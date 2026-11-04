# Runbooks

## Archive / cleanup failures
- Each `archiveJobs/{gameId}` document shows `status` (PENDING → VERIFIED → CLEANED, or FAILED after 5 attempts), `attempts` and `lastError`.
- To retry a FAILED job, set it back to `PENDING` in the console. The next `scheduledCleanup` run (every 15 min) retries it. Archive writes are deterministic and retry-safe.
- Cleanup never deletes live data unless `gameArchives/{gameId}` exists. If an archive is missing, the job stays VERIFIED and live data is kept.
- Logs: filter Cloud Logging on `cleanup_errors`, `archive_job` and `internal_error`. Log entries carry a `correlationId` (also shown to users as "Ref: xxxxxxxx") and a hashed uid, never a raw uid or token.

## Stuck game
- Check `games/{id}.turnDeadline` and `phase`. With a timer set, `enforceTurnDeadlines` advances the game within about a minute. With the timer off, players can still resign. Inactive games are marked `stale` after 48 h and ended by net worth after 14 days.

## Incident: abuse or cost spike
- Check `rateLimits`, Functions invocation counts and Firestore reads. Tighten the limits in `functions/src/room-service/rooms.ts` / `friends.ts`, set `ENFORCE_APP_CHECK=true`, and confirm the budget alerts.

## Backup / export
- Schedule managed Firestore exports (`gcloud firestore export gs://<bucket>`), at least daily for `gameArchives` and `users`.

## Manual two-device test (manual Appendix C)
1. Device A signs in and creates a room. Device B, signed in with a different Google account, joins by code or link.
2. Both mark Ready. The host starts the game. Check that both devices show the same board, order, dice and movement.
3. Buy a deed on A. Land on it with B and pay rent. Check that both devices show the same balances.
4. Send an emote from B. It should disappear from A after about 8 s.
5. Refresh B. It should return to the same seat and state.
6. Finish the game (for example, by resigning). Check that the archive appears under History for both players. After the 1 h grace period, the live game, room, events, receipts and invite lookup should be gone. A third account must not be able to read the archive.

## Release checklist (manual §15.3)
- [ ] Name and visual identity reviewed for trademark/IP risk
- [ ] Privacy notice and terms published (retention: lobbies 24 h, live completed games 1 h after archive, reactions 8 s, archives 12 months)
- [ ] Blaze billing, budget alerts and quotas configured
- [ ] Indexes, rules and TTL policies deployed. Rules tests pass on CI.
- [ ] Functions region matches the Firestore region (`asia-south1`)
- [ ] Google OAuth domains and the redirect flow tested (including iOS Safari)
- [ ] GitHub Pages base path and deep links tested on the real URL
- [ ] Two-device and six-player playtests completed
- [ ] Archive/cleanup failure recovery tested
- [ ] Accessibility (keyboard, 200% zoom, screen reader) and reduced-motion checks done
- [ ] Production deploy only after explicit approval
