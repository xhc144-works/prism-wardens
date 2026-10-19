import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createPublicKey } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sig = require('../electron/update-signature.cjs');
const afterAll = require('../scripts/electron-builder-after-all.cjs');

function tmpFile(name: string, bytes = 200_000) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-sig-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from(Array.from({ length: bytes }, (_, i) => (i * 31) & 255)));
  return file;
}

describe('更新签名（Ed25519）', () => {
  const keys = sig.generateKeyPair();
  const name = 'PrismWardens-Setup-1.2.3.exe';

  it('签名后可以用公钥校验通过', async () => {
    const file = tmpFile(name);
    const doc = await sig.signFile(file, '1.2.3', keys.privateKey);
    expect(await sig.verifyFile(file, { version: '1.2.3', fileName: name }, doc, keys.publicKey)).toBeNull();
  });

  it('安装包被篡改、版本或文件名不符、密钥不符时拒绝', async () => {
    const file = tmpFile(name);
    const doc = await sig.signFile(file, '1.2.3', keys.privateKey);
    const other = sig.generateKeyPair();
    expect(await sig.verifyFile(file, { version: '1.2.4', fileName: name }, doc, keys.publicKey)).toMatch(/版本/);
    expect(await sig.verifyFile(file, { version: '1.2.3', fileName: 'x.exe' }, doc, keys.publicKey)).toMatch(/文件/);
    expect(await sig.verifyFile(file, { version: '1.2.3', fileName: name }, doc, other.publicKey)).toMatch(/签名无效/);
    // 伪造者改写签名文件里的版本号：签名覆盖版本号，因此同样失败
    expect(await sig.verifyFile(file, { version: '9.9.9', fileName: name }, { ...doc, version: '9.9.9' }, keys.publicKey)).toMatch(/签名无效/);
    fs.appendFileSync(file, 'x');
    expect(await sig.verifyFile(file, { version: '1.2.3', fileName: name }, doc, keys.publicKey)).toMatch(/内容/);
    expect(await sig.verifyFile(file, { version: '1.2.3', fileName: name }, null, keys.publicKey)).toMatch(/格式/);
  });

  it('仓库内置的公钥是有效的 Ed25519 公钥', () => {
    const pem = sig.loadPublicKey();
    expect(pem).toBeTruthy();
    expect(createPublicKey(pem).asymmetricKeyType).toBe('ed25519');
  });

  it('electron-builder 钩子为安装包生成 .sig，未配置私钥时跳过', async () => {
    const version = require('../package.json').version;
    const file = tmpFile(`PrismWardens-Setup-${version}.exe`);
    const zip = tmpFile(`PrismWardens-${version}-x64.zip`);
    const old = process.env.UPDATE_SIGNING_KEY;
    try {
      delete process.env.UPDATE_SIGNING_KEY;
      expect(await afterAll({ artifactPaths: [file, zip] })).toEqual([]);
      process.env.UPDATE_SIGNING_KEY = keys.privateKey;
      expect(await afterAll({ artifactPaths: [file, zip] })).toEqual([`${file}.sig`]);
      const doc = JSON.parse(fs.readFileSync(`${file}.sig`, 'utf8'));
      expect(await sig.verifyFile(file, { version, fileName: path.basename(file) }, doc, keys.publicKey)).toBeNull();
    } finally {
      if (old === undefined) delete process.env.UPDATE_SIGNING_KEY;
      else process.env.UPDATE_SIGNING_KEY = old;
    }
  });
});
