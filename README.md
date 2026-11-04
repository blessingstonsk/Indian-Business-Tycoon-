# Indian Business Tycoon

*Buy Cities. Build Empires. Bankrupt Your Friends.*

A real-time multiplayer Indian property-trading board game for 2–6 friends. Sign in with Google, add friends, create a private room, share a six-character code, and play from separate devices. All game rules run on trusted backend code. The browser only renders the board and asks for actions.

> Virtual money only: no payments, betting, prizes or cash-out. The game uses its own name, board, card text and artwork, and is not affiliated with any commercial board-game brand.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19 + TypeScript + Vite, Tailwind CSS, Framer Motion, Zustand, TanStack Query, Radix Dialog, Lucide |
| Hosting | GitHub Pages (static build, `HashRouter` deep links) |
| Backend | Firebase Cloud Functions v2 (Node 22, `asia-south1`) |
| Data | Cloud Firestore (state, events, archives) + Realtime Database (presence) |
| Auth | Firebase Authentication – Google |
| Tests | Vitest + fast-check (engine), in-memory transactional DB (services), Firestore rules tests (emulator), Playwright |

## Repository layout

```
shared/            Pure domain: board config, cards, ruleset, engine, Zod schemas, API contract
  engine/          Deterministic state machine (RNG, clock and IDs are injected)
  test/            Unit + property-based invariant tests
functions/         Cloud Functions (bundled with esbuild into lib/index.js)
  src/db/          Db port + Firestore adapter + in-memory adapter for tests
  src/room-service/ src/game-engine/ src/friend-service/ src/archive-service/ src/cleanup/
  src/callable/    Auth + Zod + ApiResult wrapper with correlation IDs
  src/tests/       Service integration tests (concurrency, replay, archive-before-delete…)
src/               React app (features/, components/, lib/, hooks/, stores/)
tests/rules/       Firestore security-rules tests (need the emulator)
e2e/               Playwright tests
docs/              architecture.md, rules.md, runbooks.md
firestore.rules  database.rules.json  firestore.indexes.json  firebase.json
```

## Local setup

Requirements: Node 22 (`.nvmrc`). The Firebase Emulator Suite also needs Java 11+ and `firebase-tools`.

```bash
npm install
```

```bash
npm install --prefix functions
```

```bash
cp .env.example .env.local
```

**Option A: emulators (recommended).** Set `VITE_USE_EMULATORS=true` and `VITE_FIREBASE_PROJECT_ID=demo-ibt` in `.env.local`, plus any non-empty `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_APP_ID` values. Then build the functions and start the emulators:

```bash
npm run functions:build
```

```bash
npx firebase-tools emulators:start --project demo-ibt
```

```bash
npm run dev
```

Open http://localhost:5173. The Auth emulator shows a fake Google sign-in, so use two browser profiles to play against yourself.

**Option B: a real Firebase dev project.** Fill in `.env.local` with the project's web config. Enable Google sign-in, Firestore (`asia-south1`), and the Realtime Database. Then deploy the rules and functions (see Deployment).

**UI only, no backend:** `npm run dev`, then open `/#/dev/playground`. This route exists only in development builds. It runs the real engine in the browser, hot-seat style, so you can exercise the board UI. It is not multiplayer.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm test` | Engine unit/property tests + backend service tests (rules tests skip without an emulator) |
| `npm run typecheck` | App, shared and functions TypeScript |
| `npm run lint` | ESLint |
| `npm run build` | Production build into `dist/` (+ `404.html` fallback) |
| `npm run functions:build` | Bundle Cloud Functions into `functions/lib` |
| `npm run test:e2e` | Playwright (run `npx playwright install` once) |
| `npx firebase-tools emulators:exec --only firestore "npx vitest run tests/rules"` | Security-rules tests |

## Deployment

1. Create separate Firebase projects for **staging** and **production**. Copy `.firebaserc.example` to `.firebaserc`. The Blaze plan is needed for Functions and scheduled jobs. Set budget alerts.
2. Enable Google sign-in, and add your GitHub Pages domain (or custom domain) to Auth → Authorized domains.
3. Create Firestore in `asia-south1` and the Realtime Database in `asia-southeast1`.
4. Deploy the backend (only after review and explicit approval for production):
   ```bash
   npx firebase-tools deploy --project staging --only firestore,database,functions
   ```
5. Turn on the Firestore TTL policies declared in `firestore.indexes.json` (`ttlAt` on `reactions`, `rateLimits` and `commandReceipts`). Remember that TTL deletion is asynchronous.
6. Set up App Check (reCAPTCHA Enterprise). Put the site key in `VITE_APPCHECK_SITE_KEY`, then set `ENFORCE_APP_CHECK=true` for the functions.
7. GitHub → Settings → Pages → Source: **GitHub Actions**. Add the repository/environment variables `VITE_FIREBASE_*`, `VITE_APPCHECK_SITE_KEY` and optionally `VITE_APP_BASE_PATH`. Pushing to `main` runs `.github/workflows/deploy-pages.yml`.

Never commit service-account keys. The Firebase web config is public by design; security comes from Auth, the rules, App Check and backend validation.

## Status against the manual's milestones

M0–M9 are implemented, plus parts of M10 (rules, rate limits, structured logs). See `docs/runbooks.md` for the release checklist and the items that still need a real Firebase project: OAuth on mobile Safari, App Check, budget alerts, and two-device and six-player playtests.
