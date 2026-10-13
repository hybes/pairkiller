'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('./harness');
const { ConfigStore, normalizeConfig, DEFAULT_INTERVAL } = require('../src/main/config');
const { buildTemplates } = require('../src/main/templates');

const context = { platform: 'win32', appVersion: '9.9.9' };
const log = { info() {}, warn() {}, error() {} };

function tempFile() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pairkiller-test-')), 'config.json');
}

test('config: defaults for a fresh install', () => {
    const config = normalizeConfig(null, context);
    assert.deepStrictEqual(config.appGroups, []);
    assert.strictEqual(config.anonymousUsage, true);
    assert.deepStrictEqual(config.monitoring, { enabled: true, interval: DEFAULT_INTERVAL });
    assert.deepStrictEqual(config.ui, { backgroundMode: false, notifications: false });
    assert.strictEqual(normalizeConfig(null, { ...context, platform: 'darwin' }).ui.backgroundMode, true);
});

test('config: upgrades a 6.0.5 config without losing the rule', () => {
    const config = normalizeConfig({
        appGroups: [{
            name: 'Blitz / League of Legends',
            condition: 'any',
            monitoredApps: [{ name: 'LeagueClient.exe' }, { name: 'League of Legends.exe' }],
            controlledApps: [{ name: 'Blitz.exe', path: 'C:\\Users\\Ben\\AppData\\Local\\Programs\\Blitz\\Blitz.exe', action: 'sync' }],
        }],
        anonymousUsage: false,
        version: '6.0.5',
        configVersion: '6.0.5',
        monitoring: { interval: 5000, enabled: true },
        ui: { theme: 'dark', animations: true },
    }, context);

    assert.strictEqual(config.appGroups.length, 1);
    const [rule] = config.appGroups;
    assert.match(rule.id, /^[\w-]{8,}$/);
    assert.strictEqual(rule.enabled, true);
    assert.deepStrictEqual(rule.monitoredApps, [{ name: 'LeagueClient.exe' }, { name: 'League of Legends.exe' }]);
    assert.deepStrictEqual(rule.controlledApps, [{ name: 'Blitz.exe', path: 'C:\\Users\\Ben\\AppData\\Local\\Programs\\Blitz\\Blitz.exe', action: 'sync' }]);
    assert.strictEqual(config.anonymousUsage, false);
    assert.strictEqual(config.monitoring.interval, DEFAULT_INTERVAL, 'the old 5s default is replaced');
    assert.strictEqual(config.configVersion, '9.9.9');
    assert.strictEqual('theme' in config.ui, false);
});

test('config: keeps ids and a chosen interval once on the current schema', () => {
    const first = normalizeConfig({ appGroups: [{ name: 'A', monitoredApps: [{ name: 'a.exe' }] }] }, context);
    first.monitoring.interval = 5000;
    const second = normalizeConfig(JSON.parse(JSON.stringify(first)), context);
    assert.strictEqual(second.appGroups[0].id, first.appGroups[0].id);
    assert.strictEqual(second.monitoring.interval, 5000);
});

test('config: reads the version 1 "apps" layout', () => {
    const config = normalizeConfig({ apps: [{ name: 'Old', enabled: false, monitoredApps: [{ name: 'game.exe' }], controlledApps: [{ name: 'tool.exe' }] }] }, context);
    assert.strictEqual(config.appGroups[0].name, 'Old');
    assert.strictEqual(config.appGroups[0].enabled, false);
    assert.deepStrictEqual(config.appGroups[0].controlledApps, [{ name: 'tool.exe', action: 'sync' }]);
});

test('config: repairs malformed entries instead of failing', () => {
    const config = normalizeConfig({
        schemaVersion: 2,
        appGroups: [
            null,
            'nonsense',
            {
                id: 'dup', name: '  Spaced  ', condition: 'sometimes',
                monitoredApps: [{ name: '' }, { path: 'C:\\Games\\Game.exe' }, 42],
                controlledApps: [{ name: 'tool.exe', action: 'explode' }],
            },
            { id: 'dup', name: 'Second' },
        ],
        monitoring: { interval: 5 },
        ui: 'broken',
    }, context);
    assert.strictEqual(config.appGroups.length, 2);
    const [first, second] = config.appGroups;
    assert.strictEqual(first.name, 'Spaced');
    assert.strictEqual(first.condition, 'any');
    assert.deepStrictEqual(first.monitoredApps, [{ name: 'Game.exe', path: 'C:\\Games\\Game.exe' }]);
    assert.strictEqual(first.controlledApps[0].action, 'sync');
    assert.notStrictEqual(first.id, second.id);
    assert.strictEqual(config.monitoring.interval, 1000);
});

test('config store: first run, save and reload', async () => {
    const file = tempFile();
    const store = new ConfigStore({ file, ...context, log });
    store.load();
    assert.strictEqual(store.firstRun, true);
    store.data.appGroups.push({ id: 'r1', name: 'Rule', enabled: true, condition: 'any', monitoredApps: [{ name: 'a.exe' }], controlledApps: [] });
    await Promise.all([store.save(), store.save(), store.save()]);

    const reloaded = new ConfigStore({ file, ...context, log });
    reloaded.load();
    assert.strictEqual(reloaded.firstRun, false);
    assert.strictEqual(reloaded.data.appGroups[0].id, 'r1');
    assert.ok(!fs.existsSync(`${file}.tmp`));
});

test('config store: a corrupt file falls back to the newest readable backup', async () => {
    const file = tempFile();
    const store = new ConfigStore({ file, ...context, log });
    store.load();
    store.data.appGroups.push({ id: 'kept', name: 'Kept', enabled: true, condition: 'any', monitoredApps: [], controlledApps: [] });
    await store.save();
    await store.backup();
    fs.writeFileSync(file, '{ "appGroups": [ truncated');

    const recovered = new ConfigStore({ file, ...context, log });
    recovered.load();
    assert.strictEqual(recovered.data.appGroups[0].id, 'kept');
    assert.ok(fs.existsSync(`${file}.corrupt`));
});

test('config store: a corrupt file with no backup starts clean rather than crashing', () => {
    const file = tempFile();
    fs.writeFileSync(file, 'not json');
    const store = new ConfigStore({ file, ...context, log });
    assert.deepStrictEqual(store.load().appGroups, []);
});

test('templates: every template survives normalisation unchanged on each platform', () => {
    for (const platform of ['win32', 'darwin', 'linux']) {
        const templates = buildTemplates({ platform, home: platform === 'win32' ? 'C:\\Users\\Ben' : '/Users/ben', localAppData: 'C:\\Users\\Ben\\AppData\\Local' });
        assert.ok(templates.length >= 5);
        assert.strictEqual(new Set(templates.map((template) => template.id)).size, templates.length);
        for (const template of templates) {
            const [rule] = normalizeConfig({ appGroups: [template] }, { platform, appVersion: '1.0.0' }).appGroups;
            assert.deepStrictEqual(rule.monitoredApps, template.monitoredApps, template.id);
            assert.deepStrictEqual(rule.controlledApps, template.controlledApps, template.id);
            assert.ok(rule.monitoredApps.length > 0, template.id);
        }
    }
    const [league] = buildTemplates({ platform: 'win32', home: 'C:\\Users\\Ben', localAppData: 'C:\\Users\\Ben\\AppData\\Local' });
    assert.strictEqual(league.controlledApps[0].path, 'C:\\Users\\Ben\\AppData\\Local\\Programs\\Blitz\\Blitz.exe');
});
