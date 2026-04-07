import { test, expect } from '@playwright/test';
import { startLocalGame } from './helpers.js';

test.describe('Canvas Rendering', () => {
  test('should render game canvas with correct dimensions', async ({ page }) => {
    await startLocalGame(page);
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test('should have a properly sized canvas', async ({ page }) => {
    await startLocalGame(page);
    const hasValidCanvas = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      return canvas.width > 0 && canvas.height > 0;
    });
    expect(hasValidCanvas).toBe(true);
  });

  test('should render different content after direction change', async ({ page }) => {
    await startLocalGame(page);
    const canvas = page.locator('canvas').first();

    const before = await canvas.screenshot();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(1000);
    const after = await canvas.screenshot();

    expect(Buffer.compare(before, after)).not.toBe(0);
  });
});
