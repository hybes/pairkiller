'use strict';

const fs = require('fs');
const { displayName } = require('./names');

// Everything the rule engine needs from the operating system: what is running, and how to
// open or close an app. `openPath` is Electron's shell.openPath, injected so this stays testable.
function createHost({ platform = process.platform, openPath, log, dryRun = false }) {
    const impl = platform === 'win32'
        ? require('./win32').createWin32Host({ log })
        : require('./posix').createPosixHost({ platform });

    async function launch(appPath) {
        if (!appPath) return { ok: false, error: 'No location set' };
        if (!fs.existsSync(appPath)) return { ok: false, error: 'File not found' };
        if (dryRun) {
            log.info(`[dry run] would open ${appPath}`);
            return { ok: true };
        }
        const viaShell = platform === 'win32' || (platform === 'darwin' && /\.app\/?$/i.test(appPath));
        if (!viaShell) return impl.launchDetached(appPath);
        const error = await openPath(appPath);
        return error ? { ok: false, error } : { ok: true };
    }

    async function stop(name, snapshot, options) {
        if (dryRun) {
            log.info(`[dry run] would close ${displayName(name)}`);
            return { ok: true };
        }
        return impl.stop(name, snapshot, options);
    }

    return {
        backend: impl.backend,
        minInterval: impl.minInterval,
        snapshot: impl.snapshot,
        listApps: impl.listApps,
        launch,
        stop,
    };
}

module.exports = { createHost };
