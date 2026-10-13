'use strict';

const assert = require('assert');
const { test } = require('./harness');
const { Engine } = require('../src/main/engine');
const { Snapshot, normalizeName } = require('../src/main/processes/names');

const BLITZ = 'C:\\Apps\\Blitz\\Blitz.exe';

function setup(rules, { offDelay = 4000 } = {}) {
    const clock = { t: 1000 };
    const host = {
        backend: 'fake',
        minInterval: 0,
        running: new Set(),
        calls: [],
        launchResult: { ok: true },
        stopWorks: true,
        snapshotFails: false,
        async snapshot() {
            if (host.snapshotFails) throw new Error('process list unavailable');
            const snapshot = new Snapshot();
            let pid = 100;
            for (const name of host.running) snapshot.add(name, pid++, name);
            return snapshot;
        },
        async launch(appPath) {
            host.calls.push(`launch ${appPath}`);
            if (host.launchResult.ok) host.running.add(appPath.split('\\').pop());
            return host.launchResult;
        },
        async stop(name, _snapshot, { force } = {}) {
            host.calls.push(`stop ${name}${force ? ' force' : ''}`);
            if (host.stopWorks) {
                for (const item of [...host.running]) {
                    if (normalizeName(item) === normalizeName(name)) host.running.delete(item);
                }
            }
            return { ok: host.stopWorks };
        },
    };
    const log = { info() {}, warn() {}, error() {} };
    const engine = new Engine({ host, log, now: () => clock.t, offDelay });
    engine.configure({ rules, interval: 2000 });
    const tick = async (advance = 0) => {
        clock.t += advance;
        await engine.tick();
    };
    const messages = () => engine.activity.map((entry) => entry.message);
    return { engine, host, clock, tick, messages };
}

function leagueRule(overrides = {}) {
    return {
        id: 'league',
        name: 'Blitz / League of Legends',
        enabled: true,
        condition: 'any',
        monitoredApps: [{ name: 'LeagueClient.exe' }, { name: 'League of Legends.exe' }],
        controlledApps: [{ name: 'Blitz.exe', path: BLITZ, action: 'sync' }],
        ...overrides,
    };
}

test('engine: opens the companion when a trigger starts and closes it once the trigger is gone', async () => {
    const { host, tick, messages } = setup([leagueRule()]);
    await tick();
    assert.deepStrictEqual(host.calls, []);

    host.running.add('LeagueClient.exe');
    await tick(2000);
    assert.deepStrictEqual(host.calls, [`launch ${BLITZ}`]);
    await tick(500);

    host.running.delete('LeagueClient.exe');
    await tick(2000);
    assert.strictEqual(host.calls.length, 1, 'still inside the off delay');
    await tick(4000);
    assert.deepStrictEqual(host.calls, [`launch ${BLITZ}`, 'stop Blitz.exe']);
    await tick(500);
    assert.deepStrictEqual(messages(), ['LeagueClient started', 'Opened Blitz', 'LeagueClient closed', 'Closed Blitz']);
});

// The 6.0.5 bug: once the game process had been seen running, a stale "running" answer
// was served forever and the companion never closed after a real match.
test('engine: closes the companion after a full session where the game process was seen', async () => {
    const { host, tick } = setup([leagueRule()]);
    host.running.add('LeagueClient.exe');
    await tick();
    await tick(2000);

    host.running.add('League of Legends.exe');
    for (let i = 0; i < 10; i++) await tick(2000);
    host.running.delete('League of Legends.exe');
    for (let i = 0; i < 5; i++) await tick(2000);
    assert.ok(host.running.has('Blitz.exe'), 'client still open, companion stays');

    host.running.delete('LeagueClient.exe');
    await tick(2000);
    await tick(2000);
    await tick(2000);
    assert.ok(!host.running.has('Blitz.exe'), 'companion closed after the client quit');
    assert.strictEqual(host.calls.filter((call) => call.startsWith('stop')).length, 1);
});

test('engine: the companion survives the client closing while the game is running', async () => {
    const { host, tick } = setup([leagueRule()]);
    host.running.add('LeagueClient.exe');
    await tick();
    host.running.add('League of Legends.exe');
    await tick(2000);
    host.running.delete('LeagueClient.exe');
    for (let i = 0; i < 5; i++) await tick(2000);
    assert.ok(host.running.has('Blitz.exe'));
});

test('engine: does not reopen an app the user closed while the rule is still active', async () => {
    const { host, tick } = setup([leagueRule()]);
    host.running.add('LeagueClient.exe');
    await tick();
    await tick(500);
    host.running.delete('Blitz.exe');
    for (let i = 0; i < 5; i++) await tick(2000);
    assert.deepStrictEqual(host.calls, [`launch ${BLITZ}`]);
});

test('engine: reopens on the next activation after the user closed it', async () => {
    const { host, tick } = setup([leagueRule()]);
    host.running.add('LeagueClient.exe');
    await tick();
    host.running.delete('Blitz.exe');
    host.running.delete('LeagueClient.exe');
    await tick(2000);
    await tick(5000);
    host.running.add('LeagueClient.exe');
    await tick(2000);
    assert.strictEqual(host.calls.filter((call) => call.startsWith('launch')).length, 2);
});

test('engine: a trigger gap shorter than the off delay does not close the companion', async () => {
    const { host, tick } = setup([leagueRule()]);
    host.running.add('LeagueClient.exe');
    await tick();
    host.running.delete('LeagueClient.exe');
    await tick(2000);
    host.running.add('LeagueClient.exe');
    await tick(1500);
    await tick(5000);
    assert.deepStrictEqual(host.calls, [`launch ${BLITZ}`]);
});

test('engine: an unreadable process list never triggers an action', async () => {
    const { engine, host, tick } = setup([leagueRule()]);
    host.running.add('LeagueClient.exe');
    await tick();
    host.snapshotFails = true;
    for (let i = 0; i < 5; i++) await tick(5000);
    assert.deepStrictEqual(host.calls, [`launch ${BLITZ}`]);
    assert.strictEqual(engine.getState().healthy, false);
    host.snapshotFails = false;
    await tick(2000);
    assert.strictEqual(engine.getState().healthy, true);
    assert.strictEqual(engine.getState().rules.league.active, true);
});

test('engine: sync keeps the companion closed whenever the trigger is not running', async () => {
    const { host, tick } = setup([leagueRule()]);
    host.running.add('Blitz.exe');
    await tick();
    assert.deepStrictEqual(host.calls, ['stop Blitz.exe']);
});

test('engine: "all" needs every trigger running', async () => {
    const { engine, host, tick } = setup([leagueRule({ condition: 'all' })]);
    host.running.add('LeagueClient.exe');
    await tick();
    assert.strictEqual(engine.getState().rules.league.active, false);
    host.running.add('League of Legends.exe');
    await tick(2000);
    assert.strictEqual(engine.getState().rules.league.active, true);
    assert.deepStrictEqual(host.calls, [`launch ${BLITZ}`]);
});

test('engine: "start" opens with the trigger and leaves the app running afterwards', async () => {
    const { host, tick } = setup([leagueRule({ controlledApps: [{ name: 'Blitz.exe', path: BLITZ, action: 'start' }] })]);
    host.running.add('LeagueClient.exe');
    await tick();
    host.running.delete('LeagueClient.exe');
    await tick(2000);
    await tick(5000);
    await tick(5000);
    assert.deepStrictEqual(host.calls, [`launch ${BLITZ}`]);
});

test('engine: "stop" closes while the trigger runs and does not reopen', async () => {
    const { host, tick } = setup([leagueRule({ controlledApps: [{ name: 'Blitz.exe', path: BLITZ, action: 'stop' }] })]);
    host.running.add('Blitz.exe');
    await tick();
    assert.deepStrictEqual(host.calls, []);
    host.running.add('LeagueClient.exe');
    await tick(2000);
    assert.deepStrictEqual(host.calls, ['stop Blitz.exe']);
    host.running.delete('LeagueClient.exe');
    await tick(2000);
    await tick(5000);
    assert.deepStrictEqual(host.calls, ['stop Blitz.exe']);
});

test('engine: "opposite" closes while the trigger runs and reopens after', async () => {
    const { host, tick } = setup([leagueRule({ controlledApps: [{ name: 'Blitz.exe', path: BLITZ, action: 'opposite' }] })]);
    host.running.add('Blitz.exe');
    host.running.add('LeagueClient.exe');
    await tick();
    assert.deepStrictEqual(host.calls, ['stop Blitz.exe']);
    host.running.delete('LeagueClient.exe');
    await tick(2000);
    await tick(5000);
    assert.deepStrictEqual(host.calls, ['stop Blitz.exe', `launch ${BLITZ}`]);
});

test('engine: an app shared by two rules stays open while either rule wants it', async () => {
    const valorant = leagueRule({ id: 'valorant', name: 'Valorant', monitoredApps: [{ name: 'VALORANT.exe' }] });
    const { host, tick } = setup([leagueRule(), valorant]);
    host.running.add('VALORANT.exe');
    await tick();
    for (let i = 0; i < 4; i++) await tick(2000);
    assert.deepStrictEqual(host.calls, [`launch ${BLITZ}`]);
    assert.ok(host.running.has('Blitz.exe'));
});

test('engine: keeps retrying a close that fails, forcefully, and reports it once', async () => {
    const { engine, host, tick, messages } = setup([leagueRule()]);
    host.running.add('Blitz.exe');
    host.stopWorks = false;
    await tick();
    for (let i = 0; i < 12; i++) await tick(5000);
    const stops = host.calls.filter((call) => call.startsWith('stop'));
    assert.ok(stops.length >= 4);
    assert.strictEqual(stops[0], 'stop Blitz.exe');
    assert.ok(stops.slice(1).every((call) => call === 'stop Blitz.exe force'));
    assert.strictEqual(messages().filter((message) => message.startsWith('Couldn’t close')).length, 1);
    assert.strictEqual(engine.getState().rules.league.apps[0].status, 'error');

    host.stopWorks = true;
    await tick(60000);
    await tick(500);
    assert.strictEqual(engine.getState().rules.league.apps[0].status, null);
});

test('engine: reports an app that cannot be opened and does not loop on it', async () => {
    const { engine, host, tick, messages } = setup([leagueRule()]);
    host.launchResult = { ok: false, error: 'File not found' };
    host.running.add('LeagueClient.exe');
    await tick();
    for (let i = 0; i < 5; i++) await tick(2000);
    assert.strictEqual(host.calls.length, 1);
    assert.ok(messages().includes('Couldn’t open Blitz: File not found'));
    assert.strictEqual(engine.getState().rules.league.apps[0].status, 'error');
});

test('engine: flags an app that was opened but never appears under its process name', async () => {
    const { engine, host, tick } = setup([leagueRule({ controlledApps: [{ name: 'Wrong.exe', path: BLITZ, action: 'sync' }] })]);
    host.running.add('LeagueClient.exe');
    await tick();
    await tick(10000);
    assert.strictEqual(engine.getState().rules.league.apps[0].status, 'launching');
    await tick(15000);
    assert.strictEqual(engine.getState().rules.league.apps[0].status, 'warning');
    assert.strictEqual(host.calls.length, 1);
});

test('engine: disabled and incomplete rules never act', async () => {
    const { host, tick } = setup([
        leagueRule({ enabled: false }),
        leagueRule({ id: 'empty', controlledApps: [] }),
    ]);
    host.running.add('Blitz.exe');
    host.running.add('LeagueClient.exe');
    await tick();
    host.running.delete('LeagueClient.exe');
    await tick(10000);
    assert.deepStrictEqual(host.calls, []);
});

test('engine: editing a rule while it is active does not reopen an app the user closed', async () => {
    const { engine, host, tick } = setup([leagueRule()]);
    host.running.add('LeagueClient.exe');
    await tick();
    host.running.delete('Blitz.exe');
    await tick(2000);
    engine.configure({ rules: [leagueRule({ name: 'Renamed' })], interval: 2000 });
    await tick(2000);
    assert.deepStrictEqual(host.calls, [`launch ${BLITZ}`]);
});

test('engine: an app added to an active rule is opened straight away', async () => {
    const { engine, host, tick } = setup([leagueRule()]);
    host.running.add('LeagueClient.exe');
    await tick();
    engine.configure({
        rules: [leagueRule({ controlledApps: [
            { name: 'Blitz.exe', path: BLITZ, action: 'sync' },
            { name: 'Porofessor.exe', path: 'C:\\Apps\\Porofessor.exe', action: 'sync' },
        ] })],
        interval: 2000,
    });
    await tick(2000);
    assert.deepStrictEqual(host.calls, [`launch ${BLITZ}`, 'launch C:\\Apps\\Porofessor.exe']);
});

test('engine: pausing forgets state so resuming brings apps back in line', async () => {
    const { engine, host, tick } = setup([leagueRule()]);
    host.running.add('LeagueClient.exe');
    await tick();
    host.running.delete('Blitz.exe');
    engine.stop();
    assert.strictEqual(engine.getState().monitoring, false);
    await tick(2000);
    assert.strictEqual(host.calls.filter((call) => call.startsWith('launch')).length, 2);
});

test('engine: switching a rule off mid-close drops the attempt, and switching it on starts fresh', async () => {
    const { engine, host, tick } = setup([leagueRule()]);
    host.running.add('Blitz.exe');
    host.stopWorks = false;
    await tick();
    await tick(5000);
    assert.strictEqual(host.calls.length, 2);

    engine.configure({ rules: [leagueRule({ enabled: false })], interval: 2000 });
    for (let i = 0; i < 4; i++) await tick(5000);
    assert.strictEqual(host.calls.length, 2, 'a disabled rule leaves the app alone');
    assert.strictEqual(engine.getState().rules.league.apps[0].running, true);
    assert.strictEqual(engine.getState().rules.league.apps[0].status, null);

    host.stopWorks = true;
    engine.configure({ rules: [leagueRule()], interval: 2000 });
    await tick(2000);
    assert.strictEqual(host.calls[2], 'stop Blitz.exe', 'first attempt after re-enabling is a polite one');
});
