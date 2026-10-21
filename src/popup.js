let selectTab = document.getElementById('selectThisTab');
let stopAllTabs = document.getElementById('stopAllTabs');
let openSettings = document.getElementById('openSettings');
let selectedTabsInfo = document.getElementById('selectedTabsInfo');
let activeTabsSection = document.getElementById('activeTabsSection');
let pausedTabsSection = document.getElementById('pausedTabsSection');
let activeTabsList = document.getElementById('activeTabsList');
let pausedTabsList = document.getElementById('pausedTabsList');

// Store countdown intervals for cleanup
let countdownIntervals = {};

const MIN_INTERVAL = 0.5;       // seconds – absolute floor (background enforces this too)
const STATIC_LABEL_BELOW = 2;   // seconds – below this, show a static "every Xs" label
const FAST_WARNING_BELOW = 5;   // seconds – below this, show a cost warning in the UI

// Function to get default interval from settings
function getDefaultInterval() {
    return new Promise(function(resolve) {
        chrome.storage.sync.get(['reload4uSettings'], function(data) {
            let settings = data.reload4uSettings || { defaultInterval: 30 };
            resolve(Math.max(MIN_INTERVAL, settings.defaultInterval));
        });
    });
}

// Function to get next reload time for a tab: prefer the alarm (interval >= 30s);
// fall back to the sub-30s session timer entry written by the background worker.
function getNextReloadTime(tabId) {
    return new Promise(function(resolve) {
        chrome.alarms.get('reloadTab_' + tabId, function(alarm) {
            if (alarm && alarm.scheduledTime) {
                resolve(alarm.scheduledTime);
                return;
            }
            chrome.storage.session.get('reloadTab_' + tabId, function(data) {
                const entry = data['reloadTab_' + tabId];
                if (entry && entry.ms) {
                    const now = Date.now();
                    const next = entry.startedAt + Math.ceil((now - entry.startedAt) / entry.ms) * entry.ms;
                    resolve(next);
                } else {
                    resolve(null);
                }
            });
        });
    });
}

// Function to create countdown timer
function createCountdownTimer(tabId, countdownElement, interval) {
    // Clear existing interval if any
    if (countdownIntervals[tabId]) {
        clearInterval(countdownIntervals[tabId]);
    }

    function updateCountdown() {
        getNextReloadTime(tabId).then(function(nextReloadTime) {
            if (nextReloadTime) {
                const now = Date.now();
                const timeLeft = Math.max(0, Math.ceil((nextReloadTime - now) / 1000));

                if (timeLeft > 0) {
                    const minutes = Math.floor(timeLeft / 60);
                    const seconds = timeLeft % 60;
                    countdownElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    countdownElement.className = 'text-xs text-green-600 font-mono';
                } else {
                    countdownElement.textContent = 'Reloading...';
                    countdownElement.className = 'text-xs text-blue-600 font-mono animate-pulse';
                }
            } else {
                countdownElement.textContent = 'No timer';
                countdownElement.className = 'text-xs text-gray-500';
            }
        });
    }

    // Update immediately and then every second
    updateCountdown();
    countdownIntervals[tabId] = setInterval(updateCountdown, 1000);
}

// Function to clean up countdown timer
function cleanupCountdownTimer(tabId) {
    if (countdownIntervals[tabId]) {
        clearInterval(countdownIntervals[tabId]);
        delete countdownIntervals[tabId];
    }
}


function getSelectedTabs() {
    return new Promise(function(resolve, reject) {
        chrome.storage.sync.get('selectedTabsWithIntervals', function(data) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                let tabsData = data.selectedTabsWithIntervals || {};

                // Migrate old format (number) to new format (object with interval and paused)
                for (let tabId in tabsData) {
                    if (typeof tabsData[tabId] === 'number') {
                        // Use default if old format (minutes) is detected
                        let interval = tabsData[tabId] < 30 ? 30 : tabsData[tabId];
                        tabsData[tabId] = {
                            interval: interval,
                            paused: false
                        };
                    }
                }

                resolve(tabsData);
            }
        });
    });
}

function removeTabFromSelected(tabId) {
    // Ensure tabId is a string (keys in storage are strings)
    tabId = String(tabId);

    getSelectedTabs().then(function(tabsData) {
        if (tabsData.hasOwnProperty(tabId)) {
            delete tabsData[tabId];
            chrome.storage.sync.set({selectedTabsWithIntervals: tabsData}, function() {
                // The background worker reacts to this storage change and stops the tab's timer/alarm.
                cleanupCountdownTimer(tabId);
                displaySelectedTabs();
                console.log('Removed tab:', tabId);
            });
        } else {
            console.log('Tab not found in selected tabs:', tabId);
        }
    }).catch(function(error) {
        console.error('Error removing tab:', error);
    });
}

function updateTabInterval(tabId, newIntervalInSeconds) {
    // Ensure tabId is a string
    tabId = String(tabId);

    // Enforce the absolute minimum interval (0.5s); the background chooses
    // alarms vs. setInterval based on this value, so no further clamping is needed here.
    const interval = Math.max(MIN_INTERVAL, parseFloat(newIntervalInSeconds));

    getSelectedTabs().then(function(tabsData) {
        if (tabsData.hasOwnProperty(tabId)) {
            tabsData[tabId].interval = interval;
            chrome.storage.sync.set({selectedTabsWithIntervals: tabsData}, function() {
                console.log('Updated interval for tab:', tabId, 'to:', interval, 'seconds');
                // Refresh display to show corrected value if it was adjusted
                if (interval !== parseFloat(newIntervalInSeconds)) {
                    displaySelectedTabs();
                }
            });
        }
    });
}

function toggleTabPause(tabId) {
    // Ensure tabId is a string
    tabId = String(tabId);

    getSelectedTabs().then(function(tabsData) {
        if (tabsData.hasOwnProperty(tabId)) {
            tabsData[tabId].paused = !tabsData[tabId].paused;
            if (!tabsData[tabId].paused) {
                // Resuming: clear any previous auto-stop reason and let the
                // background re-arm the stop condition from scratch.
                delete tabsData[tabId].stoppedReason;
            }
            chrome.storage.sync.set({selectedTabsWithIntervals: tabsData}, function() {
                console.log(tabsData[tabId].paused ? 'Paused tab:' : 'Resumed tab:', tabId);
                displaySelectedTabs();
            });
        }
    });
}

// Function to update (or clear) a tab's stop condition
function updateStopCondition(tabId, stopAfter) {
    // Ensure tabId is a string
    tabId = String(tabId);

    getSelectedTabs().then(function(tabsData) {
        if (!tabsData.hasOwnProperty(tabId)) return;
        if (stopAfter) {
            tabsData[tabId].stopAfter = stopAfter;
        } else {
            delete tabsData[tabId].stopAfter;
        }
        delete tabsData[tabId].stoppedReason;
        chrome.storage.sync.set({selectedTabsWithIntervals: tabsData}, function() {
            displaySelectedTabs();
        });
    });
}

function displaySelectedTabs() {
    // Clean up all existing countdown timers
    Object.keys(countdownIntervals).forEach(function(tabId) {
        cleanupCountdownTimer(tabId);
    });

    getSelectedTabs().then(function(tabsData) {
        const tabIds = Object.keys(tabsData);
        if (tabIds && tabIds.length > 0) {
            // Clear both lists
            activeTabsList.innerHTML = '';
            pausedTabsList.innerHTML = '';
            let validTabsData = {};
            let hasActiveTabs = false;
            let hasPausedTabs = false;

            const tabPromises = tabIds.map(function(tabId) {
                return new Promise(function(resolve) {
                    chrome.tabs.get(parseInt(tabId), function(tab) {
                        if (!chrome.runtime.lastError && tab) {
                            validTabsData[tabId] = tabsData[tabId];
                            const isPaused = tabsData[tabId].paused;

                            if (isPaused) {
                                hasPausedTabs = true;
                            } else {
                                hasActiveTabs = true;
                            }

                            const tabDiv = createTabElement(tab, tabId, tabsData[tabId], isPaused);

                            // Add to appropriate list
                            if (isPaused) {
                                pausedTabsList.appendChild(tabDiv);
                            } else {
                                activeTabsList.appendChild(tabDiv);
                            }
                        }
                        resolve();
                    });
                });
            });

            Promise.all(tabPromises).then(function() {
                // Update storage to remove invalid tabs
                if (Object.keys(validTabsData).length !== tabIds.length) {
                    chrome.storage.sync.set({selectedTabsWithIntervals: validTabsData});
                }

                // Show/hide sections based on content
                if (hasActiveTabs) {
                    activeTabsSection.classList.remove('hidden');
                } else {
                    activeTabsSection.classList.add('hidden');
                }

                if (hasPausedTabs) {
                    pausedTabsSection.classList.remove('hidden');
                } else {
                    pausedTabsSection.classList.add('hidden');
                }

                if (Object.keys(validTabsData).length > 0) {
                    selectedTabsInfo.classList.remove('hidden');
                } else {
                    selectedTabsInfo.classList.add('hidden');
                }
            });
        } else {
            selectedTabsInfo.classList.add('hidden');
            activeTabsSection.classList.add('hidden');
            pausedTabsSection.classList.add('hidden');
        }
    }).catch(function() {
        selectedTabsInfo.classList.add('hidden');
        activeTabsSection.classList.add('hidden');
        pausedTabsSection.classList.add('hidden');
    });
}

function createTabElement(tab, tabId, tabData, isPaused) {
    const tabDiv = document.createElement('div');
    tabDiv.className = 'p-3 bg-white border border-gray-200 rounded-lg shadow-sm space-y-3';

    // Status and info section
    const statusDiv = document.createElement('div');
    statusDiv.className = 'flex items-start justify-between';

    const infoSection = document.createElement('div');
    infoSection.className = 'flex-1 min-w-0';

    // Status badge and title
    const titleDiv = document.createElement('div');
    titleDiv.className = 'flex items-center gap-2 mb-1';

    const statusBadge = document.createElement('span');
    if (isPaused) {
        statusBadge.className = 'w-2 h-2 bg-yellow-500 rounded-full';
        statusBadge.title = 'Paused';
    } else {
        statusBadge.className = 'w-2 h-2 bg-green-500 rounded-full animate-pulse';
        statusBadge.title = 'Active';
    }

    const titleText = document.createElement('p');
    titleText.className = 'text-sm font-medium text-gray-900 truncate';
    titleText.textContent = tab.title;

    titleDiv.appendChild(statusBadge);
    titleDiv.appendChild(titleText);

    // URL
    const urlText = document.createElement('p');
    urlText.className = 'text-xs text-gray-500 truncate mb-2';
    urlText.textContent = tab.url;

    // Countdown timer (only for active tabs)
    const timerDiv = document.createElement('div');
    if (!isPaused) {
        timerDiv.className = 'flex items-center gap-2';
        const timerLabel = document.createElement('span');
        timerLabel.className = 'text-xs text-gray-600';
        timerLabel.textContent = 'Next reload in:';
        const timerDisplay = document.createElement('span');
        timerDisplay.className = 'text-xs text-green-600 font-mono font-semibold';
        timerDiv.appendChild(timerLabel);
        timerDiv.appendChild(timerDisplay);

        if (tabData.interval < STATIC_LABEL_BELOW) {
            // Too fast for a meaningful ticking countdown; a static label avoids
            // a per-second storage/alarm lookup that would never keep up anyway.
            timerDisplay.textContent = `every ${tabData.interval}s`;
        } else {
            createCountdownTimer(tabId, timerDisplay, tabData.interval);
        }
    } else {
        timerDiv.className = 'text-xs text-yellow-600';
        timerDiv.textContent = tabData.stoppedReason ? ('⏹ ' + tabData.stoppedReason) : 'Reload paused';
    }

    infoSection.appendChild(titleDiv);
    infoSection.appendChild(urlText);
    infoSection.appendChild(timerDiv);

    if (!isPaused && tabData.interval < FAST_WARNING_BELOW) {
        const warning = document.createElement('p');
        warning.className = 'text-xs text-orange-600 mt-1';
        warning.textContent = '⚠ Fast intervals use more CPU/network.';
        infoSection.appendChild(warning);
    }

    // Buttons section
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'flex flex-col gap-1';

    const pauseBtn = document.createElement('button');
    pauseBtn.className = `px-2 py-1 text-xs text-white rounded transition-colors ${isPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`;
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    pauseBtn.addEventListener('click', function() {
        toggleTabPause(tabId);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', function() {
        removeTabFromSelected(tabId);
    });

    buttonsDiv.appendChild(pauseBtn);
    buttonsDiv.appendChild(removeBtn);

    statusDiv.appendChild(infoSection);
    statusDiv.appendChild(buttonsDiv);

    // Interval controls section
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'flex items-center justify-between pt-2 border-t border-gray-100';

    const intervalSection = document.createElement('div');
    intervalSection.className = 'flex items-center gap-2';

    const label = document.createElement('label');
    label.className = 'text-xs text-gray-600';
    label.textContent = 'Interval (sec):';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(MIN_INTERVAL);
    input.step = '0.5';
    input.value = tabData.interval;
    input.className = 'w-16 px-2 py-1 text-xs border border-gray-300 rounded text-center focus:border-blue-500 focus:outline-none';
    input.disabled = isPaused;

    input.addEventListener('change', function() {
        updateTabInterval(tabId, input.value);
    });

    intervalSection.appendChild(label);
    intervalSection.appendChild(input);

    const statusText = document.createElement('div');
    statusText.className = 'text-xs text-gray-500';
    statusText.textContent = isPaused ? 'Paused' : 'Active';

    controlsDiv.appendChild(intervalSection);
    controlsDiv.appendChild(statusText);

    // Stop-condition controls section
    const stopDiv = document.createElement('div');
    stopDiv.className = 'flex items-center gap-2 pt-2 border-t border-gray-100';

    const stopLabel = document.createElement('label');
    stopLabel.className = 'text-xs text-gray-600';
    stopLabel.textContent = 'Stop when:';

    const stopSelect = document.createElement('select');
    stopSelect.className = 'px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 focus:outline-none';
    stopSelect.disabled = isPaused;
    [
        { value: 'none', text: 'Never (manual only)' },
        { value: 'count', text: 'After N reloads' },
        { value: 'title', text: 'Tab title changes' }
    ].forEach(function(opt) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        stopSelect.appendChild(option);
    });

    const currentType = (tabData.stopAfter && tabData.stopAfter.type) || 'none';
    stopSelect.value = currentType;

    const countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.min = '1';
    countInput.step = '1';
    countInput.value = (tabData.stopAfter && tabData.stopAfter.limit) || 5;
    countInput.className = 'w-14 px-2 py-1 text-xs border border-gray-300 rounded text-center focus:border-blue-500 focus:outline-none';
    countInput.classList.toggle('hidden', currentType !== 'count');
    countInput.disabled = isPaused;

    function applyStopCondition() {
        const type = stopSelect.value;
        countInput.classList.toggle('hidden', type !== 'count');
        if (type === 'none') {
            updateStopCondition(tabId, null);
        } else if (type === 'count') {
            updateStopCondition(tabId, { type: 'count', limit: Math.max(1, parseInt(countInput.value, 10) || 1) });
        } else if (type === 'title') {
            updateStopCondition(tabId, { type: 'title' });
        }
    }

    stopSelect.addEventListener('change', applyStopCondition);
    countInput.addEventListener('change', applyStopCondition);

    stopDiv.appendChild(stopLabel);
    stopDiv.appendChild(stopSelect);
    stopDiv.appendChild(countInput);

    tabDiv.appendChild(statusDiv);
    tabDiv.appendChild(controlsDiv);
    tabDiv.appendChild(stopDiv);

    return tabDiv;
}

// Make functions globally available
window.removeTabFromSelected = removeTabFromSelected;
window.updateTabInterval = updateTabInterval;
window.toggleTabPause = toggleTabPause;

// Clear any old storage format and display selected tabs info when popup opens
document.addEventListener('DOMContentLoaded', function() {
    // Clean up any old storage format to prevent conflicts
    chrome.storage.sync.get(['selectedTabs'], function(data) {
        if (data.selectedTabs) {
            chrome.storage.sync.remove('selectedTabs');
        }
    });


    displaySelectedTabs();
});

// Clean up countdown timers when popup closes
window.addEventListener('beforeunload', function() {
    Object.keys(countdownIntervals).forEach(function(tabId) {
        cleanupCountdownTimer(tabId);
    });
});

selectTab.onclick = function(){
    var query = { active: true, currentWindow: true };
    chrome.tabs.query(query, function(tabs) {
        var currentTab = tabs[0];
        var tabId = String(currentTab.id); // Ensure string type

        // Get default interval from settings
        getDefaultInterval().then(function(defaultInterval) {
            getSelectedTabs().then(function(selectedTabsData) {
                if (!selectedTabsData.hasOwnProperty(tabId)) {
                    selectedTabsData[tabId] = {
                        interval: defaultInterval,
                        paused: false
                    };
                    chrome.storage.sync.set({selectedTabsWithIntervals: selectedTabsData}, function() {
                        // The background worker reacts to this storage change and starts the tab's timer/alarm.
                        displaySelectedTabs();
                        console.log('Added tab:', tabId, 'with interval:', defaultInterval, 'seconds');
                        alert("Tab added to auto-reload list");
                    });
                } else {
                    alert("This tab is already selected for auto-reload");
                }
            });
        });
    });
};

// Open settings page
openSettings.onclick = function() {
    chrome.runtime.openOptionsPage();
};

stopAllTabs.onclick = function () {
    // Clean up all countdown timers
    Object.keys(countdownIntervals).forEach(function(tabId) {
        cleanupCountdownTimer(tabId);
    });

    chrome.storage.sync.set({selectedTabsWithIntervals: {}}, function() {
        // The background worker reacts to this storage change and clears every timer/alarm.
        displaySelectedTabs();
        alert("All tabs removed from auto-reload");
    });
};
