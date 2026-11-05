# Architecture

```
Browser (React, GitHub Pages)
  │  Google Identity Services → Google ID token
  │  POST /auth/google          → session token (HS256, 30 days)
  │  POST /api/<command>        → every write (Zod-validated, ApiResult)
  │  WebSocket /ws              ← live documents & queries (read-only), presence
  ▼
Game server (Node 22 on an Oracle Cloud VM, behind Caddy HTTPS)
  http/app.ts      auth + API + CORS + rate limits + structured logs
  realtime/hub.ts  subscriptions, permission checks (realtime/access.ts), push on change
  services         room-service · game-engine · friend-service · archive-service · cleanup
  jobs.ts          archive outbox, turn-deadline sweeper (15 s), cleanup (15 min)
  └── shared/ engine (pure TypeScript, deterministic, injected RNG/clock/ids)
  ▼
Oracle Autonomous Database (Always Free) — table IBT_DOCS(path, coll, data JSON)
```

## Trust boundary

- **Clients only read** through the WebSocket hub, and only data `realtime/access.ts` allows. All writes go through `POST /api/*`.
- Deck order lives in `games/{id}/private/state`, which no client can read.
- `submitGameAction` takes the `GameCommand` envelope (`commandId`, `roomId`, `gameId`, `expectedVersion`, `type`, `payload`) and runs **one database transaction**:
  1. Read the receipt; if it already exists, return the stored result (idempotent replay).
  2. Read the game, private state and room with row locks (`SELECT … FOR UPDATE`). Check membership, completion, and `expectedVersion`.
  3. Run `applyAction`, the pure engine.
  4. Write the snapshot, events (with contiguous `sequence` numbers), the receipt, room activity, and — when the game completes — the archive outbox job.
- Dice and shuffles use `crypto.randomInt` on the server only.

## Data model

Every document is a row in `IBT_DOCS`, keyed by a path such as `rooms/{id}/members/{uid}`. Its JSON shape is in `server/src/shared/model.ts`, and timestamps are UTC epoch milliseconds.

The `Db` port (`server/src/db/types.ts`) offers transactions, `get`, `query`, `queryGroup`, `deleteTree` and change events:
- `OracleDb` backs it in production. It uses node-oracledb in Thin mode with TLS, row locks for serialization, and retries on ORA-00001, ORA-00060 and ORA-08177.
- `MemoryDb` backs it in tests and local development, optionally persisted to `data/dev-db.json`.

| Path | Purpose | Client access |
| --- | --- | --- |
| `users/{uid}` | profile, friend code, privacy, active rooms | owner |
| `friendCodes/{code}` | code → uid | none |
| `friendRequests/{from_to}` | deterministic ID prevents duplicates | participants (query by `participants`) |
| `friendships/{pairId}` | sorted pair + profile snapshots | participants (query by `uids`) |
| `rooms/{roomId}` (+ `members`, `reactions`) | lobby and in-game room | members |
| `inviteCodes/{sha256}` | hashed code → room | none |
| `roomInvites/{roomId_uid}` | friend invites | recipient (query by `toUid`) |
| `games/{gameId}` (+ `events`, `private`) | snapshot / event log / deck order | members (never `private`) |
| `commandReceipts`, `archiveJobs`, `rateLimits` | bookkeeping | none |
| `gameArchives/{gameId}` | immutable archive | participants (via `getMyArchives`) |
| `status/{uid}` (virtual) | online/offline from open WebSockets | any signed-in user |

## Architecture decisions

| Decision | Choice |
| --- | --- |
| Hosting | Website on GitHub Pages (HashRouter, so deep links survive refreshes). Server on an OCI Always Free VM, behind Caddy with a free `*.sslip.io` name and Let's Encrypt. |
| Database | Oracle Autonomous DB, Always Free, TLS without wallet, VM IP on the ACL. One JSON document table keeps the service code storage-agnostic. |
| Identity | Google Identity Services ID token, verified against Google's JWKS (issuer + audience). Server-issued HS256 session token. User IDs are `g_<google sub>`. |
| Live updates | WebSocket hub with allowlisted query shapes and permissions re-checked on every push. One process, so change events are in-memory. |
| Reactions | Allowlisted emote IDs, nonce-based dedupe, 3 per 5 s per user, 8 s lifetime (UI) and cleanup sweep. |
| Invite code | 6 characters from a 32-symbol unambiguous alphabet (crypto RNG), looked up by `sha256`. Expires after 24 h or at game start. Joins rate-limited. |
| Turn timeout | Off/30/45/60 s, server time. Clients send `CLAIM_TIMEOUT`, and the in-process sweeper backs it up every 15 s. |
| Archive policy | Archive ID = game ID. Verified before cleanup; live data removed after 1 h; archives kept for 12 months. Pseudonymized on account deletion. |
| Ruleset version | `RULESET.version` is stored on games and archives. |
| Scaling | A single VM process is plenty for friends' games. More instances would need a shared change feed (e.g. Oracle AQ or Redis) for the hub. |
