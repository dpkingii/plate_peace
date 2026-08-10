# QuietPlate Privacy Policy

_Last updated: 2026-08-10_

QuietPlate is a Chrome extension that hides calorie numbers on menu web pages. This page explains what data it handles.

## What QuietPlate does on pages you visit

QuietPlate's content script scans the text of the page you're viewing to find and visually hide calorie-related numbers. This scanning happens entirely in your browser. Page content is never transmitted anywhere, logged, or stored.

## What QuietPlate stores

QuietPlate saves a small amount of settings data using Chrome's built-in storage APIs, all on your device (and synced across your own signed-in Chrome browsers via your Google account, the same as any other Chrome extension setting):

- Whether the filter is turned on or off
- Your light/dark theme choice
- Timestamps of your own "report this page" clicks, used only to locally cap how often the report button can be used
- The hostnames of pages you've reported in the current browser session, so the report button doesn't re-trigger for a page you already reported

None of this data is sent to QuietPlate's developer or any third-party server, except as described below.

## Reporting a page

If you click the flag icon to report a page where the filter isn't working, QuietPlate opens a pre-filled Google Form in a new tab containing the URL of the page you were on. This submission is handled by Google Forms and is subject to [Google's Privacy Policy](https://policies.google.com/privacy). QuietPlate does not send anything unless you deliberately click the report icon.

## Permissions

QuietPlate requests the `activeTab` and `storage` permissions, and host permissions to run its filtering content script on the pages you browse. These are used solely to detect and hide calorie numbers on the current page and to save your settings, as described above.

## Contact

Questions about this policy can be sent to dupopking@gmail.com.
