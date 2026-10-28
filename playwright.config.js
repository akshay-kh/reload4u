import { defineConfig } from '@playwright/test';

// E2E tests load the built extension from dist/ — run `npm run build` first
// (`npm run test:e2e` does this).
export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 30000,
    fullyParallel: true,
    reporter: process.env.CI ? 'github' : 'list'
});
