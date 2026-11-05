import { useEffect, useState } from 'react';
import { live, type QuerySpec } from '../lib/realtime';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/** Live value of one document. Pass null to stay idle. */
export function useDoc<T>(path: string | null): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: Boolean(path), error: null });
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return live.subscribe(`doc:${path}`, { op: 'sub', doc: path }, (value, error) =>
      setState({ data: (value as T | null) ?? null, loading: false, error }),
    );
  }, [path]);
  return state;
}

/** Live results of an allowlisted query. Pass null to stay idle. */
export function useQueryDocs<T>(spec: QuerySpec | null): Live<T[]> {
  const key = spec ? `q:${JSON.stringify(spec)}` : null;
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: Boolean(spec), error: null });
  useEffect(() => {
    if (!key || !spec) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    return live.subscribe(key, { op: 'subq', query: spec }, (value, error) =>
      setState({ data: (value as T[] | null) ?? [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** True while the live connection to the game server is up. */
export function useLiveConnected(): boolean {
  const [connected, setConnected] = useState(live.connected);
  useEffect(() => live.onStatus(setConnected), []);
  return connected;
}
