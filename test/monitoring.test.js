'use strict';

const assert = require('assert');
const { test } = require('./harness');
const { glitchtipOptions, monitoringConfig } = require('../src/monitoring');

test('monitoring: packaged apps report to GlitchTip with low trace sampling', () => {
    const options = monitoringConfig({ isPackaged: true, env: {} });
    assert.strictEqual(options.dsn, 'https://9d9c2ec177654b48bdce3e218aca0d3a@error.cnnct.uk/8');
    assert.strictEqual(options.enabled, true);
    assert.strictEqual(options.environment, 'production');
    assert.strictEqual(options.tracesSampleRate, 0.01);
});

test('monitoring: development needs an explicit DSN and never samples traces', () => {
    for (const dsn of [undefined, '', '   ']) {
        assert.strictEqual(monitoringConfig({ isPackaged: false, env: { SENTRY_DSN: dsn } }).enabled, false);
    }
    const override = 'https://public@errors.example.com/9';
    for (const isPackaged of [false, true]) {
        const options = monitoringConfig({ isPackaged, env: { SENTRY_DSN: ` ${override} ` } });
        assert.strictEqual(options.dsn, override);
        assert.strictEqual(options.enabled, true);
        if (!isPackaged) {
            assert.strictEqual(options.environment, 'development');
            assert.strictEqual(options.tracesSampleRate, 0);
        }
    }
});

test('monitoring: tests and the disable switch override an explicit DSN', () => {
    for (const isPackaged of [false, true]) {
        for (const env of [{ NODE_ENV: 'test' }, { SENTRY_DISABLED: 'true' }]) {
            const options = monitoringConfig({ isPackaged, env: { ...env, SENTRY_DSN: 'https://public@errors.example.com/9' } });
            assert.strictEqual(options.enabled, false);
        }
    }
});

test('monitoring: both runtimes drop release health without removing error handlers', () => {
    const names = ['BrowserSession', 'ProcessSession', 'MainProcessSession', 'BrowserWindowSession', 'OnUncaughtException', 'GlobalHandlers', 'ScopeToMain'];
    const integrations = names.map((name) => ({ name }));
    assert.deepStrictEqual(glitchtipOptions().integrations(integrations).map(({ name }) => name), ['OnUncaughtException', 'GlobalHandlers', 'ScopeToMain']);
});

test('monitoring: errors stay anonymous and unsupported telemetry is dropped', () => {
    const options = glitchtipOptions();
    assert.strictEqual(options.sampleRate, 1);
    assert.strictEqual(options.traceLifecycle, 'static');
    assert.strictEqual(options.sendClientReports, false);
    assert.strictEqual(options.beforeSendLog({ body: 'do not send' }), null);
    assert.strictEqual(options.beforeSendMetric({ name: 'do not send' }), null);
    assert.strictEqual(options.initialScope.tags.application, 'pairkiller');
    assert.strictEqual(options.dataCollection.userInfo, false);
    assert.strictEqual(options.dataCollection.cookies, false);
    assert.strictEqual(options.dataCollection.stackFrameVariables, false);
    assert.deepStrictEqual(options.dataCollection.httpBodies, []);
});
