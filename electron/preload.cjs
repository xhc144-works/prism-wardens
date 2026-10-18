/* 预加载脚本：只暴露有限、类型明确的原生接口给渲染进程 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const inv = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const version = (() => {
  const arg = process.argv.find((a) => a.startsWith('--prism-version='));
  return arg ? arg.split('=')[1] : '';
})();

contextBridge.exposeInMainWorld('prismNative', {
  isElectron: true,
  version,
  platform: process.platform,
  storage: {
    get: (k) => inv('storage:get', String(k)),
    set: (k, v) => inv('storage:set', String(k), String(v)),
    remove: (k) => inv('storage:remove', String(k)),
    list: () => inv('storage:list'),
  },
  backup: {
    create: (label) => inv('backup:create', String(label)),
    list: () => inv('backup:list'),
    restore: (id) => inv('backup:restore', String(id)),
    remove: (id) => inv('backup:remove', String(id)),
    openFolder: () => inv('backup:open'),
  },
  window: {
    setFullscreen: (on) => inv('window:setFullscreen', !!on),
    isFullscreen: () => inv('window:isFullscreen'),
    setSize: (w, h) => inv('window:setSize', Number(w), Number(h)),
    quit: () => inv('window:quit'),
  },
  update: {
    check: () => inv('update:check'),
    download: () => inv('update:download'),
    install: () => inv('update:install'),
    onStatus: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),
  },
  file: {
    save: (name, content) => inv('file:save', String(name), String(content)),
    open: (filters) => inv('file:open', filters),
  },
  dataPath: () => inv('app:dataPath'),
  reload: () => inv('app:reload'),
  assets: {
    status: () => inv('assets:status'),
    pick: (kind) => inv('assets:pick', kind === 'dir' ? 'dir' : 'file'),
    import: (source) => inv('assets:import', String(source)),
    remove: () => inv('assets:remove'),
    onProgress: (cb) => ipcRenderer.on('assets:progress', (_e, m) => cb(m)),
  },
});
