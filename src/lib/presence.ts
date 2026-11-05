import { useEffect, useState } from 'react';
import { live } from './realtime';

// Presence comes from the server, which knows who has an open live connection. Display only.

export type PresenceState = 'online' | 'reconnecting' | 'offline';

/** Online / Reconnecting (offline < 60s) / Offline for a set of uids. */
export function usePresence(uids: string[]): Record<string, PresenceState> {
  const [raw, setRaw] = useState<Record<string, { state: string; lastChanged: number }>>({});
  const [, tick] = useState(0);
  const key = uids.join(',');
  useEffect(() => {
    const unsubs = uids.map((uid) =>
      live.subscribe(`doc:status/${uid}`, { op: 'sub', doc: `status/${uid}` }, (value) =>
        setRaw((r) => ({ ...r, [uid]: (value as { state: string; lastChanged: number } | null) ?? { state: 'offline', lastChanged: 0 } })),
      ),
    );
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => {
      unsubs.forEach((u) => u());
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const out: Record<string, PresenceState> = {};
  for (const uid of uids) {
    const s = raw[uid];
    if (!s || s.state === 'online') out[uid] = 'online';
    else out[uid] = Date.now() - s.lastChanged < 60_000 ? 'reconnecting' : 'offline';
  }
  return out;
}

/** Browser connectivity for the reconnect banner. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
