# Kivana (Basic)

The basic, local-only desktop app for Kivana built with Tauri + React + TypeScript + Vite.

- No login, no cloud sync
- Data is stored locally on your device

## Desktop App

The desktop app source lives in [pf-desktop](./pf-desktop).

## Dev

```bash
cd pf-desktop
npm install
npm run tauri:dev
```

## Build

```bash
cd pf-desktop
npm run tauri:build
```

## License

MIT (see LICENSE.md).

## Website

https://kivana.eu/

## macOS Unsigned Builds

If macOS blocks the app on first launch:

1. Move `Kivana.app` into your `Applications` folder.
2. Right‑click `Kivana.app` → Open → Open.

If you get “damaged” / quarantine warnings, remove the quarantine flag:

```bash
sudo xattr -dr com.apple.quarantine "/Applications/Kivana.app"
```

## Data Storage

- Data is stored locally on disk (JSON under the app data directory).
- Backup/restore is available from Settings (single JSON).
