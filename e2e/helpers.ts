import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Navigate to the page and start a local single-player game.
 */
export async function startLocalGame(page: Page) {
  await page.goto('/');
  // Should see the lobby
  await expect(page.getByText('협동 인형뽑기')).toBeVisible({ timeout: 5000 });
  // Click local play button
  await page.getByText('로컬 싱글플레이').click();
  // Wait for canvas to appear
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 5000 });
  // Wait for engine initialization
  await page.waitForTimeout(500);
}
