# Runbooks

## Server health
- `curl -s https://<server>/health` shows `{ ok, connections, google, devLogin }`.
- Logs: `journalctl -u ibt-server -f`. Each line is JSON with a `correlationId`, which users see as "Ref: xxxxxxxx", and a hashed uid. Tokens and raw uids are never logged.
- Restart: `sudo systemctl restart ibt-server`. Update to the latest code: `sudo bash /opt/ibt/deploy/oci/update.sh`.

## Archive / cleanup failures
- Each `archiveJobs/{gameId}` row's JSON shows `status` (PENDING → VERIFIED → CLEANED, or FAILED after 5 attempts), `attempts` and `lastError`.
- The cleanup job (every 15 min) retries PENDING jobs. To retry a FAILED one, set its status back to PENDING:
  ```sql
  UPDATE ibt_docs SET data = JSON_TRANSFORM(data, SET '$.status' = 'PENDING') WHERE path = 'archiveJobs/<gameId>';
  COMMIT;
  ```
- Live data is never deleted unless `gameArchives/{gameId}` exists.

## Stuck game
- Check the game's `turnDeadline` and `phase` with `SELECT data FROM ibt_docs WHERE path = 'games/<id>'`. With a turn timer, the sweeper advances the game within about 15 s.
- Games are marked `stale` after 48 h of inactivity and ended by net worth after 14 days.

## Backups
- Autonomous Database takes automatic backups. For an extra copy, export with Data Pump from Database Actions, or run `SELECT path, data FROM ibt_docs WHERE path LIKE 'gameArchives/%'`.

## Incident: abuse or cost spike
- Always Free resources cannot be billed. If you upgrade the account, set a budget alert first.
- Tighten the rate limits in `server/src/room-service/rooms.ts`, `friends.ts`, and the auth limiter in `http/app.ts`. Restrict `ALLOWED_ORIGINS`.

## Manual two-device test
1. Device A signs in with Google and creates a room. Device B, with a different Google account, joins by code or link.
2. Both mark Ready, and the host starts. Check that both devices show the same board, dice and movement.
3. Buy a deed on A, and land on it with B. Check that both devices show the same rent and balances.
4. Send an emote from B. It should disappear from A after about 8 s.
5. Refresh B. It should come back to the same seat.
6. Finish the game (for example by resigning). The archive should appear under History for both players, and after 1 h the live rows (`games/…`, `rooms/…`) should be gone.

## Release checklist
- [ ] Name and visual identity reviewed for trademark/IP risk
- [ ] Privacy notice published (retention: lobbies 24 h, completed live games 1 h after archive, reactions 8 s, archives 12 months)
- [ ] Database ACL limited to the VM IP; mTLS off only because the ACL is set
- [ ] `SESSION_SECRET` random (setup script does this); `/etc/ibt/server.env` mode 640
- [ ] Google OAuth origins match the live site exactly
- [ ] GitHub variables `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID` set; Pages source = GitHub Actions
- [ ] Two-device and six-player playtests completed
- [ ] Accessibility (keyboard, 200% zoom, screen reader) and reduced-motion checks done
