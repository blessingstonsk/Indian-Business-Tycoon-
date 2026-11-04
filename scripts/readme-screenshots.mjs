// Regenerates the README screenshots in docs/images.
// Needs `npm run dev` (with emulators running for the lobby shot) and `npx playwright install chromium`.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = 'docs/images';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    deviceScaleFactor: opts.scale ?? 2,
    colorScheme: opts.scheme ?? 'dark',
    isMobile: opts.mobile ?? false,
    hasTouch: opts.mobile ?? false,
  });
  return ctx.newPage();
}

const hideDevChrome = (p) =>
  p.evaluate(() => {
    document.querySelector('#test-name')?.closest('form')?.remove();
    document.querySelector('.chip.border-gold')?.parentElement?.remove(); // playground banner
  });

/** Play a few turns in the dev playground so the board has owners, buildings-free deeds and moved tokens. */
async function playTurns(p, actions) {
  const panel = p.getByLabel('Your actions');
  for (let i = 0; i < actions; i++) {
    for (const name of [/^Roll dice$/, /^Buy for/, /^End turn$/, /^Decline/]) {
      const btn = panel.getByRole('button', { name });
      if ((await btn.count()) && (await btn.first().isEnabled())) {
        await btn.first().click();
        break;
      }
    }
    await sleep(2600);
  }
}

// 1–2. Landing, dark and light
for (const scheme of ['dark', 'light']) {
  const p = await page({ scheme, viewport: { width: 1280, height: 720 } });
  await p.goto(`${BASE}/`);
  await sleep(2500);
  await hideDevChrome(p);
  await p.screenshot({ path: `${OUT}/landing-${scheme}.png` });
  await p.close();
}

// 3–4. Game board mid-game (dark + light)
for (const scheme of ['dark', 'light']) {
  const p = await page({ scheme });
  await p.goto(`${BASE}/#/dev/playground`);
  await sleep(1500);
  await playTurns(p, 16);
  await hideDevChrome(p);
  await p.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
  await p.screenshot({ path: `${OUT}/board-${scheme}.png` });
  if (scheme === 'dark') {
    // Deed card dialog
    await p.getByRole('button', { name: /^Mumbai – Marine Drive/ }).click();
    await sleep(700);
    await p.screenshot({ path: `${OUT}/deed.png` });
    await p.keyboard.press('Escape');
  }
  await p.close();
}

// 5. Mobile
{
  const p = await page({ viewport: { width: 390, height: 844 }, scale: 3, mobile: true });
  await p.goto(`${BASE}/#/dev/playground`);
  await sleep(1500);
  await playTurns(p, 6);
  await hideDevChrome(p);
  await p.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
  await p.screenshot({ path: `${OUT}/mobile.png` });
  await p.close();
}

// 6. Lobby (needs the emulators)
try {
  const p = await page({ viewport: { width: 1280, height: 800 } });
  await p.goto(`${BASE}/`);
  await p.locator('#test-name').fill('Asha', { timeout: 5000 });
  await p.getByRole('button', { name: 'Test sign-in' }).click();
  await p.waitForURL(/#\/home/, { timeout: 15000 });
  await p.getByRole('button', { name: 'Create room' }).first().click();
  await p.getByRole('dialog').getByRole('button', { name: 'Create room' }).click();
  await p.waitForURL(/#\/room\//, { timeout: 15000 });
  await sleep(2500);
  await p.screenshot({ path: `${OUT}/lobby.png` });
  await p.close();
} catch (e) {
  console.warn('lobby screenshot skipped (are the emulators running?)', e.message);
}

await browser.close();
console.log('screenshots written to', OUT);
