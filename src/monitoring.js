'use strict';

const DEFAULT_DSN = 'https://9d9c2ec177654b48bdce3e218aca0d3a@error.cnnct.uk/8';
const { scrubSecrets, scrubText } = require('./monitoring-privacy');
const SESSION_INTEGRATIONS = new Set(['BrowserSession', 'ProcessSession', 'MainProcessSession', 'BrowserWindowSession']);

function logMessage(message, area) {
    const text = String(message).replace(/^\[pairkiller\]\s*/, '');
    return `[pairkiller] ${/^[\w-]+:/.test(text) ? text : `${area}: ${text}`}`;
}

function glitchtipOptions({ runtime = 'server', hostname, isEnabled = () => true, integrations = [] } = {}) {
    function prepareLog(log) {
        const source = log.attributes?.runtime || runtime;
        const attributes = { ...log.attributes, 'service.name': 'pairkiller', runtime: source };
        if (source === 'browser') delete attributes['host.name'];
        else if (hostname) attributes['host.name'] = hostname;
        attributes.environment = attributes['sentry.environment'] || attributes.environment;
        attributes.release = attributes['sentry.release'] || attributes.release;
        return scrubSecrets({ ...log, message: logMessage(log.message, attributes.area || source), attributes });
    }

    return {
        sampleRate: 1,
        // Sentry 11 streams spans by default; GlitchTip needs whole transactions.
        traceLifecycle: 'static',
        sendClientReports: false,
        enableLogs: true,
        beforeSendLog: (log) => isEnabled() ? prepareLog(log) : null,
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
                                    return { ...log, body: prepared.message, attributes: Object.fromEntries(Object.entries(prepared.attributes)
                                        .filter(([, value]) => value !== undefined)
                                        .map(([key, value]) => [key, { value, type: typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'double') : typeof value }])) };
                                });
                                item[0].item_count = item[1].items.length;
                            } else if (item[1] && typeof item[1] === 'object' && !(item[1] instanceof Uint8Array)) {
                                item[1] = scrubSecrets(item[1]);
                            }
                        }
                        envelope[1] = envelope[1].filter(([header, payload]) => header.type !== 'log' || payload.items.length > 0);
                    });
                },
            },
        ],
        initialScope: { tags: { application: 'pairkiller', service: 'pairkiller' } },
        beforeSend(event) {
            if (!isEnabled()) return null;
            return scrubSecrets({ ...event, tags: { ...event.tags, application: 'pairkiller', service: 'pairkiller' } });
        },
        beforeSendTransaction: (event) => isEnabled() ? scrubSecrets(event) : null,
        dataCollection: {
            userInfo: true,
            cookies: false,
            httpHeaders: true,
            urlQueryParams: true,
            stackFrameVariables: false,
        },
    };
}

function monitoringConfig({ isPackaged, env }) {
    const override = env.SENTRY_DSN?.trim();
    return {
        dsn: override || DEFAULT_DSN,
        enabled: env.NODE_ENV !== 'test' && env.SENTRY_DISABLED !== 'true' && (isPackaged || Boolean(override)),
        environment: env.NODE_ENV === 'test' ? 'test' : isPackaged ? 'production' : 'development',
        tracesSampleRate: isPackaged ? 0.01 : 0,
    };
}

module.exports = { glitchtipOptions, logMessage, monitoringConfig, scrubSecrets, scrubText };
