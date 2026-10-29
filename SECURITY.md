# Security Policy

## Supported Versions

Only the latest release, as published on the Chrome Web Store and Firefox Add-ons, receives
security fixes. Browsers update extensions automatically, so fixes ship as a new release rather
than as patches to older versions.

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |
| < 1.0   | ❌        |

## Reporting a Vulnerability

**Please don't report security issues in public GitHub issues, discussions, or pull requests.**

Report them privately through GitHub:
[**Report a vulnerability**](https://github.com/akshay-kh/reload4u/security/advisories/new)
(Security tab → Advisories → Report a vulnerability).

Please include:

- What the issue is and what an attacker could do with it
- Steps to reproduce, or a proof of concept
- The extension version, browser, and browser version you tested on
- Any suggested fix, if you have one

## What to Expect

Reload4U is maintained by one person in their spare time, so these are goals rather than
guarantees:

- **Acknowledgement** within 7 days
- **Initial assessment** (whether it's accepted, and how severe) within 14 days
- **Fix released** as soon as practical for confirmed issues, depending on severity and on store
  review times (Chrome Web Store and Firefox Add-ons review can take several days)

You'll be kept updated on progress. Once a fix is released, the advisory will be published and you
will be credited, unless you'd prefer not to be.

## Scope

In scope:

- The extension's source code in this repository (`src/`, `public/manifest.json`)
- The packages published to the Chrome Web Store and Firefox Add-ons
- The build and release workflows in `.github/workflows/`

Particularly relevant, given what the extension does:

- Anything that lets a web page read, change, or abuse the extension's stored data or its
  permissions (`tabs`, `scripting`, `<all_urls>` host access)
- The content-change stop condition sending anything other than its one-way hash out of a page
  (see `captureContentHash()` in `src/background.js`)
- The extension making network requests or loading remote code (it should do neither)

Out of scope:

- Websites behaving differently because they are reloaded often (rate limiting, blocking)
- Vulnerabilities in the browsers themselves; please report those to Google or Mozilla
- Issues that require an already-compromised browser or machine
- Vulnerabilities in dev dependencies that don't affect the built extension (Dependabot tracks
  these; a normal issue or PR is fine)

## Privacy

How the extension handles data is described in [PRIVACY_POLICY.md](PRIVACY_POLICY.md).
