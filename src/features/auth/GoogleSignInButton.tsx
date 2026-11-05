import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../app/providers/AuthProvider';
import { GOOGLE_CLIENT_ID } from '../../lib/backend';
import { useSettings } from '../../stores/settings';

// Google Identity Services: Google renders its own button and hands us a signed ID token,
// which the game server verifies. No Google SDK beyond this one script.

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup' | 'redirect'; auto_select?: boolean }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load Google sign-in'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function GoogleSignInButton() {
  const ref = useRef<HTMLDivElement>(null);
  const { signInWithGoogle } = useAuth();
  const theme = useSettings((s) => s.theme);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => void signInWithGoogle(r.credential), ux_mode: 'popup' });
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          width: 260,
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [signInWithGoogle, theme]);

  if (!GOOGLE_CLIENT_ID) return <p className="text-sm text-muted">Google sign-in isn't set up on this site yet.</p>;
  if (failed) return <p className="text-sm text-danger">Couldn't load Google sign-in. Check your connection or ad-blocker, then reload.</p>;
  return <div ref={ref} className="min-h-11" aria-label="Sign in with Google" />;
}
