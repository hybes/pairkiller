'use strict';

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 512 * 1024;

// A small rolling log file, so "it didn't close my app" can be answered after the fact.
function createLog({ dir, echo = false }) {
    const file = path.join(dir, 'pairkiller.log');
    let size = 0;
    try {
        fs.mkdirSync(dir, { recursive: true });
        size = fs.statSync(file).size;
    } catch (_) {
        // No log yet.
    }

    function write(level, message, error) {
        const detail = error ? ` | ${error.stack || error.message || error}` : '';
        const line = `${new Date().toISOString()} ${level} ${message}${detail}\n`;
        if (echo) process.stdout.write(line);
        try {
            if (size + line.length > MAX_BYTES) {
                fs.renameSync(file, `${file}.1`);
                size = 0;
            }
            fs.appendFileSync(file, line);
            size += Buffer.byteLength(line);
        } catch (_) {
            // Logging must never take the app down.
        }
    }

    return {
        file,
        info: (message, error) => write('INFO ', message, error),
        warn: (message, error) => write('WARN ', message, error),
        error: (message, error) => write('ERROR', message, error),
    };
}

module.exports = { createLog };
