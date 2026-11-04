import { consoleLoggingIntegration, init, logger } from '@sentry/electron/renderer';
import { glitchtipOptions, isLocalHostname } from '../monitoring';

// The Electron SDK forwards events over IPC to the main process, which owns the DSN and opt-out filter.
// A page served from a local address is never a real install, even if main allowed reporting.
init({
    ...glitchtipOptions({ runtime: 'browser', integrations: [consoleLoggingIntegration({ levels: ['warn', 'error'] })] }),
    ...window.pairkiller.monitoring,
    enabled: window.pairkiller.monitoring.enabled && !isLocalHostname(window.location.hostname),
});

// The interface scripts are plain JavaScript; expose only the structured levels they use.
window.pairkillerLog = { warn: logger.warn, error: logger.error };
