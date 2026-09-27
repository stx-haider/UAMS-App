# University Attendance System — Offline Windows

The React app is packaged as a standalone Windows Electron application. It loads local packaged web assets and needs no server or internet connection to run. A browser-installable PWA build is also retained.

Accounts, student/subject lists, attendance, aggregates and profile data are held in a local IndexedDB database in the Windows app's private profile. Every CR's records are keyed and checked against that account ID. Data is not automatically synchronized between computers; use Settings → Backup data to move records manually. Exports are written into Downloads without opening a blocking Save As popup.

## Windows installer and portable executable

On Windows, install dependencies and run `npm run desktop:win`. The build generates a Windows icon from `src/assets/logo.png` and writes the NSIS installer and portable executable under `release/`. The app itself runs without a local server or network. Spreadsheet and large-backup processing runs in workers to keep the interface responsive. `npm run desktop:dev` builds the UI and starts the desktop shell for development.

## Browser PWA

Run `npm run build` and serve `dist/` from localhost or a secure context. Open it once so the service worker can cache its app assets; it then opens offline. PWA browser storage may be cleared by the browser, so use Settings → Backup data regularly.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`
- Production PWA service-worker precache contains the packaged static UI, logo, and campus image.

Local device storage is not SQLite and is not a substitute for an external backup. Protect Windows user accounts; local CR passwords are checked locally and cannot recover data if the app's private storage is erased.
