import { test as base, expect, chromium } from '@playwright/test';
import path from 'node:path';

const DIST = path.resolve(__dirname, '../../dist');

// Loads the extension into a browser whose UI language is Spanish.
const test = base.extend({
    context: async function ({}, use) {
        const context = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            args: ['--lang=es', '--disable-extensions-except=' + DIST, '--load-extension=' + DIST]
        });
        await use(context);
        await context.close();
    },
    extensionId: async function ({ context }, use) {
        let [worker] = context.serviceWorkers();
        if (!worker) worker = await context.waitForEvent('serviceworker');
        await use(worker.url().split('/')[2]);
    }
});

test.describe('localization', function () {
    test('popup and settings follow the browser language', async function ({ context, extensionId }) {
        const popup = await context.newPage();
        await popup.goto('chrome-extension://' + extensionId + '/popup.html');
        await expect(popup.locator('#selectThisTab')).toContainText('Seleccionar esta pestaña');

        const settings = await context.newPage();
        await settings.goto('chrome-extension://' + extensionId + '/settings.html');
        await expect(settings.locator('h1')).toHaveText('Ajustes de Reload4U');
        await expect(settings.locator('#minIntervalHint')).toHaveText('Mínimo: 0.5 segundos');
        await expect(settings).toHaveTitle('Ajustes de Reload4U');
    });
});
