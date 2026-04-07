import { test, expect } from '@playwright/test';
import { startLocalGame } from './helpers.js';

test.describe('Game Loading', () => {
  test('should load the lobby page with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('협동 인형뽑기');
    await expect(page.getByText('협동 인형뽑기')).toBeVisible();
  });

  test('should show lobby with create and join buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('방 만들기')).toBeVisible();
    await expect(page.getByText('참여하기')).toBeVisible();
    await expect(page.getByText('로컬 싱글플레이')).toBeVisible();
  });

  test('should render canvas after starting local game', async ({ page }) => {
    await startLocalGame(page);
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('should display HUD with level and coins in local mode', async ({ page }) => {
    await startLocalGame(page);
    await expect(page.getByText('Lv.1')).toBeVisible();
    await expect(page.getByText(/Coin:\d+/)).toBeVisible();
    await expect(page.getByText(/Phase 1/)).toBeVisible();
  });

  test('should display controls hint', async ({ page }) => {
    await startLocalGame(page);
    await expect(page.getByText('Arrow keys')).toBeVisible();
  });
});
