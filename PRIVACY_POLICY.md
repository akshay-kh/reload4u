# Privacy Policy for Reload4U Browser Extension

*Last updated: October 30, 2026*

## Overview

Reload4U ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how our browser extension collects, uses, and protects your information across all supported browsers.

## Information We Collect

### Data Stored Locally
Reload4U stores the following information locally on your device using the browser's storage API:

- **Selected Tab Information**: Tab IDs of tabs you choose to auto-reload
- **Reload Intervals**: Custom reload intervals you set for each tab (minimum 0.5 seconds)
- **Pause States**: Whether specific tabs are paused or active for reloading
- **User Preferences**: Your default interval, theme, and whether notifications are on
- **Per-Tab Options** (optional): hard reload, keep scroll position, don't reload while typing,
  and a random interval range
- **Stop Conditions** (optional, only if you enable one for a tab): a reload count limit, a
  captured tab title, a one-way hash of a tab's visible text (see "Page Content Hashing" below),
  or a word or phrase you type to look for
- **Scroll Position** (only if you turn on "Keep scroll position" for a tab): the tab's scroll
  offsets, kept in session storage for the moment between a reload and the page finishing loading

### Page Content Hashing (only if you enable "Page content changes" for a tab)

If you choose the "stop when page content changes" option for a tab, the extension injects a
small script into that tab, after each reload, that computes a one-way hash (a short number, not
the text itself) of `document.body`'s visible text, entirely inside the page. Only that hash is
returned to the extension and stored locally (in session storage, cleared when the browser closes)
so it can tell whether the page changed. **The actual page text is never read, transmitted, or
stored by the extension** — the hash cannot be reversed back into the original content.

### Other In-Page Checks (only for tabs where you turn them on)

A few other optional features run a small function inside a tab, following the same rule — the
page's text stays in the page, and only a minimal answer comes back:

- **"Text appears / disappears" stop condition**: searches the page's visible text for the word
  or phrase you entered and returns only **yes or no**.
- **"Don't reload while I'm typing"**: before each reload, checks whether a text field holds input
  that differs from what the page loaded with, and returns only **yes or no**. The field contents
  are never read by the extension.
- **"Keep scroll position"**: reads the page's **scroll offsets** (two numbers) before a reload and
  scrolls back to them afterwards.

These run only on tabs where you've turned the specific option on.

### Notifications (only if you turn them on)

If you turn on "Notify me when a tab stops" in Settings, the extension shows a desktop
notification containing the tab's title and why it stopped. It's displayed by your browser and
operating system on your device; nothing is sent anywhere.

### Data We Do NOT Collect

- **Personal Information**: We do not collect names, email addresses, or any personal identifiers
- **Browsing History**: We do not track or store your browsing history
- **Raw Tab Content**: We do not read or store the content of your web pages. The optional
  in-page checks described above return only a hash, a yes/no answer, or scroll offsets
- **URLs or Website Data**: We do not collect or store the URLs you visit
- **Analytics or Tracking Data**: We do not use analytics services or tracking pixels

## How We Use Information

The information stored locally is used solely to:

- Remember which tabs you want to auto-reload
- Apply your custom reload intervals to each selected tab
- Maintain pause/resume states for your convenience
- Provide the core functionality of the extension

## Data Storage and Security

### Local Storage Only
- All data is stored locally on your device using the browser's native storage API
- Data may sync across your browsers if you're signed in and have sync enabled
- No data is transmitted to external servers or third parties

### Data Retention
- Data persists until you:
  - Remove tabs from the auto-reload list
  - Uninstall the extension
  - Clear your browser data

### Security Measures
- The extension follows browser Content Security Policy (CSP) requirements
- No external scripts or resources are loaded
- All code is contained within the extension package

## Permissions Explained

Reload4U requests the following browser permissions:

### Required Permissions

- **`activeTab`**: To identify the currently active tab when you click "Select This Tab"
- **`tabs`**: To reload selected tabs and access basic tab information (title, URL for display)
- **`storage`**: To save your tab selections and preferences locally
- **`alarms`**: To schedule automatic tab reloading at your specified intervals
- **`contextMenus`**: To add the "Reload4U" entry to the right-click menu
- **`scripting`** and **host permissions** (`<all_urls>`): Only used for the optional in-page
  checks described above (content hash, text search, typing check, scroll position), on tabs
  where you've turned them on. Without this permission, they could only run on the tab you most
  recently clicked, not on other tabs you're watching in the background.

### Optional Permissions

- **`notifications`**: Requested only when you turn on notifications in Settings, to show a
  desktop notification when a tab stops. You can turn it off at any time.

### What These Permissions Allow

- **Tab Access**: Only to reload tabs you specifically select and display their titles/URLs in the extension popup
- **Limited Content Access**: We can run the small in-page checks described above, but only on
  tabs where you've turned on the matching option, and only a hash, yes/no answer, or scroll
  offsets — never the page's actual text — ever leaves the page
- **No Network Access**: The extension does not make network requests or communicate with external servers

## Third-Party Services

Reload4U does not:
- Use third-party analytics services
- Connect to external APIs or servers
- Share data with advertisers or data brokers
- Include tracking codes or cookies

## Children's Privacy

This extension does not knowingly collect any information from children under 13 years of age.

## Changes to This Privacy Policy

We may update this Privacy Policy occasionally. When we do:
- The "Last updated" date at the top will be revised
- Significant changes will be noted in the extension's changelog
- We recommend reviewing this policy periodically

## Contact Information

If you have questions about this Privacy Policy or the extension's data practices:

- **GitHub Issues**: [https://github.com/akshay-kh/reload4u/issues](https://github.com/akshay-kh/reload4u/issues)
- **Repository**: [https://github.com/akshay-kh/reload4u](https://github.com/akshay-kh/reload4u)

## Your Rights

You have the right to:
- **View**: See what data is stored by inspecting the browser's extension storage
- **Delete**: Remove all data by removing tabs from auto-reload or uninstalling the extension
- **Control**: Manage which tabs are selected and their reload intervals

## Compliance

This extension complies with:
- Browser extension store policies
- General data protection principles
- Browser extension security standards

---

**Summary**: Reload4U is a privacy-focused extension that stores only essential data locally on your device to provide tab auto-reload functionality. We do not collect personal information, track your browsing, or share any data with third parties.