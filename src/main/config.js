'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 2;
const ACTIONS = ['sync', 'start', 'stop', 'opposite'];
const DEFAULT_INTERVAL = 2000;
const MIN_INTERVAL = 1000;
const MAX_INTERVAL = 30000;
const MAX_RULES = 100;
const MAX_APPS = 50;

function text(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function baseName(file) {
    const trimmed = file.replace(/[\\/]+$/, '');
    return trimmed.slice(Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1);
}

function normalizeApp(raw, controlled) {
    if (!raw || typeof raw !== 'object') return null;
    const appPath = text(raw.path, 1024);
    const name = text(raw.name, 260) || baseName(appPath);
    if (!name) return null;
    const app = { name };
    if (appPath) app.path = appPath;
    if (controlled) app.action = ACTIONS.includes(raw.action) ? raw.action : 'sync';
    return app;
}

function normalizeApps(list, controlled) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_APPS).map((app) => normalizeApp(app, controlled)).filter(Boolean);
}

function normalizeRules(list) {
    if (!Array.isArray(list)) return [];
    const ids = new Set();
    return list.slice(0, MAX_RULES).filter((raw) => raw && typeof raw === 'object').map((raw) => {
        let id = typeof raw.id === 'string' && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : '';
        if (!id || ids.has(id)) id = crypto.randomUUID();
        ids.add(id);
        return {
            id,
            name: text(raw.name, 80),
            enabled: raw.enabled !== false,
            condition: raw.condition === 'all' ? 'all' : 'any',
            monitoredApps: normalizeApps(raw.monitoredApps, false),
            controlledApps: normalizeApps(raw.controlledApps, true),
        };
    });
}

function clampInterval(value) {
    const interval = Number(value);
    if (!Number.isFinite(interval)) return DEFAULT_INTERVAL;
    return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(interval)));
}

// Turns anything found on disk, from any earlier version, into the current shape.
function normalizeConfig(raw, { platform, appVersion }) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const monitoring = source.monitoring && typeof source.monitoring === 'object' ? source.monitoring : {};
    const ui = source.ui && typeof source.ui === 'object' ? source.ui : {};
    const fromLegacy = !(Number(source.schemaVersion) >= SCHEMA_VERSION);

    const config = {
        schemaVersion: SCHEMA_VERSION,
        // Still written because Pairkiller 6 and earlier decide their migrations from it.
        configVersion: appVersion,
        // "appGroups" is the on-disk name from earlier versions; the app calls them rules. Version 1 used "apps".
        appGroups: normalizeRules(Array.isArray(source.appGroups) ? source.appGroups : source.apps),
        anonymousUsage: source.anonymousUsage !== false,
        monitoring: {
            enabled: monitoring.enabled !== false,
            // Earlier versions polled every 5s because each check was expensive; that no longer applies.
            interval: fromLegacy ? DEFAULT_INTERVAL : clampInterval(monitoring.interval),
        },
        ui: {
            backgroundMode: typeof ui.backgroundMode === 'boolean' ? ui.backgroundMode : platform === 'darwin',
            notifications: ui.notifications === true,
        },
    };
    if (typeof ui.autoStart === 'boolean') config.ui.autoStart = ui.autoStart;
    return config;
}

class ConfigStore {
    constructor({ file, platform = process.platform, appVersion, log }) {
        this.file = file;
        this.context = { platform, appVersion };
        this.log = log;
        this.firstRun = false;
        this.data = normalizeConfig(null, this.context);
        this.writing = Promise.resolve();
    }

    // Synchronous on purpose: the result decides things that must be settled before the app is ready.
    load() {
        let raw = null;
        if (!fs.existsSync(this.file)) {
            this.firstRun = true;
        } else {
            try {
                raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            } catch (error) {
                this.log.error('Config file is unreadable, looking for a backup', error);
                raw = this.recover();
            }
        }
        this.data = normalizeConfig(raw, this.context);
        return this.data;
    }

    recover() {
        const dir = path.dirname(this.file);
        const base = path.basename(this.file);
        try {
            fs.copyFileSync(this.file, path.join(dir, `${base}.corrupt`));
        } catch (_) {
            // Keeping a copy for inspection is best effort.
        }
        let backups = [];
        try {
            backups = fs.readdirSync(dir)
                .filter((name) => name.startsWith(`${base}.backup.`))
                .sort((a, b) => Number(b.split('.').pop()) - Number(a.split('.').pop()));
        } catch (_) {
            return null;
        }
        for (const name of backups) {
            try {
                const restored = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
                this.log.info(`Restored config from ${name}`);
                return restored;
            } catch (_) {
                // Try the next oldest backup.
            }
        }
        return null;
    }

    save() {
        const next = this.writing.then(() => this.write());
        this.writing = next.catch(() => {});
        return next;
    }

    async write() {
        const temp = `${this.file}.tmp`;
        const contents = JSON.stringify(this.data, null, 2);
        await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
        try {
            await fs.promises.writeFile(temp, contents, 'utf8');
            await fs.promises.rename(temp, this.file);
        } catch (error) {
            // Antivirus scanners on Windows can briefly lock the target; a direct write still gets through.
            await fs.promises.unlink(temp).catch(() => {});
            await fs.promises.writeFile(this.file, contents, 'utf8');
            this.log.warn('Atomic config save failed, wrote in place instead', error);
        }
    }

    // Kept so an update that goes wrong can be undone by hand; `recover` reads these.
    async backup() {
        if (!fs.existsSync(this.file)) return;
        const dir = path.dirname(this.file);
        const base = path.basename(this.file);
        await fs.promises.copyFile(this.file, path.join(dir, `${base}.backup.${Date.now()}`));
        const backups = (await fs.promises.readdir(dir))
            .filter((name) => name.startsWith(`${base}.backup.`))
            .sort((a, b) => Number(b.split('.').pop()) - Number(a.split('.').pop()));
        await Promise.all(backups.slice(5).map((name) => fs.promises.unlink(path.join(dir, name)).catch(() => {})));
    }
}

module.exports = {
    ACTIONS,
    DEFAULT_INTERVAL,
    MIN_INTERVAL,
    MAX_INTERVAL,
    SCHEMA_VERSION,
    ConfigStore,
    clampInterval,
    normalizeConfig,
    normalizeRules,
};
