'use strict';

const fs = require('fs');
const path = require('path');
const { logMessage, scrubSecrets } = require('../monitoring');

const MAX_BYTES = 512 * 1024;
const REPEAT_WINDOW_MS = 5 * 60 * 1000;

// A small rolling log file, so "it didn't close my app" can be answered after the fact.
function createLog({ dir, echo = false, now = Date.now }) {
    const file = path.join(dir, 'pairkiller.log');
    let size = 0;
    let sink = null;
    let pending = [];
    let fileFailed = false;
    const repeats = new Map();
    try {
        fs.mkdirSync(dir, { recursive: true });
        size = fs.statSync(file).size;
    } catch (_) {
        // No log yet.
    }

    function send(entry) {
        if (entry.attributes['log.local']) return;
        if (!sink) { pending.push(entry); pending = pending.slice(-100); return; }
        try {
            if (sink.isEnabled()) sink.logger[entry.level](entry.message, entry.attributes);
        } catch (_) {
            // Reporting must never interrupt an app action or recurse through the logger.
        }
    }

    function write(level, message, detail, extra = {}) {
        const error = detail instanceof Error || typeof detail === 'string' ? detail : null;
        const attributes = scrubSecrets({
            ...(error ? {
                'error.message': error.message || String(error),
                'error.code': error.code,
                'error.stack': error.stack,
                'http.status_code': error.statusCode || error.status,
            } : detail),
            ...extra,
        });
        const area = attributes.area || String(message).match(/^([\w-]+):/)?.[1] || 'app';
        attributes.area = area;
        const failure = error ? `: ${error.code ? `${error.code} ` : ''}${error.message || error}` : '';
        const body = logMessage(`${message}${failure}`, area);
        const entry = { level, message: scrubSecrets(body), attributes };
        if (level === 'warn' || level === 'error') {
            const key = `${level}:${attributes['log.key'] || body}`;
            const previous = repeats.get(key);
            if (previous && now() - previous.at < REPEAT_WINDOW_MS) { previous.count++; return; }
            if (previous?.count) attributes['log.suppressed_count'] = previous.count;
            repeats.delete(key);
            repeats.set(key, { at: now(), count: 0 });
            if (repeats.size > 1000) repeats.delete(repeats.keys().next().value);
        }
        const line = `${new Date(now()).toISOString()} ${level.toUpperCase()} ${entry.message} ${JSON.stringify(attributes)}\n`;
        if (echo) process.stdout.write(line);
        send(entry);
        try {
            if (size + line.length > MAX_BYTES) {
                fs.renameSync(file, `${file}.1`);
                size = 0;
            }
            fs.appendFileSync(file, line);
            size += Buffer.byteLength(line);
            fileFailed = false;
        } catch (error) {
            if (!fileFailed) send({ level: 'warn', message: logMessage(`could not write ${file}: ${error.message}`, 'logging'),
                attributes: scrubSecrets({ area: 'logging', path: file, 'error.message': error.message, 'error.code': error.code }) });
            fileFailed = true;
        }
    }

    return {
        file,
        connect({ logger, isEnabled }) {
            sink = { logger, isEnabled };
            pending.forEach(send);
            pending = [];
        },
        info: (message, detail, attributes) => write('info', message, detail, attributes),
        warn: (message, detail, attributes) => write('warn', message, detail, attributes),
        error: (message, detail, attributes) => write('error', message, detail, attributes),
    };
}

module.exports = { createLog };
