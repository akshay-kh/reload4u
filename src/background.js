// Reload4U background service worker
//
// Scheduling strategy:
//   interval >= 30s  -> chrome.alarms (survives service-worker shutdown)
//   interval <  30s  -> setInterval inside the worker, plus a 30s keepalive
//                       alarm that wakes the worker and rebuilds timers if
//                       Chrome ever terminates it.
//
// The background is the single owner of scheduling: the popup/settings pages
// only write `selectedTabsWithIntervals` to storage, and we react to changes.
// Intervals are stored in seconds; chrome.alarms only understands minutes, so
// we convert at that boundary.
//
// Stop conditions: a tab can optionally carry `stopAfter` ({type:'count',limit}
// or {type:'title'}). Progress for these lives in storage.session (not sync,
// which has a write-rate quota) and is reset only when the condition is freshly
// armed (new tab, resumed from pause, or the condition itself was edited) —
// never on a worker-restart rebuild, so progress survives that.

const ALARM_PREFIX = 'reloadTab_';
const KEEPALIVE_ALARM = 'reload4u_keepalive';
const PROGRESS_PREFIX = 'reload4u_progress_';
const TITLE_PREFIX = 'reload4u_title_';
const ALARM_MIN_INTERVAL = 30;   // seconds – chrome.alarms floor (0.5 min)
const MIN_INTERVAL = 0.5;        // seconds – absolute floor
const SKIP_IF_LOADING_BELOW = 2; // seconds – below this, don't reload a tab still loading
const BADGE_COLOR = '#2563eb';

// tabId (string) -> setInterval handle. Lives only as long as the worker does.
const timers = {};
// Guards against queuing many removals when a fast-reloading tab disappears.
const removing = new Set();

chrome.runtime.onInstalled.addListener(function () {
    console.log('Reload4U extension installed');
});

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

// ---------- scheduling ----------

function usesTimer(interval) {
    return interval < ALARM_MIN_INTERVAL;
}

function stopTab(tabId) {
    tabId = String(tabId);
    if (timers[tabId]) {
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
}

// Sets up (or carries forward) session-stored progress for a tab's stop
// condition. `reset` re-arms from scratch (new tab, resumed, condition edited);
// without it, existing progress is left alone (worker-restart rebuild).
function armStopCondition(tabId, tabData, reset) {
    tabId = String(tabId);

    const stopAfter = tabData.stopAfter;
    if (!stopAfter) {
        if (reset) clearStopConditionState(tabId);
        return;
    }

    if (stopAfter.type === 'count') {
        const key = PROGRESS_PREFIX + tabId;
        if (reset) {
            chrome.storage.session.remove(TITLE_PREFIX + tabId);
            // Write the reset value directly — a remove() followed by a
            // separate get()/set() has no ordering guarantee and can leave a
            // stale prior count in place if the remove hasn't landed yet.
            chrome.storage.session.set({ [key]: { count: 0 } });
        } else {
            chrome.storage.session.get(key, function (data) {
                if (!data[key]) chrome.storage.session.set({ [key]: { count: 0 } });
            });
        }
    } else if (stopAfter.type === 'title') {
        const key = TITLE_PREFIX + tabId;
        if (reset) {
            chrome.storage.session.remove(PROGRESS_PREFIX + tabId);
            chrome.tabs.get(parseInt(tabId, 10), function (tab) {
                if (chrome.runtime.lastError || !tab) return;
                chrome.storage.session.set({ [key]: { baseline: tab.title } });
            });
        } else {
            chrome.storage.session.get(key, function (data) {
                if (data[key]) return;
                chrome.tabs.get(parseInt(tabId, 10), function (tab) {
                    if (chrome.runtime.lastError || !tab) return;
                    chrome.storage.session.set({ [key]: { baseline: tab.title } });
                });
            });
        }
    }
}

function startTab(tabId, tabData, resetCondition) {
    tabId = String(tabId);
    stopTab(tabId);
    if (tabData.paused) return;

    armStopCondition(tabId, tabData, resetCondition !== false);

    const interval = Math.max(MIN_INTERVAL, tabData.interval);

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

// Keep a 30s alarm alive while any sub-30s tab is active, so a terminated
// worker gets woken up and rebuilds its timers.
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
            if (!d.paused && usesTimer(d.interval) && !timers[tabId]) {
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

function reloadSpecificTab(tabId, interval) {
    const id = parseInt(tabId, 10);

    if (interval !== undefined && interval < SKIP_IF_LOADING_BELOW) {
        chrome.tabs.get(id, function (tab) {
            if (chrome.runtime.lastError) return; // let the reload attempt below handle removal
            if (tab && tab.status === 'loading') return;
            doReload(id);
        });
        return;
    }

    doReload(id);
}

function doReload(id) {
    chrome.tabs.reload(id, function () {
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
    });
}

function trackReloadCount(tabId) {
    getSelectedTabs().then(function (tabsData) {
        const tabData = tabsData[tabId];
        if (!tabData || tabData.paused || !tabData.stopAfter || tabData.stopAfter.type !== 'count') return;

        const key = PROGRESS_PREFIX + tabId;
        chrome.storage.session.get(key, function (data) {
            const count = ((data[key] && data[key].count) || 0) + 1;
            if (count >= tabData.stopAfter.limit) {
                triggerStop(tabId, `Stopped: reached ${tabData.stopAfter.limit} reload${tabData.stopAfter.limit === 1 ? '' : 's'}`);
            } else {
                chrome.storage.session.set({ [key]: { count: count } });
            }
        });
    });
}

// Watches every tab's title (cheap — only fires on actual title changes, not
// on a timer) and stops any watched tab whose title drifted from its baseline.
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
    if (changeInfo.title === undefined) return;
    const idStr = String(tabId);

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
        if (!o || o.interval !== n.interval || o.paused !== n.paused || stopAfterChanged) {
            // Reset progress only on a brand-new tab, a resume, or an edited
            // condition — not on a bare interval change.
            const resetCondition = !o || stopAfterChanged || (o.paused && !n.paused);
            startTab(tabId, n, resetCondition);
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
        reloadSpecificTab(alarm.name.slice(ALARM_PREFIX.length));
    }
});

// Clean up when a watched tab is closed.
chrome.tabs.onRemoved.addListener(function (tabId) {
    removeFromStorage(tabId);
});
