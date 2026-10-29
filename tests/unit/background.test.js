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

describe('per-tab options', function () {
    it('bypasses the cache only when hard reload is on', async function () {
        await loadBackground();
        chrome.addTab(21);
        chrome.addTab(22);
        await setTabs({
            '21': { interval: 60, paused: false, hardReload: true },
            '22': { interval: 60, paused: false }
        });
        chrome.alarms.onAlarm.emit({ name: 'reloadTab_21' });
        chrome.alarms.onAlarm.emit({ name: 'reloadTab_22' });
        await flush();

        expect(chrome.tabs.reloadProps[21]).toEqual({ bypassCache: true });
        expect(chrome.tabs.reloadProps[22]).toEqual({ bypassCache: false });
    });

    it('randomizes each sub-30s delay between interval and intervalMax', async function () {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        await loadBackground();
        chrome.addTab(23);
        await setTabs({ '23': { interval: 4, intervalMax: 8, paused: false } });

        expect(chrome.alarms.all.reloadTab_23).toBeUndefined();
        expect(chrome.storage.session.data.reloadTab_23).toMatchObject({ ms: 6000 });
        expect(chrome.alarms.all.reload4u_keepalive).toBeDefined();
        expect(chrome.tabs.reloads[23]).toBe(1); // immediate first reload

        await vi.advanceTimersByTimeAsync(5999);
        expect(chrome.tabs.reloads[23]).toBe(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(chrome.tabs.reloads[23]).toBe(2);
    });

    it('uses one-shot alarms for long random delays and reschedules after each', async function () {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        await loadBackground();
        chrome.addTab(24);
        await setTabs({ '24': { interval: 60, intervalMax: 120, paused: false } });

        const first = chrome.alarms.all.reloadTab_24;
        expect(first.periodInMinutes).toBeUndefined();
        expect(first.when).toBeGreaterThan(Date.now());

        delete chrome.alarms.all.reloadTab_24; // one-shot alarms are gone once fired
        chrome.alarms.onAlarm.emit({ name: 'reloadTab_24' });
        await flush();
        expect(chrome.tabs.reloads[24]).toBe(2); // immediate + alarm
        expect(chrome.alarms.all.reloadTab_24).toBeDefined();
    });

    it('skips a reload while the page has unsaved input', async function () {
        let busy = true;
        await loadBackground({ page: { inspectPage: function () { return { busy: busy, x: 0, y: 0 }; } } });
        chrome.addTab(25);
        await setTabs({ '25': { interval: 60, paused: false, protectTyping: true } });

        chrome.alarms.onAlarm.emit({ name: 'reloadTab_25' });
        await flush();
        expect(chrome.tabs.reloads[25]).toBeUndefined();

        busy = false;
        chrome.alarms.onAlarm.emit({ name: 'reloadTab_25' });
        await flush();
        expect(chrome.tabs.reloads[25]).toBe(1);
    });

    it('reloads anyway when the page cannot be inspected', async function () {
        await loadBackground({ page: { inspectPage: function () { throw new Error('cannot inject'); } } });
        chrome.scripting.executeScript = function () { return Promise.reject(new Error('cannot inject')); };
        chrome.addTab(26);
        await setTabs({ '26': { interval: 60, paused: false, protectTyping: true } });

        chrome.alarms.onAlarm.emit({ name: 'reloadTab_26' });
        await flush();
        expect(chrome.tabs.reloads[26]).toBe(1);
    });

    it('saves the scroll position before a reload and restores it after', async function () {
        await loadBackground({ page: { inspectPage: function () { return { busy: false, x: 0, y: 840 }; } } });
        chrome.addTab(27);
        await setTabs({ '27': { interval: 60, paused: false, keepScroll: true } });

        chrome.alarms.onAlarm.emit({ name: 'reloadTab_27' });
        await flush();
        expect(chrome.storage.session.data.reload4u_scroll_27).toEqual({ x: 0, y: 840 });

        chrome.tabs.onUpdated.emit(27, { status: 'complete' });
        await flush();
        const restore = chrome.scripting.calls.find(function (c) { return c.func === 'restoreScroll'; });
        expect(restore).toMatchObject({ tabId: 27, args: [0, 840] });
        expect(chrome.storage.session.data.reload4u_scroll_27).toBeUndefined();
    });
});

describe('text stop condition', function () {
    it('stops when the text appears', async function () {
        let found = false;
        await loadBackground({ page: { pageHasText: function () { return found; } } });
        chrome.addTab(28);
        await setTabs({ '28': { interval: 60, paused: false, stopAfter: { type: 'text', text: 'In stock', when: 'appears' } } });

        chrome.tabs.onUpdated.emit(28, { status: 'complete' });
        await flush();
        expect(syncTabs()['28'].paused).toBe(false);

        found = true;
        chrome.tabs.onUpdated.emit(28, { status: 'complete' });
        await flush();
        expect(syncTabs()['28'].paused).toBe(true);
        expect(syncTabs()['28'].stoppedReason).toBe('Stopped: "In stock" appeared');
        const check = chrome.scripting.calls.find(function (c) { return c.func === 'pageHasText'; });
        expect(check.args).toEqual(['In stock']);
    });

    it('stops when the text disappears', async function () {
        await loadBackground({ page: { pageHasText: function () { return false; } } });
        chrome.addTab(29);
        await setTabs({ '29': { interval: 60, paused: false, stopAfter: { type: 'text', text: 'Sold out', when: 'disappears' } } });

        chrome.tabs.onUpdated.emit(29, { status: 'complete' });
        await flush();
        expect(syncTabs()['29'].stoppedReason).toBe('Stopped: "Sold out" disappeared');
    });
});

describe('notifications', function () {
    it('notifies when a stop condition fires, if turned on', async function () {
        const seed = { sync: { reload4uSettings: { defaultInterval: 30, notifyOnStop: true } } };
        await loadBackground({ notifications: true }, seed);
        chrome.addTab(30, { title: 'Tickets' });
        await setTabs({ '30': { interval: 5, paused: false, stopAfter: { type: 'count', limit: 1 } } });
        await flush();

        expect(chrome.notifications.created.reload4u_stop_30).toMatchObject({
            title: 'Reload4U: Tickets',
            message: 'Stopped: reached 1 reload. Click to open the tab.'
        });
    });

    it('stays quiet when turned off', async function () {
        await loadBackground({ notifications: true });
        chrome.addTab(31);
        await setTabs({ '31': { interval: 5, paused: false, stopAfter: { type: 'count', limit: 1 } } });
        await flush();

        expect(syncTabs()['31'].paused).toBe(true);
        expect(chrome.notifications.created).toEqual({});
    });
});

describe('keyboard shortcut', function () {
    it('adds the tab at the default interval, then pauses and resumes it', async function () {
        const seed = { sync: { reload4uSettings: { defaultInterval: 45 } } };
        await loadBackground(undefined, seed);
        chrome.addTab(32);

        chrome.commands.onCommand.emit('toggle-current-tab', { id: 32 });
        await flush();
        expect(syncTabs()['32']).toEqual({ interval: 45, paused: false });

        chrome.commands.onCommand.emit('toggle-current-tab', { id: 32 });
        await flush();
        expect(syncTabs()['32'].paused).toBe(true);

        chrome.commands.onCommand.emit('toggle-current-tab', { id: 32 });
        await flush();
        expect(syncTabs()['32'].paused).toBe(false);
    });
});

describe('context menu', function () {
    it('creates the menu on install', async function () {
        await loadBackground();
        chrome.runtime.onInstalled.emit({ reason: 'install' });
        await flush();

        expect(Object.keys(chrome.contextMenus.items)).toEqual(expect.arrayContaining([
            'reload4u', 'reload4u_every_10', 'reload4u_every_300', 'reload4u_stop'
        ]));
        expect(chrome.contextMenus.items.reload4u_every_60.title).toBe('Auto-reload every 1 minute');
    });

    it('sets an interval while keeping other options, and stops the tab', async function () {
        await loadBackground();
        chrome.addTab(33);
        await setTabs({ '33': { interval: 5, paused: true, stoppedReason: 'x', hardReload: true } });

        chrome.contextMenus.onClicked.emit({ menuItemId: 'reload4u_every_300' }, { id: 33 });
        await flush();
        expect(syncTabs()['33']).toEqual({ interval: 300, paused: false, hardReload: true });

        chrome.contextMenus.onClicked.emit({ menuItemId: 'reload4u_stop' }, { id: 33 });
        await flush();
        expect(syncTabs()['33']).toBeUndefined();
    });
});
