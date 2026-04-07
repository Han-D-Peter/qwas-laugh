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
    await expect(page.getByText('Lv.1')).toBeVisible();
  });

  test('should increase coins when claw hits a wall', async ({ page }) => {
    // Level 1 maze: 7x7 * 100px = 700px. Claw at ~350px, speed 2px/frame.
    // May need to bounce multiple directions to guarantee a wall hit.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(4000);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(4000);

    const coinsEl = page.getByText(/Coin:\d+/);
    await expect(coinsEl).toBeVisible({ timeout: 5000 });
    const coinsText = await coinsEl.textContent();
    const coins = parseInt(coinsText!.replace('Coin:', ''));
    expect(coins).toBeGreaterThanOrEqual(1);
  });

  test('should respond to space key grab attempt', async ({ page }) => {
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);

    const hasFail = await page.getByText('실패').isVisible().catch(() => false);
    const hasTransition = await page.getByText(/Phase 2/).isVisible().catch(() => false);
    const hasOverlap = await page.getByText(/겹침/).isVisible().catch(() => false);
    const coinsEl = page.getByText(/Coin:\d+/);
    const coinsText = await coinsEl.textContent().catch(() => 'Coin:0');
    const coins = parseInt(coinsText!.replace('Coin:', ''));

    expect(hasFail || hasTransition || hasOverlap || coins > 0).toBeTruthy();
  });

  test('should restart game when pressing R', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(5000);

    await page.keyboard.press('r');
    await page.waitForTimeout(500);
    await page.keyboard.press('r');
    await page.waitForTimeout(1500);

    await expect(page.getByText('Lv.1')).toBeVisible();
    await expect(page.getByText(/Phase 1/)).toBeVisible({ timeout: 5000 });
  });
});
