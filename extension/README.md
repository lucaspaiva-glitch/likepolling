# Creators + (browser extension)

Manifest V3 extension that shows Like Polling's YouTube data on YouTube and in the toolbar popup.
It reads everything from the shared API in `api/v1.js` (`/api/v1/channel|trending|music|worldwide|education`) and never calls YouTube itself.

- `content.js`: YouTube only. Finds the channel locally, shows the pill/panel in a Shadow DOM.
- `popup.html`: the toolbar dashboard (Trending by default, Creators on a YouTube channel/video).
- `welcome.html`: first-run country choice.
- `background.js`: API requests with a short cache in `chrome.storage.session`.
- `lib/core.js`: languages (9), formatting, page detection. `lib/dashboard.js` + `.css`: the panel.

Try it: Chrome → `chrome://extensions` → Developer mode → Load unpacked → pick this folder.
Store package: zip the contents of this folder (manifest.json at the zip root).
