# FitMon Chrome Extension

FitMon helps browser users manage fatigue with timely stretch prompts, quick on-page routines, recovery records, and character growth.

## Included

- Top-page stretch prompt overlay
- Side panel hub for status, routines, records, character customization, and settings
- Naver login flow through the backend
- User-specific state, Fit Point unlocks, and owned FitMon records
- Browser activity based reminder timing
- Server-backed feedback and account withdrawal requests

## Files

- `manifest.json`: Chrome extension manifest
- `service-worker.js`: extension background state, OAuth, reminders, backend sync
- `content.js`: on-page banner and stretching overlay
- `sidepanel.html`, `sidepanel.css`, `sidepanel.js`: FitMon hub UI
- `assets/fitmons/basic/*.png`: default FitMon character states
- `backend/server.py`: backend API for OAuth, user state, assets, feedback, and FitMon unlocks

## Development Notes

Reload the extension from `chrome://extensions` after changing `manifest.json`, `service-worker.js`, `content.js`, or side panel files.

The extension stores local state under `fitmonState` and automatically migrates data from earlier builds.

edit this file
