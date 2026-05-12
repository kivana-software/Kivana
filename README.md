# 🏦 Kivana — Personal Finance & Accounting

> **Offline-first. Privacy-first. Open source. Your data never leaves your device.**

<p align="center">
  <img src="https://kivana.eu/kivana-logo.png" alt="Kivana Logo" width="120"/>
</p>

<p align="center">
  <a href="https://github.com/kivana-software/Kivana/blob/main/LICENSE.md">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"/>
  </a>
  <a href="https://kivana.eu">
    <img src="https://img.shields.io/badge/website-kivana.eu-1b1748" alt="Website"/>
  </a>
  <img src="https://img.shields.io/badge/built%20with-Tauri%20%7C%20React%20%7C%20TypeScript-3178C6" alt="Built with"/>
  <a href="https://www.paypal.com/paypalme/kostelioklausimynas">
    <img src="https://img.shields.io/badge/donate-PayPal-00457C?logo=paypal" alt="Donate"/>
  </a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#why-kivana">Why Kivana?</a> •
  <a href="#comparison">Comparison</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#development">Development</a> •
  <a href="#license--funding">License & Funding</a>
</p>

---

<p align="center">
  <img src="https://raw.githubusercontent.com/kivana-software/Kivana/main/assets/dashbord1.png" alt="Kivana Dashboard Screenshot" width="800"/>
</p>

<p align="center">
  <em>Your finances, beautifully organized — fully offline, fully private.</em>
</p>

<details>
<summary>👀 See more screenshots</summary>

<p align="center">
  <img src="https://raw.githubusercontent.com/kivana-software/Kivana/main/assets/Report.png" alt="Kivana Reports" width="800"/>
</p>
<p align="center">
  <em>Track income, expenses, and trends with detailed reports.</em>
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/kivana-software/Kivana/main/assets/hero.png" alt="Kivana Hero" width="600"/>
</p>
</details>

Kivana is a **modern personal finance & accounting app** that runs entirely on your device. No cloud, no subscriptions, no data selling — just a beautiful, fast, and private way to manage your money.

---

<h2 id="features">✨ Features</h2>

| Feature | Description |
|---------|-------------|
| 🔒 **100% Local** | All data stored on your device — nothing leaves your machine |
| 🚫 **No Account Required** | No sign-up, no email, no tracking |
| 💾 **One-Click Backup** | Export and restore your full data as JSON |
| 🖥️ **Cross-Platform** | Works on macOS, Windows, and Linux |
| ⚡ **Blazing Fast** | Built with Tauri + React + TypeScript for native performance |
| 🎨 **Beautiful UI** | Clean, modern design that's actually pleasant to use |
| 📊 **Full Accounting** | Track income, expenses, and your overall financial picture |
| 🔓 **Open Source** | MIT-licensed — inspect, modify, and trust the code |

---

<h2 id="why-kivana">🤔 Why Kivana?</h2>

Most personal finance apps today are **SaaS products disguised as tools**:

- ❌ They store your financial data on someone else's server
- ❌ They track your behavior and sell analytics
- ❌ They lock features behind monthly subscriptions
- ❌ They disappear or change pricing whenever they want

**Kivana is different:**

- ✅ Your data stays **on your device** — always
- ✅ **No tracking, no telemetry, no accounts**
- ✅ **MIT-licensed** — free forever, fork it if you want
- ✅ Works **offline** — no internet required
- ✅ You own your backups — portable JSON format

> *"Built with care, for people who own their data."*

---

<h2 id="comparison">📋 Comparison</h2>

| Feature | Kivana | YNAB | Actual Budget | Mint | Lunch Money |
|---------|--------|------|---------------|------|-------------|
| **Offline-first** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Open Source (MIT)** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **No Account Required** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Privacy-first** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Free** | ✅ | ❌ | ✅ (self-host) | ❌ | ❌ |
| **Cross-Platform** | ✅ | ✅ | ✅ | ✅ | 🌐 Web |
| **Beautiful UI** | ✅ | ✅ | ⚠️ | ✅ | ✅ |

---

<h2 id="quick-start">🚀 Quick Start</h2>

### Download

Grab the latest release for your platform from the [Releases page](https://github.com/kivana-software/Kivana/releases/latest).

| Platform | Format |
|----------|--------|
| **macOS** | `.dmg` |
| **Windows** | `.msi` |
| **Linux** | `.AppImage` or `.deb` |

### macOS Fix (if blocked)

If macOS blocks the app on first launch:

1. Move `Kivana.app` into your `Applications` folder.
2. Right-click → Open → Open.

If you get a "damaged" / quarantine warning:

```bash
sudo xattr -dr com.apple.quarantine "/Applications/Kivana.app"
```

### Data Storage

- Data is stored locally as JSON under the app data directory
- Backup and restore your full data from **Settings** → **Backup**

---

<h2 id="development">🛠️ Development</h2>

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (for Tauri)
- System dependencies for [Tauri](https://tauri.app/start/prerequisites/)

### Setup

```bash
cd pf-desktop
npm install
npm run tauri:dev
```

### Build

```bash
cd pf-desktop
npm run tauri:build
```

---

<h2 id="license--funding">📜 License & Funding</h2>

### License

**MIT** — see [LICENSE.md](./LICENSE.md). Free to use, modify, and distribute.

Is Kivana valuable to you? Consider supporting its development:

<p align="center">
  <a href="https://www.paypal.com/paypalme/kostelioklausimynas">
    <img src="https://img.shields.io/badge/Donate-PayPal-00457C?style=for-the-badge&logo=paypal" alt="Donate via PayPal"/>
  </a>
</p>

Your donations help keep Kivana **free, open source, and privacy-first**. Every contribution goes directly into development.

---

<p align="center">
  <a href="https://kivana.eu">kivana.eu</a> •
  <a href="https://github.com/kivana-software/Kivana/issues">Report a Bug</a> •
  <a href="https://github.com/kivana-software/Kivana/discussions">Discussion</a>
</p>

<p align="center">
  <sub>Built with care, for people who own their data. ❤️</sub>
</p>
