import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDoc } from '../../hooks/useFirestore';
import { api } from '../../lib/api/callables';
import { firebase } from '../../lib/firebase/client';
import { startPresence } from '../../lib/presence';
import { reportError } from '../../stores/toasts';
import type { UserDoc } from '../../domain/docs';

interface AuthState {
  user: User | null;
  profile: UserDoc | null;
  initializing: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(firebase().auth, async (u) => {
      setUser(u);
      setBootstrapped(false);
      if (u) {
        try {
          await api.bootstrapProfile();
          setBootstrapped(true);
        } catch (e) {
          reportError(e);
        }
      }
      setInitializing(false);
    });
  }, []);

  useEffect(() => (user ? startPresence(user.uid) : undefined), [user]);

  const profile = useDoc<UserDoc>(user && bootstrapped ? `users/${user.uid}` : null);

  const signIn = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(firebase().auth, provider);
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      // Popups are often blocked on iOS Safari / in-app browsers: fall back to redirect.
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(firebase().auth, provider);
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        reportError({ message: 'Sign-in failed – please try again' });
      }
    }
  }, []);

  const signOut = useCallback(() => fbSignOut(firebase().auth), []);

  const value = useMemo<AuthState>(
    () => ({ user, profile: profile.data, initializing: initializing || (Boolean(user) && !profile.data && profile.loading), signIn, signOut }),
    [user, profile.data, profile.loading, initializing, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
