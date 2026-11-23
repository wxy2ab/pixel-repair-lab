import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const port = process.env.PLAYWRIGHT_PORT ?? '5187'
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  testMatch: ['browser.spec.ts', '*.browser.spec.ts'],
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    viewport: { width: 1366, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    env: { PORT: port, AI_API_BASE_URL: '', AI_API_MODEL: '', AI_API_KEY: '' },
    url: `${baseURL}/api/levels`,
  },
})
