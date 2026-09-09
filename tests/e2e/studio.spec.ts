import { test, expect } from '@playwright/test';
test('core pages remain usable on desktop and mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [path, title] of [
    ['explore', 'Was erschaffst du heute?'],
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
