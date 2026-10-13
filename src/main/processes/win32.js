'use strict';

const { execFile } = require('child_process');
const path = require('path');
const { parseTasklistCsv, snapshotFromWindows } = require('./parse');

const windowsDir = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
const TASKLIST = path.join(windowsDir, 'System32', 'tasklist.exe');
const TASKKILL = path.join(windowsDir, 'System32', 'taskkill.exe');

const TH32CS_SNAPPROCESS = 0x2;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const MAX_PATH = 260;
// PROCESSENTRY32W carries one pointer-sized member, so its layout differs between x86 and x64.
const ENTRY_SIZE = process.arch === 'ia32' ? 556 : 568;
const ENTRY_NAME_OFFSET = process.arch === 'ia32' ? 36 : 44;
const ENTRY_PID_OFFSET = 8;

// Shell and session plumbing that is always running and never something to build a rule on.
const SYSTEM_IMAGES = new Set([
    'applicationframehost.exe', 'backgroundtaskhost.exe', 'cmd.exe', 'conhost.exe', 'crashpad_handler.exe',
    'csrss.exe', 'ctfmon.exe', 'dllhost.exe', 'dwm.exe', 'explorer.exe', 'fontdrvhost.exe', 'lockapp.exe',
    'msedgewebview2.exe', 'openconsole.exe', 'powershell.exe', 'pwsh.exe', 'runtimebroker.exe',
    'searchhost.exe', 'securityhealthsystray.exe', 'shellexperiencehost.exe', 'sihost.exe',
    'smartscreen.exe', 'startmenuexperiencehost.exe', 'svchost.exe', 'systemsettings.exe',
    'taskhostw.exe', 'tasklist.exe', 'textinputhost.exe', 'widgets.exe', 'widgetservice.exe',
    'winlogon.exe', 'wsl.exe', 'wslhost.exe', 'wslrelay.exe',
]);

function run(file, args, timeout) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

function readWideString(buffer, offset, maxChars) {
    let end = offset;
    const limit = offset + maxChars * 2;
    while (end < limit && buffer.readUInt16LE(end) !== 0) end += 2;
    return buffer.toString('utf16le', offset, end);
}

// Reads the process table straight from the kernel. A poll costs well under a millisecond,
// where spawning tasklist.exe costs about half a second of CPU.
function loadNative() {
    const koffi = require('koffi');
    const kernel32 = koffi.load('kernel32.dll');
    const fn = (name, result, args) => kernel32.func('__stdcall', name, result, args);
    const api = {
        CreateToolhelp32Snapshot: fn('CreateToolhelp32Snapshot', 'intptr_t', ['uint32_t', 'uint32_t']),
        Process32FirstW: fn('Process32FirstW', 'int', ['intptr_t', 'void *']),
        Process32NextW: fn('Process32NextW', 'int', ['intptr_t', 'void *']),
        CloseHandle: fn('CloseHandle', 'int', ['intptr_t']),
        OpenProcess: fn('OpenProcess', 'intptr_t', ['uint32_t', 'int', 'uint32_t']),
        QueryFullProcessImageNameW: fn('QueryFullProcessImageNameW', 'int', ['intptr_t', 'uint32_t', 'void *', 'void *']),
        ProcessIdToSessionId: fn('ProcessIdToSessionId', 'int', ['uint32_t', 'void *']),
    };
    const entry = Buffer.alloc(ENTRY_SIZE);

    function list() {
        const handle = Number(api.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
        if (handle === -1 || handle === 0) throw new Error('CreateToolhelp32Snapshot failed');
        const processes = [];
        try {
            entry.fill(0);
            entry.writeUInt32LE(ENTRY_SIZE, 0);
            let more = api.Process32FirstW(handle, entry);
            while (more) {
                processes.push({
                    pid: entry.readUInt32LE(ENTRY_PID_OFFSET),
                    name: readWideString(entry, ENTRY_NAME_OFFSET, MAX_PATH),
                });
                more = api.Process32NextW(handle, entry);
            }
        } finally {
            api.CloseHandle(handle);
        }
        if (processes.length === 0) throw new Error('Process list came back empty');
        return processes;
    }

    function sessionOf(pid) {
        const out = new Uint32Array(1);
        return api.ProcessIdToSessionId(pid, out) ? out[0] : null;
    }

    function pathOf(pid) {
        const handle = Number(api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid));
        if (!handle) return '';
        try {
            const buffer = Buffer.alloc(2048);
            const size = new Uint32Array([buffer.length / 2]);
            if (!api.QueryFullProcessImageNameW(handle, 0, buffer, size)) return '';
            return buffer.toString('utf16le', 0, size[0] * 2);
        } finally {
            api.CloseHandle(handle);
        }
    }

    list();
    return { list, sessionOf, pathOf };
}

function createWin32Host({ log }) {
    let native = null;
    try {
        native = loadNative();
    } catch (error) {
        log.warn('Native process list unavailable, falling back to tasklist', error);
    }

    const ownImage = path.basename(process.execPath).toLowerCase();

    async function snapshot() {
        if (native) return snapshotFromWindows(native.list());
        return snapshotFromWindows(parseTasklistCsv(await run(TASKLIST, ['/FO', 'CSV', '/NH'], 15000)));
    }

    async function stop(name, current) {
        const images = current.images(name).filter((image) => image.toLowerCase() !== ownImage);
        if (images.length === 0) return { ok: false, error: 'Not running' };
        let failure = null;
        for (const image of images) {
            try {
                await run(TASKKILL, ['/F', '/IM', image], 10000);
            } catch (error) {
                failure = String(error.stderr || error.message || error).trim();
            }
        }
        return failure ? { ok: false, error: failure } : { ok: true };
    }

    async function listApps() {
        const apps = new Map();
        const consider = (image, appPath) => {
            const key = image.toLowerCase();
            if (apps.has(key) || key === ownImage || SYSTEM_IMAGES.has(key) || !key.endsWith('.exe')) return;
            if (appPath && appPath.toLowerCase().startsWith(windowsDir.toLowerCase() + '\\')) return;
            apps.set(key, { name: image, path: appPath });
        };

        if (native) {
            const session = native.sessionOf(process.pid);
            for (const proc of native.list()) {
                if (proc.pid <= 4 || apps.has(proc.name.toLowerCase())) continue;
                if (session !== null && native.sessionOf(proc.pid) !== session) continue;
                consider(proc.name, native.pathOf(proc.pid));
            }
        } else {
            for (const proc of parseTasklistCsv(await run(TASKLIST, ['/FO', 'CSV', '/NH'], 15000))) {
                if (proc.session === 0) continue;
                consider(proc.name, '');
            }
        }
        return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }

    return {
        backend: native ? 'native' : 'tasklist',
        // tasklist is expensive enough that polling it faster than this would be felt in games.
        minInterval: native ? 1000 : 5000,
        snapshot,
        stop,
        listApps,
    };
}

module.exports = { createWin32Host };
