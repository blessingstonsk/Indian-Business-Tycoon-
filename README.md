<div align="center">

<img src="public/favicon.svg" width="88" alt="Indian Business Tycoon logo" />

# Indian Business Tycoon

### Buy Cities · Build Empires · Bankrupt Your Friends

A real-time multiplayer Indian property-trading board game for **2–6 friends**, playable in any browser.

[![CI](https://github.com/blessingstonsk/Indian-Business-Tycoon-/actions/workflows/ci.yml/badge.svg)](https://github.com/blessingstonsk/Indian-Business-Tycoon-/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Node](https://img.shields.io/badge/Node-22%20·%20WebSocket-339933?logo=nodedotjs&logoColor=white)
![Oracle Cloud](https://img.shields.io/badge/Oracle%20Cloud-Autonomous%20DB%20·%20Always%20Free-F80000?logo=oracle&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Tests](https://img.shields.io/badge/tests-67%20passing-1f8a5b)

[**Features**](#-features) · [**Screenshots**](#-screenshots) · [**How to play**](#-how-to-play) · [**Quick start**](#-quick-start) · [**Architecture**](#%EF%B8%8F-architecture) · [**Deploy**](#-deployment) · [**Roadmap**](#%EF%B8%8F-roadmap)

<br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/board-dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="docs/images/board-light.png" />
  <img src="docs/images/board-dark.png" alt="The game board mid-game: cities around the edge, dice in the centre, players and actions on the right" width="100%" />
</picture>

<sub>The hero image follows your GitHub light/dark theme. Try switching it.</sub>

</div>

---

## ✨ Features

<table>
<tr>
<td width="33%" valign="top">

### 🎲 Fair, server-side play
Dice, rent, auctions, bankruptcy and the winner are all decided by **trusted backend code**. The browser only asks for actions. Every move is versioned and idempotent, so double clicks and flaky mobile networks never charge you twice.

</td>
<td width="33%" valign="top">

### 🏙️ An original Indian board
40 spaces with **22 cities** from Jaipur to Mumbai, **4 transit lines** (Mumbai Local, Delhi Metro, Kolkata Tram, Vande Bharat), 2 utilities, GST Checkpost, and Fortune & Civic Chest cards.

</td>
<td width="33%" valign="top">

### 👥 Friends & private rooms
Google sign-in, friend codes, friend requests, and room invites. Share a six-character code or link, pick a token 🐘 🛺 🐅 🦚 🪷 🏏, and start when everyone is ready.

</td>
</tr>
<tr>
<td valign="top">

### 🏗️ Full rulebook
Buy or auction, even building (4 blocks → tower), mortgages, jail with doubles and bail, three-doubles rule, a debt and liquidation flow, and atomic trades of cash, deeds and jail cards.

</td>
<td valign="top">

### ✨ Delightful, but calm
3D dice, step-by-step token movement, card flips, confetti, synthesized sound effects, and light/dark themes. **Reduced motion** and **mute** are respected everywhere.

</td>
<td valign="top">

### 🗄️ History that's kept, clutter that isn't
Finished games are archived with standings and key moments. Live data is removed only **after the archive is verified**. Reactions vanish after 8 seconds.

</td>
</tr>
</table>

> [!NOTE]
> **Virtual money only.** There are no payments, betting, prizes or cash-out. The game uses its own name, board, card text and artwork, and is not affiliated with any commercial board-game brand.

## 📸 Screenshots

<table>
<tr>
<td width="50%"><img src="docs/images/landing-dark.png" alt="Landing page in dark mode" /><p align="center"><sub><b>Landing</b>: dark mode</sub></p></td>
<td width="50%"><img src="docs/images/landing-light.png" alt="Landing page in light mode" /><p align="center"><sub><b>Landing</b>: light mode</sub></p></td>
</tr>
<tr>
<td><img src="docs/images/lobby.png" alt="Room lobby with room code, players, token picker and settings" /><p align="center"><sub><b>Lobby</b>: room code, tokens, host settings</sub></p></td>
<td><img src="docs/images/deed.png" alt="Property deed dialog for Mumbai – Marine Drive" /><p align="center"><sub><b>Deed card</b>: rents for each upgrade level</sub></p></td>
</tr>
</table>

<details>
<summary><b>📱 See it on a phone</b></summary>
<br />
<p align="center"><img src="docs/images/mobile.png" alt="Game on a phone-sized screen" width="320" /></p>
<p align="center"><sub>The board fits the screen width, with a compact player strip, a sticky action panel, and zoom & pan.</sub></p>
</details>

## 🎮 How to play

| | |
|---|---|
| 💰 **Start** | Everyone begins with **₹15,000**. Pass or land on START to collect **₹2,000**. |
| 🎲 **Roll** | Move clockwise. Doubles roll again, but **three doubles** in a row sends you to Jail. |
| 🏠 **Buy** | Land on an unowned city, transit line or utility to buy it. Decline it and **everyone bids** in an auction. |
| 🧾 **Rent** | A full colour group doubles base rent. Transit rent grows with every line you own; utilities multiply the dice. |
| 🏗️ **Build** | Own a whole group, then add blocks evenly (up to 4), then a **tower**. Rent climbs steeply. |
| 🏦 **Raise cash** | Sell buildings for half, mortgage deeds for half the price, or trade. |
| 🔒 **Jail** | Pay ₹500 bail, use a Get Out of Jail Free card, or try for doubles (3 tries). |
| 🏆 **Win** | Be the last solvent tycoon, or have the highest net worth when the 90-minute **Timed** mode ends. |

<details>
<summary><b>🗺️ The full board (all 40 spaces)</b></summary>
<br />

| Group | Spaces | Price range |
|---|---|---|
| 🟫 Terracotta | Jaipur – MI Road, Jodhpur – Clock Tower | ₹600 |
| 🟦 Sky | Patna – Golghar, Bhopal – Upper Lake, Lucknow – Hazratganj | ₹1,000–1,200 |
| 🩷 Rose | Varanasi – Dashashwamedh Ghat, Coimbatore – Race Course, Visakhapatnam – RK Beach | ₹1,400–1,600 |
| 🟧 Saffron | Indore – Rajwada, Nagpur – Zero Mile, Chandigarh – Sector 17 | ₹1,800–2,000 |
| 🟥 Crimson | Kochi – Fort Kochi, Surat – Diamond Market, Ahmedabad – Sabarmati Riverfront | ₹2,200–2,400 |
| 🟨 Turmeric | Pune – Shaniwar Wada, Goa – Panaji, Kolkata – Howrah Bridge | ₹2,600–2,800 |
| 🟩 Emerald | Hyderabad – Charminar, Chennai – Marina Beach, Bengaluru – MG Road | ₹3,000–3,200 |
| 🟪 Indigo | Delhi – Connaught Place, Mumbai – Marine Drive | ₹3,500–4,000 |
| 🚆 Transit | Mumbai Local, Delhi Metro, Kolkata Tram, Vande Bharat Express | ₹2,000 |
| ⚡ Utilities | Power Grid, Jal Board | ₹1,500 |
| 🎴 Cards | 3 × Fortune, 3 × Civic Chest (16 cards each) | — |
| 🏛️ Taxes | GST Checkpost ₹2,000 · Infrastructure Levy ₹1,000 | — |
| ⬛ Corners | START · Jail / Just Visiting · Rest House · Go To Jail | — |

Every price, rent, card and amount lives in versioned config: [`shared/board-config.ts`](shared/board-config.ts), [`shared/cards.ts`](shared/cards.ts) and [`shared/ruleset.ts`](shared/ruleset.ts). The full rules are in [`docs/rules.md`](docs/rules.md).

</details>

<details>
<summary><b>💬 Reactions & quick phrases</b></summary>
<br />

There's no free-text chat. Players react with a curated set, rate-limited to 3 every 5 seconds:

👏 😂 😮 😭 😤 😎 🙏 🔥 💰 ☕ · 🧾 *Pay my rent!* · 🤝 *Let's trade!* · ⏰ *Your turn!* · 🏆 *Good game!* · 🍀 *Best of luck!* · ⏳ *One minute…*

</details>

## 🚀 Quick start

<details open>
<summary><b>Option A: full multiplayer on your computer (recommended)</b></summary>
<br />

**You need:** Node 22 (see `.nvmrc`). Nothing else: locally the server uses an in-memory database saved to `server/data/dev-db.json`.

**1. Install**

```bash
npm install
```

```bash
npm install --prefix server
```

**2. Create the two local config files**

`server/.env`:

```ini
PORT=8787
ALLOWED_ORIGINS=http://localhost:5173
DEV_LOGIN=true
```

`.env.local`:

```ini
VITE_API_URL=http://localhost:8787
VITE_DEV_LOGIN=true
```

**3. Start the game server** in one terminal:

```bash
npm run server
```

**4. Start the website** in another terminal:

```bash
npm run dev
```

**5. Play.** Open <http://localhost:5173> and type a name into **Test sign-in**. Open a **second tab** with another name to get a second player, since each tab has its own session. Typing the same name again returns you to the same seat.

> [!TIP]
> To test real Google sign-in locally, add `GOOGLE_CLIENT_ID` to `server/.env` and `VITE_GOOGLE_CLIENT_ID` to `.env.local`, using a client that allows `http://localhost:5173`.

</details>

<details>
<summary><b>Option B: just look at the board (no server)</b></summary>
<br />

```bash
npm run dev
```

Then open <http://localhost:5173/#/dev/playground>. This development-only page runs the real rules engine in your browser, hot-seat style; use **View as** to switch players. It's not multiplayer, and it isn't included in production builds.

</details>

<details>
<summary><b>🧰 All scripts</b></summary>
<br />

| Command | What it does |
|---|---|
| `npm run dev` | Website dev server on :5173 |
| `npm run server` | Game server with auto-reload on :8787 |
| `npm test` | Engine unit & property tests + server tests (services, permissions, live end-to-end) |
| `npm run test:e2e` | Playwright (run `npx playwright install chromium` once) |
| `npm run typecheck` | Website, shared engine and server |
| `npm run lint` | ESLint |
| `npm run build` | Production website build into `dist/` |
| `npm run server:build` | Bundle the server into `server/dist/server.js` |
| `node scripts/readme-screenshots.mjs` | Regenerate the images in this README |

</details>

## 🏛️ Architecture

```mermaid
flowchart LR
    subgraph Pages["🌐 GitHub Pages"]
        UI["React app<br/>Board · Lobby · Friends · History"]
    end
    Google["🔑 Google sign-in<br/>Identity Services"]
    subgraph OCI["☁️ Oracle Cloud · Always Free"]
        Caddy["Caddy<br/>HTTPS · sslip.io"]
        Server["Node game server<br/>API · WebSocket hub · jobs"]
        ADB[("Autonomous Database<br/>rooms · games · events · archives")]
    end
    Engine["⚙️ shared/engine<br/>pure, deterministic rules"]

    UI -- "ID token" --> Google
    UI -- "HTTPS commands" --> Caddy
    UI <-- "WebSocket live updates" --> Caddy
    Caddy --> Server
    Server -- "transactions (row locks)" --> ADB
    Server -. "uses" .-> Engine
```

<details>
<summary><b>🔁 What happens when you click “Roll dice”</b></summary>
<br />

```mermaid
sequenceDiagram
    autonumber
    actor P as Player
    participant C as Browser
    participant F as Game server
    participant DB as Oracle DB
    P->>C: Click "Roll dice"
    C->>F: POST /api/submitGameAction (commandId, expectedVersion, ROLL_DICE)
    F->>F: Verify session + validate payload (Zod)
    F->>DB: Begin transaction, SELECT … FOR UPDATE
    DB-->>F: receipt?, game snapshot, deck order
    alt same commandId seen before
        F-->>C: stored result (no double charge)
    else version changed
        F-->>C: VERSION_CONFLICT
    else valid
        F->>F: Engine rolls with crypto RNG, moves, resolves landing
        F->>DB: snapshot v+1, events, receipt (one COMMIT)
        F-->>C: ok
    end
    F-->>C: WebSocket hub pushes the new state to every player
    C->>P: Dice spin, token walks, sound plays
```

</details>

<details>
<summary><b>🧭 Turn state machine</b></summary>
<br />

```mermaid
stateDiagram-v2
    [*] --> AWAIT_ROLL
    AWAIT_ROLL --> PROPERTY_DECISION: land on unowned deed
    AWAIT_ROLL --> DEBT: cannot afford rent, tax or card
    AWAIT_ROLL --> TURN_END: landing resolved
    AWAIT_ROLL --> AWAIT_ROLL: doubles
    JAIL_DECISION --> AWAIT_ROLL: bail or card
    JAIL_DECISION --> TURN_END: failed attempt
    PROPERTY_DECISION --> TURN_END: buy
    PROPERTY_DECISION --> AUCTION: decline
    AUCTION --> TURN_END: sold or unsold
    DEBT --> TURN_END: paid
    DEBT --> [*]: bankrupt, last rival wins
    TURN_END --> AWAIT_ROLL: next player
    TURN_END --> JAIL_DECISION: next player is jailed
```

When a turn timer expires, the server applies a deterministic default (auto-roll, decline, close the auction, auto-liquidate, or end the turn), so an offline player can never stall a game.

</details>

<details>
<summary><b>🔐 Security model</b></summary>
<br />

- **Clients never write.** The browser only *reads* over the WebSocket, through [`server/src/realtime/access.ts`](server/src/realtime/access.ts). Every change is a validated `POST /api/*` call.
- **Hidden information stays hidden.** Card deck order lives in a server-only document.
- **One command = one transaction.** Each command locks the game row, checks the version, applies the engine, appends events and stores an idempotency receipt atomically.
- **Verified sign-in.** Google ID tokens are checked against Google's keys, then the server issues its own signed session token.
- **Membership everywhere.** Only room members can read rooms, games and events, and only participants can read an archive.
- **Abuse limits.** Rate limits cover sign-in, room creation, joins, friend requests and reactions. CORS allows only the game's own site. Invite codes are hashed and use an unambiguous alphabet.
- **Privacy.** Logs carry hashed IDs and correlation IDs, never tokens. Other players see only your display name, photo and friend code.

</details>

<details>
<summary><b>📁 Project structure</b></summary>
<br />

```text
shared/              Pure domain: board, cards, ruleset, engine, Zod schemas, API errors
  engine/            Deterministic state machine (RNG, clock, IDs injected)
  test/              Unit + fast-check property tests
server/src/          Node game server
  http/              REST API, Google/dev sign-in, CORS, rate limits
  realtime/          WebSocket hub, read permissions, presence
  room-service/      Rooms, lobby, reactions, invites
  game-engine/       submitGameAction + timeout sweeper
  friend-service/    Profiles, friends, archives, account deletion
  archive-service/   Archive → verify → cleanup
  db/                Oracle adapter + in-memory adapter (tests, local dev)
src/                 React app (features/, components/, hooks/, stores/)
deploy/              Oracle Cloud VM setup, Caddy, systemd, DB user SQL
e2e/                 Playwright
docs/                architecture · rules · runbooks · deploy-oracle · images
```

More detail: [`docs/architecture.md`](docs/architecture.md) · [`docs/rules.md`](docs/rules.md) · [`docs/runbooks.md`](docs/runbooks.md) · [`docs/deploy-oracle.md`](docs/deploy-oracle.md)

</details>

## 🧪 Testing

| Suite | What it proves | Count |
|---|---|---|
| Engine unit tests | movement, rent, doubles, jail, auctions, cards, building, trades, bankruptcy, timed mode | 39 |
| Property-based invariants | money is conserved, building stays even, bank stock adds up, jail cards accounted for, version always increases | 2 × 150 runs |
| Backend integration | full rooms, duplicate joins, out-of-turn moves, replays, simultaneous bids, rate limits, archive-before-delete | 20 |
| Live server end-to-end | real HTTP + two WebSocket players, outsiders locked out, deck order hidden, presence, auto-archive | 6 |

## 🌍 Deployment

Everything runs on **Oracle Cloud's Always Free tier** plus GitHub Pages. The full click-by-click guide is in **[`docs/deploy-oracle.md`](docs/deploy-oracle.md)**.

<details>
<summary><b>The short version</b></summary>
<br />

1. **VM:** create an Ubuntu 24.04 Always Free instance with a public IP, and open TCP 80/443 in its security list.
2. **Database:** create an Always Free Autonomous Database (Transaction Processing). Allow only the VM's IP, untick *mTLS required*, run [`deploy/oracle/01-create-app-user.sql`](deploy/oracle/01-create-app-user.sql), and copy the `_tp` TLS connect string.
3. **Google:** create an OAuth **Web** client ID with origins `https://blessingstonsk.github.io` and `http://localhost:5173`.
4. **Server:** SSH into the VM and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/blessingstonsk/Indian-Business-Tycoon-/main/deploy/oci/setup.sh | bash
   ```
   Then put the DB password, connect string and client ID in `/etc/ibt/server.env` and run `sudo systemctl restart ibt-server`. The script prints your HTTPS address (`https://<ip-with-dashes>.sslip.io`).
5. **Website:** add the GitHub repository variables `VITE_API_URL` (that address) and `VITE_GOOGLE_CLIENT_ID`, then re-run **Deploy to GitHub Pages**.

> [!IMPORTANT]
> The database password and session secret live only in `/etc/ibt/server.env` on the VM. Never commit them or paste them into chats or issues.

</details>

## 🗺️ Roadmap

- [x] Pure rules engine with property-based tests
- [x] Server-authoritative commands, idempotency and version checks
- [x] Rooms, ready-up, invite codes and links, host hand-over
- [x] Friends, friend codes, room invites, privacy settings
- [x] Reactions with rate limits and auto-expiry
- [x] Archive → verify → cleanup lifecycle, game history
- [x] Responsive board, 3D dice, animations, sound, dark mode
- [x] Node game server with live WebSocket sync, ready for Oracle Cloud
- [ ] Oracle Cloud VM + Autonomous Database live, Google sign-in on the public site
- [ ] Two-device and six-player playtests on mobile Safari and Android
- [ ] Balance simulations for tower rents
- [ ] Bots for solo practice

<div align="center">
<br />
<sub>Made with ☕ and 🎲 · Have fun, and pay your rent on time.</sub>
</div>
