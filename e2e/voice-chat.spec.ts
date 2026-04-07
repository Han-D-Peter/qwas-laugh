import { test, expect } from '@playwright/test';

test.describe('Voice Chat UI', () => {
  test('should not show voice controls in local mode', async ({ page }) => {
    await page.goto('/');
    await page.getByText('로컬 싱글플레이').click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 5000 });

    // Voice controls should not be visible in local mode
    await expect(page.getByText('음성채팅 켜기')).not.toBeVisible();
  });

  test('lobby should have create room button for multiplayer', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('닉네임 입력').fill('테스터');

    // Create room button should be visible
    await expect(page.getByText('방 만들기')).toBeEnabled();
    await expect(page.getByText('참여하기')).toBeEnabled();
  });
});
