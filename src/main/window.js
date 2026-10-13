'use strict';

const { BrowserWindow, nativeTheme, screen } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const DEFAULT_SIZE = { width: 900, height: 640 };
const MIN_SIZE = { width: 720, height: 500 };
const TITLE_BAR_HEIGHT = 44;

// Mica needs Windows 11 22H2 or later; earlier builds get a solid background instead.
function supportsMica(platform) {
    if (platform !== 'win32') return false;
    const build = Number(os.release().split('.')[2]);
    return Number.isFinite(build) && build >= 22621;
}

function createWindowManager({ platform, uiPlatform, isDev, stateFile, onOpen, onClosed }) {
    let win = null;
    let pendingRoute = null;
    const mica = supportsMica(platform) && uiPlatform === 'win32';

    function readBounds() {
        try {
            const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            const { x, y, width, height } = saved;
            if (![x, y, width, height].every(Number.isFinite)) return null;
            // Ignore a position that is no longer on any connected display.
            const area = screen.getDisplayMatching({ x, y, width, height }).workArea;
            const visible = x < area.x + area.width - 80 && x + width > area.x + 80
                && y >= area.y - 10 && y < area.y + area.height - 80;
            return visible ? { x, y, width, height } : { width, height };
        } catch (_) {
            return null;
        }
    }

    function saveBounds() {
        if (!win || win.isDestroyed() || win.isMinimized() || win.isMaximized() || win.isFullScreen()) return;
        try {
            fs.writeFileSync(stateFile, JSON.stringify(win.getBounds()));
        } catch (_) {
            // Losing the window position is not worth surfacing.
        }
    }

    function overlayColours() {
        return { color: '#00000000', symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000', height: TITLE_BAR_HEIGHT };
    }

    function solidBackground() {
        if (uiPlatform === 'darwin') return nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ececec';
        return nativeTheme.shouldUseDarkColors ? '#202020' : '#f3f3f3';
    }

    function create() {
        const options = {
            ...DEFAULT_SIZE,
            ...readBounds(),
            minWidth: MIN_SIZE.width,
            minHeight: MIN_SIZE.height,
            show: false,
            title: 'Pairkiller',
            backgroundColor: solidBackground(),
            webPreferences: {
                preload: path.join(__dirname, '..', 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                spellcheck: false,
                additionalArguments: [`--pairkiller-ui=${uiPlatform}`, mica ? '--pairkiller-mica' : '--pairkiller-solid'],
            },
        };

        if (platform === 'darwin') {
            Object.assign(options, {
                titleBarStyle: 'hiddenInset',
                trafficLightPosition: { x: 20, y: 20 },
                vibrancy: 'sidebar',
                visualEffectState: 'followWindow',
                backgroundColor: '#00000000',
            });
        } else if (platform === 'win32') {
            Object.assign(options, {
                titleBarStyle: 'hidden',
                titleBarOverlay: overlayColours(),
                icon: path.join(root, 'icon.png'),
            });
            if (mica) {
                options.backgroundMaterial = 'mica';
                options.backgroundColor = '#00000000';
            }
        } else {
            Object.assign(options, { autoHideMenuBar: true, icon: path.join(root, 'icon.png') });
        }

        win = new BrowserWindow(options);
        win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

        win.on('resized', saveBounds);
        win.on('moved', saveBounds);
        win.on('close', saveBounds);
        win.on('closed', () => {
            win = null;
            onClosed();
        });

        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.webContents.on('will-navigate', (event) => event.preventDefault());
        if (!isDev) {
            win.webContents.on('devtools-opened', () => win && win.webContents.closeDevTools());
        }
        return win;
    }

    nativeTheme.on('updated', () => {
        if (!win || win.isDestroyed()) return;
        if (platform === 'win32') win.setTitleBarOverlay(overlayColours());
        if (!mica && platform !== 'darwin') win.setBackgroundColor(solidBackground());
    });

    // Opens the window, or brings the existing one forward. `show: false` prepares it without
    // putting anything on screen, which the screenshot tooling relies on.
    function open({ route = null, show = true } = {}) {
        if (win && !win.isDestroyed()) {
            if (route) win.webContents.send('navigate', route);
            if (show) {
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
            }
            return win;
        }
        pendingRoute = route;
        const created = create();
        onOpen();
        if (show) {
            created.once('ready-to-show', () => {
                created.show();
                created.focus();
            });
        }
        return created;
    }

    function takeRoute() {
        const route = pendingRoute;
        pendingRoute = null;
        return route;
    }

    function send(channel, payload) {
        if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    }

    return { open, send, takeRoute, get: () => (win && !win.isDestroyed() ? win : null), isOpen: () => Boolean(win && !win.isDestroyed()) };
}

module.exports = { createWindowManager };
