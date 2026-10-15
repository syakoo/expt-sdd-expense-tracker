import { defineConfig, devices } from '@playwright/test'

const E2E_DATABASE_PATH = 'data/e2e.db'

export default defineConfig({
  testDir: 'e2e',
  // E2E は 1 つの開発サーバーと DB を共有するため、並列に実行しない
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run db:setup && npm run dev',
    env: { DATABASE_PATH: E2E_DATABASE_PATH },
    url: 'http://localhost:3000',
    // 毎回 data/e2e.db で db:setup を実行するため、起動中のサーバーは再利用しない
    reuseExistingServer: false,
  },
})
