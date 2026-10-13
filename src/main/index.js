'use strict';

const { app, Menu, Notification, nativeTheme, powerMonitor, shell, systemPreferences } = require('electron');
const os = require('os');
const path = require('path');
const Sentry = require('@sentry/electron/main');

const { ConfigStore, clampInterval } = require('./config');
const { createLog } = require('./log');
const { createHost } = require('./processes');
const { Engine } = require('./engine');
const { buildTemplates } = require('./templates');
const { createAutoStart } = require('./autostart');
const { createUpdater } = require('./updater');
const { createTray } = require('./tray');
const { createWindowManager } = require('./window');
const { registerIpc } = require('./ipc');

const platform = process.platform;
const isDev = !app.isPackaged;
const REPO_URL = 'https://github.com/hybes/pairkiller';
const PII_HEADERS = ['forwarded', '-ip', 'remote-', 'via', '-user'];
const SENTRY_DSN = process.env.SENTRY_DSN || 'https://8cf399a69648dc38f3031071446b40e7@o4507687244136448.ingest.de.sentry.io/4508365136855120';

// Lets a development copy run next to the installed app without sharing its lock or config.
if (isDev && process.env.PAIRKILLER_USER_DATA) {
    app.setPath('userData', path.resolve(process.env.PAIRKILLER_USER_DATA));
}
if (platform === 'win32') {
    app.setAppUserModelId('com.pairkiller.app');
}
if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

const userData = app.getPath('userData');
const log = createLog({ dir: path.join(userData, 'logs'), echo: isDev });
const store = new ConfigStore({ file: path.join(userData, 'config.json'), platform, appVersion: app.getVersion(), log });
store.load();

Sentry.init({
    dsn: SENTRY_DSN,
    // Decided before anything is sent: someone who opted out sends nothing at all, sessions included.
    enabled: store.data.anonymousUsage && (app.isPackaged || Boolean(process.env.SENTRY_DSN)),
    release: app.getVersion(),
    environment: isDev ? 'development' : 'production',
    // The SDK can rewrite modules as they load to trace servers and databases. There is nothing
    // of that kind here, and a background utility shouldn't pay for it at startup.
    enableRuntimeChannelInjection: false,
    // Reports are promised to be anonymous. Since v8 the SDK attaches IP addresses, cookies and
    // request data unless each category is turned off, so this pins the restrictive baseline.
    dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: { deny: PII_HEADERS }, response: { deny: PII_HEADERS } },
        httpBodies: [],
        urlQueryParams: { deny: PII_HEADERS },
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        graphQL: { document: false, variables: false },
    },
    beforeSend(event) {
        if (!store.data.anonymousUsage) return null;
        event.tags = { ...event.tags, app: 'Pairkiller', platform, electron: process.versions.electron };
        event.extra = { ...event.extra, ruleCount: store.data.appGroups.length };
        return event;
    },
});

process.on('uncaughtException', (error) => {
    log.error('Uncaught exception', error);
    Sentry.captureException(error, { level: 'fatal' });
});
process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection', reason);
    Sentry.captureException(reason);
});

// Development builds can preview the other platform's look and rehearse rules without acting on them.
const uiPlatform = (isDev && process.env.PAIRKILLER_UI_PLATFORM) || platform;
const host = createHost({ platform, openPath: shell.openPath, log, dryRun: isDev && process.env.PAIRKILLER_DRY_RUN === '1' });
const engine = new Engine({ host, log });
const autoStart = createAutoStart({ app, platform, log });
const templates = buildTemplates({ platform, home: os.homedir(), localAppData: process.env.LOCALAPPDATA });

const windows = createWindowManager({
    platform,
    uiPlatform,
    isDev,
    stateFile: path.join(userData, 'window-state.json'),
    onOpen: applyDock,
    onClosed: applyDock,
});

const updater = createUpdater({
    app,
    log,
    onChange(state) {
        windows.send('update', state);
        tray.refresh();
        if (state.status === 'ready' && Notification.isSupported()) {
            const notification = new Notification({
                title: 'Pairkiller update ready',
                body: `Version ${state.version} will be installed the next time Pairkiller restarts.`,
            });
            notification.on('click', () => windows.open({ route: 'settings' }));
            notification.show();
        }
    },
    async beforeInstall() {
        await store.backup();
        engine.stop();
    },
});

const tray = createTray({
    platform,
    log,
    getModel() {
        const state = engine.getState();
        return {
            paused: !store.data.monitoring.enabled,
            update: updater.getState(),
            rules: store.data.appGroups.map((rule) => ({
                id: rule.id,
                name: rule.name,
                enabled: rule.enabled,
                active: Boolean(state.rules[rule.id] && state.rules[rule.id].active),
            })),
        };
    },
    actions: {
        open: () => windows.open(),
        quit: () => app.quit(),
        setPaused: (paused) => context.setSetting('paused', paused),
        checkForUpdates() {
            windows.open({ route: 'settings' });
            updater.check({ manual: true });
        },
        installUpdate: () => updater.install(),
        setRuleEnabled(id, enabled) {
            const rule = store.data.appGroups.find((candidate) => candidate.id === id);
            if (!rule) return;
            rule.enabled = enabled;
            context.rulesChanged();
        },
    },
});

function theme() {
    let accent = null;
    try {
        if (platform === 'win32' || platform === 'darwin') accent = `#${systemPreferences.getAccentColor().slice(0, 6)}`;
    } catch (_) {
        // Falls back to the stylesheet's default accent.
    }
    return { accent, dark: nativeTheme.shouldUseDarkColors };
}

function settings() {
    return {
        paused: !store.data.monitoring.enabled,
        interval: store.data.monitoring.interval,
        minInterval: host.minInterval,
        autoStart: Boolean(store.data.ui.autoStart),
        showInDock: !store.data.ui.backgroundMode,
        notifications: store.data.ui.notifications,
        crashReports: store.data.anonymousUsage,
    };
}

function applyRules() {
    engine.configure({ rules: store.data.appGroups, interval: store.data.monitoring.interval });
}

// In menu-bar-only mode the Dock icon still appears while the window is open, so the window
// can be reached with Cmd+Tab and has a menu bar for its shortcuts.
function applyDock() {
    if (platform !== 'darwin') return;
    const visible = isDev || !store.data.ui.backgroundMode || windows.isOpen();
    try {
        app.setActivationPolicy(visible ? 'regular' : 'accessory');
        if (app.dock) {
            if (visible) app.dock.show();
            else app.dock.hide();
        }
    } catch (error) {
        log.warn('Could not update Dock visibility', error);
    }
}

const context = {
    app, platform, uiPlatform, isDev, log, store, host, engine, autoStart, updater, windows, templates,
    repoUrl: REPO_URL,
    theme,
    settings,
    persist() {
        return store.save().catch((error) => log.error('Could not save settings', error));
    },
    // Rules were edited somewhere other than the window (tray, menu): apply, save and tell the window.
    rulesChanged() {
        applyRules();
        tray.refresh();
        windows.send('config', store.data.appGroups);
        return context.persist();
    },
    applyRules() {
        applyRules();
        tray.refresh();
    },
    async setSetting(key, value) {
        switch (key) {
            case 'paused':
                store.data.monitoring.enabled = !value;
                if (value) engine.stop();
                else engine.start();
                break;
            case 'interval':
                store.data.monitoring.interval = clampInterval(value);
                applyRules();
                break;
            case 'autoStart':
                if (await autoStart.set(Boolean(value))) store.data.ui.autoStart = Boolean(value);
                break;
            case 'showInDock':
                store.data.ui.backgroundMode = !value;
                applyDock();
                break;
            case 'notifications':
                store.data.ui.notifications = Boolean(value);
                break;
            case 'crashReports':
                store.data.anonymousUsage = Boolean(value);
                break;
            default:
                return settings();
        }
        await context.persist();
        tray.refresh();
        windows.send('settings', settings());
        return settings();
    },
};

function buildApplicationMenu() {
    if (platform !== 'darwin') {
        // The window draws its own title bar; a development build keeps the default menu for reload and DevTools.
        if (!isDev) Menu.setApplicationMenu(null);
        return;
    }
    const template = [
        {
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { label: 'Settings…', accelerator: 'Command+,', click: () => windows.open({ route: 'settings' }) },
                {
                    label: 'Check for Updates…',
                    click() {
                        windows.open({ route: 'settings' });
                        updater.check({ manual: true });
                    },
                },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
            ],
        },
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Rule',
                    accelerator: 'Command+N',
                    click() {
                        windows.open({ route: 'rules' });
                        windows.send('command', 'new-rule');
                    },
                },
                { type: 'separator' },
                { role: 'close' },
            ],
        },
        { role: 'editMenu' },
        ...(isDev ? [{ role: 'viewMenu' }] : []),
        { role: 'windowMenu' },
        {
            role: 'help',
            submenu: [{ label: 'Pairkiller on GitHub', click: () => shell.openExternal(REPO_URL) }],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    app.setAboutPanelOptions({
        applicationName: 'Pairkiller',
        applicationVersion: app.getVersion(),
        credits: 'Opens and closes companion apps alongside the apps they belong with.',
        copyright: 'Ben Hybert',
    });
}

let readyAt = Number.POSITIVE_INFINITY;

async function start() {
    readyAt = Date.now();
    nativeTheme.themeSource = 'system';
    registerIpc(context);
    buildApplicationMenu();

    engine.on('state', (state) => {
        windows.send('state', state);
        tray.refresh();
    });
    engine.on('activity', (entry) => {
        windows.send('activity', entry);
        const worthNotifying = entry.level === 'success' || entry.level === 'error' || entry.level === 'warning';
        if (store.data.ui.notifications && worthNotifying && Notification.isSupported()) {
            new Notification({ title: entry.rule || 'Pairkiller', body: entry.message, silent: true }).show();
        }
    });

    applyRules();
    if (store.data.monitoring.enabled) engine.start();

    tray.create();
    applyDock();

    nativeTheme.on('updated', () => windows.send('theme', theme()));
    if (platform === 'win32') systemPreferences.on('accent-color-changed', () => windows.send('theme', theme()));
    // Timers are suspended during sleep, so check immediately on wake rather than a cycle later.
    powerMonitor.on('resume', () => engine.poke());

    const launchedAtLogin = process.argv.includes('--startup') || process.argv.includes('--hidden')
        || (platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin);
    const menuBarOnly = platform === 'darwin' && store.data.ui.backgroundMode && !isDev;
    if (!launchedAtLogin && (!menuBarOnly || store.firstRun)) windows.open();

    store.data.ui.autoStart = await autoStart.reconcile({ preference: store.data.ui.autoStart, firstRun: store.firstRun });
    await context.persist();
    windows.send('settings', settings());

    updater.start();
    log.info(`Pairkiller ${app.getVersion()} started (${platform}, process list via ${host.backend})`);
}

app.on('second-instance', () => windows.open());
app.on('activate', () => {
    // macOS also sends this as part of the initial launch, where start() has already decided
    // whether a window should appear (it shouldn't when launched at login).
    if (Date.now() - readyAt < 3000) return;
    windows.open();
});
// The app lives in the tray; closing the window must not end it.
app.on('window-all-closed', () => {});
app.on('before-quit', () => {
    engine.stop();
    tray.destroy();
});

const ready = app.whenReady().then(start).catch((error) => {
    log.error('Startup failed', error);
    Sentry.captureException(error);
});

// Used by scripts/dev-screenshots.js to drive a running instance.
module.exports = { ready, context };
