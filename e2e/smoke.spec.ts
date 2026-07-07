import { test, expect } from '@playwright/test'

// Smoke tests — verify the tracker loads and auth redirect works.
// Run against a live dev/preview URL via BASE_URL env var.

test('home page loads without a 5xx', async ({ page }) => {
  const resp = await page.goto('/')
  expect(resp?.status()).toBeLessThan(500)
})

test('unauthenticated root redirects or shows auth — no crash', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const title = await page.title()
  expect(title.toLowerCase()).not.toMatch(/error|500|exception/)
})

test('sign-in page is reachable', async ({ page }) => {
  const resp = await page.goto('/sign-in')
  // Either renders the sign-in page or redirects (3xx) — no server crash
  expect((resp?.status() ?? 200)).toBeLessThan(500)
})

test('API team endpoint returns 401 without auth', async ({ request }) => {
  const resp = await request.get('/api/team/my-candidates')
  expect([401, 403]).toContain(resp.status())
})
