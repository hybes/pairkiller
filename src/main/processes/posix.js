'use strict';

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parsePs, bundlesInPath, snapshotFromPaths } = require('./parse');

function ps() {
    return new Promise((resolve, reject) => {
        execFile('/bin/ps', ['-axww', '-o', 'pid=,comm='], { timeout: 10000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
            if (error) reject(error);
            else resolve(parsePs(stdout));
        });
    });
}

async function procfs() {
    const processes = [];
    const names = await fs.promises.readdir('/proc');
    await Promise.all(names.filter((name) => /^\d+$/.test(name)).map(async (name) => {
        const pid = Number.parseInt(name, 10);
        let comm = '';
        let exe = '';
        try {
            comm = (await fs.promises.readFile(`/proc/${name}/comm`, 'utf8')).trim();
        } catch (_) {
            return;
        }
        try {
            exe = (await fs.promises.readlink(`/proc/${name}/exe`)).replace(/ \(deleted\)$/, '');
        } catch (_) {
            // Other users' processes hide their exe link; the short comm name still identifies them.
        }
        processes.push({ pid, path: exe || comm, comm });
    }));
    return processes;
}

function signal(pids, name) {
    let failure = null;
    for (const pid of pids) {
        if (pid === process.pid || pid === process.ppid) continue;
        try {
            process.kill(pid, name);
        } catch (error) {
            if (error.code !== 'ESRCH') failure = error.code === 'EPERM' ? 'Permission denied' : error.message;
        }
    }
    return failure ? { ok: false, error: failure } : { ok: true };
}

function launchDetached(file) {
    return new Promise((resolve) => {
        const child = spawn(file, [], { detached: true, stdio: 'ignore', cwd: path.dirname(file) });
        child.once('error', (error) => resolve({ ok: false, error: error.message }));
        child.once('spawn', () => {
            child.unref();
            resolve({ ok: true });
        });
    });
}

function createPosixHost({ platform }) {
    const isMac = platform === 'darwin';
    const list = isMac ? ps : procfs;
    const home = os.homedir();

    async function listApps() {
        const apps = new Map();
        for (const proc of await list()) {
            if (proc.pid === process.pid) continue;
            if (isMac) {
                const bundle = bundlesInPath(proc.path)[0];
                if (!bundle || apps.has(bundle.path)) continue;
                const visible = ['/Applications/', '/System/Applications/', '/Users/', '/Volumes/', '/opt/']
                    .some((prefix) => bundle.path.startsWith(prefix));
                if (!visible || bundle.path.startsWith(`${home}/Library/`)) continue;
                apps.set(bundle.path, { name: bundle.name.replace(/\.app$/i, ''), path: bundle.path });
            } else {
                if (!proc.path.startsWith('/') || apps.has(proc.path)) continue;
                apps.set(proc.path, { name: path.basename(proc.path), path: proc.path });
            }
        }
        return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }

    return {
        backend: isMac ? 'ps' : 'procfs',
        minInterval: 1000,
        snapshot: async () => snapshotFromPaths(await list()),
        // Ask politely first; the engine retries with force if the app is still there.
        stop: async (name, current, { force } = {}) => {
            const pids = current.pids(name);
            if (pids.length === 0) return { ok: false, error: 'Not running' };
            return signal(pids, force ? 'SIGKILL' : 'SIGTERM');
        },
        listApps,
        launchDetached,
    };
}

module.exports = { createPosixHost };
