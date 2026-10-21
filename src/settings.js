// Settings page functionality
let defaultIntervalInput = document.getElementById('defaultInterval');
let minIntervalHint = document.getElementById('minIntervalHint');
// let showNotificationsInput = document.getElementById('showNotifications');
// let autoStartInput = document.getElementById('autoStart');
let saveButton = document.getElementById('saveSettings');
let saveStatus = document.getElementById('saveStatus');

const MIN_INTERVAL = 0.5; // seconds – absolute floor (background enforces this too)

// Default settings (interval in seconds)
const DEFAULT_SETTINGS = {
    defaultInterval: 30,
    showNotifications: false,
    autoStart: false
};

// Load settings when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
});

// Function to load settings from storage
function loadSettings() {
    chrome.storage.sync.get(['reload4uSettings'], function(data) {
        let settings = data.reload4uSettings || DEFAULT_SETTINGS;

        defaultIntervalInput.value = Math.max(MIN_INTERVAL, settings.defaultInterval);

        //showNotificationsInput.checked = settings.showNotifications;
        //autoStartInput.checked = settings.autoStart;

        console.log('Settings loaded:', settings);
    });
}

// Function to save settings
function saveSettings() {
    let intervalInSeconds = Math.max(MIN_INTERVAL, parseFloat(defaultIntervalInput.value));

    if (intervalInSeconds !== parseFloat(defaultIntervalInput.value)) {
        defaultIntervalInput.value = intervalInSeconds;
        showSaveStatus(`Minimum interval is ${MIN_INTERVAL} seconds`, false);
        return;
    }

    const settings = {
        defaultInterval: intervalInSeconds,
        //showNotifications: showNotificationsInput.checked,
        //autoStart: autoStartInput.checked
    };

    chrome.storage.sync.set({reload4uSettings: settings}, function() {
        if (chrome.runtime.lastError) {
            console.error('Error saving settings:', chrome.runtime.lastError);
            showSaveStatus('Error saving settings!', false);
        } else {
            console.log('Settings saved:', settings);
            showSaveStatus('Settings saved successfully!', true);
        }
    });
}

// Function to show save status
function showSaveStatus(message, isSuccess) {
    saveStatus.textContent = isSuccess ? '✅ ' + message : '❌ ' + message;
    saveStatus.className = isSuccess ? 'text-sm text-green-600' : 'text-sm text-red-600';
    saveStatus.classList.remove('hidden');

    // Hide status after 3 seconds
    setTimeout(function() {
        saveStatus.classList.add('hidden');
    }, 3000);
}

// Function to validate interval input
function validateInterval() {
    const intervalInSeconds = parseFloat(defaultIntervalInput.value);

    if (intervalInSeconds < MIN_INTERVAL) {
        defaultIntervalInput.value = MIN_INTERVAL;
        showSaveStatus(`Minimum interval is ${MIN_INTERVAL} seconds`, false);
    }
}

// Event listeners
saveButton.addEventListener('click', saveSettings);

// Validate interval on change
defaultIntervalInput.addEventListener('change', validateInterval);

// Auto-save on change (optional - can be removed if you prefer manual save only)
defaultIntervalInput.addEventListener('change', function() {
    setTimeout(saveSettings, 500); // Auto-save after 500ms delay
});

// showNotificationsInput.addEventListener('change', function() {
//     setTimeout(saveSettings, 100);
// });

// autoStartInput.addEventListener('change', function() {
//     setTimeout(saveSettings, 100);
// });

// Export function to get default interval (for use in popup)
window.getDefaultInterval = function() {
    return new Promise(function(resolve) {
        chrome.storage.sync.get(['reload4uSettings'], function(data) {
            const settings = data.reload4uSettings || DEFAULT_SETTINGS;
            resolve(Math.max(MIN_INTERVAL, settings.defaultInterval));
        });
    });
};
