import { test, expect } from '@playwright/test';
import { startLocalGame } from './helpers.js';

test.describe('Phase 1 Gameplay', () => {
  test.beforeEach(async ({ page }) => {
    await startLocalGame(page);
  });

  test('should respond to arrow key inputs', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);

    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByText('Level 1')).toBeVisible();
  });

  test('should increase coins when claw hits a wall', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(3000);

    const coinsText = await page.getByText(/Coins: \d+/).textContent();
    const coins = parseInt(coinsText!.replace('Coins: ', ''));
    expect(coins).toBeGreaterThanOrEqual(1);
  });

  test('should respond to space key grab attempt', async ({ page }) => {
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);

    const hasFail = await page.getByText('실패').isVisible().catch(() => false);
    const hasTransition = await page.getByText(/Phase 2/).isVisible().catch(() => false);
    const hasOverlap = await page.getByText(/겹침/).isVisible().catch(() => false);
    const coinsText = await page.getByText(/Coins: \d+/).textContent().catch(() => 'Coins: 0');
    const coins = parseInt(coinsText!.replace('Coins: ', ''));

    expect(hasFail || hasTransition || hasOverlap || coins > 0).toBeTruthy();
  });

  test('should restart game when pressing R', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(3000);

    const beforeText = await page.getByText(/Coins: \d+/).textContent();
    const coinsBefore = parseInt(beforeText!.replace('Coins: ', ''));
    expect(coinsBefore).toBeGreaterThanOrEqual(1);

    await page.keyboard.press('r');
    await page.waitForTimeout(500);
    await page.keyboard.press('r');
    await page.waitForTimeout(1500);

    await expect(page.getByText('Level 1')).toBeVisible();
    await expect(page.getByText(/Phase 1/)).toBeVisible({ timeout: 5000 });
  });
});
