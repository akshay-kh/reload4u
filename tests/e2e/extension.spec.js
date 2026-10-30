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

test.describe('new in 1.1', function () {
    test('stops when text disappears from the page', async function ({ context, serviceWorker }) {
        const page = await context.newPage();
        await page.goto(TARGET_URL);

        const tabId = await watchTab(serviceWorker, TARGET_URL, {
            interval: 1, paused: false, stopAfter: { type: 'text', text: 'Sold out', when: 'disappears' }
        });

        await expect.poll(async function () {
            return (await getTabs(serviceWorker))[tabId].stoppedReason;
        }, { timeout: 8000 }).toBe('Stopped: "Sold out" disappeared');
    });

    test('hard reload and random interval still reload the tab', async function ({ context, serviceWorker }) {
        const page = await context.newPage();
        await page.goto(TARGET_URL);
        const first = await loadCount(page);

        await watchTab(serviceWorker, TARGET_URL, { interval: 1, intervalMax: 1.5, paused: false, hardReload: true });

        await expect.poll(function () { return loadCount(page); }, { timeout: 8000 }).toBeGreaterThanOrEqual(first + 3);
    });

    test("doesn't reload while a field has unsaved input", async function ({ context, serviceWorker }) {
        const page = await context.newPage();
        await page.goto(TARGET_URL);
        await page.locator('#field').fill('half-typed');
        const before = await loadCount(page);

        await watchTab(serviceWorker, TARGET_URL, { interval: 1, paused: false, protectTyping: true });
        await page.waitForTimeout(3000);
        expect(await loadCount(page)).toBe(before);
        await expect(page.locator('#field')).toHaveValue('half-typed');

        await page.locator('#field').fill('');
        await expect.poll(function () { return loadCount(page); }, { timeout: 8000 }).toBeGreaterThan(before);
    });

    test('keeps the scroll position across reloads', async function ({ context, serviceWorker }) {
        const page = await context.newPage();
        await page.goto(TARGET_URL);
        await page.evaluate(function () { window.scrollTo(0, 1500); });
        const before = await loadCount(page);

        await watchTab(serviceWorker, TARGET_URL, { interval: 2, paused: false, keepScroll: true });
        await expect.poll(function () { return loadCount(page); }, { timeout: 8000 }).toBeGreaterThan(before + 1);
        await expect.poll(function () { return page.evaluate(function () { return window.scrollY; }); }).toBe(1500);
    });

    test('keyboard shortcut is registered', async function ({ serviceWorker }) {
        const commands = await serviceWorker.evaluate(function () { return chrome.commands.getAll(); });
        const toggle = commands.find(function (c) { return c.name === 'toggle-current-tab'; });
        // An empty shortcut means the browser rejected the suggested key (e.g. a clash).
        expect(toggle.shortcut).toBe('Alt+Shift+U');
    });

    test('popup can pause all and resume all', async function ({ context, serviceWorker, extensionId }) {
        const target = await context.newPage();
        await target.goto(TARGET_URL);
        const tabId = await watchTab(serviceWorker, TARGET_URL, { interval: 60, paused: false });

        const popup = await context.newPage();
        await popup.goto('chrome-extension://' + extensionId + '/popup.html');
        await expect(popup.locator('#activeTabsList')).toContainText('Target page');

        await popup.locator('#pauseAllTabs').click();
        await expect(popup.locator('#pausedTabsList')).toContainText('Target page');
        expect((await getTabs(serviceWorker))[tabId].paused).toBe(true);

        await popup.locator('#resumeAllTabs').click();
        await expect(popup.locator('#activeTabsList')).toContainText('Target page');
        expect((await getTabs(serviceWorker))[tabId].paused).toBe(false);
    });

    test('popup saves per-tab options and keeps the section open', async function ({ context, serviceWorker, extensionId }) {
        const target = await context.newPage();
        await target.goto(TARGET_URL);
        const tabId = await watchTab(serviceWorker, TARGET_URL, { interval: 60, paused: false });

        const popup = await context.newPage();
        await popup.goto('chrome-extension://' + extensionId + '/popup.html');
        await popup.getByText('More options').click();
        await popup.getByLabel('Hard reload (skip cache)').check();

        await expect.poll(async function () {
            return (await getTabs(serviceWorker))[tabId].hardReload;
        }).toBe(true);
        // Re-rendered after the save, but the section is still open and checked.
        await expect(popup.getByLabel('Hard reload (skip cache)')).toBeChecked();

        await popup.getByLabel('Randomize, up to').check();
        await expect.poll(async function () {
            return (await getTabs(serviceWorker))[tabId].intervalMax;
        }).toBe(90);
        await expect(popup.locator('#activeTabsList')).toContainText('Next reload in');
    });

    test('text stop condition is saved from the popup', async function ({ context, serviceWorker, extensionId }) {
        const target = await context.newPage();
        await target.goto(TARGET_URL);
        const tabId = await watchTab(serviceWorker, TARGET_URL, { interval: 60, paused: false });

        const popup = await context.newPage();
        await popup.goto('chrome-extension://' + extensionId + '/popup.html');
        await popup.locator('#activeTabsList select').selectOption('textAppears');
        await popup.getByPlaceholder('e.g. In stock').fill('Back in stock');
        await popup.getByPlaceholder('e.g. In stock').press('Enter');

        await expect.poll(async function () {
            return (await getTabs(serviceWorker))[tabId].stopAfter;
        }).toEqual({ type: 'text', text: 'Back in stock', when: 'appears' });
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
