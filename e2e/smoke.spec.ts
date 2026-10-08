import { expect, test } from '@playwright/test';

test.describe('home page', () => {
    test('shows "API available" when the API can serve [M0-AC-06]', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('status')).toHaveText('API available');
    });

    test('shows "API unavailable" when the health request fails [M0-AC-06]', async ({ page }) => {
        await page.route('**/api/health', (route) => route.abort());
        await page.goto('/');
        await expect(page.getByRole('status')).toHaveText('API unavailable');
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

    test.fixme('sends every /api request to the same origin as the page [M0-AC-07]', () => {});
});
