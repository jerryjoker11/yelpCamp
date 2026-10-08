import { expect, test } from '@playwright/test';

test.describe('home page', () => {
    test('shows "API available" when the API can serve [M0-AC-06]', async ({ page }) => {
        test.slow();
        await page.goto('/');
        await expect(page.getByRole('status')).toHaveText('API available');
    });

    test('shows "API unavailable" when the health request fails [M0-AC-06]', async ({ page }) => {
        await page.route('**/api/health', (route) => route.abort());
        await page.goto('/');
        await expect(page.getByRole('status')).toHaveText('API unavailable', { timeout: 60_000 });
    });

    test('shows "API unavailable" when the API answers 503 [M0-AC-06]', async ({ page }) => {
        await page.route('**/api/health', (route) =>
            route.fulfill({
                status: 503,
                json: {
                    error: {
                        code: 'UPSTREAM_UNAVAILABLE',
                        message: 'The database is unavailable.',
                    },
                },
            }),
        );
        await page.goto('/');
        await expect(page.getByRole('status')).toHaveText('API unavailable');
    });

    test('sends every /api request to the same origin as the page [M0-AC-07]', async ({ page }) => {
        test.slow();
        const apiRequestsUrls: URL[] = [];
        page.on('request', (request) => {
            const url = new URL(request.url());
            if (url.pathname.startsWith('/api/')) apiRequestsUrls.push(url);
        });

        const healthRequest = page.waitForRequest('**/api/health');
        await page.goto('/');
        const response = await (await healthRequest).response();

        const pageOrigin = new URL(page.url()).origin;
        const crossOriginUrls = apiRequestsUrls
            .filter((url) => url.origin != pageOrigin)
            .map(String);

        expect(apiRequestsUrls.length).toBeGreaterThan(0);
        expect(crossOriginUrls).toEqual([]);
        expect(response?.ok()).toBe(true);
    });
});
