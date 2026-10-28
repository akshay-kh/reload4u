import { test, expect, TARGET_URL, watchTab, getTabs } from './fixtures.js';

async function loadCount(page) {
    return Number(await page.locator('#load').textContent());
}

test.describe('auto-reload', function () {
    test('reloads a watched tab at a sub-30s interval', async function ({ context, serviceWorker }) {
        const page = await context.newPage();
        await page.goto(TARGET_URL);
        const first = await loadCount(page);

        await watchTab(serviceWorker, TARGET_URL, { interval: 1, paused: false });

        await expect.poll(function () { return loadCount(page); }, { timeout: 8000 }).toBeGreaterThanOrEqual(first + 3);
        const badge = await serviceWorker.evaluate(function () { return chrome.action.getBadgeText({}); });
        expect(badge).toBe('1');
    });

    test('stops after the configured number of reloads', async function ({ context, serviceWorker }) {
        const page = await context.newPage();
        await page.goto(TARGET_URL);

        const tabId = await watchTab(serviceWorker, TARGET_URL, {
            interval: 1, paused: false, stopAfter: { type: 'count', limit: 2 }
        });

        await expect.poll(async function () {
            return (await getTabs(serviceWorker))[tabId].paused;
        }, { timeout: 8000 }).toBe(true);
        expect((await getTabs(serviceWorker))[tabId].stoppedReason).toBe('Stopped: reached 2 reloads');

        const stoppedAt = await loadCount(page);
        await page.waitForTimeout(2500);
        expect(await loadCount(page)).toBe(stoppedAt);
    });
});

test.describe('popup', function () {
    test('lists a watched tab and can pause and resume it', async function ({ context, serviceWorker, extensionId }) {
        const target = await context.newPage();
        await target.goto(TARGET_URL);
        const tabId = await watchTab(serviceWorker, TARGET_URL, { interval: 60, paused: false });

        const popup = await context.newPage();
        await popup.goto('chrome-extension://' + extensionId + '/popup.html');

        const active = popup.locator('#activeTabsList');
        await expect(active).toContainText('Target page');
        await expect(popup.locator('#activeTabsList > div')).toHaveCount(1); // no duplicate cards

        await active.getByRole('button', { name: /pause/i }).click();
        await expect(popup.locator('#pausedTabsList')).toContainText('Target page');
        await expect(popup.locator('#activeTabsSection')).toBeHidden();
        expect((await getTabs(serviceWorker))[tabId].paused).toBe(true);

        await popup.locator('#pausedTabsList').getByRole('button', { name: /resume/i }).click();
        await expect(active).toContainText('Target page');
        expect((await getTabs(serviceWorker))[tabId].paused).toBe(false);
    });
});

test.describe('theme', function () {
    test('dark theme chosen in settings applies to settings and popup', async function ({ context, extensionId }) {
        const settings = await context.newPage();
        await settings.goto('chrome-extension://' + extensionId + '/settings.html');
        await expect(settings.locator('html')).not.toHaveClass(/dark/);

        await settings.locator('#themeSelect').selectOption('dark');
        await expect(settings.locator('html')).toHaveClass(/dark/);

        // An already-open popup picks up the change, and a fresh one starts dark.
        const popup = await context.newPage();
        await popup.goto('chrome-extension://' + extensionId + '/popup.html');
        await expect(popup.locator('html')).toHaveClass(/dark/);

        await settings.locator('#themeSelect').selectOption('light');
        await expect(popup.locator('html')).not.toHaveClass(/dark/);

        await settings.reload();
        await expect(settings.locator('#themeSelect')).toHaveValue('light');
    });

    test('system theme follows the OS color scheme', async function ({ context, extensionId }) {
        const popup = await context.newPage();
        await popup.emulateMedia({ colorScheme: 'dark' });
        await popup.goto('chrome-extension://' + extensionId + '/popup.html');
        await expect(popup.locator('html')).toHaveClass(/dark/);

        await popup.emulateMedia({ colorScheme: 'light' });
        await expect(popup.locator('html')).not.toHaveClass(/dark/);
    });

    test('changing the theme does not reset the default interval', async function ({ context, extensionId }) {
        const settings = await context.newPage();
        await settings.goto('chrome-extension://' + extensionId + '/settings.html');
        await settings.locator('#defaultInterval').fill('45');
        await settings.locator('#saveSettings').click();
        await settings.locator('#themeSelect').selectOption('dark');

        await settings.reload();
        await expect(settings.locator('#defaultInterval')).toHaveValue('45');
        await expect(settings.locator('#themeSelect')).toHaveValue('dark');
    });
});
