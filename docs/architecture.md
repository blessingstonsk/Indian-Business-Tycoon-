# Architecture

```
Browser (React, GitHub Pages)
  │  Firebase Auth (Google)                  ─ identity
  │  httpsCallable(...)  → Cloud Functions   ─ every write / command
  │  onSnapshot(...)     ← Firestore         ─ rooms, members, games, events, reactions (read-only)
  │  RTDB /status/{uid}  ↔ presence          ─ display only
  ▼
Cloud Functions (asia-south1)
  callable wrapper: auth → Zod → service → ApiResult { ok | error{code,message,retryable,correlationId} }
  services: room-service · game-engine · friend-service · archive-service · cleanup
  triggers: onArchiveJobCreated (Firestore) · enforceTurnDeadlines (1 min) · scheduledCleanup (15 min)
  └── shared/ engine (pure TypeScript, deterministic, injected RNG/clock/ids)
```

## Trust boundary

- Clients **only read**. `firestore.rules` denies every client write. The deck order lives in `games/{id}/private/state`, which no client can read.
- `submitGameAction` takes the manual's `GameCommand` envelope (`commandId`, `roomId`, `gameId`, `expectedVersion`, `type`, `payload`). Each call runs in **one Firestore transaction**:
  1. Read the receipt. If it exists, return the stored result (idempotent replay).
  2. Read the game, private state and room. Check membership, `COMPLETED`, and `expectedVersion` (`VERSION_CONFLICT` on mismatch).
  3. Run `applyAction`, the pure engine. It throws `DomainError` on illegal moves, and the state is never partially mutated.
  4. Write the snapshot, private state, events (contiguous `sequence`), the receipt (`commandReceipts`, with a 7-day TTL), and room activity. If the game completed, also write the `archiveJobs` outbox record.
- Dice and shuffles use `crypto.randomInt` on the server only. The dice values and card IDs are stored in the event log.

## Data model

See `functions/src/shared/model.ts` for the exact shapes. Timestamps are UTC epoch milliseconds. Fields named `ttlAt` are stored as Firestore Timestamps so TTL policies can act on them.

| Path | Purpose | Client access |
| --- | --- | --- |
| `users/{uid}` | profile, friend code, privacy, active rooms | owner read |
| `friendCodes/{code}` | code → uid lookup | none |
| `friendRequests/{from_to}` | deterministic ID prevents duplicates | participants read |
| `friendships/{pairId}` | sorted pair ID + profile snapshots | participants read |
| `rooms/{roomId}` (+ `members`, `reactions`) | lobby and in-game room | members read |
| `inviteCodes/{sha256}` | hashed code → roomId, deleted at game start | none |
| `roomInvites/{roomId_uid}` | friend invites | sender/recipient read |
| `games/{gameId}` (+ `events`, `private`) | live snapshot / event log / deck order | members read (not `private`) |
| `commandReceipts/{hash}` · `archiveJobs/{gameId}` · `rateLimits/{key}` | backend bookkeeping | none |
| `gameArchives/{gameId}` | immutable archive | participants read |

## Testability

Every service depends on a small `Db` port (`functions/src/db/types.ts`). In production the port is backed by Firestore. In tests it's backed by `MemoryDb`, which serializes transactions and, like Firestore, throws if a transaction reads after it writes. This lets the service tests cover concurrency, replay and lifecycle without the emulator. The security-rules tests in `tests/rules` do need the emulator.

## Architecture decisions (manual Appendix D)

| Decision | Choice |
| --- | --- |
| Firebase region | Firestore + Functions in `asia-south1` (Mumbai), co-located and closest to players in India. RTDB in `asia-southeast1` (the nearest RTDB region). Check product availability before creating the project. |
| GitHub Pages routing | `HashRouter` (`/#/room/…`). Deep links and refreshes work without server rewrites. `404.html` mirrors `index.html` as a fallback. |
| Reaction transport | Firestore `rooms/{id}/reactions`, created only by `sendReaction`. Allowlisted emote IDs, a nonce-based ID for dedupe, and a limit of 3 per 5 s per user (Firestore-backed sliding window). Reactions expire after 8 s (`ttlAt`); the client hides them after `ttlAt`, a TTL policy deletes them, and the cleanup job sweeps any left over. No free text anywhere. |
| Invite code | 6 characters from a 32-symbol alphabet without O/0/I/1 (about 1.07 × 10⁹ codes) from `crypto.randomInt`. Normalized to uppercase alphanumerics, looked up via `sha256('invite:'+code)`. Expires after 24 h or when the game starts. Join attempts are limited to 10 per minute per user, and every failure returns the same generic error. |
| Archive policy | Archive ID is the game ID (deterministic, so retries are safe). Stores player snapshots (uid, name, photo, token, final cash, net worth, rank, deeds, rent, biggest trade), the winner, `rulesetVersion`, timestamps, and a summary of at most 200 events. Kept for 12 months (`retentionUntil`). On account deletion the user is pseudonymized in other players' archives. |
| Turn timeout | Off/30/45/60 s, enforced by server timestamps. Timeout actions: roll → auto-roll; jail → one doubles attempt; purchase → decline (goes to auction); auction → closes `auctionSeconds` (20 s) after opening, extended to ≥10 s after each bid; debt → auto-liquidate (sell buildings evenly, then mortgage the cheapest deeds), then pay or go bankrupt; turn end → next player. Clients send `CLAIM_TIMEOUT` once a deadline passes, and a scheduled sweeper backs this up every minute. |
| Host disconnect | Host is a lobby-only role. If the host leaves the lobby, the earliest-joined remaining member becomes host. In game, the host has no special powers, so a host disconnect needs no recovery. |
| Ruleset version | `RULESET.version` (semver) is stored on every game and archive. Board and cards are versioned config in `shared/`. Change the version whenever prices, rents or card effects change. |
| Cost controls | One snapshot write + N event writes per command. Listeners per player: room, members, game, last 80 events, recent reactions, presence. Set budget alerts and use separate staging/prod projects. Abandoned lobbies are deleted after 24 h. Games are marked stale after 48 h and ended by net worth after 14 days. |
