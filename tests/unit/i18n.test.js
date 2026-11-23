import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// vitest runs from the repo root.
const root = process.cwd();
const localesDir = resolve(root, 'public/_locales');
const load = function (loc) {
    return JSON.parse(readFileSync(resolve(localesDir, loc, 'messages.json'), 'utf8'));
};
const placeholderNames = function (entry) {
    return Object.keys(entry.placeholders || {}).map(function (n) { return n.toLowerCase(); }).sort();
};
const tokens = function (entry) {
    return (entry.message.match(/\$[A-Za-z0-9_@]+\$/g) || []).map(function (s) { return s.slice(1, -1).toLowerCase(); }).sort();
};

const en = load('en');
const locales = readdirSync(localesDir).filter(function (l) { return l !== 'en'; });

describe('message catalogs', function () {
    it('use every placeholder they declare, and only those', function () {
        Object.keys(en).forEach(function (key) {
            expect(tokens(en[key]), key).toEqual(placeholderNames(en[key]));
        });
    });

    locales.forEach(function (loc) {
        it(loc + ' has exactly the keys and placeholders of en', function () {
            const messages = load(loc);
            expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
            Object.keys(en).forEach(function (key) {
                expect(tokens(messages[key]), loc + '.' + key).toEqual(placeholderNames(en[key]));
            });
        });
    });

    it('define every key referenced from the source and manifest', function () {
        const used = new Set();
        ['background.js', 'popup.js', 'settings.js'].forEach(function (f) {
            const src = readFileSync(resolve(root, 'src', f), 'utf8');
            (src.match(/\bt\('([A-Za-z0-9_]+)'/g) || []).forEach(function (m) { used.add(m.slice(3, -1)); });
        });
        ['popup.html', 'settings.html'].forEach(function (f) {
            const html = readFileSync(resolve(root, 'src', f), 'utf8');
            (html.match(/data-i18n(?:-title|-placeholder)?="([^"]+)"/g) || []).forEach(function (m) {
                used.add(m.split('"')[1]);
            });
        });
        (readFileSync(resolve(root, 'public/manifest.json'), 'utf8').match(/__MSG_(\w+)__/g) || []).forEach(function (m) {
            used.add(m.slice(6, -2));
        });
        expect(used.size).toBeGreaterThan(40);
        used.forEach(function (key) { expect(en, key).toHaveProperty(key); });
    });

    it('keeps the extension description within the Chrome Web Store limit', function () {
        ['en'].concat(locales).forEach(function (loc) {
            expect(load(loc).extDescription.message.length, loc).toBeLessThanOrEqual(132);
        });
    });
});
