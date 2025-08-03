chrome.runtime.onInstalled.addListener(function() {
    console.log('Reload4U extension installed');
});

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
                        tabsData[tabId] = {
                            interval: tabsData[tabId],
                            paused: false
                        };
                    }
                }
                
                resolve(tabsData);
            }
        });
    });
}

function reloadSpecificTab(tabId) {
    chrome.tabs.reload(tabId, function() {
        if (chrome.runtime.lastError) {
            console.error('Failed to reload tab:', tabId, chrome.runtime.lastError);
            // Remove invalid tab and clear its alarm
            getSelectedTabs().then(function(tabsData) {
                delete tabsData[tabId];
                chrome.storage.sync.set({selectedTabsWithIntervals: tabsData});
                chrome.alarms.clear('reloadTab_' + tabId);
            });
        } else {
            console.log('Tab reloaded successfully:', tabId);
        }
    });
}

function setupTabAlarms() {
    getSelectedTabs().then(function(tabsData) {
        // Clear all existing reload alarms
        chrome.alarms.getAll(function(alarms) {
            alarms.forEach(function(alarm) {
                if (alarm.name.startsWith('reloadTab_')) {
                    chrome.alarms.clear(alarm.name);
                }
            });
        });
        
        // Create new alarms for each tab with its specific interval (only if not paused)
        for (let tabId in tabsData) {
            let tabData = tabsData[tabId];
            if (!tabData.paused) {
                chrome.alarms.create('reloadTab_' + tabId, {
                    when: Date.now(),
                    periodInMinutes: tabData.interval
                });
            }
        }
    });
}

chrome.alarms.onAlarm.addListener(function(alarm) {
    if (alarm.name.startsWith('reloadTab_')) {
        let tabId = parseInt(alarm.name.replace('reloadTab_', ''));
        reloadSpecificTab(tabId);
    }
});
