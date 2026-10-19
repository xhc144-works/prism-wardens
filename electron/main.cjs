/* 棱镜守卫 Prism Wardens — Electron 主进程 */
'use strict';
const { app, BrowserWindow, ipcMain, protocol, net, dialog, shell, Menu, screen, utilityProcess } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const isDev = !app.isPackaged && process.env.PRISM_DEV_URL;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
const userData = () => app.getPath('userData');
const dataDir = () => path.join(userData(), 'data');
const backupDir = () => path.join(userData(), 'backups');
const logFile = () => path.join(userData(), 'logs', 'main.log');

function log(...args) {
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    fs.appendFileSync(logFile(), `[${new Date().toISOString()}] ${args.map(String).join(' ')}\n`);
  } catch {
    /* ignore */
  }
}

process.on('uncaughtException', (e) => log('uncaught', e && e.stack));

/* ---------------------------- 存储 ---------------------------- */

const keyFile = (key) => path.join(dataDir(), `${encodeURIComponent(key)}.json`);

async function atomicWrite(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, content, 'utf8');
  await fsp.rename(tmp, file);
}

ipcMain.handle('storage:get', async (_e, key) => {
  try {
    return await fsp.readFile(keyFile(key), 'utf8');
  } catch {
    return null;
  }
});
ipcMain.handle('storage:set', async (_e, key, value) => atomicWrite(keyFile(key), value));
ipcMain.handle('storage:remove', async (_e, key) => fsp.rm(keyFile(key), { force: true }));
ipcMain.handle('storage:list', async () => {
  try {
    const files = await fsp.readdir(dataDir());
    return files.filter((f) => f.endsWith('.json')).map((f) => decodeURIComponent(f.slice(0, -5)));
  } catch {
    return [];
  }
});

/* ---------------------------- 备份 ---------------------------- */

const MAX_BACKUPS = 20;

async function copyDir(src, dst) {
  await fsp.mkdir(dst, { recursive: true });
  for (const f of await fsp.readdir(src).catch(() => [])) {
    const s = path.join(src, f);
    const d = path.join(dst, f);
    const st = await fsp.stat(s);
    if (st.isDirectory()) await copyDir(s, d);
    else await fsp.copyFile(s, d);
  }
}

async function dirSize(p) {
  let n = 0;
  for (const f of await fsp.readdir(p).catch(() => [])) {
    const st = await fsp.stat(path.join(p, f));
    n += st.isDirectory() ? await dirSize(path.join(p, f)) : st.size;
  }
  return n;
}

ipcMain.handle('backup:create', async (_e, label) => {
  const id = `${Date.now()}`;
  const dst = path.join(backupDir(), id);
  await copyDir(dataDir(), path.join(dst, 'data'));
  await atomicWrite(path.join(dst, 'meta.json'), JSON.stringify({ label: String(label || '备份'), time: Date.now(), version: app.getVersion() }));
  const all = (await fsp.readdir(backupDir())).sort();
  while (all.length > MAX_BACKUPS) await fsp.rm(path.join(backupDir(), all.shift()), { recursive: true, force: true });
  return id;
});

ipcMain.handle('backup:list', async () => {
  const out = [];
  for (const id of (await fsp.readdir(backupDir()).catch(() => [])).sort().reverse()) {
    try {
      const meta = JSON.parse(await fsp.readFile(path.join(backupDir(), id, 'meta.json'), 'utf8'));
      out.push({ id, label: meta.label, time: meta.time, size: await dirSize(path.join(backupDir(), id)) });
    } catch {
      /* ignore broken backup */
    }
  }
  return out;
});

ipcMain.handle('backup:restore', async (_e, id) => {
  const src = path.join(backupDir(), String(id).replace(/[^0-9]/g, ''), 'data');
  if (!fs.existsSync(src)) return false;
  await fsp.rm(dataDir(), { recursive: true, force: true });
  await copyDir(src, dataDir());
  return true;
});

ipcMain.handle('backup:remove', async (_e, id) => fsp.rm(path.join(backupDir(), String(id).replace(/[^0-9]/g, '')), { recursive: true, force: true }));
ipcMain.handle('backup:open', async () => {
  await fsp.mkdir(backupDir(), { recursive: true });
  await shell.openPath(backupDir());
});
ipcMain.handle('app:dataPath', () => userData());

/* ---------------------------- 窗口 ---------------------------- */

ipcMain.handle('window:setFullscreen', (_e, on) => win && win.setFullScreen(!!on));
ipcMain.handle('window:isFullscreen', () => !!(win && win.isFullScreen()));
ipcMain.handle('window:setSize', (_e, w, h) => {
  if (!win) return;
  const area = screen.getPrimaryDisplay().workAreaSize;
  win.setFullScreen(false);
  win.setSize(Math.min(Number(w) || 1280, area.width), Math.min(Number(h) || 720, area.height));
  win.center();
});
ipcMain.handle('window:quit', () => app.quit());

/* ---------------------------- 文件 ---------------------------- */

ipcMain.handle('file:save', async (_e, name, content) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), String(name)) });
  if (r.canceled || !r.filePath) return false;
  await fsp.writeFile(r.filePath, String(content), 'utf8');
  return true;
});
ipcMain.handle('file:open', async (_e, filters) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: filters || [] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  const st = await fsp.stat(p);
  if (st.size > 20 * 1024 * 1024) throw new Error('文件过大');
  return { name: path.basename(p), content: await fsp.readFile(p, 'utf8') };
});

/* ---------------------------- 原版资源导入 ---------------------------- */
// 公开安装包不含任何原版素材；玩家可选择自己合法持有的《植物大战僵尸》安装包或游戏目录，
// 由导入器在本机生成资源包（保存在用户数据目录），游戏随即切换为经典美术风格。

const assetsDir = () => path.join(userData(), 'pvz-assets');

function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

ipcMain.handle('assets:status', () => {
  const m = readManifest(assetsDir());
  const b = readManifest(path.join(DIST, 'pvz'));
  const src = m || b;
  return { imported: !!m, bundled: !!b, source: src ? src.source : '', importedAt: src ? src.importedAt : '', bytes: src && src.stats ? src.stats.bytes : 0 };
});

ipcMain.handle('assets:pick', async (_e, kind) => {
  const r =
    kind === 'dir'
      ? await dialog.showOpenDialog(win, { title: '选择《植物大战僵尸》游戏目录（含 main.pak）', properties: ['openDirectory'] })
      : await dialog.showOpenDialog(win, { title: '选择《植物大战僵尸》安装包', properties: ['openFile'], filters: [{ name: '安装包 / 压缩包', extensions: ['exe', '7z', 'zip'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return r.filePaths[0];
});

ipcMain.handle('assets:import', (_e, source) => {
  const sevenZip = require('7zip-bin').path7za.replace('app.asar', 'app.asar.unpacked');
  const worker = utilityProcess.fork(path.join(__dirname, 'gen', 'import-worker.cjs'), [], { serviceName: 'pvz-import' });
  return new Promise((resolve) => {
    worker.on('message', (m) => {
      if (win && !win.isDestroyed()) win.webContents.send('assets:progress', m);
      if (m.type === 'done' || m.type === 'error') {
        worker.kill();
        log('asset import', m.type, m.text || '');
        resolve(m);
      }
    });
    worker.on('exit', (code) => resolve({ type: 'error', text: `导入进程意外退出（${code}）` }));
    worker.postMessage({ source: String(source), outDir: assetsDir(), tempDir: path.join(app.getPath('temp'), 'pvz-import'), sevenZip });
  });
});

ipcMain.handle('assets:remove', async () => {
  await fsp.rm(assetsDir(), { recursive: true, force: true });
  return true;
});

ipcMain.handle('app:reload', () => win && win.webContents.reload());

/* ---------------------------- 自动更新 ---------------------------- */

let updater = null;
let updateVerified = false;
function sendUpdate(s) {
  if (win && !win.isDestroyed()) win.webContents.send('update:status', s);
}
// 本地研究构建（内置原版素材）不接入公开的更新源，避免被替换成不含素材的公开版本
const researchBuild = (() => {
  try {
    return !!require('../package.json').researchBuild;
  } catch {
    return false;
  }
})();
const updateSig = require('./update-signature.cjs');
const updatePublicKey = updateSig.loadPublicKey();

// app-update.yml 由 electron-builder 写入：发布源，以及（使用代码签名证书时）发布者名称
function readUpdateConfig() {
  try {
    const t = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
    const get = (k) => (t.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1];
    const pub = t.match(/^publisherName:\s*\n((?:\s+-\s*.+\n?)+)/m);
    return {
      provider: get('provider') || 'github',
      url: get('url') || null,
      owner: get('owner') || 'xhc144',
      repo: get('repo') || 'prism-wardens',
      publisherName: pub ? pub[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean) : null,
    };
  } catch {
    return { provider: 'github', url: null, owner: 'xhc144', repo: 'prism-wardens', publisherName: null };
  }
}

// 下载完成后、标记为可安装之前，校验发布者的 Ed25519 签名（<安装包>.sig 随 Release 发布）
async function verifyUpdateSignature(file, info) {
  if (!updatePublicKey) return '缺少发布者公钥，拒绝安装更新';
  if (!info) return '缺少更新信息，无法校验签名';
  const installer = info.files && info.files.find((f) => /\.exe$/i.test(String(f.url)));
  const fileName = path.basename(String((installer && installer.url) || info.path || ''));
  const cfg = readUpdateConfig();
  const sigName = `${encodeURIComponent(fileName)}.sig`;
  const url =
    cfg.provider === 'generic' && cfg.url
      ? `${cfg.url.replace(/^['"]|['"]$/g, '').replace(/\/$/, '')}/${sigName}`
      : `https://github.com/${cfg.owner}/${cfg.repo}/releases/download/v${info.version}/${sigName}`;
  sendUpdate({ status: 'verifying', version: info.version });
  let doc;
  try {
    const r = await net.fetch(url);
    if (!r.ok) return `无法获取更新签名（HTTP ${r.status}）`;
    doc = await r.json();
  } catch (e) {
    return `无法获取更新签名：${(e && e.message) || e}`;
  }
  const err = await updateSig.verifyFile(file, { version: info.version, fileName }, doc, updatePublicKey);
  log('update signature', info.version, err || 'ok');
  return err;
}

function getUpdater() {
  if (!app.isPackaged || researchBuild || !updatePublicKey) return null;
  if (updater) return updater;
  try {
    const candidate = require('electron-updater').autoUpdater;
    if (['verifySignature', 'dispatchUpdateDownloaded', 'addQuitHandler'].some((k) => typeof candidate[k] !== 'function')) {
      log('updater: signature verification hooks not found, automatic updates disabled');
      return null;
    }
    updater = candidate;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.disableWebInstaller = true;
    updater.logger = { info: (m) => log('updater', m), warn: (m) => log('updater warn', m), error: (m) => log('updater error', m), debug: () => {} };
    let offered = null;
    // 在 electron-updater 自身的 Authenticode 校验之后追加 Ed25519 校验；任一失败都会删除下载的文件并报错
    const authenticode = updater.verifySignature;
    updater.verifySignature = async (file) => (await authenticode.call(updater, file)) || verifyUpdateSignature(file, offered);
    // electron-updater 会复用下载缓存，缓存命中时不调用 NSIS 的 verifySignature。
    // 因此在任何“下载完成”通知及退出安装前再校验最终文件，缓存也不能绕过签名。
    const downloaded = updater.dispatchUpdateDownloaded;
    updater.dispatchUpdateDownloaded = (event) => {
      updateVerified = false;
      updater.autoInstallOnAppQuit = false;
      updater.verifySignature(event.downloadedFile).then(async (err) => {
        if (err) {
          const e = new Error(`更新签名校验失败：${err}`);
          e.code = 'ERR_UPDATER_INVALID_SIGNATURE';
          throw e;
        }
        updateVerified = true;
        updater.autoInstallOnAppQuit = true;
        downloaded.call(updater, event);
        updater.addQuitHandler();
      }).catch(async (e) => {
        updateVerified = false;
        updater.autoInstallOnAppQuit = false;
        await updater.downloadedUpdateHelper?.clear().catch(() => {});
        updater.emit('error', e);
      });
    };
    updater.on('checking-for-update', () => sendUpdate({ status: 'checking' }));
    updater.on('update-available', (i) => {
      offered = i;
      updateVerified = false;
      updater.autoInstallOnAppQuit = false;
      sendUpdate({ status: 'available', version: i.version });
    });
    updater.on('update-not-available', () => sendUpdate({ status: 'not-available' }));
    updater.on('download-progress', (p) => sendUpdate({ status: 'downloading', percent: p.percent }));
    updater.on('update-downloaded', (i) => sendUpdate({ status: 'downloaded', version: i.version }));
    updater.on('error', (e) => {
      log('updater', e && e.message);
      sendUpdate(updateError(e));
    });
  } catch (e) {
    log('updater load failed', e && e.message);
    updater = null;
  }
  return updater;
}
function updateError(e) {
  const emptyFeed = e && e.code === 'ERR_XML_MISSED_ELEMENT' && e.message === 'No published versions on GitHub';
  // GitHub 的 Atom feed 也包含仅有标签的条目；没有正式 Release 时 /releases/latest
  // 可能返回 406，依赖会把“无法找到正式版本”再包装为 INVALID_RELEASE_FEED。
  const unpublished = e && e.code === 'ERR_UPDATER_INVALID_RELEASE_FEED' &&
    String(e.message).includes('Unable to find latest version on GitHub') &&
    String(e.message).includes('please ensure a production release exists');
  if (emptyFeed || unpublished || ['ERR_UPDATER_CHANNEL_FILE_NOT_FOUND', 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS'].includes(e && e.code)) {
    return { status: 'manual', message: '发布页尚未提供可验证的自动更新，请从 GitHub Releases 下载新版本手动安装。' };
  }
  return { status: 'error', message: String((e && e.message) || e) };
}
ipcMain.handle('update:check', async () => {
  const u = getUpdater();
  if (!u) return { status: 'disabled' };
  try {
    const r = await u.checkForUpdates();
    const v = r && r.updateInfo && r.updateInfo.version;
    return r && r.isUpdateAvailable && v ? { status: 'available', version: v } : { status: 'not-available' };
  } catch (e) {
    return updateError(e);
  }
});
ipcMain.handle('update:download', async () => {
  const u = getUpdater();
  if (u) await u.downloadUpdate();
});
ipcMain.handle('update:info', () => ({
  enabled: !!getUpdater(),
  signature: !!updatePublicKey,
  publisherName: app.isPackaged ? readUpdateConfig().publisherName : null,
}));
ipcMain.handle('update:install', () => {
  const u = getUpdater();
  if (u && updateVerified) u.quitAndInstall(false, true);
});

/* ---------------------------- 启动 ---------------------------- */

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(keyFile('settings'), 'utf8'));
  } catch {
    return {};
  }
}

function createWindow() {
  const s = readSettings();
  const [w, h] = String(s.resolution || '1280x720').split('x').map(Number);
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(w || 1280, area.width),
    height: Math.min(h || 720, area.height),
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b1024',
    title: '棱镜守卫 Prism Wardens',
    show: false,
    fullscreen: !!s.fullscreen,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      additionalArguments: [`--prism-version=${app.getVersion()}`],
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !(isDev && url.startsWith(process.env.PRISM_DEV_URL))) e.preventDefault();
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    if (input.type === 'keyDown' && input.key === 'F12' && (!app.isPackaged || process.env.PRISM_DEVTOOLS)) win.webContents.toggleDevTools();
  });
  win.webContents.on('render-process-gone', (_e, d) => log('renderer gone', JSON.stringify(d)));
  if (isDev) win.loadURL(process.env.PRISM_DEV_URL);
  else win.loadURL('app://bundle/index.html');
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    // 玩家导入的原版资源优先于安装包内的资源
    if (rel.startsWith('/pvz/') && fs.existsSync(path.join(assetsDir(), 'manifest.json'))) {
      const af = path.normalize(path.join(assetsDir(), rel.slice(5)));
      if (!af.startsWith(assetsDir())) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(af).toString());
    }
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  // 自动更新端到端测试（CI）：检查 → 下载 → 校验 → 静默安装，结果写入日志
  if (process.env.PRISM_UPDATE_E2E === '1') {
    const u = getUpdater();
    if (u) {
      u.on('update-downloaded', (i) => {
        log('e2e update-downloaded', i.version);
        setTimeout(() => u.quitAndInstall(true, false), 500);
      });
      u.on('error', (e) => log('e2e update-error', e && (e.code || e.message)));
      u.checkForUpdates()
        .then((r) => (r && r.updateInfo.version !== app.getVersion() ? u.downloadUpdate() : log('e2e no-update')))
        .catch((e) => log('e2e update-error', e && (e.code || e.message)));
    }
    return;
  }
  // 启动后静默检查更新（只通知，不自动下载）
  setTimeout(() => {
    const u = getUpdater();
    if (u) u.checkForUpdates().catch((e) => log('update check', e && e.message));
  }, 8000);
});

app.on('window-all-closed', () => app.quit());
