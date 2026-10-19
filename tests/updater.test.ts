import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
const require = createRequire(import.meta.url);

function desktop(options: { publicKey?: string | null; hooks?: boolean } = {}) {
  const handlers = new Map<string, (...args: any[]) => any>();
  const updater = Object.assign(new EventEmitter(), {
    verifySignature: vi.fn(async () => null as string | null),
    dispatchUpdateDownloaded: vi.fn((_event: any) => {}), addQuitHandler: vi.fn(),
    checkForUpdates: vi.fn(async () => ({ isUpdateAvailable: false, updateInfo: { version: '0.9.0' } })),
    quitAndInstall: vi.fn(), autoInstallOnAppQuit: false,
    downloadedUpdateHelper: { clear: vi.fn(async () => {}) },
  });
  if (options.hooks === false) (updater as any).verifySignature = undefined;
  const verifyFile = vi.fn(async () => null as string | null);
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ fixture: true }) }));
  const electron = {
    app: { isPackaged: true, requestSingleInstanceLock: () => true, getVersion: () => '1.0.0',
      getPath: () => '/tmp', on() {}, whenReady: () => ({ then() {} }) },
    protocol: { registerSchemesAsPrivileged() {} },
    ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler) },
    net: { fetch },
  };
  vm.runInNewContext(fs.readFileSync('electron/main.cjs', 'utf8'), {
    __dirname: '/workspace/zwdzjs/electron', process,
    require: (name: string) => {
      if (name === 'electron') return electron;
      if (name === 'electron-updater') return { autoUpdater: updater };
      if (name === './update-signature.cjs') return { loadPublicKey: () => options.publicKey === undefined ? 'fixture-public-key' : options.publicKey, verifyFile };
      if (name === '../package.json') return {};
      if (name === 'node:fs') return { ...fs, mkdirSync() {}, appendFileSync() {} };
      return require(name);
    },
  });
  return { updater, handlers, verifyFile, fetch };
}

describe('桌面自动更新的检查与安全门', () => {
  it('依赖更新器的版本判断，旧版本不会被错误显示为可更新', async () => {
    const { updater, handlers } = desktop();
    expect(await handlers.get('update:check')!()).toEqual({ status: 'not-available' });
    updater.checkForUpdates.mockResolvedValueOnce({ isUpdateAvailable: true, updateInfo: { version: '1.0.1' } });
    expect(await handlers.get('update:check')!()).toEqual({ status: 'available', version: '1.0.1' });
  });
  it('缺少公钥或校验钩子时禁用更新，禁止直接安装', async () => {
    for (const options of [{ publicKey: null }, { hooks: false }]) {
      const { updater, handlers } = desktop(options);
      expect(await handlers.get('update:check')!()).toEqual({ status: 'disabled' });
      handlers.get('update:install')!();
      expect(updater.quitAndInstall).not.toHaveBeenCalled();
    }
  });
  it('发布页没有更新清单时明确提示手动安装', async () => {
    const { updater, handlers } = desktop();
    for (const code of ['ERR_UPDATER_CHANNEL_FILE_NOT_FOUND', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS']) {
      updater.checkForUpdates.mockRejectedValueOnce(Object.assign(new Error('404'), { code }));
      expect(await handlers.get('update:check')!()).toMatchObject({ status: 'manual', message: expect.stringContaining('手动安装') });
    }
  });
  it('保留 Authenticode 校验，拒绝签名不符的缓存并禁止退出安装', async () => {
    const { updater, handlers, verifyFile } = desktop();
    const downloaded = updater.dispatchUpdateDownloaded;
    handlers.get('update:info')!();
    updater.emit('update-available', { version: '1.0.1', files: [{ url: 'PrismWardens-Setup-1.0.1.exe' }] });
    verifyFile.mockResolvedValue('无效签名');
    const error = new Promise<Error>((resolve) => updater.once('error', resolve));
    updater.dispatchUpdateDownloaded({ downloadedFile: '/tmp/cache.exe' } as any);
    expect((await error).message).toContain('无效签名');
    expect(updater.downloadedUpdateHelper.clear).toHaveBeenCalled();
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(downloaded).not.toHaveBeenCalled();
    handlers.get('update:install')!();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
  it('最终文件通过签名后才允许下载完成通知和安装', async () => {
    const { updater, handlers, verifyFile, fetch } = desktop();
    const downloaded = updater.dispatchUpdateDownloaded;
    const authenticode = updater.verifySignature;
    handlers.get('update:info')!();
    handlers.get('update:install')!();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updater.emit('update-available', { version: '1.0.1', files: [{ url: 'PrismWardens-1.0.1-x64.zip' }, { url: 'PrismWardens-Setup-1.0.1.exe' }] });
    updater.dispatchUpdateDownloaded({ downloadedFile: '/tmp/cache.exe' } as any);
    await vi.waitFor(() => expect(downloaded).toHaveBeenCalled());
    expect(authenticode).toHaveBeenCalledWith('/tmp/cache.exe');
    expect(verifyFile).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('https://github.com/xhc144/zwdzjs/releases/download/v1.0.1/PrismWardens-Setup-1.0.1.exe.sig');
    expect(updater.autoInstallOnAppQuit).toBe(true);
    handlers.get('update:install')!();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});
