'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = new Set(['state', 'activity', 'config', 'settings', 'update', 'theme', 'navigate', 'command']);

function argument(prefix) {
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : null;
}

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('pairkiller', {
    // The look to render. Normally the real platform; development builds can preview another.
    ui: argument('--pairkiller-ui=') || process.platform,
    preview: (argument('--pairkiller-ui=') || process.platform) !== process.platform,
    mica: process.argv.includes('--pairkiller-mica'),

    bootstrap: call('bootstrap'),
    saveRules: call('rules:save'),
    setSetting: call('settings:set'),
    runningApps: call('apps:running'),
    browseForApp: call('apps:browse'),
    appIcon: call('apps:icon'),
    popupMenu: call('menu:popup'),
    confirm: call('dialog:confirm'),
    checkForUpdates: call('update:check'),
    installUpdate: call('update:install'),
    openExternal: call('open:external'),
    reveal: call('open:reveal'),

    on(event, listener) {
        if (!EVENTS.has(event)) throw new Error(`Unknown event: ${event}`);
        const handler = (_event, payload) => listener(payload);
        ipcRenderer.on(event, handler);
        return () => ipcRenderer.removeListener(event, handler);
    },
});
