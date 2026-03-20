# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [6.0.5](https://github.com/hybes/pairkiller/compare/v6.0.3...v6.0.5) (2026-03-20)

### [6.0.4](https://github.com/hybes/pairkiller/compare/v6.0.3...v6.0.4) (2026-03-20)

### [6.0.3](https://github.com/hybes/pairkiller/compare/v6.0.2...v6.0.3) (2026-03-20)

- **Windows**: NSIS cleanup only removes legacy folders when **`Pairkiller.exe`** is at that folder root (avoids deleting `%APPDATA%\pairkiller` user data); migrates away from previous **`InstallPath`** in registry when upgrading.
- **Windows**: **`app.setAppUserModelId('com.pairkiller.app')`** for proper taskbar / shell behaviour.
- **Windows**: Releases ship **NSIS Setup only** (portable artefact removed). NSIS header icons require `.ico`; wizard uses defaults so PNG-only assets do not break CI.

### [6.0.2](https://github.com/hybes/pairkiller/compare/v6.0.1...v6.0.2) (2026-03-20)

### [6.0.1](https://github.com/hybes/pairkiller/compare/v6.0.0...v6.0.1) (2026-03-20)

## [6.0.0](https://github.com/hybes/pairkiller/releases/tag/v6.0.0) (2026-03-19)

### Highlights

- **Runtime & tooling**: Electron 41, Bun for installs and scripts, Tailwind CSS v4, ESLint 10, `@sentry/electron` 7, refreshed CI on Bun.
- **Security & stability**: Context-isolated renderers with a whitelisted preload API; single-instance lock; safer config saves and updater scheduling; clearer install/uninstall behaviour on Windows (auto-start controlled in-app only).
- **Updates**: Release metadata stays compatible with **electron-updater from v5.x** (`electronUpdaterCompatibility` **>=5.0.0**) so existing installs can upgrade cleanly; pending updates can complete on normal quit when appropriate.
- **Docs & versioning**: README and artefacts aligned with current release naming; **6.0.0** is the shipping app version in `package.json`.

### [4.6.2](https://github.com/hybes/pairkiller/compare/v4.6.1...v4.6.2) (2025-09-11)


### Features

* comprehensive Windows installer system with cleanup and validation ([4d2cadc](https://github.com/hybes/pairkiller/commit/4d2cadc0d4536fe5c905c414a3bac25a683d0557))


### Bug Fixes

* remove invalid NSIS configuration properties and fix icon paths ([729d37d](https://github.com/hybes/pairkiller/commit/729d37de0a729931a573c6217ab3e780eb64c299))
* remove NSIS icon configuration to fix build ([fe6d4f9](https://github.com/hybes/pairkiller/commit/fe6d4f9383d026d78fb951733431f494247e352e))
* update build scripts for Windows compatibility and use PNG icons ([9c338a7](https://github.com/hybes/pairkiller/commit/9c338a778720686d39d63cdd0e2b2c2def75b3c8))

### [4.6.1](https://github.com/hybes/pairkiller/compare/v4.5.1...v4.6.1) (2025-08-06)

## [4.0.0](https://github.com/hybes/pairkiller/compare/v3.2.0...v4.0.0) (2024-11-26)

### ✨ Features

**Seamless Update System**
- **Configuration Migration**: Automatic migration of settings from any previous version (v1.0.0+)
- **Backup System**: Automatic configuration backups before updates with recovery functionality
- **Enhanced Auto-Updater**: Improved error handling with network retry and graceful fallbacks
- **Update Safety**: Pre-installation checks and validation to ensure successful updates
- **Migration Testing**: Built-in test suite to verify configuration migrations work correctly

**Compatibility Improvements**
- Full backward compatibility with all previous configuration formats
- Automatic detection and migration of legacy `apps` array to new `appGroups` structure
- Preserved user settings during updates (monitoring intervals, UI preferences, etc.)
- Intelligent recovery from corrupted configurations using backup system

**Developer Experience**
- Added comprehensive migration test suite (`npm run test:migration`)
- Enhanced build validation in CI/CD pipeline
- Improved error logging and debugging capabilities
- Better Sentry integration for update-related issues

### 🔧 Technical Changes

- Added `configVersion` tracking for precise migration control
- Implemented atomic configuration saving to prevent corruption
- Enhanced error handling for network issues during updates
- Added automatic cleanup of old configuration backups (keeps last 5)
- Improved GitHub Actions workflow with compatibility testing

### [3.2.0](https://github.com/hybes/pairkiller/compare/v3.1.1...v3.2.0) (2024-11-26)

### [3.1.1](https://github.com/hybes/pairkiller/compare/v3.1.0...v3.1.1) (2024-11-26)

## [3.1.0](https://github.com/hybes/pairkiller/compare/v3.0.0...v3.1.0) (2024-11-26)

## [3.0.0](https://github.com/hybes/pairkiller/compare/v2.2.0...v3.0.0) (2024-11-26)

## [2.2.0](https://github.com/hybes/pairkiller/compare/v2.1.1...v2.2.0) (2024-11-25)

### [2.1.1](https://github.com/hybes/pairkiller/compare/v2.1.0...v2.1.1) (2024-11-25)

## [2.1.0](https://github.com/hybes/pairkiller/compare/v2.0.6...v2.1.0) (2024-11-25)

### [2.0.6](https://github.com/hybes/pairkiller/compare/v2.0.5...v2.0.6) (2024-11-25)

### [2.0.5](https://github.com/hybes/pairkiller/compare/v2.0.4...v2.0.5) (2024-11-25)

### [2.0.4](https://github.com/hybes/pairkiller/compare/v2.0.3...v2.0.4) (2024-11-25)

### [2.0.3](https://github.com/hybes/pairkiller/compare/v2.0.2...v2.0.3) (2024-11-25)

### [2.0.2](https://github.com/hybes/pairkiller/compare/v2.0.1...v2.0.2) (2024-11-25)

### [2.0.1](https://github.com/hybes/pairkiller/compare/v1.8.0...v2.0.1) (2024-11-25)

### [1.7.3](https://github.com/Hybes/pairkiller/compare/v1.7.2...v1.7.3) (2023-11-08)

### [1.7.2](https://github.com/Hybes/pairkiller/compare/v1.7.1...v1.7.2) (2023-11-08)

### [1.7.1](https://github.com/Hybes/pairkiller/compare/v1.7.0...v1.7.1) (2023-11-08)

### [1.6.10](https://github.com/Hybes/pairkiller/compare/v1.6.9...v1.6.10) (2023-10-23)

### [1.6.9](https://github.com/Hybes/pairkiller/compare/v1.6.8...v1.6.9) (2023-08-29)

### [1.6.8](https://github.com/Hybes/pairkiller/compare/v1.6.7...v1.6.8) (2023-08-23)

### [1.6.7](https://github.com/Hybes/pairkiller/compare/v1.6.6...v1.6.7) (2023-08-22)

### [1.6.6](https://github.com/Hybes/pairkiller/compare/v1.6.5...v1.6.6) (2023-08-22)

### [1.6.5](https://github.com/Hybes/pairkiller/compare/v1.0.0...v1.6.5) (2023-08-22)
