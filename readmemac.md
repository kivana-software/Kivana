# macOS (Apple Silicon) — Launching Unsigned Builds

Kivana is still in development and may not be notarized/signed with an Apple Developer ID yet. On macOS, Gatekeeper can block the app with messages like:

- “Kivana” is damaged and can’t be opened. You should move it to the Bin.
- “Kivana” can’t be opened because Apple cannot check it for malicious software.

Use the steps below to open it safely during development.

## 1) Install correctly (DMG → Applications)

1. Open the downloaded `.dmg`
2. Drag `Kivana.app` into your `Applications` folder
3. Eject the `.dmg`

If you try to run the app directly from the `.dmg`, macOS can behave weirdly with permissions/quarantine.

## 2) First launch (Right‑click → Open)

1. Go to `Applications`
2. Right‑click `Kivana.app` → **Open**
3. Confirm **Open** in the dialog

This creates an explicit user approval for that app on your Mac.

## 3) Fix the “damaged app” message (remove quarantine)

If you get the “damaged” message, it’s usually the macOS quarantine flag on the app bundle. Remove it like this:

```bash
sudo xattr -dr com.apple.quarantine "/Applications/Kivana.app"
```

Then try opening the app again (double click, or right‑click → Open).

If you installed it somewhere else, use that path instead (example):

```bash
sudo xattr -dr com.apple.quarantine "/Users/<you>/Downloads/Kivana.app"
```

## 4) If macOS still blocks it (Privacy & Security → Open Anyway)

1. Try opening `Kivana.app` once (so macOS records the block)
2. Open **System Settings** → **Privacy & Security**
3. Scroll down to the security section
4. Click **Open Anyway** for Kivana
5. Confirm **Open**

## Notes

- These steps are for development builds only. Once the app is signed + notarized, you won’t need this.
- Do not disable Gatekeeper globally. Removing quarantine for this specific app is the safer approach.
