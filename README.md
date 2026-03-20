# Pairkiller v6.0.0

A modern, intelligent app monitoring and control system that automatically manages your companion applications based on what games you're playing. **Now supports Windows, macOS, and Linux with seamless updates!**

![Pairkiller Logo](icon.png)

## ✨ Features

### 🎯 Smart Monitoring
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Real-time Process Detection**: Monitors running applications with optimized performance
- **Flexible Conditions**: Set rules based on "any" or "all" monitored apps running
- **Process Caching**: Efficient monitoring with intelligent caching to reduce system load

### 🎮 Gaming Focus
- **Pre-built Presets**: Ready-to-use configurations for popular gaming setups
  - League of Legends + Blitz (Windows & macOS)
  - Rocket League + BakkesMod (Windows) / Rocket League Monitor (macOS)
  - Steam Games monitoring (All platforms)
  - Discord Gaming monitor (All platforms)
- **Custom Groups**: Create your own monitoring groups for any applications

### 🚀 Enhanced Performance
- **Parallel Processing**: Concurrent app monitoring and control for better performance
- **Resource Optimization**: Minimal system impact with smart resource management
- **Error Recovery**: Robust error handling and automatic recovery mechanisms
- **Platform-Optimized**: Uses native commands for each operating system

### 🎨 Modern UI/UX
- **Beautiful Interface**: Clean, modern design with smooth animations
- **Dark Theme**: Eye-friendly dark theme throughout the application
- **Responsive Design**: Adapts to different screen sizes and resolutions
- **Interactive Elements**: Tooltips, confirmations, and visual feedback

### 🔧 Advanced Configuration
- **Flexible Actions**: Start, stop, sync, or run opposite to monitored apps
- **Path Detection**: Automatic executable path detection with file browser
- **Cross-Platform Apps**: Supports .exe files on Windows, .app bundles on macOS
- **Validation**: Real-time configuration validation with helpful error messages
- **Backup & Recovery**: Safe configuration management with atomic saves

### 🔄 Seamless Updates
- **Automatic Configuration Migration**: Your settings are automatically migrated when updating from any previous version
- **Safe Update Process**: Configuration backups are created before updates
- **Backward Compatibility**: Supports configuration formats from v1.0.0+ 
- **Update Verification**: Built-in tests ensure migrations work correctly
- **Recovery System**: Automatic backup restoration if configuration becomes corrupted

## 📥 Installation

### Download
Get the latest release from [GitHub Releases](https://github.com/hybes/pairkiller/releases). Names follow the version tag, for example:

- **Windows**: `Pairkiller-Setup-<version>.exe` (and optional portable `.exe`)
- **macOS**: `Pairkiller-<version>-<arch>.dmg` or `.zip` (Intel & Apple Silicon)
- **Linux**: `.AppImage`, `.deb`, or `.tar.gz` for x64

### Platform-specific installation

#### Windows
1. Download the latest **Setup** executable from Releases.
2. Run the installer and follow the wizard (per-user install under `%LOCALAPPDATA%` by default).
3. The app can start automatically and lives in the system tray.

#### macOS
1. Download the **DMG** (or **ZIP**) for your architecture.
2. Open the DMG and drag Pairkiller into **Applications**.
3. Launch from Applications or Spotlight; grant permissions if macOS prompts you.

#### Linux
1. Download the **AppImage** (or **deb** / **tar.gz** if you prefer).
2. AppImage example: `chmod +x Pairkiller-*.AppImage` then `./Pairkiller-*.AppImage`

### Quick Start
1. Launch the application (it will start in the system tray)
2. Right-click the tray icon and select "Settings"
3. Choose a preset or create your own app group
4. Save and let Pairkiller manage your apps automatically!

## 🎮 Usage Examples

### League of Legends + Blitz

**Windows:**
Monitor when League of Legends is running and automatically start/stop Blitz accordingly.
- **Monitored Apps:** `LeagueClient.exe`, `League of Legends.exe`
- **Controlled Apps:** `Blitz.exe` (Start/Stop with League)

**macOS:**
- **Monitored Apps:** `League of Legends`, `LeagueClient`
- **Controlled Apps:** `Blitz` (Start/Stop with League)

### Rocket League + BakkesMod

**Windows:**
Automatically manage BakkesMod when playing Rocket League.
- **Monitored Apps:** `RocketLeague.exe`
- **Controlled Apps:** `BakkesMod.exe` (Sync with Rocket League)

**macOS:**
Monitor Rocket League for companion app management.
- **Monitored Apps:** `RocketLeague`
- **Controlled Apps:** Add your preferred companion apps

### Cross-Platform Steam Monitor
Works on all platforms to monitor Steam and manage gaming apps.
- **Windows:** Monitors `steam.exe`
- **macOS:** Monitors `Steam`
- **Linux:** Monitors `steam`

## ⚙️ Platform Differences

### Process Detection
- **Windows**: Uses `tasklist` for process detection
- **macOS**: Uses `pgrep` and `ps` with fallback to AppleScript for .app bundles
- **Linux**: Uses `pgrep` and `ps` for process detection

### App Launching
- **Windows**: Direct executable launching
- **macOS**: Uses `open` command for .app bundles, direct execution for binaries
- **Linux**: Background process launching with `&`

### File Types
- **Windows**: Supports `.exe`, `.bat`, `.cmd` files
- **macOS**: Supports `.app` bundles and executables
- **Linux**: Supports all executable files

## 🔧 Development

### Prerequisites
- [Bun](https://bun.sh) 1.0 or newer
- Optional: ImageMagick if you generate multi-resolution icons locally

### Setup
```bash
git clone https://github.com/hybes/pairkiller.git
cd pairkiller

bun install

bun run build:css
bun run dev
```

On **macOS**, packaged installs often use **menu-bar / tray-only** mode (no dock icon). **`bun run dev`** now forces the **Dock** visible and **opens Settings** automatically so you are not staring at an empty desktop. For a normal install, use the **tray icon** (top-right menu bar) → **Settings**.

### Building for distribution

**Quick commands:**
```bash
bun run build:icons     # Copy icon + regenerate trayTemplate.png (macOS) for menu bar
bun run build:mac       # macOS
bun run build:win       # Windows
bun run build:linux     # Linux
bun run build:all       # All platforms on current machine
bun run release         # Icons + all platforms
```

`build:win` only works on Windows (or a Windows VM), and `build:mac` only on macOS—electron-builder cannot cross-build the other OS reliably from one machine. For **both** artefacts in one release, use GitHub Actions (below) or build on two machines and upload the `dist/` outputs to the same [GitHub Release](https://github.com/hybes/pairkiller/releases).

### Shipping macOS + Windows (recommended)

**One workflow:** [`.github/workflows/release.yml`](.github/workflows/release.yml) runs on pushes to **`main`**, on **`v*`** tag pushes, and manually. It only **builds** when:

- you **bumped** the app **`version`** in [`package.json`](package.json) compared to the previous commit on **`main`**, or  
- the run was triggered by a **`v*`** tag, or  
- you used **Run workflow** (manual).

On a **version bump** push to `main`, it builds Mac + Windows and **[creates the GitHub Release and the `v…` tag](https://github.com/softprops/action-gh-release)** in the same run (no separate tag workflow). That avoids a GitHub limitation where a tag pushed with **`GITHUB_TOKEN`** does **not** start another workflow.

1. Bump **`version`**: **`nr version:patch`**, **`nr version:minor`**, or **`nr version:major`** (no local git tag — CI creates **`v…`**), or **`nr bump`** for [standard-version](https://github.com/conventional-changelog/standard-version) and the changelog. Commit and push **`main`**.
2. Open **Actions** → **Release** and wait for **gate** → **build** → **publish**.

**Manual tag:** `git tag v6.0.1 && git push origin v6.0.1` still triggers **Release** (tag push path).

**Manual run:** **Actions** → **Release** → **Run workflow**; the version you enter must match `package.json` on `main`.

**Auto-update (Windows):** the published release should include **`latest.yml`** and **`.exe.blockmap`** (uploaded by this workflow).

Local one-off builds:

```bash
bun run build:icons && bun run build:mac   # on a Mac → check dist/
bun run build:icons && bun run build:win   # on Windows → check dist/
```

### Platform-Specific Development

#### Windows Development
Requires Windows 10+ for full functionality testing.

#### macOS Development
Requires macOS 10.14+ and Xcode Command Line Tools:
```bash
xcode-select --install
```

#### Linux Development
Requires development packages:
```bash
# Ubuntu/Debian
sudo apt-get install build-essential

# RHEL/CentOS/Fedora
sudo yum groupinstall "Development Tools"
```

## 🐛 Troubleshooting

### Platform-Specific Issues

#### Windows
**Q: Pairkiller isn't detecting my app**
A: Make sure you're using the correct process name (e.g., `notepad.exe`). Check Task Manager for the exact process name.

#### macOS
**Q: Can't detect Mac applications**
A: Try using just the app name without ".app" (e.g., "Steam" instead of "Steam.app"). For some apps, you may need to use the actual process name.

**Q: Permission denied when starting apps**
A: Check System Preferences > Security & Privacy > Privacy > Automation and ensure Pairkiller has the necessary permissions.

#### Linux
**Q: AppImage won't run**
A: Ensure the file is executable (`chmod +x Pairkiller.AppImage`) and that you have FUSE installed.

### Common Issues

**Q: Controlled app isn't starting**
A: Verify the path to the executable is correct. Use the "Browse" button to select the file.

**Q: High CPU usage**
A: Increase the monitoring interval in settings to reduce frequency of checks.

### Debug mode
```bash
bun run dev
```

### In-app updates (installed builds)

- Pairkiller checks GitHub Releases in the background (packaged builds only) and notifies you when a newer version is available.
- Downloads are manual-confirm: you choose when to install. After a build is downloaded, you can use **Install & Restart** or simply **quit the app** — the pending update is applied on quit when possible.
- Development runs (`bun run dev`) skip automatic update checks to avoid noise.

### Windows install & uninstall

- **NSIS installer**: per-user install under `%LOCALAPPDATA%\\Programs\\Pairkiller` by default; shortcuts and uninstall entry are managed by the installer.
- **Auto-start** is configured from **Settings** in the app, not forced by the installer, so reinstalls do not override your preference.
- **Uninstall** removes the app, shortcuts, and registry entries created by the app; your config under `%APPDATA%\\Pairkiller` (or the platform equivalent) is kept so you can reinstall without losing groups unless you delete that folder yourself.

### Logs
- **Windows**: `%APPDATA%/Pairkiller/logs/`
- **macOS**: `~/Library/Logs/Pairkiller/`
- **Linux**: `~/.config/Pairkiller/logs/`

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Ben Hybert**
- GitHub: [@hybes](https://github.com/hybes)
- Twitter: [@hybes](https://twitter.com/hybes)
- Email: ben@cnnct.uk

## 🙏 Acknowledgments

- Originally created because Fraser wanted Blitz to only run with League of Legends
- Built with [Electron](https://electronjs.org/) for cross-platform compatibility
- UI styled with [Tailwind CSS](https://tailwindcss.com/)
- Icons by [Font Awesome](https://fontawesome.com/)

## 📊 Stats

![GitHub release](https://img.shields.io/github/v/release/hybes/pairkiller)
![GitHub downloads](https://img.shields.io/github/downloads/hybes/pairkiller/total)
![GitHub stars](https://img.shields.io/github/stars/hybes/pairkiller)
![GitHub issues](https://img.shields.io/github/issues/hybes/pairkiller)
![GitHub license](https://img.shields.io/github/license/hybes/pairkiller)

---

<div align="center">
Made with ❤️ for the gaming community across all platforms
</div>
