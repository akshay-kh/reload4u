import { test as base, chromium } from '@playwright/test';
import path from 'node:path';

const DIST = path.resolve(__dirname, '../../dist'); // specs are transpiled to CommonJS
export const TARGET_URL = 'http://reload4u.test/target';

// Loads the built extension (dist/) into a fresh Chromium profile per test.
// Extensions need a persistent context; the 'chromium' channel supports them headless.
export const test = base.extend({
    context: async function ({}, use) {
        const context = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            args: [
                '--disable-extensions-except=' + DIST,
                '--load-extension=' + DIST
            ]
        });
        // Serve a tiny page for the extension to reload, with a per-load stamp.
        let served = 0;
        await context.route('http://reload4u.test/**', function (route) {
            served++;
            route.fulfill({
                contentType: 'text/html',
                body: '<title>Target page</title><p id="load">' + served + '</p>' +
                    '<input id="field"><div style="height:4000px"></div>'
            });
        });
        await use(context);
        await context.close();
    },
    serviceWorker: async function ({ context }, use) {
        let [worker] = context.serviceWorkers();
        if (!worker) worker = await context.waitForEvent('serviceworker');
        await use(worker);
    },
    extensionId: async function ({ serviceWorker }, use) {
        await use(serviceWorker.url().split('/')[2]);
    }
});

export const expect = test.expect;

// Watches the tab showing `url` the same way the popup's "Select This Tab" does:
// by writing selectedTabsWithIntervals, which the background reacts to.
export async function watchTab(serviceWorker, url, tabConfig) {
    return serviceWorker.evaluate(async function (args) {
        const [tab] = await chrome.tabs.query({ url: args.url });
        const data = {};
        data[String(tab.id)] = args.tabConfig;
        await chrome.storage.sync.set({ selectedTabsWithIntervals: data });
        return tab.id;
    }, { url: url, tabConfig: tabConfig });
}

export async function getTabs(serviceWorker) {
    return serviceWorker.evaluate(async function () {
        const data = await chrome.storage.sync.get('selectedTabsWithIntervals');
        return data.selectedTabsWithIntervals || {};
    });
}
