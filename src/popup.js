let selectTab = document.getElementById('selectThisTab');
let stopAllTabs = document.getElementById('stopAllTabs');
let selectedTabsInfo = document.getElementById('selectedTabsInfo');
let tabsList = document.getElementById('tabsList');

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

function removeTabFromSelected(tabId) {
    // Ensure tabId is a string (keys in storage are strings)
    tabId = String(tabId);
    
    getSelectedTabs().then(function(tabsData) {
        if (tabsData.hasOwnProperty(tabId)) {
            delete tabsData[tabId];
            chrome.storage.sync.set({selectedTabsWithIntervals: tabsData}, function() {
                // Clear the specific alarm for this tab
                chrome.alarms.clear('reloadTab_' + tabId);
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

function updateTabInterval(tabId, newInterval) {
    // Ensure tabId is a string
    tabId = String(tabId);
    
    // Enforce minimum interval of 0.5 minutes (30 seconds) due to Chrome alarm API limits
    const interval = Math.max(0.5, parseFloat(newInterval));
    
    getSelectedTabs().then(function(tabsData) {
        if (tabsData.hasOwnProperty(tabId)) {
            tabsData[tabId].interval = interval;
            chrome.storage.sync.set({selectedTabsWithIntervals: tabsData}, function() {
                // Only recreate alarm if not paused
                if (!tabsData[tabId].paused) {
                    chrome.alarms.clear('reloadTab_' + tabId, function() {
                        chrome.alarms.create('reloadTab_' + tabId, {
                            when: Date.now(),
                            periodInMinutes: interval
                        });
                    });
                }
                console.log('Updated interval for tab:', tabId, 'to:', interval);
                // Refresh display to show corrected value if it was adjusted
                if (interval !== parseFloat(newInterval)) {
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
            chrome.storage.sync.set({selectedTabsWithIntervals: tabsData}, function() {
                if (tabsData[tabId].paused) {
                    // Clear alarm when paused
                    chrome.alarms.clear('reloadTab_' + tabId);
                    console.log('Paused tab:', tabId);
                } else {
                    // Create alarm when resumed
                    chrome.alarms.create('reloadTab_' + tabId, {
                        when: Date.now(),
                        periodInMinutes: tabsData[tabId].interval
                    });
                    console.log('Resumed tab:', tabId);
                }
                displaySelectedTabs();
            });
        }
    });
}

function displaySelectedTabs() {
    getSelectedTabs().then(function(tabsData) {
        const tabIds = Object.keys(tabsData);
        if (tabIds && tabIds.length > 0) {
            tabsList.innerHTML = '';
            let validTabsData = {};
            
            const tabPromises = tabIds.map(function(tabId) {
                return new Promise(function(resolve) {
                    chrome.tabs.get(parseInt(tabId), function(tab) {
                        if (!chrome.runtime.lastError && tab) {
                            validTabsData[tabId] = tabsData[tabId];
                            
                            const tabDiv = document.createElement('div');
                            const isPaused = tabsData[tabId].paused;
                            tabDiv.className = `p-2 border border-blue-200 rounded space-y-2 ${isPaused ? 'bg-gray-100' : 'bg-white'}`;
                            
                            const topDiv = document.createElement('div');
                            topDiv.className = 'flex items-center justify-between';
                            
                            const infoDiv = document.createElement('div');
                            infoDiv.className = 'flex-1 min-w-0';
                            infoDiv.innerHTML = `
                                <p class="text-sm text-blue-600 truncate">${tab.title} ${isPaused ? '(Paused)' : ''}</p>
                                <p class="text-xs text-blue-500 truncate">${tab.url}</p>
                            `;
                            
                            const buttonsDiv = document.createElement('div');
                            buttonsDiv.className = 'flex gap-1';
                            
                            const pauseBtn = document.createElement('button');
                            pauseBtn.className = `px-2 py-1 text-xs text-white rounded ${isPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`;
                            pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
                            pauseBtn.addEventListener('click', function() {
                                toggleTabPause(tabId);
                            });
                            
                            const removeBtn = document.createElement('button');
                            removeBtn.className = 'px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded';
                            removeBtn.textContent = 'Remove';
                            removeBtn.addEventListener('click', function() {
                                removeTabFromSelected(tabId);
                            });
                            
                            buttonsDiv.appendChild(pauseBtn);
                            buttonsDiv.appendChild(removeBtn);
                            
                            topDiv.appendChild(infoDiv);
                            topDiv.appendChild(buttonsDiv);
                            
                            const intervalDiv = document.createElement('div');
                            intervalDiv.className = 'flex items-center gap-2';
                            
                            const label = document.createElement('label');
                            label.className = 'text-xs text-gray-600';
                            label.textContent = 'Interval (min):';
                            
                            const input = document.createElement('input');
                            input.type = 'number';
                            input.min = '0.5';
                            input.step = '0.5';
                            input.value = tabsData[tabId].interval;
                            input.className = 'w-16 px-1 py-1 text-xs border border-gray-300 rounded text-center';
                            input.disabled = isPaused;
                            input.addEventListener('change', function() {
                                updateTabInterval(tabId, this.value);
                            });
                            
                            intervalDiv.appendChild(label);
                            intervalDiv.appendChild(input);
                            
                            tabDiv.appendChild(topDiv);
                            tabDiv.appendChild(intervalDiv);
                            tabsList.appendChild(tabDiv);
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
                
                if (Object.keys(validTabsData).length > 0) {
                    selectedTabsInfo.classList.remove('hidden');
                } else {
                    selectedTabsInfo.classList.add('hidden');
                }
            });
        } else {
            selectedTabsInfo.classList.add('hidden');
        }
    }).catch(function() {
        selectedTabsInfo.classList.add('hidden');
    });
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

selectTab.onclick = function(){
    var query = { active: true, currentWindow: true };
    chrome.tabs.query(query, function(tabs) {
        var currentTab = tabs[0];
        var tabId = String(currentTab.id); // Ensure string type
        var defaultInterval = Math.max(0.5, parseFloat(document.getElementById('defaultInterval').value));
        
        getSelectedTabs().then(function(selectedTabsData) {
            if (!selectedTabsData.hasOwnProperty(tabId)) {
                selectedTabsData[tabId] = {
                    interval: defaultInterval,
                    paused: false
                };
                chrome.storage.sync.set({selectedTabsWithIntervals: selectedTabsData}, function() {
                    // Create alarm for this specific tab
                    chrome.alarms.create('reloadTab_' + tabId, {
                        when: Date.now(),
                        periodInMinutes: defaultInterval
                    });
                    displaySelectedTabs();
                    console.log('Added tab:', tabId, 'with interval:', defaultInterval);
                    alert("Tab added to auto-reload list");
                });
            } else {
                alert("This tab is already selected for auto-reload");
            }
        });
    });
};

stopAllTabs.onclick = function () {
    // Clear all reload alarms
    chrome.alarms.getAll(function(alarms) {
        alarms.forEach(function(alarm) {
            if (alarm.name.startsWith('reloadTab_')) {
                chrome.alarms.clear(alarm.name);
            }
        });
    });
    
    chrome.storage.sync.set({selectedTabsWithIntervals: {}}, function() {
        displaySelectedTabs();
        alert("All tabs removed from auto-reload");
    });
};
