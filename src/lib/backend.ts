// Where the game server lives and how this browser's session is stored.

const env = import.meta.env;

export const API_URL: string = ((env.VITE_API_URL as string | undefined) || (env.DEV ? 'http://localhost:8787' : '')).replace(/\/$/, '');
export const GOOGLE_CLIENT_ID: string = (env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
/** Development only: lets you sign in as named test players (the server must also allow it). */
export const DEV_LOGIN = Boolean(env.DEV) && env.VITE_DEV_LOGIN === 'true';
export const backendConfigured = Boolean(API_URL);

export interface Session {
  token: string;
  uid: string;
}

// With test sign-in, keep each tab's session separate so one browser can seat several players.
const store = (): Storage => (DEV_LOGIN ? sessionStorage : localStorage);
const KEY = 'ibt-session';
const listeners = new Set<(s: Session | null) => void>();

export function getSession(): Session | null {
  try {
    const raw = store().getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session | null) {
  try {
    if (s) store().setItem(KEY, JSON.stringify(s));
    else store().removeItem(KEY);
  } catch {
    /* storage unavailable (private mode): session lasts for this page only */
  }
  listeners.forEach((l) => l(s));
}

export function onSessionChange(l: (s: Session | null) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
