import { test, expect } from '@playwright/test';
import { startLocalGame } from './helpers.js';

test.describe('Phase 2 Gameplay', () => {
  test('should render canvas throughout phase transitions', async ({ page }) => {
    await startLocalGame(page);

    for (let i = 0; i < 15; i++) {
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
      await page.keyboard.press(keys[i % 5]);
      await page.waitForTimeout(300);
    }

    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByText(/Lv\.\d+/)).toBeVisible();
    await expect(page.getByText(/Coin:\d+/)).toBeVisible();
  });
});
