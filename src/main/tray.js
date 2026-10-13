'use strict';

const { Menu, Tray, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

function firstExisting(files) {
    return files.find((file) => fs.existsSync(file)) || null;
}

// Builds an image carrying several pixel densities so it stays sharp on scaled displays.
function multiScale(source, size, scales) {
    const image = nativeImage.createEmpty();
    for (const scaleFactor of scales) {
        const pixels = Math.round(size * scaleFactor);
        const scaled = source.resize({ width: pixels, height: pixels, quality: 'best' });
        if (scaled.isEmpty()) return null;
        image.addRepresentation({ scaleFactor, width: pixels, height: pixels, buffer: scaled.toPNG() });
    }
    return image;
}

function trayImage(platform) {
    const template = firstExisting([path.join(root, 'trayTemplate.png'), path.join(root, 'build', 'icons', 'trayTemplate.png')]);
    const colour = firstExisting([path.join(root, 'icon.png'), path.join(root, 'build', 'icons', 'icon.png')]);

    if (platform === 'darwin' && template) {
        const image = multiScale(nativeImage.createFromPath(template), 16, [1, 2]);
        if (image) {
            // Template images are tinted by the menu bar, so they follow light, dark and tinted modes.
            image.setTemplateImage(true);
            return image;
        }
    }
    const file = colour || template;
    if (!file) return null;
    const source = nativeImage.createFromPath(file);
    if (source.isEmpty()) return null;
    return multiScale(source, 16, platform === 'darwin' ? [1, 2] : [1, 1.25, 1.5, 2, 3]) || source;
}

// macOS writes menus in Title Case with ellipses; Windows uses sentence case.
function createTray({ platform, getModel, actions, log }) {
    const mac = platform === 'darwin';
    const text = (macLabel, otherLabel) => (mac ? macLabel : otherLabel);
    let tray = null;
    let pending = null;

    function statusLine(model) {
        if (model.paused) return text('Monitoring Paused', 'Monitoring paused');
        const enabled = model.rules.filter((rule) => rule.enabled);
        if (enabled.length === 0) return text('No Rules Enabled', 'No rules enabled');
        const active = enabled.filter((rule) => rule.active).length;
        if (active > 0) return `${active} of ${enabled.length} ${enabled.length === 1 ? 'rule' : 'rules'} active`;
        return `Watching ${enabled.length} ${enabled.length === 1 ? 'rule' : 'rules'}`;
    }

    function build() {
        const model = getModel();
        const template = [{ label: statusLine(model), enabled: false }, { type: 'separator' }];

        for (const rule of model.rules.slice(0, 12)) {
            template.push({
                label: rule.name || text('Untitled Rule', 'Untitled rule'),
                type: 'checkbox',
                checked: rule.enabled,
                click: () => actions.setRuleEnabled(rule.id, !rule.enabled),
            });
        }
        if (model.rules.length > 0) template.push({ type: 'separator' });

        template.push({ label: 'Open Pairkiller', click: () => actions.open() });
        template.push({
            label: model.paused ? text('Resume Monitoring', 'Resume monitoring') : text('Pause Monitoring', 'Pause monitoring'),
            click: () => actions.setPaused(!model.paused),
        });
        template.push({ type: 'separator' });
        if (model.update.status === 'ready') {
            template.push({ label: text('Restart to Update', 'Restart to update'), click: () => actions.installUpdate() });
        } else {
            template.push({ label: text('Check for Updates…', 'Check for updates'), click: () => actions.checkForUpdates() });
        }
        template.push({ type: 'separator' });
        template.push({ label: text('Quit Pairkiller', 'Quit'), accelerator: mac ? 'Command+Q' : undefined, click: () => actions.quit() });

        tray.setContextMenu(Menu.buildFromTemplate(template));
        tray.setToolTip(`Pairkiller: ${statusLine(model).toLowerCase()}`);
    }

    function create() {
        const image = trayImage(platform);
        if (!image) {
            log.error('No tray icon could be loaded');
            return false;
        }
        tray = new Tray(image);
        // A menu bar extra shows its menu on click. In the Windows notification area a click
        // opens the app and the menu lives on right-click.
        if (!mac) tray.on('click', () => actions.open());
        build();
        return true;
    }

    // Coalesces bursts of state changes into one menu rebuild.
    function refresh() {
        if (!tray || pending) return;
        pending = setTimeout(() => {
            pending = null;
            if (tray && !tray.isDestroyed()) build();
        }, 150);
    }

    function destroy() {
        clearTimeout(pending);
        if (tray && !tray.isDestroyed()) tray.destroy();
        tray = null;
    }

    return { create, refresh, destroy };
}

module.exports = { createTray };
