# Privacy Policy for Reload4U Browser Extension

*Last updated: October 21, 2026*

## Overview

Reload4U ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how our browser extension collects, uses, and protects your information across all supported browsers.

## Information We Collect

### Data Stored Locally
Reload4U stores the following information locally on your device using the browser's storage API:

- **Selected Tab Information**: Tab IDs of tabs you choose to auto-reload
- **Reload Intervals**: Custom reload intervals you set for each tab (minimum 0.5 seconds)
- **Pause States**: Whether specific tabs are paused or active for reloading
- **User Preferences**: Your default interval settings
- **Stop Conditions** (optional, only if you enable one for a tab): a reload count limit, a
  captured tab title, or a one-way hash of a tab's visible text (see "Page Content Hashing" below)

### Page Content Hashing (only if you enable "Page content changes" for a tab)

If you choose the "stop when page content changes" option for a tab, the extension injects a
small script into that tab, after each reload, that computes a one-way hash (a short number, not
the text itself) of `document.body`'s visible text, entirely inside the page. Only that hash is
returned to the extension and stored locally (in session storage, cleared when the browser closes)
so it can tell whether the page changed. **The actual page text is never read, transmitted, or
stored by the extension** — the hash cannot be reversed back into the original content. This is
the only feature that touches page content, and it only runs on tabs you've explicitly set this
option for.

### Data We Do NOT Collect

- **Personal Information**: We do not collect names, email addresses, or any personal identifiers
- **Browsing History**: We do not track or store your browsing history
- **Raw Tab Content**: Outside of the one-way content hash described above (used only when you
  enable that specific stop condition), we do not read or store the content of your web pages
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
- **`scripting`** and **host permissions** (`<all_urls>`): Only used for the optional "stop when
  page content changes" condition, to inject the content-hashing script described above into a
  tab you've selected. Without this permission, that script could only run on the tab you most
  recently clicked, not on other tabs you're watching in the background.

### What These Permissions Allow

- **Tab Access**: Only to reload tabs you specifically select and display their titles/URLs in the extension popup
- **Limited Content Access**: We can inject a script to compute a one-way content hash, but only
  on tabs where you've turned on the "page content changes" stop condition, and only that hash
  — never the page's actual text — ever leaves the page
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