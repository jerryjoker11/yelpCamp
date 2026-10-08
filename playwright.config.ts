import { defineConfig, devices } from '@playwright/test';

// Set to run against a deployment, e.g. https://yelpcamp-virid.vercel.app.
// Unset, the config starts the built app locally instead.
const deployedUrl = process.env.E2E_BASE_URL;
const localUrl = 'http://localhost:4173';
const isCi = Boolean(process.env.CI);

export default defineConfig({
    testDir: 'e2e',
    forbidOnly: isCi,
    reporter: isCi ? [['github'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: deployedUrl ?? localUrl,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    // Local runs test the production build, as CI does: run `npm run build` first.
    // The API reads .env, so it needs a reachable database to report ready.
    // Spread rather than `webServer: undefined`, which exactOptionalPropertyTypes rejects.
    ...(deployedUrl
        ? {}
        : {
              webServer: [
                  {
                      command: 'node server/dist/index.js',
                      url: 'http://localhost:3000/api/health',
                      reuseExistingServer: !isCi,
                  },
                  {
                      command: 'npm -w client exec -- vite preview --port 4173 --strictPort',
                      url: localUrl,
                      reuseExistingServer: !isCi,
                  },
              ],
          }),
});
