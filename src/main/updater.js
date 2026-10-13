'use strict';

const RELEASES_URL = 'https://github.com/hybes/pairkiller/releases/latest';
const FIRST_CHECK_MS = 30 * 1000;
const RECHECK_MS = 4 * 60 * 60 * 1000;

// status: idle | checking | downloading | ready | current | manual | error | unsupported
function createUpdater({ app, log, onChange, beforeInstall }) {
    let state = { status: 'idle', version: null, percent: 0, message: '' };
    let manual = false;
    let timer = null;

    function set(next) {
        state = { ...state, ...next };
        onChange(state);
    }

    if (!app.isPackaged) {
        return {
            releasesUrl: RELEASES_URL,
            getState: () => state,
            start() {},
            check() {
                set({ status: 'unsupported', message: 'Updates are only available in an installed copy.' });
            },
            install() {},
        };
    }

    const { autoUpdater } = require('electron-updater');
    autoUpdater.setFeedURL({ provider: 'github', owner: 'hybes', repo: 'pairkiller' });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = {
        info: (message) => log.info(`[updater] ${message}`),
        warn: (message) => log.warn(`[updater] ${message}`),
        error: (message) => log.error(`[updater] ${message}`),
        debug() {},
    };

    autoUpdater.on('checking-for-update', () => {
        if (manual) set({ status: 'checking', message: '' });
    });

    autoUpdater.on('update-available', (info) => {
        manual = false;
        set({ status: 'downloading', version: info.version, percent: 0, message: '' });
    });

    autoUpdater.on('update-not-available', () => {
        if (manual) set({ status: 'current', message: '' });
        manual = false;
    });

    autoUpdater.on('download-progress', (progress) => {
        set({ status: 'downloading', percent: Math.round(progress.percent) });
    });

    autoUpdater.on('update-downloaded', (info) => {
        set({ status: 'ready', version: info.version, percent: 100, message: '' });
    });

    autoUpdater.on('error', (error) => {
        const text = String((error && error.message) || error);
        log.warn(`[updater] ${text}`);
        const wasManual = manual;
        manual = false;
        if (state.status === 'ready') return;

        // Unsigned builds (every macOS build so far) can't replace themselves; point at the download.
        if (/code signature|not signed|failed to satisfy|validation/i.test(text)) {
            if (wasManual || state.status === 'downloading') {
                set({ status: 'manual', message: 'This copy can’t update itself. Download the new version from GitHub.' });
            }
            return;
        }
        if (!wasManual && state.status !== 'downloading') return;
        if (/404|Cannot find .*latest/i.test(text)) {
            set({ status: 'current', message: '' });
        } else if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|net::/i.test(text)) {
            set({ status: 'error', message: 'Couldn’t reach the update server. Check your connection and try again.' });
        } else {
            set({ status: 'error', message: 'The update check failed. Try again later.' });
        }
    });

    function check({ manual: byUser = false } = {}) {
        if (state.status === 'downloading' || state.status === 'ready') return;
        manual = byUser;
        autoUpdater.checkForUpdates().catch(() => {
            // Reported through the 'error' event above.
        });
    }

    function start() {
        timer = setTimeout(function tick() {
            check();
            timer = setTimeout(tick, RECHECK_MS);
        }, FIRST_CHECK_MS);
    }

    async function install() {
        if (state.status !== 'ready') return;
        clearTimeout(timer);
        try {
            await beforeInstall();
        } catch (error) {
            log.warn('Pre-update housekeeping failed', error);
        }
        autoUpdater.quitAndInstall(true, true);
    }

    return { releasesUrl: RELEASES_URL, getState: () => state, start, check, install };
}

module.exports = { createUpdater };
