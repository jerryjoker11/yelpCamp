import { defineConfig } from 'vitest/config';

// One root config with the three workspaces as projects, so `vitest run` at the
// root is the single command CI and the inner loop both use.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', root: './shared', environment: 'node' } },
      { test: { name: 'server', root: './server', environment: 'node' } },
      { test: { name: 'client', root: './client', environment: 'jsdom' } },
    ],
  },
});
