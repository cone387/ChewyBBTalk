import { test, expect } from '@playwright/test';

test('automatic privacy can be disabled, restored and enabled from settings', async ({ page }, info) => {
  const response = await page.request.post('/api/v1/bbtalk/auth/register', { data: {
    username: `privacy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    password: 'privacy-switch-regression-2026',
  } });
  expect(response.status()).toBe(201);
  const session = await response.json();
  await page.addInitScript(value => {
    localStorage.setItem('bbtalk_access_token', value.access);
    localStorage.setItem('bbtalk_refresh_token', value.refresh);
    localStorage.setItem('bbtalk_user_info', JSON.stringify(value.user));
    localStorage.setItem('show_privacy_countdown', 'true');
  }, session);
  await page.clock.install();
  await page.goto('/settings/privacy');
  const enabled = page.getByRole('checkbox', { name: '启用自动防窥' });
  const slider = page.getByRole('slider', { name: '防窥超时时长' });
  await expect(enabled).toBeChecked();
  await slider.focus();
  await slider.press('Home');
  await expect(slider).toHaveValue('1');
  await page.getByText('启用自动防窥', { exact: true }).click();
  await expect(enabled).not.toBeChecked();
  await expect(slider).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: '显示防窥倒计时' })).toBeDisabled();
  await page.reload();
  await expect(enabled).not.toBeChecked();
  await page.screenshot({ path: info.outputPath('automatic-privacy-disabled.png') });

  await page.goto('/');
  await expect(page.getByLabel('记录内容')).toBeVisible();
  await expect(page.getByRole('button', { name: '立即锁定记录' })).toHaveCount(0);
  await page.clock.fastForward(61_000);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel('记录内容')).toBeVisible();

  await page.goto('/settings/privacy');
  await page.getByText('启用自动防窥', { exact: true }).click();
  await expect(enabled).toBeChecked();
  await expect(slider).toHaveValue('1');
  await page.screenshot({ path: info.outputPath('automatic-privacy-enabled.png') });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '立即锁定记录' })).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(page).toHaveURL(/\/locked$/);
  await expect(page.getByLabel('解锁密码', { exact: true })).toBeVisible();
});
