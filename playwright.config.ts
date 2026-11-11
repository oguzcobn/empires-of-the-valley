import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Uses the system Chrome when present (CI images without Playwright's bundled browsers).
const systemChrome = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) =>
  existsSync(p),
);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    viewport: { width: 1366, height: 768 },
    launchOptions: {
      ...(systemChrome ? { executablePath: systemChrome } : {}),
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
