import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { browserSessionPersistence, connectAuthEmulator, getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, type Database } from 'firebase/database';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL as string | undefined,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);
export const usingEmulators = env.VITE_USE_EMULATORS === 'true';

interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  rtdb: Database | null;
}

let handles: FirebaseHandles | null = null;

export function firebase(): FirebaseHandles {
  if (handles) return handles;
  if (!firebaseConfigured) throw new Error('Firebase is not configured – see .env.example');
  const app = initializeApp(config);
  if (env.VITE_APPCHECK_SITE_KEY && !usingEmulators) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
  }
  // With emulators, keep each tab's sign-in separate so one browser can seat several test players.
  const auth = usingEmulators ? initializeAuth(app, { persistence: browserSessionPersistence }) : getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, (env.VITE_FIREBASE_FUNCTIONS_REGION as string) || 'asia-south1');
  const rtdb = config.databaseURL || usingEmulators ? getDatabase(app) : null;
  if (usingEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    if (rtdb) connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
  }
  handles = { app, auth, db, functions, rtdb };
  return handles;
}
