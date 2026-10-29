// Reload4U background service worker
//
// Scheduling strategy:
//   interval >= 30s  -> chrome.alarms (survives service-worker shutdown)
//   interval <  30s  -> setInterval inside the worker, plus a 30s keepalive
//                       alarm that wakes the worker and rebuilds timers if
//                       Chrome ever terminates it.
// On Firefox the alarms floor for MV3 is 1 minute rather than 30s, so the
// cutover is 60s there instead (see TIMER_THRESHOLD).
//
// The background is the single owner of scheduling: the popup/settings pages
// only write `selectedTabsWithIntervals` to storage, and we react to changes.
// Intervals are stored in seconds; chrome.alarms only understands minutes, so
// we convert at that boundary.
//
// Stop conditions: a tab can optionally carry `stopAfter` ({type:'count',limit},
// {type:'title'}, or {type:'content'}). Progress for these lives in
// storage.session (not sync, which has a write-rate quota) and is reset only
// when the condition is freshly armed (new tab, resumed from pause, or the
// condition itself was edited) — never on a worker-restart rebuild, so
// progress survives that.
//
// 'content' detection injects a tiny content script (chrome.scripting) into
// the watched tab after each reload completes, which hashes document.body's
// text IN THE PAGE and returns only that hash — raw page content never
// leaves the tab or gets stored/transmitted anywhere. 'text' detection works
// the same way but returns only whether the user's search text was found.
//
// Per-tab options (all optional): `hardReload` bypasses the cache,
// `intervalMax` randomizes each delay between `interval` and itself,
// `protectTyping` skips a reload while a text field has unsaved input, and
// `keepScroll` restores the scroll position after the reload. The last two
// inject a function that reports only "is a field being edited" and the
// scroll offsets — never page text.

const ALARM_PREFIX = 'reloadTab_';
const KEEPALIVE_ALARM = 'reload4u_keepalive';
const PROGRESS_PREFIX = 'reload4u_progress_';
const TITLE_PREFIX = 'reload4u_title_';
const CONTENT_PREFIX = 'reload4u_content_';
const SCROLL_PREFIX = 'reload4u_scroll_';
const NOTIFICATION_PREFIX = 'reload4u_stop_';
const COMMAND_TOGGLE = 'toggle-current-tab';
const MENU_PARENT = 'reload4u';
const MENU_INTERVAL_PREFIX = 'reload4u_every_';
const MENU_STOP = 'reload4u_stop';
const MENU_INTERVALS = [10, 30, 60, 300]; // seconds
const DEFAULT_INTERVAL = 30;     // seconds – used when settings have none
const ALARM_MIN_INTERVAL = 30;   // seconds – chrome.alarms floor (0.5 min)
const MIN_INTERVAL = 0.5;        // seconds – absolute floor
// Firefox clamps chrome.alarms periods to 1 minute, so 30–59s intervals
// would silently fire every 60s. Detected via the extension URL scheme
// rather than the user agent, which can be spoofed/overridden.
const IS_FIREFOX = chrome.runtime.getURL('').startsWith('moz-extension://');
const TIMER_THRESHOLD = IS_FIREFOX ? 60 : ALARM_MIN_INTERVAL; // seconds – below this, use setInterval
const SKIP_IF_LOADING_BELOW = 2; // seconds – below this, don't reload a tab still loading
const BADGE_COLOR = '#2563eb';

// tabId (string) -> setInterval handle. Lives only as long as the worker does.
const timers = {};
// Guards against queuing many removals when a fast-reloading tab disappears.
const removing = new Set();

chrome.runtime.onInstalled.addListener(function () {
    console.log('Reload4U extension installed');
    createContextMenus();
});

// Chrome keeps menus across restarts; Firefox event pages may not, so
// rebuild them on startup too (removeAll makes this idempotent).
chrome.runtime.onStartup && chrome.runtime.onStartup.addListener(createContextMenus);

// ---------- storage helpers ----------

function normalize(tabsData) {
    tabsData = tabsData || {};
    for (const tabId in tabsData) {
        if (typeof tabsData[tabId] === 'number') {
            // Legacy format: a bare number predates per-tab pause/interval
            // objects and the sub-30s feature. Anything below the old 30s
            // floor was never a valid user choice, so fall back to it.
            const interval = tabsData[tabId] < ALARM_MIN_INTERVAL ? ALARM_MIN_INTERVAL : tabsData[tabId];
            tabsData[tabId] = { interval: interval, paused: false };
        }
    }
    return tabsData;
}

function getSelectedTabs() {
    return new Promise(function (resolve, reject) {
        chrome.storage.sync.get('selectedTabsWithIntervals', function (data) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(normalize(data.selectedTabsWithIntervals));
            }
        });
    });
}

function removeFromStorage(tabId) {
    tabId = String(tabId);
    return getSelectedTabs().then(function (tabsData) {
        if (!(tabId in tabsData)) return;
        delete tabsData[tabId];
        // onChanged listener below will stop its timer/alarm
        return chrome.storage.sync.set({ selectedTabsWithIntervals: tabsData });
    });
}

function sameStopAfter(a, b) {
    return JSON.stringify(a || null) === JSON.stringify(b || null);
}

function getDefaultInterval() {
    return new Promise(function (resolve) {
        chrome.storage.sync.get('reload4uSettings', function (data) {
            const settings = data.reload4uSettings || {};
            resolve(Math.max(MIN_INTERVAL, settings.defaultInterval || DEFAULT_INTERVAL));
        });
    });
}

// Read-modify-write of one tab's entry; `update` gets the existing entry (or
// undefined) and returns the new one, or null to remove the tab.
function updateTab(tabId, update) {
    tabId = String(tabId);
    return getSelectedTabs().then(function (tabsData) {
        const next = update(tabsData[tabId]);
        if (next) {
            tabsData[tabId] = next;
        } else if (tabId in tabsData) {
            delete tabsData[tabId];
        } else {
            return;
        }
        return chrome.storage.sync.set({ selectedTabsWithIntervals: tabsData });
    });
}

function resumed(tabData) {
    tabData.paused = false;
    delete tabData.stoppedReason;
    return tabData;
}

// ---------- scheduling ----------

function usesTimer(interval) {
    return interval < TIMER_THRESHOLD;
}

function isRandom(tabData) {
    return typeof tabData.intervalMax === 'number' && tabData.intervalMax > tabData.interval;
}

function stopTab(tabId) {
    tabId = String(tabId);
    if (timers[tabId]) {
        // Handles from setInterval and setTimeout share one pool, so
        // clearInterval also cancels a randomized tab's pending timeout.
        clearInterval(timers[tabId]);
        delete timers[tabId];
    }
    chrome.alarms.clear(ALARM_PREFIX + tabId);
    chrome.storage.session.remove(ALARM_PREFIX + tabId);
}

function clearStopConditionState(tabId) {
    tabId = String(tabId);
    chrome.storage.session.remove(PROGRESS_PREFIX + tabId);
    chrome.storage.session.remove(TITLE_PREFIX + tabId);
    chrome.storage.session.remove(CONTENT_PREFIX + tabId);
    chrome.storage.session.remove(SCROLL_PREFIX + tabId);
}

// Sets up (or carries forward) session-stored progress for a tab. The reload
// counter is tracked unconditionally — the popup shows it for every tab,
// whether or not a stop condition is using it. `reset` re-arms from scratch
// (new tab, resumed, condition edited); without it, existing progress is
// left alone (worker-restart rebuild).
function armStopCondition(tabId, tabData, reset) {
    tabId = String(tabId);
    const stopAfter = tabData.stopAfter;

    const progressKey = PROGRESS_PREFIX + tabId;
    if (reset) {
        // Write the reset value directly — a remove() followed by a separate
        // get()/set() has no ordering guarantee and can leave a stale prior
        // count in place if the remove hasn't landed yet.
        chrome.storage.session.set({ [progressKey]: { count: 0 } });
    } else {
        chrome.storage.session.get(progressKey, function (data) {
            if (!data[progressKey]) chrome.storage.session.set({ [progressKey]: { count: 0 } });
        });
    }

    const titleKey = TITLE_PREFIX + tabId;
    const contentKey = CONTENT_PREFIX + tabId;

    // 'count' and 'text' need no baseline: count uses the progress key above,
    // and text is checked against the user's search string after each reload.
    if (!stopAfter || stopAfter.type === 'count' || stopAfter.type === 'text') {
        if (reset) {
            chrome.storage.session.remove(titleKey);
            chrome.storage.session.remove(contentKey);
        }
        return;
    }

    if (stopAfter.type === 'title') {
        if (reset) {
            chrome.storage.session.remove(contentKey);
            chrome.tabs.get(parseInt(tabId, 10), function (tab) {
                if (chrome.runtime.lastError || !tab) return;
                chrome.storage.session.set({ [titleKey]: { baseline: tab.title } });
            });
        } else {
            chrome.storage.session.get(titleKey, function (data) {
                if (data[titleKey]) return;
                chrome.tabs.get(parseInt(tabId, 10), function (tab) {
                    if (chrome.runtime.lastError || !tab) return;
                    chrome.storage.session.set({ [titleKey]: { baseline: tab.title } });
                });
            });
        }
        return;
    }

    if (stopAfter.type === 'content') {
        if (reset) {
            chrome.storage.session.remove(titleKey);
            captureContentHash(tabId, true);
        } else {
            chrome.storage.session.get(contentKey, function (data) {
                if (!data[contentKey]) captureContentHash(tabId, true);
            });
        }
    }
}

// Runs entirely inside the page: hashes document.body's visible text and
// returns only the hash. The extension never receives or stores raw content.
function hashPageContent() {
    const text = document.body ? document.body.innerText : '';
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash) + text.charCodeAt(i);
        hash = hash & hash; // keep it a 32-bit int
    }
    return hash;
}

// Captures (forceBaseline: true) or checks (false) a tab's content hash.
// Silently no-ops on tabs we can't inject into (chrome://, the Web Store,
// a pending navigation, etc.) rather than erroring the whole extension.
function captureContentHash(tabId, forceBaseline) {
    const id = parseInt(tabId, 10);
    chrome.scripting.executeScript({
        target: { tabId: id },
        func: hashPageContent
    }).then(function (results) {
        const hash = results && results[0] && results[0].result;
        if (hash === undefined) return;

        const key = CONTENT_PREFIX + tabId;
        if (forceBaseline) {
            chrome.storage.session.set({ [key]: { hash: hash } });
            return;
        }
        chrome.storage.session.get(key, function (data) {
            const baseline = data[key] && data[key].hash;
            if (baseline === undefined) {
                chrome.storage.session.set({ [key]: { hash: hash } });
                return;
            }
            if (hash !== baseline) {
                triggerStop(tabId, 'Stopped: page content changed');
            }
        });
    }).catch(function () {
        // Not injectable — leave the tab watched but skip this check.
    });
}

// Runs inside the page: reports only whether `needle` occurs in the visible
// text (case-insensitive). The text itself never leaves the page.
function pageHasText(needle) {
    const text = document.body ? document.body.innerText : '';
    return text.toLowerCase().indexOf(String(needle).toLowerCase()) !== -1;
}

function checkPageText(tabId, stopAfter) {
    if (!stopAfter.text) return;
    chrome.scripting.executeScript({
        target: { tabId: parseInt(tabId, 10) },
        func: pageHasText,
        args: [stopAfter.text]
    }).then(function (results) {
        const found = results && results[0] && results[0].result;
        if (typeof found !== 'boolean') return;
        if (stopAfter.when === 'disappears' && !found) {
            triggerStop(tabId, `Stopped: "${stopAfter.text}" disappeared`);
        } else if (stopAfter.when !== 'disappears' && found) {
            triggerStop(tabId, `Stopped: "${stopAfter.text}" appeared`);
        }
    }).catch(function () {
        // Not injectable — leave the tab watched but skip this check.
    });
}

// Runs inside the page before a reload: is the user mid-edit (a text field
// holding input that differs from what the page loaded with, or a focused
// rich-text editor), and where is the page scrolled to? Returns only that.
function inspectPage() {
    const TEXT_TYPES = ['text', 'search', 'email', 'url', 'tel', 'password', 'number'];
    let busy = false;
    const active = document.activeElement;
    if (active && active.isContentEditable && document.hasFocus()) busy = true;
    const fields = document.querySelectorAll('input, textarea');
    for (let i = 0; !busy && i < fields.length; i++) {
        const f = fields[i];
        const isText = f.tagName === 'TEXTAREA' || TEXT_TYPES.indexOf(f.type) !== -1;
        if (isText && f.value !== '' && f.value !== f.defaultValue) busy = true;
    }
    return { busy: busy, x: window.scrollX, y: window.scrollY };
}

// Runs inside the page after a reload. Re-applied briefly because content
// that loads late can shift or shorten the page; stops as soon as the user
// scrolls, clicks or types themselves.
function restoreScroll(x, y) {
    let touched = false;
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (type) {
        window.addEventListener(type, function () { touched = true; }, { once: true, passive: true });
    });
    function apply() { if (!touched) window.scrollTo(x, y); }
    apply();
    setTimeout(apply, 300);
    setTimeout(apply, 1000);
}

function randomDelay(tabData) {
    const min = Math.max(MIN_INTERVAL, tabData.interval);
    return min + Math.random() * (tabData.intervalMax - min);
}

// A randomized tab can't use a repeating alarm or setInterval, so each reload
// schedules the next one: a one-shot alarm when the delay allows it, else a
// timeout. Replaces whatever was pending, so a double call is harmless.
function scheduleRandom(tabId, tabData) {
    tabId = String(tabId);
    if (timers[tabId]) {
        clearTimeout(timers[tabId]);
        delete timers[tabId];
    }
    chrome.alarms.clear(ALARM_PREFIX + tabId);

    const delay = randomDelay(tabData);
    const ms = Math.round(delay * 1000);
    if (usesTimer(delay)) {
        timers[tabId] = setTimeout(function () {
            delete timers[tabId];
            reloadSpecificTab(tabId, delay);
            scheduleRandom(tabId, tabData);
        }, ms);
    } else {
        chrome.alarms.create(ALARM_PREFIX + tabId, { when: Date.now() + ms });
    }
    // One write per reload (session storage has no write quota) so the popup
    // can show the countdown to this particular delay.
    chrome.storage.session.set({
        [ALARM_PREFIX + tabId]: { startedAt: Date.now(), ms: ms }
    });
}

function startTab(tabId, tabData, resetCondition) {
    tabId = String(tabId);
    stopTab(tabId);
    if (tabData.paused) return;

    armStopCondition(tabId, tabData, resetCondition !== false);

    const interval = Math.max(MIN_INTERVAL, tabData.interval);

    if (isRandom(tabData)) {
        reloadSpecificTab(tabId, interval); // match alarm behaviour (`when: Date.now()`)
        scheduleRandom(tabId, tabData);
        return;
    }

    if (!usesTimer(interval)) {
        chrome.alarms.create(ALARM_PREFIX + tabId, {
            when: Date.now(),
            periodInMinutes: interval / 60
        });
        return;
    }

    const ms = Math.round(interval * 1000);
    reloadSpecificTab(tabId, interval); // match alarm behaviour (`when: Date.now()`)
    timers[tabId] = setInterval(function () {
        reloadSpecificTab(tabId, interval);
    }, ms);

    // Written once so the popup can compute the countdown without per-tick writes.
    chrome.storage.session.set({
        [ALARM_PREFIX + tabId]: { startedAt: Date.now(), ms: ms }
    });
}

// Keep a 30s alarm alive while any timer-based tab is active, so a terminated
// worker gets woken up and rebuilds its timers. (Firefox clamps this to 60s.)
function updateKeepalive(tabsData) {
    const needsKeepalive = Object.values(tabsData).some(function (d) {
        return !d.paused && usesTimer(d.interval);
    });

    chrome.alarms.get(KEEPALIVE_ALARM, function (existing) {
        if (needsKeepalive && !existing) {
            chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: ALARM_MIN_INTERVAL / 60 });
        } else if (!needsKeepalive && existing) {
            chrome.alarms.clear(KEEPALIVE_ALARM);
        }
    });
}

function updateBadge(tabsData) {
    const activeCount = Object.values(tabsData).filter(function (d) { return !d.paused; }).length;
    chrome.action.setBadgeText({ text: activeCount > 0 ? String(activeCount) : '' });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

// Runs every time the worker spins up (install, browser start, any event
// after a shutdown). Only rebuilds missing setInterval timers — alarm-based
// tabs persist on their own and must not be reset on every wake. Stop-condition
// progress is carried forward (resetCondition: false), not reset.
function hydrateTimers() {
    getSelectedTabs().then(function (tabsData) {
        for (const tabId in tabsData) {
            const d = tabsData[tabId];
            if (d.paused || timers[tabId]) continue;
            if (isRandom(d)) {
                // Its next reload may be a pending one-shot alarm, which
                // survives the worker; only reschedule if nothing is pending.
                chrome.alarms.get(ALARM_PREFIX + tabId, function (alarm) {
                    if (alarm || timers[tabId]) return;
                    armStopCondition(tabId, d, false);
                    scheduleRandom(tabId, d);
                });
            } else if (usesTimer(d.interval)) {
                startTab(tabId, d, false);
            }
        }
        updateKeepalive(tabsData);
        updateBadge(tabsData);
    }).catch(function (err) {
        console.error('Reload4U: failed to hydrate timers', err);
    });
}

hydrateTimers();

// ---------- reload ----------

// Reads the tab's current options on every reload (sync reads have no quota),
// so toggling an option takes effect without rescheduling.
function reloadSpecificTab(tabId, interval) {
    tabId = String(tabId);
    const id = parseInt(tabId, 10);

    getSelectedTabs().then(function (tabsData) {
        const tabData = tabsData[tabId];
        if (!tabData || tabData.paused) return;

        if (interval !== undefined && interval < SKIP_IF_LOADING_BELOW) {
            chrome.tabs.get(id, function (tab) {
                if (chrome.runtime.lastError) return; // let the reload attempt below handle removal
                if (tab && tab.status === 'loading') return;
                prepareAndReload(id, tabData);
            });
            return;
        }

        prepareAndReload(id, tabData);
    }).catch(function (err) {
        console.error('Reload4U: failed to read tab options', err);
    });
}

// The typing guard and scroll memory need one look at the page first. If the
// page can't be inspected (chrome:// pages, the Web Store), reload anyway.
function prepareAndReload(id, tabData) {
    if (!tabData.protectTyping && !tabData.keepScroll) {
        doReload(id, tabData);
        return;
    }
    chrome.scripting.executeScript({
        target: { tabId: id },
        func: inspectPage
    }).then(function (results) {
        const state = results && results[0] && results[0].result;
        if (state && tabData.protectTyping && state.busy) return; // try again next time
        if (state && tabData.keepScroll) {
            chrome.storage.session.set({ [SCROLL_PREFIX + id]: { x: state.x, y: state.y } });
        }
        doReload(id, tabData);
    }).catch(function () {
        doReload(id, tabData);
    });
}

function doReload(id, tabData) {
    chrome.tabs.reload(id, { bypassCache: !!(tabData && tabData.hardReload) }, function () {
        if (!chrome.runtime.lastError) {
            trackReloadCount(String(id));
            return;
        }
        if (removing.has(id)) return;

        removing.add(id);
        console.warn('Reload4U: tab no longer available, removing:', id, chrome.runtime.lastError.message);
        stopTab(id);
        removeFromStorage(id).finally(function () {
            removing.delete(id);
        });
    });
}

// ---------- stop conditions ----------

// Pauses a tab and records why, so the popup can show it. A single sync
// write — never on a per-reload/per-tick basis.
function triggerStop(tabId, reason) {
    tabId = String(tabId);
    getSelectedTabs().then(function (tabsData) {
        if (!tabsData[tabId] || tabsData[tabId].paused) return;
        tabsData[tabId].paused = true;
        tabsData[tabId].stoppedReason = reason;
        chrome.storage.sync.set({ selectedTabsWithIntervals: tabsData });
        notifyStop(tabId, reason);
    });
}

// ---------- notifications ----------
//
// `notifications` is an optional permission, requested from the settings page
// when the user turns alerts on, so chrome.notifications may be missing.

function notifyStop(tabId, reason) {
    chrome.storage.sync.get('reload4uSettings', function (data) {
        const settings = data.reload4uSettings || {};
        if (!settings.notifyOnStop || !chrome.notifications) return;
        chrome.tabs.get(parseInt(tabId, 10), function (tab) {
            if (chrome.runtime.lastError || !tab) return;
            chrome.notifications.create(NOTIFICATION_PREFIX + tabId, {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('images/icon128.png'),
                title: 'Reload4U: ' + (tab.title || tab.url),
                message: reason + '. Click to open the tab.'
            });
        });
    });
}

let notificationClicksHandled = false;

function handleNotificationClicks() {
    if (notificationClicksHandled || !chrome.notifications) return;
    notificationClicksHandled = true;
    chrome.notifications.onClicked.addListener(function (notificationId) {
        if (!notificationId.startsWith(NOTIFICATION_PREFIX)) return;
        const id = parseInt(notificationId.slice(NOTIFICATION_PREFIX.length), 10);
        chrome.tabs.update(id, { active: true }, function (tab) {
            if (chrome.runtime.lastError || !tab) return;
            chrome.windows.update(tab.windowId, { focused: true });
        });
        chrome.notifications.clear(notificationId);
    });
}

handleNotificationClicks();
if (chrome.permissions && chrome.permissions.onAdded) {
    chrome.permissions.onAdded.addListener(handleNotificationClicks);
}

function trackReloadCount(tabId) {
    getSelectedTabs().then(function (tabsData) {
        const tabData = tabsData[tabId];
        if (!tabData || tabData.paused) return;

        const key = PROGRESS_PREFIX + tabId;
        chrome.storage.session.get(key, function (data) {
            const count = ((data[key] && data[key].count) || 0) + 1;
            chrome.storage.session.set({ [key]: { count: count } });

            if (tabData.stopAfter && tabData.stopAfter.type === 'count' && count >= tabData.stopAfter.limit) {
                triggerStop(tabId, `Stopped: reached ${tabData.stopAfter.limit} reload${tabData.stopAfter.limit === 1 ? '' : 's'}`);
            }
        });
    });
}

// Watches every tab's title (cheap — only fires on actual title changes, not
// on a timer) and stops any watched tab whose title drifted from its baseline.
// Also triggers a content-hash check once a watched tab finishes loading.
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
    const idStr = String(tabId);

    if (changeInfo.title !== undefined) {
        getSelectedTabs().then(function (tabsData) {
            const tabData = tabsData[idStr];
            if (!tabData || tabData.paused || !tabData.stopAfter || tabData.stopAfter.type !== 'title') return;

            const key = TITLE_PREFIX + idStr;
            chrome.storage.session.get(key, function (data) {
                const baseline = data[key] && data[key].baseline;
                if (baseline === undefined) {
                    chrome.storage.session.set({ [key]: { baseline: changeInfo.title } });
                    return;
                }
                if (changeInfo.title !== baseline) {
                    triggerStop(idStr, 'Stopped: page title changed');
                }
            });
        });
    }

    if (changeInfo.status === 'complete') {
        getSelectedTabs().then(function (tabsData) {
            const tabData = tabsData[idStr];
            if (!tabData) return;

            if (tabData.keepScroll) {
                const scrollKey = SCROLL_PREFIX + idStr;
                chrome.storage.session.get(scrollKey, function (data) {
                    const pos = data[scrollKey];
                    if (!pos) return;
                    chrome.storage.session.remove(scrollKey);
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: restoreScroll,
                        args: [pos.x, pos.y]
                    }).catch(function () {});
                });
            }

            if (tabData.paused || !tabData.stopAfter) return;
            if (tabData.stopAfter.type === 'content') captureContentHash(idStr, false);
            if (tabData.stopAfter.type === 'text') checkPageText(idStr, tabData.stopAfter);
        });
    }
});

// ---------- listeners ----------

// React to popup/settings changes; only reschedule tabs that actually changed.
chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'sync' || !changes.selectedTabsWithIntervals) return;

    const oldData = normalize(changes.selectedTabsWithIntervals.oldValue);
    const newData = normalize(changes.selectedTabsWithIntervals.newValue);

    for (const tabId in oldData) {
        if (!(tabId in newData)) {
            stopTab(tabId);
            clearStopConditionState(tabId);
        }
    }
    for (const tabId in newData) {
        const o = oldData[tabId];
        const n = newData[tabId];
        const stopAfterChanged = !sameStopAfter(o && o.stopAfter, n.stopAfter);
        const schedulingChanged = !o || o.interval !== n.interval || o.paused !== n.paused ||
            o.intervalMax !== n.intervalMax;

        if (schedulingChanged) {
            // Reset progress only on a brand-new tab, a resume, or an edited
            // condition — not on a bare interval change.
            const resetCondition = !o || stopAfterChanged || (o.paused && !n.paused);
            startTab(tabId, n, resetCondition);
        } else if (stopAfterChanged) {
            // Only the stop condition itself changed (e.g. editing N, or
            // switching condition type) — re-arm its bookkeeping in place.
            // Do NOT call startTab here: it fires an immediate "extra" reload
            // to match alarm behavior, which would burn one off the new
            // count limit before any real timer tick happens.
            armStopCondition(tabId, n, true);
        }
    }
    updateKeepalive(newData);
    updateBadge(newData);
});

chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === KEEPALIVE_ALARM) {
        // Nothing to do: waking the worker already ran hydrateTimers().
        return;
    }
    if (alarm.name.startsWith(ALARM_PREFIX)) {
        const tabId = alarm.name.slice(ALARM_PREFIX.length);
        reloadSpecificTab(tabId);
        getSelectedTabs().then(function (tabsData) {
            const d = tabsData[tabId];
            if (d && !d.paused && isRandom(d)) scheduleRandom(tabId, d);
        });
    }
});

// Clean up when a watched tab is closed.
chrome.tabs.onRemoved.addListener(function (tabId) {
    removeFromStorage(tabId);
});

// ---------- keyboard shortcut ----------

// Starts watching the tab at the default interval, or pauses/resumes it if
// it's already watched.
function toggleWatch(tabId) {
    return getDefaultInterval().then(function (defaultInterval) {
        return updateTab(tabId, function (existing) {
            if (!existing) return { interval: defaultInterval, paused: false };
            if (existing.paused) return resumed(existing);
            existing.paused = true;
            return existing;
        });
    });
}

if (chrome.commands) {
    chrome.commands.onCommand.addListener(function (command, tab) {
        if (command !== COMMAND_TOGGLE) return;
        if (tab && tab.id !== undefined) {
            toggleWatch(tab.id);
            return;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs && tabs[0]) toggleWatch(tabs[0].id);
        });
    });
}

// ---------- context menu ----------

function formatSeconds(seconds) {
    if (seconds < 60) return seconds + ' seconds';
    const minutes = seconds / 60;
    return minutes + (minutes === 1 ? ' minute' : ' minutes');
}

function createContextMenus() {
    if (!chrome.contextMenus) return;
    // Firefox can also show it when right-clicking a tab in the tab strip.
    const contexts = IS_FIREFOX ? ['page', 'tab'] : ['page'];
    chrome.contextMenus.removeAll(function () {
        chrome.contextMenus.create({ id: MENU_PARENT, title: 'Reload4U', contexts: contexts });
        MENU_INTERVALS.forEach(function (seconds) {
            chrome.contextMenus.create({
                id: MENU_INTERVAL_PREFIX + seconds,
                parentId: MENU_PARENT,
                title: 'Auto-reload every ' + formatSeconds(seconds),
                contexts: contexts
            });
        });
        chrome.contextMenus.create({
            id: MENU_PARENT + '_separator',
            parentId: MENU_PARENT,
            type: 'separator',
            contexts: contexts
        });
        chrome.contextMenus.create({
            id: MENU_STOP,
            parentId: MENU_PARENT,
            title: 'Stop auto-reloading this tab',
            contexts: contexts
        });
    });
}

if (chrome.contextMenus) {
    chrome.contextMenus.onClicked.addListener(function (info, tab) {
        if (!tab || tab.id === undefined) return;
        if (info.menuItemId === MENU_STOP) {
            removeFromStorage(tab.id);
            return;
        }
        if (typeof info.menuItemId !== 'string' || !info.menuItemId.startsWith(MENU_INTERVAL_PREFIX)) return;
        const interval = Number(info.menuItemId.slice(MENU_INTERVAL_PREFIX.length));
        // Keeps the tab's other options (stop condition, hard reload, ...).
        updateTab(tab.id, function (existing) {
            const next = resumed(existing || {});
            next.interval = interval;
            if (!isRandom(next)) delete next.intervalMax;
            return next;
        });
    });
}
