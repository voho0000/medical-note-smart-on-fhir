import { test, expect } from '@playwright/test'
import { importBundle, openChatInput } from '../fixtures/import'

test.describe('slash-template menu', () => {
  test('typing "/" opens the template menu and Enter inserts the body', async ({ page }) => {
    await importBundle(page)

    // Chat input lives in the right panel's default 筆記對話 tab.
    const textarea = await openChatInput(page)
    await expect(textarea).toBeVisible()
    await textarea.click()

    // Typing a slash surfaces the autocomplete with the default templates.
    await textarea.pressSequentially('/')
    const menu = page.getByRole('listbox')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('option').first()).toBeVisible()

    // Enter picks the highlighted template (does NOT send) and replaces the
    // "/" token with the template body.
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
    const value = await textarea.inputValue()
    expect(value).not.toBe('/')
    expect(value.length).toBeGreaterThan(1)
  })

  test('filters by an explicit shortcut (default templates)', async ({ page }) => {
    await importBundle(page)
    const textarea = await openChatInput(page)
    await textarea.click()
    // "soap" is the shortcut on a default medical template (SOAP 病歷).
    await textarea.pressSequentially('/soap')
    const menu = page.getByRole('listbox')
    await expect(menu).toBeVisible()
    await expect(menu.getByText('/soap')).toBeVisible()
  })

  test('filters as you type and Escape dismisses', async ({ page }) => {
    await importBundle(page)
    const textarea = await openChatInput(page)
    await textarea.click()
    await textarea.pressSequentially('/')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toBeHidden()
    // The typed text stays put.
    expect(await textarea.inputValue()).toBe('/')
  })
})
