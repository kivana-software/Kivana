# Kivana

Local-first personal finance desktop app for tracking bills, income, accounts, transactions, invoices, and reports.

![Version](https://img.shields.io/badge/version-0.4.11-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![License](https://img.shields.io/badge/license-proprietary-red)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri-24C8DB)

![Kivana dashboard](pf-desktop/src/assets/hero.png)

## What is Kivana

Kivana helps you manage monthly finances in one place: bills, income, transactions, accounts, and invoices. It’s designed to be local-first (works offline; data stays on your device) with an optional account + server connection for plan/entitlements.

Good fit for personal finance, freelancers, and small teams that want simple tracking without a heavy spreadsheet workflow.

## Key Features

| Area | What you can do |
| --- | --- |
| Bills & recurring payments | Due dates, recurrence, snooze, skip, log payments, “due soon” views |
| Income tracking | Track pay dates, log receipts, summary views |
| Accounts & transactions | Basic ledger, balances, transfers, net summary |
| CSV/PDF import | Import bank transactions from CSV; import statements from PDF (multiple formats) |
| Reports & charts | Monthly/year summaries + charts; export printable PDFs |
| Invoice management | Create invoices, attach files (desktop), preview PDFs, push invoice PDF into transaction import |
| Calendar export | Export upcoming bills as an .ics file |
| Notifications | Bill due reminders (desktop notifications) |
| AI assistant | AI command parsing for quick actions (currently focused on Bills) |
| Backup/restore | Export/import backups (including attachments) |
| Account control (server) | Sign in/out, session check, entitlements/plan gating (Pro vs basic) |
| Cross-platform | Built with Tauri + React (macOS + Windows) |

## Screenshots

| Screenshot | Description |
| --- | --- |
| ![Dashboard](pf-desktop/src/assets/hero.png) | Dashboard overview (summary + quick navigation) |

More screenshots will be added as the UI continues to evolve.

## Download & Install

Latest release:
https://github.com/kivana-software/Kivana/releases/latest

Assets you typically want:
- macOS: `.dmg`
- Windows: `.msi`

## Updates

Kivana uses the Tauri updater.
- In the app: Settings → Updates → Check for updates
- Updater index: https://github.com/kivana-software/Kivana/releases/latest/download/latest.json

## Quick Start

1. Install Kivana from the latest release.
2. Create your first account (cash/bank/credit).
3. Add bills (recurring expenses) and income items.
4. Import transactions from CSV or PDF bank statements.
5. Review reports and export a backup.

## Feature Requests & Roadmap

Have an idea? Found something missing? I actively review and prioritize requests.

**How to request:**
- Open a [GitHub Issue](../../issues) with the `feature-request` label
- Or email: [kojankus@gmail.com]

**Current priorities:**
- Mobile companion app (iOS/Android)
- Bank sync via Open Banking APIs
- Multi-currency support
- Investment/ portfolio tracking
- Recurring income rules
- Shared accounts (family/team)

**Recently shipped:**
- v0.4.11: Dashboard improvements (budget card, clearer charts, “Left after bills” breakdown popup) + reconcile UX polish + auth gating fixes
- v0.4.1: PDF viewer window improvements (draggable header, single-page view, print with watermark, basic highlight tool)
- v0.4.0: Sidebar/menu UX fixes + top-bar quick add (Bills/Income)
- v0.3.2: Transaction import progress overlay (CSV/PDF)
- v0.3.0: PDF bank statement import (5 formats)
- v0.3.0: AI command bar for bills
- v0.3.0: People profiles (Pro)
- v0.2.0: Invoice attachments & file storage
- v0.2.0: Backup/restore with attachments

**Won't build:**
- Cloud data storage (stays local-first by design)
- Cryptocurrency trading features
- Tax filing automation (varies too much by jurisdiction)

I read every request. Highest-voted issues get prioritized.

## License

This project is source-available for evaluation. 
Commercial use requires a license. [Contact me](mailto:kojankus@gmail.com) for inquiries.

See [LICENSE](./LICENSE.md) for details.

## Build & Run (Developer)

The desktop app lives in `pf-desktop/`.

```bash
cd pf-desktop
npm install
npm run tauri:dev
```

To produce installers/bundles:

```bash
cd pf-desktop
npm run tauri:build
```

## Data Storage

- Data is stored locally on disk (JSON under the app data directory).
- Backup/restore is available from Settings (desktop supports attachments in backups).
