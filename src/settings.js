// Settings page functionality
let defaultIntervalInput = document.getElementById('defaultInterval');
let defaultIntervalUnit = document.getElementById('defaultIntervalUnit');
let minIntervalHint = document.getElementById('minIntervalHint');
// let showNotificationsInput = document.getElementById('showNotifications');
// let autoStartInput = document.getElementById('autoStart');
let saveButton = document.getElementById('saveSettings');
let saveStatus = document.getElementById('saveStatus');

// Default settings (interval in seconds)
const DEFAULT_SETTINGS = {
    defaultInterval: 30,
    showNotifications: false,
    autoStart: false
};

// Load settings when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    updateMinIntervalHint();
});

// Function to convert seconds to display value
function convertSecondsToDisplay(seconds) {
    // Default to seconds
    if (seconds < 60) {
        return { value: seconds, unit: 'seconds' };
    }
    // If evenly divisible by 60, show in minutes
    if (seconds % 60 === 0) {
        return { value: seconds / 60, unit: 'minutes' };
    }
    // Otherwise show in seconds
    return { value: seconds, unit: 'seconds' };
}

// Function to convert display value to seconds
function convertDisplayToSeconds(value, unit) {
    if (unit === 'minutes') {
        return value * 60;
    }
    return value;
}

// Function to update minimum interval hint
function updateMinIntervalHint() {
    const unit = defaultIntervalUnit.value;
    if (unit === 'minutes') {
        minIntervalHint.textContent = 'Minimum: 0.5 minutes';
        defaultIntervalInput.min = '0.5';
        defaultIntervalInput.step = '0.5';
    } else {
        minIntervalHint.textContent = 'Minimum: 30 seconds';
        defaultIntervalInput.min = '1';
        defaultIntervalInput.step = '1';
    }
}

// Function to load settings from storage
function loadSettings() {
    chrome.storage.sync.get(['reload4uSettings'], function(data) {
        let settings = data.reload4uSettings || DEFAULT_SETTINGS;

        // Use default if old format (minutes) is detected
        if (settings.defaultInterval < DEFAULT_SETTINGS.defaultInterval) {
            settings.defaultInterval = DEFAULT_SETTINGS.defaultInterval;
        }

        // Convert to display format
        const display = convertSecondsToDisplay(settings.defaultInterval);
        defaultIntervalInput.value = display.value;
        defaultIntervalUnit.value = display.unit;
        updateMinIntervalHint();

        //showNotificationsInput.checked = settings.showNotifications;
        //autoStartInput.checked = settings.autoStart;

        console.log('Settings loaded:', settings);
    });
}

// Function to save settings
function saveSettings() {
    const inputValue = parseFloat(defaultIntervalInput.value);
    const unit = defaultIntervalUnit.value;

    // Convert to seconds
    let intervalInSeconds = convertDisplayToSeconds(inputValue, unit);

    // Ensure minimum interval (30 seconds - Chrome alarm API minimum)
    if (intervalInSeconds < 30) {
        intervalInSeconds = 30;
        const display = convertSecondsToDisplay(intervalInSeconds);
        defaultIntervalInput.value = display.value;
        defaultIntervalUnit.value = display.unit;
        updateMinIntervalHint();
        showSaveStatus('Minimum interval is 30 seconds', false);
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
    const inputValue = parseFloat(defaultIntervalInput.value);
    const unit = defaultIntervalUnit.value;
    const intervalInSeconds = convertDisplayToSeconds(inputValue, unit);

    if (intervalInSeconds < 30) {
        const display = convertSecondsToDisplay(30);
        defaultIntervalInput.value = display.value;
        defaultIntervalUnit.value = display.unit;
        updateMinIntervalHint();
        showSaveStatus('Minimum interval is 30 seconds', false);
    }
}

// Event listeners
saveButton.addEventListener('click', saveSettings);

// Update hint when unit changes
defaultIntervalUnit.addEventListener('change', function() {
    updateMinIntervalHint();
});

// Validate interval on change
defaultIntervalInput.addEventListener('change', validateInterval);

// Auto-save on change (optional - can be removed if you prefer manual save only)
defaultIntervalInput.addEventListener('change', function() {
    setTimeout(saveSettings, 500); // Auto-save after 500ms delay
});

defaultIntervalUnit.addEventListener('change', function() {
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
            resolve(settings.defaultInterval);
        });
    });
};