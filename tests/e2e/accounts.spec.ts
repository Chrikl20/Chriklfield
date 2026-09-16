import { test, expect } from '@playwright/test';
const preferences = {
  version: 1,
  completed: true,
  goal: 'images',
  vibe: 'Fashion',
  platform: 'tiktok',
};

test('a visitor explores and prepares a preset; generation is gated and the draft survives sign-in', async ({
  page,
}) => {
  let signedIn = false,
    profile: unknown = null,
    jobs = 0,
    statesBeforeLogin = 0;
  await page.route('**/api/auth/session', (r) =>
    r.fulfill({
      json: {
        authenticated: signedIn,
        userId: signedIn ? 'test-user' : undefined,
        preferences: profile,
      },
    }),
  );
  page.on('request', (r) => {
    if (r.url().includes('/api/jobs') || r.url().includes('/api/quotes')) jobs++;
    if (!signedIn && r.url().includes('/api/state')) statesBeforeLogin++;
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Dein nächster Content.', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Today’s fit – Vorlage öffnen', exact: true }).click();
  await page.getByLabel('Dein Prompt', { exact: false }).fill('My saved guest draft');
  await page.getByLabel('Format', { exact: true }).selectOption('1:1');
  await page.getByRole('button', { name: 'Generieren', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  expect(jobs).toBe(0);
  expect(statesBeforeLogin).toBe(0);
  await modal.getByRole('link', { name: 'Ich habe schon einen Account', exact: true }).click();
  await page.route('**/api/auth/login', async (r) => {
    expect(r.request().postDataJSON()).toEqual({
      email: 'demo@example.test',
      password: 'deterministic-test-password',
    });
    signedIn = true;
    await r.fulfill({ json: { ok: true, authenticated: true } });
  });
  await page.getByLabel('E-Mail-Adresse').fill('demo@example.test');
  await page.getByLabel('Passwort', { exact: true }).fill('deterministic-test-password');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\?/);
  await page.getByRole('button', { name: /Bilder für meinen Feed/ }).click();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByRole('button', { name: /Fashion/ }).click();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByRole('button', { name: /TikTok/ }).click();
  await page.route('**/api/auth/profile', async (r) => {
    profile = r.request().postDataJSON();
    await r.fulfill({ json: { ok: true } });
  });
  await page.getByRole('button', { name: 'Mein Studio öffnen' }).click();
  await expect(page).toHaveURL(/\/image\?preset=daily-fit$/);
  await expect(page.getByLabel('Dein Prompt', { exact: false })).toHaveValue(
    'My saved guest draft',
  );
  await expect(page.getByLabel('Format', { exact: true })).toHaveValue('1:1');
  expect(profile).toEqual(preferences);
  await page.goto('/image');
  await expect(page.getByLabel('Format', { exact: true })).toHaveValue('9:16');
  await page.goto('/explore');
  await expect(page.getByText('Dein Mix: Fashion')).toBeVisible();
  expect(jobs).toBe(0);
});

test('registration waits for confirmation; forgot password has a neutral success message', async ({
  page,
}) => {
  await page.route('**/api/auth/session', (r) => r.fulfill({ json: { authenticated: false } }));
  await page.route('**/api/auth/signup', (r) =>
    r.fulfill({ json: { ok: true, confirmationRequired: true } }),
  );
  await page.goto('/signup');
  await page.getByLabel('E-Mail-Adresse').fill('new@example.test');
  await page.getByPlaceholder('Mindestens 10 Zeichen').fill('deterministic-test-password');
  await page.getByRole('button', { name: 'Passwort anzeigen', exact: true }).click();
  await expect(page.getByPlaceholder('Mindestens 10 Zeichen')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Account erstellen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Schau in dein Postfach.' })).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
  await page.route('**/api/auth/forgot', (r) => r.fulfill({ json: { ok: true } }));
  await page.getByRole('link', { name: 'Passwort setzen oder zurücksetzen' }).click();
  await page.getByLabel('E-Mail-Adresse').fill('existing@example.test');
  await page.getByRole('button', { name: 'Link zum Zurücksetzen senden' }).click();
  await expect(
    page.getByText(
      'Falls ein Konto zu dieser Adresse besteht, erhältst du einen Link zum Setzen deines Passworts.',
    ),
  ).toBeVisible();
});

test('public pages and closed account gates remain usable at mobile widths', async ({ page }) => {
  await page.route('**/api/auth/session', (r) => r.fulfill({ json: { authenticated: false } }));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const path of [
    '/explore',
    '/image',
    '/video',
    '/characters',
    '/library',
    '/billing',
    '/login',
    '/signup',
    '/forgot-password',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }
  await page.goto('/image');
  await page.getByRole('button', { name: 'Generieren', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a recovery link clears credentials and leads to a password form', async ({ page }) => {
  await page.route('**/api/auth/session', (r) =>
    r.fulfill({ json: { authenticated: true, preferences } }),
  );
  await page.route('**/api/auth/complete', (r) => r.fulfill({ json: { ok: true } }));
  await page.goto(
    '/auth/callback#access_token=fake-test-token&refresh_token=fake-test-refresh&type=recovery',
  );
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole('heading', { name: 'Ein neues Passwort.' })).toBeVisible();
  await page.route('**/api/auth/password', (r) => r.fulfill({ json: { ok: true } }));
  await page.getByPlaceholder('Mindestens 10 Zeichen').fill('a-new-test-only-password');
  await page.getByRole('button', { name: 'Passwort speichern' }).click();
  await expect(page).toHaveURL(/\/explore$/);
});
