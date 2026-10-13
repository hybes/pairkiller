'use strict';

const { Snapshot } = require('./names');

// `tasklist /FO CSV /NH` rows: "Image Name","PID","Session Name","Session#","Mem Usage"
function parseTasklistCsv(stdout) {
    const processes = [];
    for (const line of stdout.split(/\r?\n/)) {
        const fields = line.match(/"((?:[^"]|"")*)"/g);
        if (!fields || fields.length < 2) continue;
        const cell = (index) => (fields[index] || '""').slice(1, -1).replace(/""/g, '"');
        const pid = Number.parseInt(cell(1), 10);
        if (!Number.isInteger(pid)) continue;
        const session = Number.parseInt(cell(3), 10);
        processes.push({ name: cell(0), pid, session: Number.isInteger(session) ? session : null });
    }
    return processes;
}

// `ps -axww -o pid=,comm=` rows: "  123 /Applications/Blitz.app/Contents/MacOS/Blitz"
function parsePs(stdout) {
    const processes = [];
    for (const line of stdout.split('\n')) {
        const match = line.match(/^\s*(\d+)\s+(.+?)\s*$/);
        if (!match) continue;
        processes.push({ pid: Number.parseInt(match[1], 10), path: match[2] });
    }
    return processes;
}

// Every .app bundle on the way to an executable, outermost first.
function bundlesInPath(executablePath) {
    const bundles = [];
    const parts = executablePath.split('/');
    for (let i = 0; i < parts.length; i++) {
        if (/\.app$/i.test(parts[i])) {
            bundles.push({ name: parts[i], path: parts.slice(0, i + 1).join('/') });
        }
    }
    return bundles;
}

function snapshotFromWindows(processes) {
    const snapshot = new Snapshot();
    for (const proc of processes) {
        snapshot.add(proc.name, proc.pid, proc.name);
    }
    return snapshot;
}

function snapshotFromPaths(processes) {
    const snapshot = new Snapshot();
    for (const proc of processes) {
        snapshot.add(proc.path, proc.pid);
        for (const bundle of bundlesInPath(proc.path)) {
            snapshot.add(bundle.name, proc.pid);
        }
        if (proc.comm) snapshot.add(proc.comm, proc.pid);
    }
    return snapshot;
}

module.exports = { parseTasklistCsv, parsePs, bundlesInPath, snapshotFromWindows, snapshotFromPaths };
