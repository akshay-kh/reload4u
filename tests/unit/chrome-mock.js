// Minimal in-memory fake of the chrome.* APIs used by the extension. Callbacks
// and onChanged events are delivered asynchronously (microtasks), like the
// real APIs, so tests must `await flush()` after triggering anything.

function createEvent() {
    const listeners = [];
    return {
        listeners: listeners,
        addListener: function (fn) { listeners.push(fn); },
        removeListener: function (fn) {
            const i = listeners.indexOf(fn);
            if (i !== -1) listeners.splice(i, 1);
        },
        emit: function () {
            const args = arguments;
            listeners.forEach(function (fn) { fn.apply(null, args); });
        }
    };
}

const clone = function (v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
const later = function (fn) { Promise.resolve().then(fn); };

function createStorageArea(name, onChanged) {
    const data = {};

    function pick(keys) {
        if (keys === null || keys === undefined) return clone(data);
        const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        const out = {};
        list.forEach(function (k) { if (k in data) out[k] = clone(data[k]); });
        return out;
    }

    return {
        data: data,
        get: function (keys, cb) {
            const result = pick(keys);
            return new Promise(function (resolve) {
                later(function () { if (cb) cb(result); resolve(result); });
            });
        },
        set: function (items, cb) {
            const changes = {};
            Object.keys(items).forEach(function (k) {
                changes[k] = { oldValue: clone(data[k]), newValue: clone(items[k]) };
                data[k] = clone(items[k]);
            });
            return new Promise(function (resolve) {
                later(function () {
                    onChanged.emit(changes, name);
                    if (cb) cb();
                    resolve();
                });
            });
        },
        remove: function (keys, cb) {
            const changes = {};
            (typeof keys === 'string' ? [keys] : keys).forEach(function (k) {
                if (k in data) {
                    changes[k] = { oldValue: clone(data[k]) };
                    delete data[k];
                }
            });
            return new Promise(function (resolve) {
                later(function () {
                    if (Object.keys(changes).length) onChanged.emit(changes, name);
                    if (cb) cb();
                    resolve();
                });
            });
        }
    };
}

export function createChromeMock(options) {
    options = options || {};
    const storageOnChanged = createEvent();
    const tabs = {};          // id (number) -> tab object
    const reloads = {};       // id (number) -> reload count
    const alarms = {};        // name -> alarm info
    const badge = { text: '' };

    const chrome = {
        runtime: {
            lastError: undefined,
            getURL: function (path) {
                return (options.firefox ? 'moz-extension://test-id/' : 'chrome-extension://test-id/') + path;
            },
            getManifest: function () { return { version: '1.0.0' }; },
            onInstalled: createEvent(),
            openOptionsPage: function () {}
        },
        storage: {
            onChanged: storageOnChanged,
            sync: createStorageArea('sync', storageOnChanged),
            session: createStorageArea('session', storageOnChanged)
        },
        alarms: {
            all: alarms,
            create: function (name, info) { alarms[name] = Object.assign({ name: name }, info); },
            clear: function (name, cb) {
                const existed = name in alarms;
                delete alarms[name];
                if (cb) later(function () { cb(existed); });
            },
            get: function (name, cb) { later(function () { cb(alarms[name]); }); },
            onAlarm: createEvent()
        },
        tabs: {
            all: tabs,
            reloads: reloads,
            get: function (id, cb) {
                later(function () {
                    if (!tabs[id]) {
                        chrome.runtime.lastError = { message: 'No tab with id: ' + id };
                        cb(undefined);
                        chrome.runtime.lastError = undefined;
                        return;
                    }
                    cb(Object.assign({}, tabs[id]));
                });
            },
            reload: function (id, cb) {
                later(function () {
                    if (!tabs[id]) {
                        chrome.runtime.lastError = { message: 'No tab with id: ' + id };
                        if (cb) cb();
                        chrome.runtime.lastError = undefined;
                        return;
                    }
                    reloads[id] = (reloads[id] || 0) + 1;
                    if (cb) cb();
                });
            },
            query: function (q, cb) { later(function () { cb(Object.values(tabs)); }); },
            onUpdated: createEvent(),
            onRemoved: createEvent()
        },
        scripting: {
            executeScript: function () {
                return Promise.resolve([{ result: options.contentHash !== undefined ? options.contentHash() : 0 }]);
            }
        },
        action: {
            badge: badge,
            setBadgeText: function (d) { badge.text = d.text; },
            setBadgeBackgroundColor: function () {}
        }
    };

    chrome.addTab = function (id, props) {
        tabs[id] = Object.assign({ id: id, title: 'Tab ' + id, url: 'https://example.com/' + id, status: 'complete' }, props);
    };

    return chrome;
}

// Drains pending microtask chains (mock callbacks, promise .then()s).
export async function flush(rounds) {
    for (let i = 0; i < (rounds || 50); i++) await Promise.resolve();
}
