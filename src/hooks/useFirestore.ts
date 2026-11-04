import { doc, onSnapshot, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { firebase } from '../lib/firebase/client';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/** Real-time listener for one document. Pass null to stay idle. */
export function useDoc<T>(path: string | null): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: Boolean(path), error: null });
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      doc(firebase().db, path),
      (snap) => setState({ data: snap.exists() ? (snap.data() as T) : null, loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
  }, [path]);
  return state;
}

/** Real-time listener for a query. `key` must change whenever the query changes. */
export function useQueryDocs<T>(key: string | null, build: () => Query): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: Boolean(key), error: null });
  useEffect(() => {
    if (!key) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    return onSnapshot(
      build(),
      (snap) => setState({ data: snap.docs.map((d) => d.data() as T), loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
