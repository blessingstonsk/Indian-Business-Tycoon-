import { expect, test } from '@playwright/test';

// Exercises the board UI with the local engine (dev only). Two-device multiplayer flows
// against the Emulator Suite follow manual Appendix C – see docs/runbooks.md.
test('roll, buy and end turn in the playground', async ({ page }) => {
  await page.goto('/#/dev/playground');
  await page.getByRole('button', { name: 'Roll dice' }).last().click();
  await expect(page.getByLabel('Activity log')).toContainText('rolled');
  const buy = page.getByRole('button', { name: /^Buy for/ });
  if (await buy.isVisible().catch(() => false)) await buy.click();
  const end = page.getByRole('button', { name: 'End turn' });
  const rollAgain = page.getByRole('button', { name: 'Roll dice' });
  await expect(end.or(rollAgain).first()).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
});
