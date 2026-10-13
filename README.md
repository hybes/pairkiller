# Pairkiller v6.0.0

A modern, intelligent app monitoring and control system that automatically manages your companion applications based on what games you're playing. **Now supports Windows, macOS, and Linux with seamless updates!**

![Pairkiller Logo](icon.png)

## ✨ Features

### 🎯 Rules
- **Pair apps together**: a rule watches one or more apps and opens or closes companion apps alongside them
- **Four behaviours per app**: open and close with it, open with it, close while it runs, or close while it runs and reopen after
- **Any or all**: a rule can be active when any watched app is running, or only when all of them are
- **Templates**: League of Legends + Blitz, Rocket League + BakkesMod (Windows), and starting points for Valorant, Fortnite, Minecraft, Steam, OBS and Discord
- **Pick from what's running**: add apps from a list of running apps with their real icons, or browse for them

### 🖥️ Feels at home on each platform
- **Windows 11**: Mica window, Fluent controls, your system accent colour, light and dark mode
- **macOS**: sidebar vibrancy, grouped settings lists, native menus and dialogs, menu bar extra
- **No Save button**: changes apply as you make them, the way system settings do
- **Live status**: see which rules are active and which apps are running, plus an activity history of everything Pairkiller opened or closed

### 🚀 Light and reliable
- **Negligible overhead**: on Windows the process list is read straight from the system (about 10 ms per check) instead of spawning `tasklist`
- **Never acts on missing data**: if the process list can't be read, the check is skipped rather than treated as "nothing is running"
- **Forgiving of restarts**: a watched app has to be gone for a few seconds before its rule switches off, so a client that restarts itself doesn't bounce your companion app
- **Respects you**: an app you close by hand stays closed until the next time its rule activates

### 🔄 Updates
- **Automatic configuration upgrade** from every earlier version
- **Background updates** from GitHub Releases, installed when you restart

## 📥 Installation

### Download
Get the latest release from [GitHub Releases](https://github.com/hybes/pairkiller/releases). Names follow the version tag, for example:

- **Windows**: `Pairkiller-Setup-<version>.exe` (NSIS installer — use this for Start Menu, uninstaller, and in-app updates)
- **macOS**: `Pairkiller-<version>-<arch>.dmg` or `.zip` (Intel & Apple Silicon)
- **Linux**: `.AppImage`, `.deb`, or `.tar.gz` for x64

Requires 64-bit Windows 10 or later, or macOS 13 (Ventura) or later. Version 6.0.5 is the last release for 32-bit Windows and for macOS 12 and earlier.

### Platform-specific installation

#### Windows
1. Download **`Pairkiller-Setup-<version>.exe`** from [Releases](https://github.com/hybes/pairkiller/releases) (run the Setup wizard rather than a loose download-only `.exe`).
2. Install to the default location: **`%LOCALAPPDATA%\Programs\Pairkiller`** (per-user, no admin required).
3. You get **Desktop** and **Start Menu** shortcuts, a proper entry in **Settings → Apps → Installed apps**, and matching **taskbar** grouping.
4. Allow **Launch Pairkiller** at the end of the wizard if you want; auto-start at sign-in is still controlled from **Settings** inside the app.
5. The app runs from the system tray after install.

#### macOS
1. Download the **DMG** (or **ZIP**) for your architecture.
2. Open the DMG and drag Pairkiller into **Applications**.
3. Launch from Applications or Spotlight; grant permissions if macOS prompts you.

#### Linux
1. Download the **AppImage** (or **deb** / **tar.gz** if you prefer).
2. AppImage example: `chmod +x Pairkiller-*.AppImage` then `./Pairkiller-*.AppImage`

### Quick Start
1. Launch Pairkiller. Its window opens, and it keeps running in the system tray (Windows) or menu bar (macOS) after you close it
2. Choose **New rule** and pick a template, or start with a blank rule
3. Add the app to watch and the app to control. Changes apply immediately

## 🎮 Usage Examples

### League of Legends + Blitz

**Windows:**
Monitor when League of Legends is running and automatically start/stop Blitz accordingly.
- **Monitored Apps:** `LeagueClient.exe`, `League of Legends.exe`
- **Controlled Apps:** `Blitz.exe` (Start/Stop with League)

**macOS:**
- **Monitored Apps:** `League of Legends` (covers both the client and the game, which live inside the same app)
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
- **Windows**: reads the process table directly through the Windows API; falls back to `tasklist` if that is unavailable
- **macOS**: uses `ps`. An app is matched by its executable name or by the name of any `.app` bundle it runs inside
- **Linux**: reads `/proc`

### App Launching and Closing
- **Windows**: opened through the shell, the same as double-clicking; closed with `taskkill /F`
- **macOS**: `.app` bundles are opened through Launch Services; apps are asked to quit first and forced only if they don't
- **Linux**: launched as a detached process; closed with `SIGTERM`, then `SIGKILL`

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

bun run dev      # run the app
bun run test     # unit tests for the rule engine, config and process parsing
bun run lint
```

There is no build step for the interface: `src/renderer` is plain HTML, CSS and JavaScript.

On **macOS**, packaged installs often use **menu-bar only** mode (no Dock icon). A development run always shows the Dock icon and opens the window.

Development runs understand a few environment variables:

| Variable | Effect |
| --- | --- |
| `PAIRKILLER_USER_DATA=<dir>` | Use a separate profile, so a development copy can run next to the installed app |
| `PAIRKILLER_DRY_RUN=1` | Evaluate rules and log what would happen, without opening or closing anything |
| `PAIRKILLER_UI_PLATFORM=darwin|win32` | Preview the other platform's look |

`bunx electron scripts/dev-screenshots.js <output-dir> [win32|darwin] [empty]` renders every screen to PNG, in light and dark, without showing a window.

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

1. Bump **`version`**: **`nr version:patch`**, **`nr version:minor`**, or **`nr version:major`** (no local git tag — CI creates **`v…`**), or **`nr bump`** for [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) and the changelog. Commit and push **`main`**.
2. Open **Actions** → **Release** and wait for **gate** → **build** → **publish**.

**Manual tag:** `git tag v6.0.1 && git push origin v6.0.1` still triggers **Release** (tag push path).

**Manual run:** **Actions** → **Release** → **Run workflow**; the version you enter must match `package.json` on `main`.

**Auto-update (Windows):** the published release should include **`latest.yml`** and the **NSIS** **`.exe.blockmap`** files (uploaded by this workflow). Installed users update in place; the portable build is no longer shipped.

Local one-off builds:

```bash
bun run build:icons && bun run build:mac   # on a Mac → check dist/
bun run build:icons && bun run build:win   # on Windows → check dist/
```

### Platform-Specific Development

#### Windows Development
Requires 64-bit Windows 10 or later.

#### macOS Development
Requires macOS 13+ and Xcode Command Line Tools:
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

#### Linux
**Q: AppImage won't run**
A: Ensure the file is executable (`chmod +x Pairkiller.AppImage`) and that you have FUSE installed.

### Common Issues

**Q: Controlled app isn't starting**
A: Verify the path to the executable is correct. Use the "Browse" button to select the file.

**Q: An app didn't close (or open) when I expected**
A: Open **Activity** to see what Pairkiller did and when. If it says an app couldn't be closed, that app is probably running as administrator, which a normal app isn't allowed to close.

### Debug mode
```bash
bun run dev
```

### In-app updates (installed builds)

- Pairkiller checks GitHub Releases in the background (packaged builds only) and notifies you when a newer version is available.
- Updates download in the background. When one is ready, use **Restart to update** in the app or tray menu, or simply **quit the app** — the pending update is applied on quit when possible.
- macOS builds are unsigned and can't replace themselves, so the app points you to the download page instead.
- Development runs (`bun run dev`) skip automatic update checks to avoid noise.

### Windows install & uninstall

- **Installer**: NSIS **Setup** installs to **`%LOCALAPPDATA%\Programs\Pairkiller`**, creates shortcuts, and registers the app for **Apps & Features** (same fixed upgrade **GUID** across versions).
- **Legacy folders**: On install, the wizard only removes **other** folders that look like old installs (**`Pairkiller.exe` at the folder root**, e.g. a mistaken copy under Roaming or `Program Files`). Your normal **settings folder** is only data files (no `.exe` there) and is **not** deleted by the installer.
- **Auto-start** is set from **Settings** in the app; the installer does not force a Run key.
- **Uninstall**: **Settings → Apps** (or **Add or remove programs**) → **Pairkiller** → **Uninstall**. That removes program files and shortcuts; **`deleteAppDataOnUninstall`** is off, so your profile under **`%APPDATA%\pairkiller`** (Electron `userData` for this package name) is kept unless you remove it yourself.

### Logs
Pairkiller keeps a rolling log of what it did and why. **Settings → Activity log** opens its folder.
- **Windows**: `%APPDATA%Pairkillerlogspairkiller.log`
- **macOS**: `~/Library/Application Support/Pairkiller/logs/pairkiller.log`
- **Linux**: `~/.config/Pairkiller/logs/pairkiller.log`

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
- Process list access on Windows via [Koffi](https://koffi.dev/)

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
