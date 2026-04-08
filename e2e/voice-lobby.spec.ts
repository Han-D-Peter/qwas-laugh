import { test, expect } from '@playwright/test';

test.describe('Voice Chat UI', () => {
  test('should not show voice chat on initial menu', async ({ page }) => {
    await page.goto('/');
    const hasVoice = await page.getByText('음성채팅 켜기').isVisible().catch(() => false);
    expect(hasVoice).toBe(false);
  });

  test('should not show voice chat in local mode', async ({ page }) => {
    await page.goto('/');
    await page.getByText('로컬 싱글플레이').click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 5000 });
    const hasVoice = await page.getByText('음성채팅 켜기').isVisible().catch(() => false);
    expect(hasVoice).toBe(false);
  });

  test('lobby should have nickname input and create/join buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('닉네임 입력')).toBeVisible();
    await expect(page.getByText('방 만들기')).toBeVisible();
    await expect(page.getByText('참여하기')).toBeVisible();
  });

  test('create room button requires nickname', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('방 만들기')).toBeDisabled();
    await page.getByPlaceholder('닉네임 입력').fill('테스터');
    await expect(page.getByText('방 만들기')).toBeEnabled();
  });

  test('join button shows code input', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('닉네임 입력').fill('참여자');
    await page.getByText('참여하기').click();
    await expect(page.getByPlaceholder('접속 코드 입력')).toBeVisible({ timeout: 3000 });
  });
});
