import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDoc } from '../../hooks/useLive';
import { api } from '../../lib/api/callables';
import { getSession, onSessionChange, setSession, type Session } from '../../lib/backend';
import { reportError } from '../../stores/toasts';
import type { UserDoc } from '../../domain/docs';

interface AuthState {
  user: { uid: string } | null;
  profile: UserDoc | null;
  initializing: boolean;
  /** Exchange a Google ID token (from Google Identity Services) for a game-server session. */
  signInWithGoogle: (credential: string) => Promise<void>;
  /** Development only: sign in as a named test player. */
  signInTestUser: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(() => getSession());
  useEffect(() => onSessionChange(setSessionState), []);

  const profile = useDoc<UserDoc>(session ? `users/${session.uid}` : null);

  const signInWithGoogle = useCallback(async (credential: string) => {
    try {
      const r = await api.signInWithGoogle(credential);
      setSession({ token: r.token, uid: r.uid });
    } catch (e) {
      reportError(e);
    }
  }, []);

  const signInTestUser = useCallback(async (name: string) => {
    try {
      const r = await api.signInTestUser(name);
      setSession({ token: r.token, uid: r.uid });
    } catch (e) {
      reportError(e);
    }
  }, []);

  const signOut = useCallback(async () => {
    setSession(null);
    window.google?.accounts.id.disableAutoSelect();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: session ? { uid: session.uid } : null,
      profile: profile.data,
      initializing: Boolean(session) && !profile.data && profile.loading && !profile.error,
      signInWithGoogle,
      signInTestUser,
      signOut,
    }),
    [session, profile.data, profile.loading, profile.error, signInWithGoogle, signInTestUser, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
