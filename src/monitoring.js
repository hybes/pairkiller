'use strict';

const DEFAULT_DSN = 'https://9d9c2ec177654b48bdce3e218aca0d3a@error.cnnct.uk/8';
const { describe, scrubSecrets, scrubText } = require('./monitoring-privacy');
const SESSION_INTEGRATIONS = new Set(['BrowserSession', 'ProcessSession', 'MainProcessSession', 'BrowserWindowSession']);
// Warnings Node and Electron print about themselves, which the console integration would report as app problems.
const RUNTIME_NOISE = /^\s*(?:[\w-]+:\s*)?(?:\((?:node|electron):?\d*\)\s*)?(?:\[[A-Z][A-Z\d_]*\]\s*)?(?:ExperimentalWarning|DeprecationWarning)\b|\bMODULE_TYPELESS_PACKAGE_JSON\b|^\s*\(Use `[^`]*--trace-(?:warnings|deprecation)/;

// GlitchTip already shows the service name on every line, so messages start with their area.
function logMessage(message, area) {
    const text = describe(message).replace(/^\[pairkiller\]\s*/i, '');
    return /^[\w-]+:/.test(text) ? text : `${area}: ${text}`;
}

function isRuntimeNoise(message) {
    return RUNTIME_NOISE.test(describe(message));
}

// Hostnames that only exist on a developer's machine or network. An empty hostname is not local:
// the packaged renderer loads from file://, and its events must still report.
function isLocalHostname(hostname) {
    const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!host) return false;
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) return true;
    if (/\.(?:local|localhost|test)$/.test(host)) return true;
    if (/^(?:127|10)\.\d+\.\d+\.\d+$/.test(host) || /^192\.168\.\d+\.\d+$/.test(host)) return true;
    if (/^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
    return !host.includes('.') && !host.includes(':');
}

function isLocalUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    try { return isLocalHostname(new URL(url).hostname); } catch (_) { return false; }
}

// Page or request URLs only. Device hostnames (server_name, host.name) are not checked:
// a user's PC is often called DESKTOP-1234 or ben.local and its reports are real.
const fromLocalPage = (event) => isLocalUrl(event?.request?.url);
const logFromLocalPage = (attributes) => isLocalUrl(attributes?.['url.full']) || isLocalUrl(attributes?.['page.url']);

// Set by the GitHub release and PR build workflows when packaging; any other build is local.
function releaseChannel(env) {
    const channel = env.PAIRKILLER_RELEASE_CHANNEL;
    return env.GITHUB_ACTIONS === 'true' && (channel === 'production' || channel === 'preview') ? channel : 'development';
}

function glitchtipOptions({ runtime = 'server', hostname, isEnabled = () => true, integrations = [] } = {}) {
    function prepareLog(log) {
        if (isRuntimeNoise(log.message) || logFromLocalPage(log.attributes)) return null;
        const source = log.attributes?.runtime || runtime;
        const attributes = { ...log.attributes, 'service.name': 'pairkiller', runtime: source };
        if (source === 'browser') delete attributes['host.name'];
        else if (hostname) attributes['host.name'] = hostname;
        attributes.environment = attributes['sentry.environment'] || attributes.environment;
        attributes.release = attributes['sentry.release'] || attributes.release;
        return scrubSecrets({ ...log, message: logMessage(log.message, attributes.area || source), attributes });
    }

    function prepareEnvelope(client, envelope) {
        if (!isEnabled()) { envelope[1] = []; return; }
        envelope[1] = envelope[1].filter(([header]) => !['trace_metric', 'metric', 'session', 'sessions', 'profile', 'profile_chunk', 'replay_event', 'replay_recording'].includes(header.type));
        for (const item of envelope[1]) {
            if (item[0].type === 'log') {
                item[1].items = item[1].items.filter((log) => !['debug', 'trace'].includes(log.level)).map((log) => {
                    const attrs = Object.fromEntries(Object.entries(log.attributes || {}).map(([key, attr]) => [key, attr.value]));
                    const options = client.getOptions();
                    const prepared = prepareLog({ message: log.body, attributes: {
                        ...attrs,
                        'sentry.environment': options.environment || attrs['sentry.environment'],
                        'sentry.release': options.release || attrs['sentry.release'],
                    } });
                    if (!prepared) return null;
                    return { ...log, body: prepared.message, attributes: Object.fromEntries(Object.entries(prepared.attributes)
                        .filter(([, value]) => value !== undefined)
                        .map(([key, value]) => [key, { value, type: Array.isArray(value) ? 'array' : typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'double') : typeof value }])) };
                }).filter(Boolean);
                item[0].item_count = item[1].items.length;
            } else if (item[1] && typeof item[1] === 'object' && !(item[1] instanceof Uint8Array)) {
                item[1] = fromLocalPage(item[1]) ? null : scrubSecrets(item[1]);
            }
        }
        envelope[1] = envelope[1].filter(([header, payload]) => payload !== null && (header.type !== 'log' || payload.items.length > 0));
    }

    return {
        sampleRate: 1,
        // Sentry 11 streams spans by default; GlitchTip needs whole transactions.
        traceLifecycle: 'static',
        sendClientReports: false,
        enableLogs: true,
        beforeSendLog(log) {
            try { return isEnabled() ? prepareLog(log) : null; } catch (_) { return null; }
        },
        beforeSendMetric: () => null,
        integrations: (defaults) => [
            ...defaults.filter((integration) => !SESSION_INTEGRATIONS.has(integration.name)),
            ...integrations,
            {
                name: 'GlitchTipDiagnostics',
                setup(client) {
                    // Renderer logs can arrive already serialised, bypassing beforeSendLog in main.
                    // Filter at the final boundary too, including scope attributes and opt-out changes.
                    client.on('beforeEnvelope', (envelope) => {
                        try { prepareEnvelope(client, envelope); } catch (_) {
                            // An envelope that couldn't be checked isn't sent, and the failure stays inside reporting.
                            envelope[1] = [];
                        }
                    });
                },
            },
        ],
        initialScope: { tags: { application: 'pairkiller', service: 'pairkiller' } },
        beforeSend(event) {
            if (!isEnabled() || fromLocalPage(event)) return null;
            return scrubSecrets({ ...event, tags: { ...event.tags, application: 'pairkiller', service: 'pairkiller' } });
        },
        beforeSendTransaction: (event) => isEnabled() && !fromLocalPage(event) ? scrubSecrets(event) : null,
        dataCollection: {
            userInfo: true,
            cookies: false,
            httpHeaders: true,
            urlQueryParams: true,
            stackFrameVariables: false,
        },
    };
}

// Only packaged apps built by GitHub Actions report: production for releases, preview for PR builds.
// `bun run dev`, tests and apps packaged on a developer's machine stay quiet unless SENTRY_FORCE=1.
function monitoringConfig({ isPackaged, channel = 'development', env }) {
    const deployed = isPackaged && (channel === 'production' || channel === 'preview');
    const forced = env.SENTRY_FORCE === '1' || env.SENTRY_FORCE === 'true';
    return {
        dsn: env.SENTRY_DSN?.trim() || DEFAULT_DSN,
        enabled: env.NODE_ENV !== 'test' && env.SENTRY_DISABLED !== 'true' && (deployed || forced),
        environment: env.NODE_ENV === 'test' ? 'test' : deployed ? channel : 'development',
        tracesSampleRate: deployed ? 0.01 : 0,
    };
}

module.exports = { describe, glitchtipOptions, isLocalHostname, isLocalUrl, logMessage, monitoringConfig, releaseChannel, scrubSecrets, scrubText };
