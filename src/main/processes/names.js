'use strict';

// Reduces whatever a rule stores ("Blitz.exe", "/Applications/Blitz.app", "blitz") to the
// bare lowercase name every platform's process list is indexed by.
function normalizeName(value) {
    if (typeof value !== 'string') return '';
    let name = value.trim().replace(/^["']+|["']+$/g, '').replace(/[\\/]+$/, '');
    const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
    if (slash >= 0) name = name.slice(slash + 1);
    return name.toLowerCase().replace(/\.(exe|app)$/, '');
}

function displayName(value) {
    if (typeof value !== 'string') return '';
    let name = value.trim().replace(/[\\/]+$/, '');
    const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
    if (slash >= 0) name = name.slice(slash + 1);
    return name.replace(/\.(exe|app)$/i, '');
}

// One view of everything running, indexed by normalized name. A process can be filed under
// several names (on macOS: its executable and every .app bundle that contains it).
class Snapshot {
    constructor() {
        this.entries = new Map();
    }

    add(name, pid, image) {
        const key = normalizeName(name);
        if (!key) return;
        let entry = this.entries.get(key);
        if (!entry) {
            entry = { pids: new Set(), images: new Set() };
            this.entries.set(key, entry);
        }
        entry.pids.add(pid);
        if (image) entry.images.add(image);
    }

    has(name) {
        return this.entries.has(normalizeName(name));
    }

    pids(name) {
        const entry = this.entries.get(normalizeName(name));
        return entry ? [...entry.pids] : [];
    }

    images(name) {
        const entry = this.entries.get(normalizeName(name));
        return entry ? [...entry.images] : [];
    }

    get size() {
        return this.entries.size;
    }
}

module.exports = { normalizeName, displayName, Snapshot };
