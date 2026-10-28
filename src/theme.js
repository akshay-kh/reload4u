// Applies the user's theme preference ('system' | 'light' | 'dark') to the
// current extension page by toggling the `dark` class on <html> (Tailwind's
// darkMode: 'class'). Imported by every UI page (popup, settings).
//
// The preference lives in chrome.storage.sync under reload4uSettings.theme.
// Storage reads are async, so the last-applied value is also mirrored to
// localStorage (shared by all extension pages on the same origin) and applied
// synchronously on load to avoid a light-mode flash before storage answers.

const THEME_CACHE_KEY = 'reload4u_theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

let currentTheme = 'system';

function applyTheme(theme) {
    currentTheme = theme === 'light' || theme === 'dark' ? theme : 'system';
    const isDark = currentTheme === 'dark' || (currentTheme === 'system' && darkQuery.matches);
    document.documentElement.classList.toggle('dark', isDark);
    try {
        localStorage.setItem(THEME_CACHE_KEY, currentTheme);
    } catch (e) {
        // localStorage unavailable — storage.sync below is still the source of truth
    }
}

try {
    applyTheme(localStorage.getItem(THEME_CACHE_KEY));
} catch (e) {
    applyTheme('system');
}

chrome.storage.sync.get(['reload4uSettings'], function(data) {
    applyTheme(data.reload4uSettings && data.reload4uSettings.theme);
});

// Live-update if the theme is changed from another page (e.g. settings while the popup is open).
chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'sync' || !changes.reload4uSettings) return;
    const newSettings = changes.reload4uSettings.newValue;
    applyTheme(newSettings && newSettings.theme);
});

// Follow OS-level changes while in 'system' mode.
darkQuery.addEventListener('change', function() {
    if (currentTheme === 'system') applyTheme('system');
});

export { applyTheme };
