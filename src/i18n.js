// Thin wrapper over chrome.i18n (strings live in public/_locales/<lang>/messages.json).
// The browser picks the locale from its UI language; missing keys fall back to
// the default locale (en), and to the key itself if a message is absent.
//
// Static HTML is translated by marking elements:
//   data-i18n="key"              -> textContent
//   data-i18n-title="key"        -> title attribute
//   data-i18n-placeholder="key"  -> placeholder attribute

export function t(key, substitutions) {
    const args = substitutions === undefined ? undefined
        : (Array.isArray(substitutions) ? substitutions : [substitutions]).map(String);
    return chrome.i18n.getMessage(key, args) || key;
}

export function applyI18n(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
        el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
        el.title = t(el.dataset.i18nTitle);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    // @@ui_locale is the locale the messages were actually resolved in (e.g. es, pt_BR).
    const locale = chrome.i18n.getMessage('@@ui_locale');
    if (locale) document.documentElement.lang = locale.replace('_', '-');
}
