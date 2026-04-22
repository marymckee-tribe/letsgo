import { test, expect } from './auth-fixture'

test.describe('authenticated smoke', () => {
  test('home page renders', async ({ signedInPage }) => {
    await expect(signedInPage).toHaveURL(/\/$|\/home/)
    await expect(signedInPage.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('inbox renders the triage layout', async ({ signedInPage }) => {
    await signedInPage.goto('/inbox')
    await expect(signedInPage.getByRole('heading', { name: /triage/i })).toBeVisible()
  })

  test('settings lists linked accounts section', async ({ signedInPage }) => {
    await signedInPage.goto('/settings')
    await expect(signedInPage.getByText(/linked google accounts/i)).toBeVisible()
  })
})
