import { test, expect } from '@playwright/test';

test('mail-app callback establishes its session before navigating and clears credentials from history', async ({
  page,
}) => {
  let submitted: unknown;
  let attempts = 0;
  let studioRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/state')) studioRequests++;
  });
  let release: () => void = () => {};
  const completed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/complete', async (route) => {
    submitted = route.request().postDataJSON();
    attempts++;
    await completed;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(
    '/auth/callback#access_token=browser-test-access&refresh_token=browser-test-refresh',
  );
  await expect(page.getByRole('status')).toContainText('Wir prüfen deinen Anmeldelink');
  await expect(page).toHaveURL(/\/auth\/callback$/);
  await expect.poll(() => attempts).toBe(1);
  expect(studioRequests).toBe(0);
  expect(submitted).toEqual({
    access_token: 'browser-test-access',
    refresh_token: 'browser-test-refresh',
  });
  release();
  await expect(page).toHaveURL(/\/explore$/);
  expect(attempts).toBe(1);
  await page.goBack();
  expect(page.url()).not.toContain('browser-test-access');
});

test('an expired mail link explains recovery without sending another email', async ({ page }) => {
  let sends = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/login')) sends++;
  });
  await page.goto(
    '/auth/callback#error=access_denied&error_code=otp_expired&error_description=private-provider-text',
  );
  const errorNotice = page.getByRole('main').getByRole('alert');
  await expect(errorNotice).toContainText('abgelaufen oder wurde bereits verwendet');
  await expect(errorNotice).not.toContainText('private-provider-text');
  await expect(page).toHaveURL(/\/auth\/callback$/);
  await expect(page.getByRole('link', { name: 'Neuen Anmeldelink anfordern' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  expect(sends).toBe(0);
});
