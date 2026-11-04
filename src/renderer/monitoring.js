import { consoleLoggingIntegration, init, logger } from '@sentry/electron/renderer';
import { glitchtipOptions } from '../monitoring';

// The Electron SDK forwards events over IPC to the main process, which owns the DSN and opt-out filter.
init({
    ...glitchtipOptions({ runtime: 'browser', integrations: [consoleLoggingIntegration({ levels: ['warn', 'error'] })] }),
    ...window.pairkiller.monitoring,
});

// The interface scripts are plain JavaScript; expose only the structured levels they use.
window.pairkillerLog = { warn: logger.warn, error: logger.error };
