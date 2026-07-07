import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3001',
    trace: 'on-first-retry',
    // Use pre-installed Chromium in remote execution environments
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
