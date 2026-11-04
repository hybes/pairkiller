'use strict';

const { execFile } = require('child_process');
const path = require('path');

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_VALUE = 'Pairkiller';
// Versions up to 6.0.5 also registered themselves under the app id on first run, which the
// in-app toggle never knew about, so the switch could read "off" while the app still started.
const LEGACY_RUN_VALUE = 'com.pairkiller.app';

function reg(args) {
    const exe = path.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'reg.exe');
    return new Promise((resolve) => {
        execFile(exe, args, { windowsHide: true, timeout: 10000 }, (error) => resolve(!error));
    });
}

function createAutoStart({ app, platform, log }) {
    // A development build would register electron.exe itself, so it only remembers the preference.
    const available = app.isPackaged && platform !== 'linux';

    async function read() {
        if (platform === 'win32') return reg(['QUERY', RUN_KEY, '/v', RUN_VALUE]);
        return app.getLoginItemSettings().openAtLogin;
    }

    async function write(enabled) {
        if (platform === 'win32') {
            await reg(['DELETE', RUN_KEY, '/v', LEGACY_RUN_VALUE, '/f']);
            if (!enabled) {
                await reg(['DELETE', RUN_KEY, '/v', RUN_VALUE, '/f']);
                return true;
            }
            return reg(['ADD', RUN_KEY, '/v', RUN_VALUE, '/t', 'REG_SZ', '/d', `"${process.execPath}" --startup`, '/f']);
        }
        app.setLoginItemSettings({ openAtLogin: enabled });
        return true;
    }

    // Called once at launch. Returns what the preference should be from here on.
    async function reconcile({ preference, firstRun }) {
        if (!available) return preference === undefined ? true : preference;
        try {
            if (platform === 'win32') {
                // The installer clears the Run entry on every update, so the saved preference wins here.
                let desired = preference;
                if (desired === undefined) {
                    desired = firstRun || await read() || await reg(['QUERY', RUN_KEY, '/v', LEGACY_RUN_VALUE]);
                }
                if (!await write(desired)) {
                    log.warn(`autostart: could not ${desired ? 'enable' : 'disable'} launch at login during startup`, { enabled: desired, path: process.execPath });
                }
                return desired;
            }
            // On macOS the login item can be removed in System Settings, so the system wins.
            if (firstRun) {
                await write(true);
                return true;
            }
            return await read();
        } catch (error) {
            log.warn('autostart: could not reconcile launch at login; using saved preference', error, { preference });
            return preference === undefined ? false : preference;
        }
    }

    async function set(enabled) {
        if (!available) return true;
        try {
            const ok = await write(enabled);
            if (!ok) log.warn(`autostart: could not ${enabled ? 'enable' : 'disable'} launch at login`, { enabled, path: process.execPath });
            return ok;
        } catch (error) {
            log.warn(`autostart: could not ${enabled ? 'enable' : 'disable'} launch at login`, error, { enabled, path: process.execPath });
            return false;
        }
    }

    return { available, reconcile, set };
}

module.exports = { createAutoStart };
