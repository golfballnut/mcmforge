import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const PAM_EMAIL = 'pam@mcmforge.com';
const AUTH_DIR = path.join(__dirname, '.auth');
const PAM_AUTH_FILE = path.join(AUTH_DIR, 'pam.json');

setup('authenticate as pam', async ({ page }) => {
  const password = process.env.PAM_TEST_PASSWORD;
  if (!password) {
    throw new Error('PAM_TEST_PASSWORD env var is required to capture Pam storage state.');
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  await page.goto('/login');
  await expect(page).toHaveURL(/\/login/);

  // Login page <label>s don't have htmlFor/id linkage — getByLabel won't match.
  // Tracked as a separate a11y ticket; bypassing here with type-based selectors.
  await page.locator('input[type="email"]').fill(PAM_EMAIL);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Successful login redirects off /login. We don't care which page lands —
  // any non-/login URL means the cookie session is alive.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });

  await page.context().storageState({ path: PAM_AUTH_FILE });
});
