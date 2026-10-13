'use strict';

const assert = require('assert');
const { test } = require('./harness');
const { normalizeName, displayName } = require('../src/main/processes/names');
const { parseTasklistCsv, parsePs, bundlesInPath, snapshotFromWindows, snapshotFromPaths } = require('../src/main/processes/parse');

test('names: every spelling of an app reduces to the same key', () => {
    for (const spelling of ['Blitz.exe', 'blitz.EXE', 'Blitz', ' "Blitz.exe" ', 'C:\\Programs\\Blitz\\Blitz.exe', '/Applications/Blitz.app', '/Applications/Blitz.app/']) {
        assert.strictEqual(normalizeName(spelling), 'blitz', spelling);
    }
    assert.strictEqual(normalizeName('League of Legends.exe'), 'league of legends');
    assert.strictEqual(normalizeName(''), '');
    assert.strictEqual(normalizeName(undefined), '');
});

test('names: display name drops the path and extension but keeps the casing', () => {
    assert.strictEqual(displayName('C:\\Riot Games\\League of Legends.exe'), 'League of Legends');
    assert.strictEqual(displayName('/Applications/Blitz.app'), 'Blitz');
    assert.strictEqual(displayName('obs64.exe'), 'obs64');
});

test('windows: parses tasklist CSV, including names with spaces and commas in memory figures', () => {
    const stdout = [
        '"System Idle Process","0","Services","0","8 K"',
        '"League of Legends.exe","4242","Console","4","1,200,968 K"',
        '"Blitz.exe","37856","Console","4","139,796 K"',
        '"Blitz.exe","17820","Console","4","38,492 K"',
        'INFO: No tasks are running which match the specified criteria.',
        '',
    ].join('\r\n');
    const processes = parseTasklistCsv(stdout);
    assert.strictEqual(processes.length, 4);
    assert.deepStrictEqual(processes[1], { name: 'League of Legends.exe', pid: 4242, session: 4 });

    const snapshot = snapshotFromWindows(processes);
    assert.ok(snapshot.has('league of legends.exe'));
    assert.ok(snapshot.has('Blitz'));
    assert.deepStrictEqual(snapshot.pids('Blitz.exe').sort(), [17820, 37856]);
    assert.deepStrictEqual(snapshot.images('blitz'), ['Blitz.exe']);
    assert.ok(!snapshot.has('LeagueClient.exe'));
});

test('macOS: parses ps output and files a process under its executable and its bundles', () => {
    const stdout = [
        '    1 /sbin/launchd',
        '  812 /Applications/Blitz.app/Contents/MacOS/Blitz',
        '  813 /Applications/Blitz.app/Contents/Frameworks/Blitz Helper (Renderer).app/Contents/MacOS/Blitz Helper (Renderer)',
        ' 2001 /Applications/League of Legends.app/Contents/LoL/LeagueClient.app/Contents/MacOS/LeagueClient',
        ' 2050 /Applications/League of Legends.app/Contents/LoL/Game/LeagueofLegends.app/Contents/MacOS/LeagueofLegends',
        ' 3000 /Users/Shared/Riot Games/Riot Client.app/Contents/MacOS/RiotClientServices',
        '',
    ].join('\n');
    const processes = parsePs(stdout);
    assert.strictEqual(processes.length, 6);
    assert.deepStrictEqual(processes[2], {
        pid: 813,
        path: '/Applications/Blitz.app/Contents/Frameworks/Blitz Helper (Renderer).app/Contents/MacOS/Blitz Helper (Renderer)',
    });

    const snapshot = snapshotFromPaths(processes);
    assert.deepStrictEqual(snapshot.pids('Blitz').sort(), [812, 813]);
    assert.deepStrictEqual(snapshot.pids('/Applications/Blitz.app').sort(), [812, 813]);
    assert.deepStrictEqual(snapshot.pids('League of Legends').sort(), [2001, 2050]);
    assert.deepStrictEqual(snapshot.pids('LeagueClient'), [2001]);
    assert.ok(snapshot.has('Riot Client'));
    assert.ok(!snapshot.has('League'));
});

test('macOS: lists the bundles in a path outermost first', () => {
    assert.deepStrictEqual(
        bundlesInPath('/Applications/Blitz.app/Contents/Frameworks/Blitz Helper.app/Contents/MacOS/Blitz Helper'),
        [
            { name: 'Blitz.app', path: '/Applications/Blitz.app' },
            { name: 'Blitz Helper.app', path: '/Applications/Blitz.app/Contents/Frameworks/Blitz Helper.app' },
        ],
    );
    assert.deepStrictEqual(bundlesInPath('/usr/sbin/cfprefsd'), []);
});

test('linux: a process is found by its executable name or its short comm name', () => {
    const snapshot = snapshotFromPaths([
        { pid: 10, path: '/usr/bin/obs', comm: 'obs' },
        { pid: 11, path: 'kworker/0:1', comm: 'kworker/0:1' },
        { pid: 12, path: '/opt/discord/Discord', comm: 'Discord' },
    ]);
    assert.ok(snapshot.has('obs'));
    assert.ok(snapshot.has('discord'));
});
