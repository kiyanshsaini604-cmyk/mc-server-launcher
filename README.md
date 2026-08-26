# ⛏️ MC Server Launcher

A sleek desktop app (Electron + React + Tailwind) to **create, configure, and run Minecraft servers from your own laptop** — no command line required.

![Stack](https://img.shields.io/badge/Electron-React-blue) ![MC](https://img.shields.io/badge/Minecraft-Vanilla%20%7C%20Paper%20%7C%20Purpur%20%7C%20Forge%20%7C%20Fabric-green)

## ✨ Features

### Server Management
- 🧙 **Create Server wizard** — pick name, mod loader, and MC version in 4 steps
- 🌐 **All mod loaders** — Vanilla, Paper, Purpur, Spigot, Forge, Fabric with real download APIs (`api.papermc.io`, `meta.fabricmc.net`, Modrinth, Mojang manifest)
- 📜 **Dynamic version list** — fetched live from Mojang, filtered by loader compatibility
- ▶️ **Start/Stop/Restart** servers with a live streaming console + command input
- 📊 **Live metrics** — player count, memory usage, TPS & uptime parsed from console output
- 💾 **Backup / Restore** any server as a zip with one click

### Default Resource Packs (auto-deployed)
On server creation the launcher pulls cross-version packs from **Modrinth** matched to your exact MC version:
- Fresh Animations · FA+Player · HUD-Refined · Faithful 32x
- Complementary Unbound · BSL Shaders (shaders for clients)
- Fabric API (server-safe, auto-included on Fabric)

Manage defaults in Settings → add/remove packs or push to all existing servers.

### Server Administration
- 👥 **Players tab** — op/deop, whitelist, kick/ban/pardon
- 🧩 **Mods tab** — drag-and-drop mod uploads, list & remove mods
- ⚙️ **Config tab** — full `server.properties` editor + JVM memory flags
- 📄 **Logs viewer** — read `latest.log` without touching the file system
- 🖥️ **System info** — CPU/RAM detection to right-size your server

## 🚀 Getting Started

```bash
npm install
npm run dev        # dev mode with hot reload
```

Build a distributable installer:

```bash
npm run build      # compile renderer + main
npx electron-builder          # Windows installer → release/
```

> Requires Java installed on your system to actually run Minecraft servers. The launcher detects your Java install automatically.

## 🏗️ Architecture

```
src/
├── main/            # Electron main process
│   ├── index.ts       # IPC handlers: servers, backups, versions, window controls
│   └── downloaders.ts # Per-loader JAR downloads + Modrinth pack fetcher
├── preload.ts       # Secure contextBridge API
├── components/      # Dashboard, CreateServer, ServerView, Sidebar, Settings, TitleBar
└── types/           # Shared TypeScript types
server/
└── defaults.json    # Modrinth-backed default resource pack definitions
```

## 📦 Tech

Electron · React 18 · TypeScript · Vite · Tailwind CSS

---

Built with ❤️ by [kiyanshsaini604-cmyk](https://github.com/kiyanshsaini604-cmyk) — star the repo if it helps you host your first server!
