import { init } from '@sentry/electron/renderer';
import { glitchtipOptions } from '../monitoring';

// The Electron SDK forwards events over IPC to the main process, which owns the DSN and opt-out filter.
init({
    ...glitchtipOptions(),
    ...window.pairkiller.monitoring,
});
