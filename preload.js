const { contextBridge, ipcRenderer } = require('electron');

function basename(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return '';
  }
  const normalized = filePath.replace(/\\/g, '/');
  const trimmed = normalized.replace(/\/+$/, '');
  const segments = trimmed.split('/');
  return segments.pop() || '';
}

const INVOKE = new Set([
  'get-config',
  'get-presets',
  'set-auto-start',
  'get-auto-start',
  'open-file-dialog',
  'save-settings',
  'get-version',
  'get-usage-collection',
  'get-background-mode',
  'set-background-mode',
]);

const SEND = new Set([
  'toggle-usage-collection',
  'open-link',
  'check-for-updates',
  'install-update',
  'close-update-window',
]);

function invoke(channel, ...args) {
  if (!INVOKE.has(channel)) {
    throw new Error('Invalid invoke channel');
  }
  return ipcRenderer.invoke(channel, ...args);
}

function send(channel, ...args) {
  if (!SEND.has(channel)) {
    throw new Error('Invalid send channel');
  }
  ipcRenderer.send(channel, ...args);
}

function on(channel, callback) {
  if (channel !== 'update-status' && channel !== 'update-progress' && channel !== 'update-downloaded') {
    throw new Error('Invalid listener channel');
  }
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('pairkiller', {
  invoke,
  send,
  on,
  basename,
});
