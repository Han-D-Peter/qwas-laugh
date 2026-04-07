import { test, expect } from '@playwright/test';

test.describe('Phase 1 Gameplay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 5000 });
    // Give game engine time to initialize
    await page.waitForTimeout(500);
  });

  test('should respond to arrow key inputs', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);

    // Game should still be running
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByText('Level 1')).toBeVisible();
  });

  test('should increase coins when claw hits a wall', async ({ page }) => {
    // Move in one direction continuously to hit the wall
    await page.keyboard.press('ArrowRight');

    // Wait enough time for claw to reach the boundary
    await page.waitForTimeout(3000);

    // After hitting a wall, coins should increase
    const coinsText = await page.getByText(/Coins: \d+/).textContent();
    expect(coinsText).toBeTruthy();
    const coins = parseInt(coinsText!.replace('Coins: ', ''));
    expect(coins).toBeGreaterThanOrEqual(1);
  });

  test('should show overlap indicator or fail when pressing space', async ({ page }) => {
    // Press space to attempt grab
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    // Either overlap indicator or fail result should appear
    const hasOverlap = await page.getByText(/겹침/).isVisible().catch(() => false);
    const hasFail = await page.getByText('실패').isVisible().catch(() => false);

    // At game start, claw is at center and doll is elsewhere,
    // so a grab should likely result in fail
    expect(hasOverlap || hasFail).toBeTruthy();
  });

  test('should restart game when pressing R', async ({ page }) => {
    // Move to accumulate coins
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(3000);

    // Verify coins increased
    const beforeText = await page.getByText(/Coins: \d+/).textContent();
    const coinsBefore = parseInt(beforeText!.replace('Coins: ', ''));
    expect(coinsBefore).toBeGreaterThanOrEqual(1);

    // Press R to restart
    await page.keyboard.press('r');
    await page.waitForTimeout(500);

    // After restart, should be back to Level 1, Coins 0
    await expect(page.getByText('Level 1')).toBeVisible();
    await expect(page.getByText('Coins: 0')).toBeVisible();
  });
});
