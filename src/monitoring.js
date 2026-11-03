'use strict';

const DEFAULT_DSN = 'https://9d9c2ec177654b48bdce3e218aca0d3a@error.cnnct.uk/8';
const PII_HEADERS = ['forwarded', '-ip', 'remote-', 'via', '-user'];
const SESSION_INTEGRATIONS = new Set(['BrowserSession', 'ProcessSession', 'MainProcessSession', 'BrowserWindowSession']);

function glitchtipOptions() {
    return {
        sampleRate: 1,
        // Sentry 11 streams spans by default; GlitchTip needs whole transactions.
        traceLifecycle: 'static',
        sendClientReports: false,
        beforeSendLog: () => null,
        beforeSendMetric: () => null,
        integrations: (defaults) => defaults.filter((integration) => !SESSION_INTEGRATIONS.has(integration.name)),
        initialScope: { tags: { application: 'pairkiller' } },
        // Keep crash reports anonymous in both processes.
        dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: { request: { deny: PII_HEADERS }, response: { deny: PII_HEADERS } },
            httpBodies: [],
            urlQueryParams: { deny: PII_HEADERS },
            genAI: { inputs: false, outputs: false },
            databaseQueryData: false,
            queues: false,
            graphQL: { document: false, variables: false },
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

module.exports = { glitchtipOptions, monitoringConfig };
