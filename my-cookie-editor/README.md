# My Cookie Editor

A small Chrome extension (Manifest V3) to view, search, add, edit, delete, export and import cookies for the site in the current tab.

## Install (developer mode)
1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder
4. Pin the extension, open any website, click the icon

## Files
- `manifest.json` - tells Chrome what the extension is and what it may do
- `popup.html` / `popup.css` - the window you see when you click the icon
- `popup.js` - all the logic, using `chrome.cookies`
