import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeMock, flush } from './chrome-mock.js';

let chrome;

// background.js registers listeners and hydrates at import time, so each test
// gets a fresh module instance against a fresh mock.
async function loadBackground(options, seed) {
    chrome = createChromeMock(options);
    globalThis.chrome = chrome;
    if (seed) Object.assign(chrome.storage.sync.data, JSON.parse(JSON.stringify(seed.sync || {})));
    if (seed) Object.assign(chrome.storage.session.data, JSON.parse(JSON.stringify(seed.session || {})));
    if (seed && seed.tabs) seed.tabs.forEach(function (id) { chrome.addTab(id); });
    vi.resetModules();
    await import('../../src/background.js');
    await flush();
}

async function setTabs(tabsData) {
    await chrome.storage.sync.set({ selectedTabsWithIntervals: tabsData });
    await flush();
}

function syncTabs() {
    return chrome.storage.sync.data.selectedTabsWithIntervals;
}

beforeEach(function () {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(function () {});
    vi.spyOn(console, 'warn').mockImplementation(function () {});
});

afterEach(function () {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete globalThis.chrome;
});

describe('scheduling', function () {
    it('uses chrome.alarms for intervals >= 30s', async function () {
        await loadBackground();
        chrome.addTab(1);
        await setTabs({ '1': { interval: 60, paused: false } });

        const alarm = chrome.alarms.all.reloadTab_1;
        expect(alarm).toBeDefined();
        expect(alarm.periodInMinutes).toBe(1);
        expect(chrome.alarms.all.reload4u_keepalive).toBeUndefined();
        expect(chrome.storage.session.data.reloadTab_1).toBeUndefined();
    });

    it('uses setInterval plus a keepalive alarm for sub-30s intervals', async function () {
        await loadBackground();
        chrome.addTab(2);
        await setTabs({ '2': { interval: 5, paused: false } });

        expect(chrome.alarms.all.reloadTab_2).toBeUndefined();
        expect(chrome.alarms.all.reload4u_keepalive).toBeDefined();
        expect(chrome.storage.session.data.reloadTab_2).toMatchObject({ ms: 5000 });
        expect(chrome.tabs.reloads[2]).toBe(1); // immediate first reload

        await vi.advanceTimersByTimeAsync(10000);
        expect(chrome.tabs.reloads[2]).toBe(3);
    });

    it('fires an alarm-based reload when the alarm goes off', async function () {
        await loadBackground();
        chrome.addTab(3);
        await setTabs({ '3': { interval: 60, paused: false } });

        chrome.alarms.onAlarm.emit({ name: 'reloadTab_3' });
        await flush();
        expect(chrome.tabs.reloads[3]).toBe(1);
    });

    it('on Firefox, runs 30-59s intervals on the timer path instead of a clamped alarm', async function () {
        await loadBackground({ firefox: true });
        chrome.addTab(4);
        await setTabs({ '4': { interval: 45, paused: false } });

        expect(chrome.alarms.all.reloadTab_4).toBeUndefined();
        expect(chrome.storage.session.data.reloadTab_4).toMatchObject({ ms: 45000 });
    });

    it('on Firefox, still uses alarms for intervals >= 60s', async function () {
        await loadBackground({ firefox: true });
        chrome.addTab(5);
        await setTabs({ '5': { interval: 60, paused: false } });

        expect(chrome.alarms.all.reloadTab_5).toBeDefined();
    });

    it('on Chrome, uses an alarm for a 45s interval', async function () {
        await loadBackground();
        chrome.addTab(6);
        await setTabs({ '6': { interval: 45, paused: false } });

        expect(chrome.alarms.all.reloadTab_6.periodInMinutes).toBe(0.75);
    });

    it('pausing stops the timer and clears the keepalive', async function () {
        await loadBackground();
        chrome.addTab(7);
        await setTabs({ '7': { interval: 5, paused: false } });
        await setTabs({ '7': { interval: 5, paused: true } });

        const before = chrome.tabs.reloads[7];
        await vi.advanceTimersByTimeAsync(20000);
        expect(chrome.tabs.reloads[7]).toBe(before);
        expect(chrome.alarms.all.reload4u_keepalive).toBeUndefined();
    });

    it('removing a tab clears its alarm and session state', async function () {
        await loadBackground();
        chrome.addTab(8);
        await setTabs({ '8': { interval: 60, paused: false } });
        await setTabs({});

        expect(chrome.alarms.all.reloadTab_8).toBeUndefined();
        expect(chrome.storage.session.data.reload4u_progress_8).toBeUndefined();
    });
});

describe('storage migration', function () {
    it('migrates legacy numeric entries and floors them at 30s', async function () {
        await loadBackground();
        chrome.addTab(9);
        await setTabs({ '9': 10 });

        expect(chrome.alarms.all.reloadTab_9.periodInMinutes).toBe(0.5);
    });
});

describe('badge', function () {
    it('shows the number of active (non-paused) tabs', async function () {
        await loadBackground();
        chrome.addTab(10);
        chrome.addTab(11);
        await setTabs({
            '10': { interval: 60, paused: false },
            '11': { interval: 60, paused: true }
        });
        expect(chrome.action.badge.text).toBe('1');

        await setTabs({});
        expect(chrome.action.badge.text).toBe('');
    });
});

describe('reload counter and stop conditions', function () {
    it('counts every successful reload', async function () {
        await loadBackground();
        chrome.addTab(12);
        await setTabs({ '12': { interval: 5, paused: false } });
        await vi.advanceTimersByTimeAsync(10000);

        expect(chrome.storage.session.data.reload4u_progress_12).toEqual({ count: 3 });
    });

    it('pauses a tab with a reason once the reload-count limit is reached', async function () {
        await loadBackground();
        chrome.addTab(13);
        await setTabs({ '13': { interval: 5, paused: false, stopAfter: { type: 'count', limit: 2 } } });
        await vi.advanceTimersByTimeAsync(5000);

        expect(syncTabs()['13'].paused).toBe(true);
        expect(syncTabs()['13'].stoppedReason).toBe('Stopped: reached 2 reloads');

        // and it actually stops reloading
        const reloads = chrome.tabs.reloads[13];
        await vi.advanceTimersByTimeAsync(20000);
        expect(chrome.tabs.reloads[13]).toBe(reloads);
    });

    it('pauses a tab when its title changes from the baseline', async function () {
        await loadBackground();
        chrome.addTab(14, { title: 'Waiting...' });
        await setTabs({ '14': { interval: 60, paused: false, stopAfter: { type: 'title' } } });
        expect(chrome.storage.session.data.reload4u_title_14).toEqual({ baseline: 'Waiting...' });

        chrome.tabs.onUpdated.emit(14, { title: 'Waiting...' });
        await flush();
        expect(syncTabs()['14'].paused).toBe(false);

        chrome.tabs.onUpdated.emit(14, { title: 'Ready!' });
        await flush();
        expect(syncTabs()['14'].paused).toBe(true);
        expect(syncTabs()['14'].stoppedReason).toBe('Stopped: page title changed');
    });

    it('pauses a tab when its page-content hash changes', async function () {
        let hash = 111;
        await loadBackground({ contentHash: function () { return hash; } });
        chrome.addTab(15);
        await setTabs({ '15': { interval: 60, paused: false, stopAfter: { type: 'content' } } });
        expect(chrome.storage.session.data.reload4u_content_15).toEqual({ hash: 111 });

        chrome.tabs.onUpdated.emit(15, { status: 'complete' });
        await flush();
        expect(syncTabs()['15'].paused).toBe(false);

        hash = 222;
        chrome.tabs.onUpdated.emit(15, { status: 'complete' });
        await flush();
        expect(syncTabs()['15'].paused).toBe(true);
        expect(syncTabs()['15'].stoppedReason).toBe('Stopped: page content changed');
    });

    it('editing only the stop condition does not fire an extra reload', async function () {
        await loadBackground();
        chrome.addTab(16);
        await setTabs({ '16': { interval: 60, paused: false } });
        chrome.alarms.all.reloadTab_16.marker = true;

        await setTabs({ '16': { interval: 60, paused: false, stopAfter: { type: 'count', limit: 5 } } });
        expect(chrome.alarms.all.reloadTab_16.marker).toBe(true); // alarm not recreated
        expect(chrome.storage.session.data.reload4u_progress_16).toEqual({ count: 0 });
    });
});

describe('worker restart (hydrate)', function () {
    it('rebuilds sub-30s timers and keeps existing progress', async function () {
        const seed = {
            sync: { selectedTabsWithIntervals: { '17': { interval: 5, paused: false, stopAfter: { type: 'count', limit: 10 } } } },
            session: { reload4u_progress_17: { count: 4 } },
            tabs: [17]
        };
        await loadBackground(undefined, seed);
        await vi.advanceTimersByTimeAsync(5000);

        expect(chrome.tabs.reloads[17]).toBe(2); // immediate rebuild reload + one tick
        expect(chrome.storage.session.data.reload4u_progress_17.count).toBe(6);
        expect(chrome.alarms.all.reload4u_keepalive).toBeDefined();
    });

    it('does not touch alarm-based tabs', async function () {
        const seed = { sync: { selectedTabsWithIntervals: { '18': { interval: 60, paused: false } } } };
        await loadBackground(undefined, seed);

        expect(chrome.alarms.all.reloadTab_18).toBeUndefined();
    });
});

describe('closed tabs', function () {
    it('removes a tab from storage when its reload fails', async function () {
        await loadBackground();
        await setTabs({ '19': { interval: 5, paused: false } }); // tab 19 never existed
        await flush();

        expect(syncTabs()['19']).toBeUndefined();
    });

    it('removes a tab from storage when it is closed', async function () {
        await loadBackground();
        chrome.addTab(20);
        await setTabs({ '20': { interval: 60, paused: false } });

        chrome.tabs.onRemoved.emit(20);
        await flush();
        expect(syncTabs()['20']).toBeUndefined();
    });
});
