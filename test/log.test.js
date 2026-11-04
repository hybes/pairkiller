'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('./harness');
const { createLog } = require('../src/main/log');

test('logger: forwards startup warnings, preserves error facts and limits repeats by window', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pairkiller-log-'));
    let at = 1000;
    let enabled = true;
    const sent = [];
    const log = createLog({ dir, now: () => at });
    try {
        const error = Object.assign(new Error('permission denied password=private-value'), { code: 'EPERM' });
        log.warn('rules: closing Blitz.exe failed (attempt 1)', error, { 'app.name': 'Blitz.exe', 'log.key': 'stop' });
        const logger = Object.fromEntries(['info', 'warn', 'error'].map((level) => [level, (message, attributes) => sent.push({ level, message, attributes })]));
        log.connect({ logger, isEnabled: () => enabled });
        log.warn('rules: closing Blitz.exe failed (attempt 2)', error, { 'log.key': 'stop' });
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].level, 'warn');
        assert.ok(sent[0].message.startsWith('[pairkiller] rules:'));
        assert.ok(sent[0].message.includes('EPERM'));
        assert.ok(sent[0].attributes['error.stack'].includes('Error: permission denied'));
        assert.ok(!JSON.stringify(sent).includes('private-value'));
        at += 5 * 60 * 1000;
        log.warn('rules: closing Blitz.exe failed (attempt 3)', error, { 'log.key': 'stop' });
        assert.strictEqual(sent.length, 2);
        assert.strictEqual(sent[1].attributes['log.suppressed_count'], 1);
        log.info('rules: trigger changed', { 'log.local': true });
        assert.strictEqual(sent.length, 2);
        enabled = false;
        log.error('config: save failed', error);
        assert.strictEqual(sent.length, 2);
        const contents = fs.readFileSync(log.file, 'utf8');
        assert.ok(contents.includes('config: save failed'));
        assert.ok(contents.includes('rules: trigger changed'));
        assert.ok(!contents.includes('private-value'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('logger: reporting failure does not break local logging', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pairkiller-log-'));
    try {
        const log = createLog({ dir });
        log.connect({ logger: { error() { throw new Error('offline'); } }, isEnabled: () => true });
        assert.doesNotThrow(() => log.error('startup: failed', new Error('test failure')));
        assert.ok(fs.readFileSync(log.file, 'utf8').includes('test failure'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
