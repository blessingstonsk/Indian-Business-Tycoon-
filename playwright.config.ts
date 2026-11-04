import { defineConfig, devices } from '@playwright/test';

// E2E runs against `npm run dev` with emulators (VITE_USE_EMULATORS=true) or the dev playground.
export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', port: 5173, reuseExistingServer: true },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
