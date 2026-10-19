import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { version } from '../package.json';

it('没有生产更新私钥时发布手动安装文件，隔离清单和残留签名', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-release-'));
  try {
    const release = path.join(dir, 'release');
    fs.mkdirSync(release);
    const setup = `PrismWardens-Setup-${version}.exe`;
    const zip = `PrismWardens-${version}-x64.zip`;
    for (const name of [setup, zip, `${setup}.blockmap`, `${setup}.sig`, 'latest.yml', 'unrelated.exe']) fs.writeFileSync(path.join(release, name), 'test-fixture');
    execFileSync(process.execPath, [path.resolve('scripts/prepare-release.mjs')], { cwd: dir, env: { ...process.env, UPDATE_SIGNING_KEY: '' } });
    const names = fs.readdirSync(path.join(release, 'publish'));
    expect(names).toEqual([setup, `${setup}.blockmap`, zip, 'SHA256SUMS.txt'].sort());
    const notes = fs.readFileSync(path.join(release, 'release-notes.md'), 'utf8');
    expect(notes).toContain('自动下载安装升级尚未启用');
    expect(fs.readFileSync(path.join(release, 'publish', 'SHA256SUMS.txt'), 'utf8')).not.toContain('latest.yml');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

it('签名模式下不能把不匹配的版本或签名发布为可信更新', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-release-'));
  try {
    const release = path.join(dir, 'release');
    fs.mkdirSync(release);
    const setup = `PrismWardens-Setup-${version}.exe`;
    fs.writeFileSync(path.join(release, `${setup}.sig`), JSON.stringify({ v: 1, version: '0.0.1', file: setup, sig: 'invalid' }));
    expect(() => execFileSync(process.execPath, [path.resolve('scripts/prepare-release.mjs')], { cwd: dir,
      env: { ...process.env, UPDATE_SIGNING_KEY: 'test-presence-flag' }, stdio: 'pipe' })).toThrow();
    expect(fs.readdirSync(path.join(release, 'publish'))).toEqual([]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
