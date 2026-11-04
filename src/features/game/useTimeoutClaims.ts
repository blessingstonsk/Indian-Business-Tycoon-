import { useEffect, useState } from 'react';
import type { GameState } from '@shared';

/**
 * Deadlines are enforced by the server against its own clock. When a deadline passes, clients ask the
 * server to apply the timeout (CLAIM_TIMEOUT); the scheduled sweeper is the backstop for empty rooms.
 * The active player's client claims first; others stagger to avoid a burst of redundant calls.
 */
export function useTimeoutClaims(game: GameState | null, myUid: string | null, claim: () => void) {
  const deadline = game ? (game.auction?.endsAt ?? game.turnDeadline ?? game.endsAt) : null;
  const version = game?.version;
  const status = game?.status;
  const isCurrent = game?.currentPlayerUid === myUid;
  useEffect(() => {
    if (!deadline || status === 'COMPLETED' || !myUid) return;
    const delay = Math.max(0, deadline - Date.now()) + (isCurrent ? 1200 : 3500 + Math.random() * 2500);
    const t = setTimeout(claim, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, version, status, myUid, isCurrent]);
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function secondsLeft(deadline: number | null, now: number): number | null {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
