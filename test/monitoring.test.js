'use strict';

const assert = require('assert');
const { test } = require('./harness');
const { describe, glitchtipOptions, monitoringConfig, scrubSecrets, scrubText } = require('../src/monitoring');

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
    assert.deepStrictEqual(glitchtipOptions().integrations(integrations).map(({ name }) => name), ['OnUncaughtException', 'GlobalHandlers', 'ScopeToMain', 'GlitchTipDiagnostics']);
});

test('monitoring: useful diagnostics are collected without unsupported telemetry', () => {
    const options = glitchtipOptions();
    assert.strictEqual(options.sampleRate, 1);
    assert.strictEqual(options.traceLifecycle, 'static');
    assert.strictEqual(options.sendClientReports, false);
    assert.strictEqual(options.enableLogs, true);
    assert.strictEqual(options.beforeSendLog({ message: 'config: saved' }).message, 'config: saved');
    assert.strictEqual(options.beforeSendMetric({ name: 'do not send' }), null);
    assert.strictEqual(options.initialScope.tags.application, 'pairkiller');
    assert.strictEqual(options.initialScope.tags.service, 'pairkiller');
    assert.strictEqual(options.dataCollection.userInfo, true);
    assert.strictEqual(options.dataCollection.cookies, false);
    assert.strictEqual(options.dataCollection.stackFrameVariables, false);
    assert.strictEqual(options.dataCollection.httpBodies, undefined);
    assert.strictEqual(options.dataCollection.httpHeaders, true);
});

function envelopeHook(options) {
    let hook;
    options.integrations([]).find(({ name }) => name === 'GlitchTipDiagnostics').setup({
        on(name, fn) { assert.strictEqual(name, 'beforeEnvelope'); hook = fn; },
        getOptions() { return { environment: 'production', release: '7.0.1' }; },
    });
    return hook;
}

function serializedLog(attributes = {}, level = 'warn') {
    return [{ type: 'log', item_count: 1 }, { version: 2, items: [{
        body: 'apps: launch failed for /Users/ben/Blitz.app', level,
        attributes: Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, { value, type: typeof value }])),
    }] }];
}

test('monitoring: main and renderer logs share service and retain their own runtime', () => {
    const options = glitchtipOptions({ hostname: 'desktop' });
    const main = options.beforeSendLog({ message: 'config: failed', attributes: { 'sentry.environment': 'production', 'sentry.release': '7.0.1' } });
    assert.strictEqual(main.attributes['service.name'], 'pairkiller');
    assert.strictEqual(main.attributes['host.name'], 'desktop');
    assert.strictEqual(main.attributes.runtime, 'server');
    assert.strictEqual(main.attributes.environment, 'production');
    assert.strictEqual(main.attributes.release, '7.0.1');
    assert.strictEqual(main.message, 'config: failed');
    // Older renderer bundles still prefixed the project name; GlitchTip already shows it as the service.
    const renderer = glitchtipOptions({ runtime: 'browser' }).beforeSendLog({ message: '[pairkiller] config: failed', attributes: { 'host.name': 'wrong' } });
    assert.strictEqual(renderer.message, 'config: failed');
    assert.strictEqual(glitchtipOptions({ runtime: 'browser' }).beforeSendLog({ message: 'save failed' }).message, 'browser: save failed');
    assert.ok(!('host.name' in renderer.attributes));
    // This is also the path taken by Electron's logger IPC, which skips main's beforeSendLog.
    const envelope = [{}, [serializedLog({ runtime: 'browser', 'host.name': 'wrong', email: 'ben@example.com', accessToken: 'private-value', attempts: 3, 'duration.ms': 4.5, pids: [101, 102] })]];
    envelopeHook(options)(envelope);
    const log = envelope[1][0][1].items[0];
    assert.strictEqual(log.body, 'apps: launch failed for /Users/ben/Blitz.app');
    assert.strictEqual(log.attributes['service.name'].value, 'pairkiller');
    assert.strictEqual(log.attributes.runtime.value, 'browser');
    assert.ok(!('host.name' in log.attributes));
    assert.strictEqual(log.attributes.environment.value, 'production');
    assert.strictEqual(log.attributes.release.value, '7.0.1');
    assert.strictEqual(log.attributes.email.value, 'ben@example.com');
    assert.deepStrictEqual(log.attributes.attempts, { value: 3, type: 'integer' });
    assert.deepStrictEqual(log.attributes['duration.ms'], { value: 4.5, type: 'double' });
    assert.deepStrictEqual(log.attributes.pids, { value: [101, 102], type: 'array' });
    assert.ok(!JSON.stringify(envelope).includes('private-value'));
});

test('monitoring: opt-out blocks already buffered logs and events', () => {
    let enabled = true;
    const options = glitchtipOptions({ isEnabled: () => enabled });
    const hook = envelopeHook(options);
    enabled = false;
    assert.strictEqual(options.beforeSendLog({ message: 'disabled' }), null);
    assert.strictEqual(options.beforeSend({ message: 'disabled' }), null);
    const envelope = [{}, [serializedLog(), [{ type: 'event' }, { message: 'disabled' }]]];
    hook(envelope);
    assert.deepStrictEqual(envelope[1], []);
});

test('monitoring: envelope guard drops sessions, metrics, profiles, replay and debug logs', () => {
    const envelope = [{}, [serializedLog({}, 'debug'), ...['session', 'sessions', 'trace_metric', 'profile', 'profile_chunk', 'replay_event', 'replay_recording'].map((type) => [{ type }, {}])]];
    envelopeHook(glitchtipOptions())(envelope);
    assert.deepStrictEqual(envelope[1], []);
});

test('monitoring: events retain people, bodies, error codes and stacks but remove secrets', () => {
    const event = glitchtipOptions().beforeSend({
        user: { id: '42', email: 'ben@example.com', name: 'Ben', phone: '+447123456789' },
        request: { url: 'https://example.com/oauth/callback?email=ben@example.com&code=oauth-private&state=state-private',
            headers: { Authorization: 'auth-private', Cookie: 'cookie-private', 'X-User': 'Ben', 'X-Forwarded-For': '192.0.2.1' },
            data: { name: 'Ben', email: 'ben@example.com', amount: 412, password: 'password-private', apiKey: 'api-private', sessionId: 'session-private', card: { number: '4242424242424242', cvv: 'cvv-private' } } },
        exception: { values: [{ value: 'Failed 401 INVALID_KEY', stacktrace: { frames: [{ filename: '/Users/ben/App.js' }] } }] },
        extra: { code: 'INVALID_KEY', oauth: { code: 'oauth-object-private', state: 'oauth-state-private' } },
    });
    assert.deepStrictEqual(event.user, { id: '42', email: 'ben@example.com', name: 'Ben', phone: '+447123456789' });
    assert.strictEqual(event.tags.service, 'pairkiller');
    assert.strictEqual(event.request.data.name, 'Ben');
    assert.strictEqual(event.request.data.amount, 412);
    assert.strictEqual(event.request.headers['X-User'], 'Ben');
    assert.strictEqual(event.extra.code, 'INVALID_KEY');
    assert.strictEqual(event.exception.values[0].stacktrace.frames[0].filename, '/Users/ben/App.js');
    assert.ok(!JSON.stringify(event).includes('-private'));
    assert.ok(!JSON.stringify(event).includes('4242424242424242'));
});

test('monitoring: text, nested JSON, URL signatures and credentials receive the same filtering', () => {
    for (const value of [
        'failed password=private-value email=ben@example.com',
        'https://example.com/file?X-Amz-Signature=private-value&path=/Users/ben',
        'https://ben:private-value@example.com/file',
        '{"email":"ben@example.com","accessToken":"private-value"}',
        'Authorization: Bearer private-value',
        'card number 4242 4242 4242 4242',
    ]) {
        const result = scrubText(value);
        assert.ok(!result.includes('private-value'), result);
        assert.ok(!result.includes('4242 4242 4242 4242'), result);
    }
    assert.deepStrictEqual(scrubSecrets({ 'error.code': 'ENOENT', email: 'ben@example.com', name: 'Ben', phone: '+447123456789', path: '/Users/ben' }),
        { 'error.code': 'ENOENT', email: 'ben@example.com', name: 'Ben', phone: '+447123456789', path: '/Users/ben' });
    const auth = scrubSecrets({
        request: { query_string: 'code=private-value&state=private-value&email=ben@example.com' },
        data: { grant_type: 'authorization_code', code: 'private-value', state: 'private-value', code_verifier: 'private-value' },
        card: { number: 4242424242424242, exp_month: 11, exp_year: 2027 },
        'connect.sid': 'private-value',
    });
    assert.ok(!JSON.stringify(auth).includes('private-value'));
    assert.ok(!JSON.stringify(auth).includes('4242424242424242'));
    assert.ok(JSON.stringify(auth).includes('ben@example.com'));
});

test('monitoring: app names, backup timestamps, ordinary URL codes and states survive filtering', () => {
    for (const text of [
        'Could not open Japan: Tokyo Drift',
        'config.json.backup.1730736000000',
        'timestamp 1730736000000',
        'https://example.com/contact?code=AREA42&state=Dorset',
        'Could not read /Users/ben/Japan: Tokyo Drift.app',
    ]) assert.strictEqual(scrubText(text), text);
    const authUrl = scrubText('https://example.com/auth/callback?code=private-value&state=private-value');
    assert.ok(!authUrl.includes('private-value'));
    assert.ok(!scrubText('password=private-value').includes('private-value'));
    assert.ok(!scrubText('card 4242424242424242').includes('4242424242424242'));
});

const secretKeyVariants = [
    'api-key', 'api_key', 'apiKey', 'APIKey', 'apiKEY',
    'x-api-key', 'X-API-Key', 'X_API_KEY', 'xApiKey', 'XApiKey',
    'access-token', 'access_token', 'accessToken', 'X-Access-Token',
    'refresh-token', 'refresh_token', 'refreshToken',
    'private-key', 'private_key', 'privateKey',
    'code-verifier', 'code_verifier', 'codeVerifier',
    'session-id', 'session_id', 'sessionId',
    'card-number', 'card_number', 'cardNumber',
    'oauth-code', 'oauth_code', 'oauthCode', 'OAuthCode',
    'oauth-state', 'oauth_state', 'oauthState', 'OAuthState',
];

test('monitoring: event headers and fields redact secret keys in every supported spelling', () => {
    for (const key of secretKeyVariants) {
        const event = glitchtipOptions().beforeSend({ request: {
            headers: { [key]: 'private-value', 'X-User': 'Ben' },
            data: { [key]: 'private-value', email: 'ben@example.com', 'error.code': 'ENOENT' },
        } });
        assert.strictEqual(event.request.headers[key], '[Filtered]', `header ${key}`);
        assert.strictEqual(event.request.data[key], '[Filtered]', `field ${key}`);
        assert.strictEqual(event.request.headers['X-User'], 'Ben');
        assert.strictEqual(event.request.data.email, 'ben@example.com');
        assert.strictEqual(event.request.data['error.code'], 'ENOENT');
    }
});

test('monitoring: parsed JSON bodies recursively redact secret key variants and remain valid JSON', () => {
    for (const key of secretKeyVariants) {
        const payload = { headers: { [key]: 'private-value' }, entries: [{ [key]: 'private-value', name: 'Ben' }] };
        for (const body of [payload, [payload]]) {
            const event = glitchtipOptions().beforeSend({ request: { data: JSON.stringify(body) } });
            const parsed = JSON.parse(event.request.data);
            const result = Array.isArray(parsed) ? parsed[0] : parsed;
            assert.strictEqual(result.headers[key], '[Filtered]', `JSON header ${key}`);
            assert.strictEqual(result.entries[0][key], '[Filtered]', `nested JSON field ${key}`);
            assert.strictEqual(result.entries[0].name, 'Ben');
            assert.ok(!event.request.data.includes('private-value'), key);
        }
    }
});

test('monitoring: log attributes and serialised renderer envelopes redact secret key variants', () => {
    for (const key of secretKeyVariants) {
        const attributes = { [key]: 'private-value', payload: JSON.stringify({ [key]: 'private-value', email: 'ben@example.com' }) };
        const options = glitchtipOptions();
        const log = options.beforeSendLog({ message: 'config: request failed', attributes });
        assert.strictEqual(log.attributes[key], '[Filtered]', `log attribute ${key}`);
        assert.strictEqual(JSON.parse(log.attributes.payload)[key], '[Filtered]', `log JSON ${key}`);
        assert.strictEqual(JSON.parse(log.attributes.payload).email, 'ben@example.com');
        const envelope = [{}, [serializedLog(attributes)]];
        envelopeHook(options)(envelope);
        const sent = envelope[1][0][1].items[0].attributes;
        assert.strictEqual(sent[key].value, '[Filtered]', `renderer attribute ${key}`);
        assert.strictEqual(JSON.parse(sent.payload.value)[key], '[Filtered]', `renderer JSON ${key}`);
        assert.ok(!JSON.stringify(envelope).includes('private-value'), key);
    }
});

const runtimeNoise = [
    '(node:4242) ExperimentalWarning: vm.USE_MAIN_CONTEXT_DEFAULT_LOADER is an experimental feature and might change at any time\n(Use `Electron --trace-warnings ...` to show where the warning was created)',
    '(node:4242) [DEP0040] DeprecationWarning: The `punycode` module is deprecated.',
    '(node:4242) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///app/index.js is not specified',
    'DeprecationWarning: Buffer() is deprecated',
    '(Use `node --trace-deprecation ...` to show where the warning was created)',
];

test('monitoring: Node and Electron runtime warnings from captured console output are not sent', () => {
    const options = glitchtipOptions({ runtime: 'browser' });
    for (const message of runtimeNoise) {
        assert.strictEqual(options.beforeSendLog({ level: 'error', message, attributes: { 'sentry.origin': 'auto.log.console' } }), null, message);
    }
    const envelope = [{}, [serializedLog(), [{ type: 'log', item_count: 2 }, { items: runtimeNoise.map((body) => ({ body, level: 'warn', attributes: {} })) }]]];
    envelopeHook(glitchtipOptions())(envelope);
    assert.strictEqual(envelope[1].length, 1);
    assert.strictEqual(envelope[1][0][1].items[0].body, 'apps: launch failed for /Users/ben/Blitz.app');
    assert.ok(options.beforeSendLog({ message: 'rules: closing Blitz.exe failed: EPERM' }));
});

function hostile() {
    const value = Object.create(null);
    Object.defineProperty(value, 'body', { enumerable: true, get() { throw new Error('getter'); } });
    return value;
}

test('monitoring: unreadable values are described and filtered without throwing', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    for (const value of [Object.create(null), hostile(), proxy, Symbol('x'), 12n, { toString() { throw new Error('nope'); } }]) {
        assert.strictEqual(typeof describe(value), 'string');
        assert.doesNotThrow(() => scrubSecrets({ value, nested: [value] }));
    }
    assert.deepStrictEqual(scrubSecrets({ request: hostile(), count: 12n }), { request: { body: '[Unreadable]' }, count: '12' });
    const options = glitchtipOptions();
    assert.doesNotThrow(() => options.beforeSendLog({ message: Object.create(null), attributes: { body: hostile() } }));
    assert.doesNotThrow(() => options.beforeSendLog(null));
    const envelope = [{}, [[{ type: 'log' }, { items: [{ body: 'x', level: 'warn', get attributes() { throw new Error('broken'); } }] }]]];
    assert.doesNotThrow(() => envelopeHook(options)(envelope));
    assert.deepStrictEqual(envelope[1], []);
});
