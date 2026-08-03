import { expect, Page, test } from '@playwright/test';

const signIn = async (page: Page, name: string, email: string) => {
  await page.goto('/');
  await page.getByLabel('Test display name').fill(name);
  await page.getByLabel('Test email').fill(email);
  await page.getByRole('button', { name: /sign in to local emulator/i }).click();
  await expect(page.getByRole('heading', { name: 'My Tabs' })).toBeVisible();
};

const signOut = async (page: Page) => {
  await page.goto('/tabs');
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
};

const expectNoHorizontalOverflow = async (page: Page) => {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  )).toBe(true);
};

const typeWithKeyboard = async (page: Page, accessibleName: string, value: string) => {
  await page.getByLabel(accessibleName).focus();
  await page.keyboard.type(value);
};

const activateWithKeyboard = async (page: Page, role: 'button' | 'radio', name: string, exact = false) => {
  const control = page.getByRole(role, { name, exact });
  await control.focus();
  await page.keyboard.press('Enter');
};

test('two users share an expense, settle it, and lose protected access after logout', async ({ page }) => {
  const run = Date.now();
  const alexEmail = `alex-${run}@example.test`;
  const blairEmail = `blair-${run}@example.test`;
  const tabName = `E2E Trip ${run}`;

  await signIn(page, 'Alex', alexEmail);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My Tabs' })).toBeVisible();
  await page.getByRole('button', { name: /create new tab/i }).click();
  await page.getByPlaceholder('Tab Name').fill(tabName);
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page).toHaveURL(/\/tabs\/[^/]+$/);
  await expect(page.locator('body')).toContainText(tabName);
  const tabUrl = page.url();
  await page.getByRole('button', { name: /manage tab/i }).click();
  await page.getByRole('radio', { name: 'CAD', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /change currency/i }).click();
  await expect(page.getByRole('radio', { name: 'CAD', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: /change currency/i })).toBeDisabled();
  await page.getByRole('radio', { name: 'USD', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /change currency/i }).click();
  await expect(page.getByRole('radio', { name: 'USD', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: /change currency/i })).toBeDisabled();
  await signOut(page);

  await signIn(page, 'Blair', blairEmail);
  await signOut(page);

  await signIn(page, 'Alex', alexEmail);
  await page.getByRole('link', { name: new RegExp(tabName) }).click();
  await page.getByRole('button', { name: /manage tab/i }).click();
  await page.getByLabel('Member email').fill(blairEmail);
  await page.getByRole('button', { name: /send invitation/i }).click();
  await expect(page.getByLabel('Member email')).toHaveValue('');
  await signOut(page);

  await signIn(page, 'Blair', blairEmail);
  await expect(page.locator('body')).toContainText(tabName);
  await page.getByRole('button', { name: /^accept$/i }).click();
  await expect(page.locator('body')).toContainText('Alex');
  await expect(page.locator('body')).toContainText('Blair');
  await page.getByRole('button', { name: /add expense/i }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await typeWithKeyboard(page, 'Expense description', 'Shared dinner');
  page.once('dialog', dialog => dialog.dismiss());
  await activateWithKeyboard(page, 'button', 'Cancel', true);
  await expect(page.getByRole('heading', { name: 'New expense' })).toBeVisible();
  await typeWithKeyboard(page, 'Amount paid by Blair', '60.00');
  await typeWithKeyboard(page, 'Item 1 description', 'Dinner');
  await typeWithKeyboard(page, 'Item 1 amount', '60.00');
  await expect(page.getByRole('checkbox', { name: 'Alex' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Blair' })).toBeChecked();
  await activateWithKeyboard(page, 'button', 'Save expense', true);
  await expect(page.locator('body')).toContainText('Alex pays Blair USD 30.00');
  await expect(page.getByRole('button', { name: /Shared dinner.*USD 60.00/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await signOut(page);

  await signIn(page, 'Alex', alexEmail);
  await page.getByRole('link', { name: new RegExp(tabName) }).click();
  await expect(page.locator('body')).toContainText('Alex pays Blair USD 30.00');
  await page.getByRole('button', { name: /record settlement/i }).click();
  await page.setViewportSize({ width: 768, height: 1024 });
  await expectNoHorizontalOverflow(page);
  const alexPayer = page.getByRole('radio', { name: 'Alex', exact: true }).first();
  await alexPayer.focus();
  await page.keyboard.press('Enter');
  const blairRecipient = page.getByRole('radio', { name: 'Blair', exact: true }).nth(1);
  await blairRecipient.focus();
  await page.keyboard.press('Enter');
  await typeWithKeyboard(page, 'Settlement amount', '30.00');
  await activateWithKeyboard(page, 'radio', 'cash', true);
  await activateWithKeyboard(page, 'button', 'Record payment', true);
  await expect(page.getByRole('button', { name: /Alex paid Blair.*USD 30.00/i })).toBeVisible();
  await expect(page.getByText('settled USD 0.00')).toHaveCount(2);
  await expectNoHorizontalOverflow(page);

  await signOut(page);
  await page.goto(tabUrl);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
});
