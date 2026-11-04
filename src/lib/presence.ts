import { onDisconnect, onValue, ref, serverTimestamp, set } from 'firebase/database';
import { useEffect, useState } from 'react';
import { firebase } from './firebase/client';

// Realtime Database presence with onDisconnect. Presence is display-only: it never affects seats or rules.

export function startPresence(uid: string): () => void {
  const rtdb = firebase().rtdb;
  if (!rtdb) return () => undefined;
  const statusRef = ref(rtdb, `status/${uid}`);
  const unsub = onValue(ref(rtdb, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    void onDisconnect(statusRef)
      .set({ state: 'offline', lastChanged: serverTimestamp() })
      .then(() => set(statusRef, { state: 'online', lastChanged: serverTimestamp() }));
  });
  return () => {
    unsub();
    void set(statusRef, { state: 'offline', lastChanged: serverTimestamp() });
  };
}

export type PresenceState = 'online' | 'reconnecting' | 'offline';

/** Online / Reconnecting (offline < 60s) / Offline for a set of uids. */
export function usePresence(uids: string[]): Record<string, PresenceState> {
  const [raw, setRaw] = useState<Record<string, { state: string; lastChanged: number }>>({});
  const [, tick] = useState(0);
  const key = uids.join(',');
  useEffect(() => {
    const rtdb = firebase().rtdb;
    if (!rtdb) return;
    const unsubs = uids.map((uid) =>
      onValue(ref(rtdb, `status/${uid}`), (snap) => setRaw((r) => ({ ...r, [uid]: snap.val() ?? { state: 'offline', lastChanged: 0 } }))),
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
    if (!s) out[uid] = 'online';
    else if (s.state === 'online') out[uid] = 'online';
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
