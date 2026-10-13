'use strict';

const { BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { normalizeRules } = require('./config');

function registerIpc(context) {
    const { app, platform, uiPlatform, isDev, log, store, host, engine, updater, windows, templates } = context;
    const icons = new Map();
    let lastBrowseDir = null;

    // Where the file picker should open: beside the app being relocated, else wherever the
    // user last picked from, else the place apps normally live on this platform.
    function browseStart(current) {
        const fallback = platform === 'win32' ? process.env.ProgramFiles : platform === 'darwin' ? '/Applications' : '/usr/bin';
        const candidates = [typeof current === 'string' && current ? path.dirname(current) : null, lastBrowseDir, fallback];
        return candidates.find((dir) => dir && fs.existsSync(dir));
    }

    ipcMain.handle('bootstrap', () => ({
        app: {
            version: app.getVersion(),
            isDev,
            backend: host.backend,
            repoUrl: context.repoUrl,
            releasesUrl: updater.releasesUrl,
        },
        rules: store.data.appGroups,
        settings: context.settings(),
        state: engine.getState(),
        activity: engine.activity,
        templates,
        theme: context.theme(),
        update: updater.getState(),
        route: windows.takeRoute(),
    }));

    ipcMain.handle('rules:save', async (_event, rules) => {
        store.data.appGroups = normalizeRules(rules);
        context.applyRules();
        await context.persist();
        return store.data.appGroups;
    });

    ipcMain.handle('settings:set', (_event, key, value) => context.setSetting(key, value));

    ipcMain.handle('apps:running', async () => {
        try {
            return await host.listApps();
        } catch (error) {
            log.warn('Could not list running apps', error);
            return [];
        }
    });

    ipcMain.handle('apps:browse', async (event, current) => {
        const options = { properties: ['openFile'], defaultPath: browseStart(current) };
        if (platform === 'win32') {
            options.filters = [{ name: 'Apps', extensions: ['exe', 'bat', 'cmd', 'lnk'] }, { name: 'All files', extensions: ['*'] }];
        } else if (platform === 'darwin') {
            options.filters = [{ name: 'Applications', extensions: ['app'] }, { name: 'All Files', extensions: ['*'] }];
        }
        const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), options);
        const file = result.filePaths[0];
        if (result.canceled || !file) return null;
        lastBrowseDir = path.dirname(file);
        const base = path.basename(file);
        return { name: platform === 'darwin' ? base.replace(/\.app$/i, '') : base, path: file };
    });

    // Tells the editor whether an app's location still exists, and fetches the icon the OS shows for it.
    ipcMain.handle('apps:icon', async (_event, file) => {
        if (typeof file !== 'string' || !file) return { exists: false, icon: null };
        if (!fs.existsSync(file)) return { exists: false, icon: null };
        if (!icons.has(file)) {
            let icon = null;
            try {
                const image = await app.getFileIcon(file, { size: 'normal' });
                if (!image.isEmpty()) icon = image.toDataURL({ scaleFactor: Math.max(...image.getScaleFactors()) });
            } catch (_) {
                // The row falls back to a generic glyph.
            }
            icons.set(file, icon);
        }
        return { exists: true, icon: icons.get(file) };
    });

    // Native context and pull-down menus for the window. Resolves with the chosen item's id.
    ipcMain.handle('menu:popup', (event, request) => new Promise((resolve) => {
        const items = Array.isArray(request && request.items) ? request.items.slice(0, 40) : [];
        let settled = false;
        const settle = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        const menu = Menu.buildFromTemplate(items.map((item) => {
            if (!item || item.type === 'separator') return { type: 'separator' };
            return {
                label: String(item.label || '').slice(0, 120),
                type: item.type === 'checkbox' ? 'checkbox' : 'normal',
                checked: Boolean(item.checked),
                enabled: item.enabled !== false,
                click: () => settle(item.id),
            };
        }));
        const position = Number.isFinite(request.x) && Number.isFinite(request.y)
            ? { x: Math.round(request.x), y: Math.round(request.y) }
            : {};
        menu.popup({
            window: BrowserWindow.fromWebContents(event.sender),
            ...position,
            // The close callback can arrive before the click handler does, so give the click a moment.
            callback: () => setTimeout(() => settle(null), 100),
        });
    }));

    ipcMain.handle('dialog:confirm', async (event, request) => {
        const { response } = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
            type: 'warning',
            message: String(request.message || ''),
            detail: String(request.detail || ''),
            buttons: [String(request.confirmLabel || 'OK'), 'Cancel'],
            // macOS convention keeps a destructive button from being the default.
            defaultId: uiPlatform === 'darwin' ? 1 : 0,
            cancelId: 1,
            noLink: true,
        });
        return response === 0;
    });

    ipcMain.handle('update:check', () => updater.check({ manual: true }));
    ipcMain.handle('update:install', () => updater.install());

    ipcMain.handle('open:external', (_event, url) => {
        if (typeof url === 'string' && /^(https:\/\/|mailto:)/i.test(url)) shell.openExternal(url);
    });

    ipcMain.handle('open:reveal', (_event, what) => {
        if (what === 'log') shell.showItemInFolder(log.file);
        if (what === 'config') shell.showItemInFolder(store.file);
    });
}

module.exports = { registerIpc };
