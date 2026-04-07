import { test, expect } from '@playwright/test';

test.describe('Lobby', () => {
  test('should display lobby with game title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('협동 인형뽑기')).toBeVisible();
    await expect(page.getByText('4명이 함께하는 협동 게임')).toBeVisible();
  });

  test('should have name input and action buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('닉네임 입력')).toBeVisible();
    await expect(page.getByText('방 만들기')).toBeVisible();
    await expect(page.getByText('참여하기')).toBeVisible();
    await expect(page.getByText('로컬 싱글플레이')).toBeVisible();
  });

  test('should disable buttons when name is empty', async ({ page }) => {
    await page.goto('/');
    const createBtn = page.getByText('방 만들기');
    await expect(createBtn).toBeDisabled();
  });

  test('should enable buttons after entering name', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('닉네임 입력').fill('테스터');
    const createBtn = page.getByText('방 만들기');
    await expect(createBtn).toBeEnabled();
  });

  test('should start local game when clicking local play', async ({ page }) => {
    await page.goto('/');
    await page.getByText('로컬 싱글플레이').click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Level 1')).toBeVisible();
  });

  test('should show join code input when clicking join', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('닉네임 입력').fill('테스터');
    await page.getByText('참여하기').click();
    await expect(page.getByPlaceholder('접속 코드 입력')).toBeVisible({ timeout: 3000 });
  });
});
