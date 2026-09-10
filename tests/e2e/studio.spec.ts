import { test, expect } from '@playwright/test';
test('core pages remain usable on desktop and mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [path, title] of [
    ['explore', 'Dein nächster Content.'],
    ['characters', 'Deine Characters'],
    ['image', 'Image Studio'],
    ['video', 'Video Studio'],
    ['library', 'Library'],
    ['billing', 'Dein Plan. Deine Credits.'],
    ['admin', 'Studio Control'],
  ]) {
    await page.goto(`/${path}`);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('Lokale Demo', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
test('a creator preset carries editable content into the studio without starting a job', async ({
  page,
}) => {
  await page.goto('/explore');
  await page.getByRole('button', { name: 'Fashion', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fashion', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('link', { name: 'Coffee & catch-up – Vorlage öffnen', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Today’s fit – Vorlage öffnen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Image Studio', exact: true })).toBeVisible();
  await expect(page.getByLabel('Szene', { exact: true })).toHaveValue(
    'City steps in soft daylight',
  );
  await expect(page.getByLabel('Outfit', { exact: true })).toHaveValue(/Sleeveless knit top/);
  await expect(page.getByLabel('Format', { exact: true })).toHaveValue('9:16');
  await expect(page.getByLabel('Aktiver Charakter')).toHaveValue(
    '00000000-0000-4000-8000-000000000003',
  );
  await expect(page.getByRole('button', { name: 'Preis berechnen', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Szene', { exact: true }).fill('A sunny park after a morning run');
  await expect(page.getByLabel('Szene', { exact: true })).toHaveValue(
    'A sunny park after a morning run',
  );
});
test('login and photo credits are usable without a studio session', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anmeldelink senden' })).toBeVisible();
  await page.getByRole('link', { name: 'Foto-Inspiration · Bildnachweise' }).click();
  await expect(page.getByRole('heading', { name: 'Bildnachweise', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});
test('character choice survives studio navigation; quote is confirmed before a simulated result', async ({
  page,
}) => {
  await page.goto('/image');
  await expect(page.getByRole('heading', { name: 'Image Studio', exact: true })).toBeVisible();
  await expect(page.getByLabel('Aktiver Charakter')).toHaveValue(
    '00000000-0000-4000-8000-000000000003',
  );
  const oldDownload = await page
    .getByRole('link', { name: 'Ergebnis herunterladen' })
    .getAttribute('href');
  await page
    .getByLabel('Dein Prompt', { exact: false })
    .fill('CI demo portrait: a soft daylight scene');
  await page.getByRole('button', { name: 'Preis berechnen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Simulierter Preis');
  await dialog.getByRole('button', { name: /Credits reservieren & starten/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Demo-Auftrag gestartet/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ergebnis herunterladen' })).not.toHaveAttribute(
    'href',
    oldDownload!,
    { timeout: 15000 },
  );
  await page.getByRole('link', { name: 'Als Video', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Video Studio', exact: true })).toBeVisible();
  await expect(page.getByLabel('Aktiver Charakter')).toHaveValue(
    '00000000-0000-4000-8000-000000000003',
  );
});
