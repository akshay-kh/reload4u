// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeMock, flush } from './chrome-mock.js';

let chrome;
let osDark;
let mediaListeners;

async function loadTheme(savedTheme) {
    chrome = createChromeMock();
    globalThis.chrome = chrome;
    if (savedTheme !== undefined) {
        chrome.storage.sync.data.reload4uSettings = { defaultInterval: 30, theme: savedTheme };
    }
    vi.resetModules();
    const mod = await import('../../src/theme.js');
    await flush();
    return mod;
}

function isDark() {
    return document.documentElement.classList.contains('dark');
}

beforeEach(function () {
    osDark = false;
    mediaListeners = [];
    window.matchMedia = function () {
        return {
            get matches() { return osDark; },
            addEventListener: function (_, fn) { mediaListeners.push(fn); }
        };
    };
    localStorage.clear();
    document.documentElement.classList.remove('dark');
});

afterEach(function () {
    delete globalThis.chrome;
});

describe('theme', function () {
    it('defaults to system and follows the OS preference', async function () {
        osDark = true;
        await loadTheme();
        expect(isDark()).toBe(true);
    });

    it('applies an explicit light theme even when the OS is dark', async function () {
        osDark = true;
        await loadTheme('light');
        expect(isDark()).toBe(false);
    });

    it('applies an explicit dark theme even when the OS is light', async function () {
        await loadTheme('dark');
        expect(isDark()).toBe(true);
    });

    it('updates live when the OS preference changes in system mode', async function () {
        await loadTheme('system');
        expect(isDark()).toBe(false);

        osDark = true;
        mediaListeners.forEach(function (fn) { fn(); });
        expect(isDark()).toBe(true);
    });

    it('ignores OS changes when a theme is chosen explicitly', async function () {
        await loadTheme('light');
        osDark = true;
        mediaListeners.forEach(function (fn) { fn(); });
        expect(isDark()).toBe(false);
    });

    it('reacts to the setting being changed from another page', async function () {
        await loadTheme('light');
        await chrome.storage.sync.set({ reload4uSettings: { defaultInterval: 30, theme: 'dark' } });
        await flush();
        expect(isDark()).toBe(true);
    });

    it('caches the choice in localStorage and applies it before storage answers', async function () {
        await loadTheme('dark');
        expect(localStorage.getItem('reload4u_theme')).toBe('dark');

        document.documentElement.classList.remove('dark');
        chrome = createChromeMock();
        chrome.storage.sync.get = function () {}; // storage never answers: only the cache can apply it
        globalThis.chrome = chrome;
        vi.resetModules();
        await import('../../src/theme.js');
        expect(isDark()).toBe(true);
    });

    it('treats an unknown value as system', async function () {
        const { applyTheme } = await loadTheme();
        osDark = true;
        applyTheme('purple');
        expect(isDark()).toBe(true);
    });
});
