import { test, expect } from '@playwright/test';

test.describe('Canvas Rendering', () => {
  test('should render game canvas with correct dimensions', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 5000 });

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test('should have a properly sized canvas', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 5000 });

    const hasValidCanvas = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      return canvas.width > 0 && canvas.height > 0;
    });
    expect(hasValidCanvas).toBe(true);
  });

  test('should render different content after direction change', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);

    // Take a screenshot before
    const before = await canvas.screenshot();

    // Change direction and wait for movement
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(1000);

    // Take a screenshot after
    const after = await canvas.screenshot();

    // Screenshots should be different (claw moved + camera followed)
    expect(Buffer.compare(before, after)).not.toBe(0);
  });
});
