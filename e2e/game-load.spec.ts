import { test, expect } from '@playwright/test';

test.describe('Game Loading', () => {
  test('should load the game page with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('협동 인형뽑기');
  });

  test('should render the canvas element', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 5000 });
  });

  test('should display HUD with level and coins', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('Level 1')).toBeVisible();
    await expect(page.getByText('Coins: 0')).toBeVisible();
    await expect(page.getByText('Phase 1')).toBeVisible();
  });

  test('should display controls hint', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Arrow keys')).toBeVisible();
    await expect(page.getByText('Space')).toBeVisible();
  });
});
