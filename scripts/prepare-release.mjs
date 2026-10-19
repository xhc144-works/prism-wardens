// 将同一份已经安装验证的产物发布；没有生产更新私钥时不发布更新清单。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const sig = require('../electron/update-signature.cjs');
const { version } = require('../package.json');
const setup = `PrismWardens-Setup-${version}.exe`;
const zip = `PrismWardens-${version}-x64.zip`;
const root = 'release';
const dest = path.join(root, 'publish');
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
const names = [setup, zip, `${setup}.blockmap`];
const signed = !!process.env.UPDATE_SIGNING_KEY;
if (signed) {
  const doc = JSON.parse(fs.readFileSync(path.join(root, `${setup}.sig`), 'utf8'));
  const err = await sig.verifyFile(path.join(root, setup), { version, fileName: setup }, doc, sig.loadPublicKey());
  if (err) throw new Error(`更新签名不匹配，拒绝发布：${err}`);
  const manifest = yaml.load(fs.readFileSync(path.join(root, 'latest.yml'), 'utf8'));
  if (manifest.version !== version || manifest.path !== setup) throw new Error('更新清单版本或安装包路径不符');
  if (manifest.sha512 !== await sig.sha512File(path.join(root, setup))) throw new Error('更新清单 SHA-512 不符');
  if (!manifest.files?.some((f) => f.url === setup)) throw new Error('更新清单缺少安装包');
  for (const f of manifest.files) {
    if (![setup, zip].includes(f.url)) throw new Error(`更新清单引用了非发布文件 ${f.url}`);
    if (f.sha512 !== await sig.sha512File(path.join(root, f.url))) throw new Error(`更新清单哈希不符 ${f.url}`);
  }
  names.push(`${setup}.sig`, 'latest.yml');
}
for (const name of names) fs.copyFileSync(path.join(root, name), path.join(dest, name));
const sums = names.map((name) => `${createHash('sha256').update(fs.readFileSync(path.join(dest, name))).digest('hex')}  ${name}`).join('\n') + '\n';
fs.writeFileSync(path.join(dest, 'SHA256SUMS.txt'), sums);
const commit = process.env.GITHUB_SHA || 'local';
fs.writeFileSync(path.join(root, 'release-notes.md'), `## Windows x64\n\n` +
  `- 安装版：[${setup}](https://github.com/xhc144/zwdzjs/releases/download/v${version}/${setup})。运行后按安装向导安装，可在 Windows 设置中卸载。\n` +
  `- 便携版：[${zip}](https://github.com/xhc144/zwdzjs/releases/download/v${version}/${zip})。解压全部文件后运行 Prism Wardens.exe；升级便携版请手动下载解压。\n` +
  `- 支持 Windows 10/11 64 位。Source code 压缩包不是安装包。\n` +
  `- 安装包已在 Windows CI 验证安装、版本、注册表、主窗口启动及卸载。SHA256SUMS.txt 供下载完整性核对。\n\n` +
  `## 更新与签名\n\n` +
  (signed ? `本次提供 Ed25519 签名、latest.yml 与 blockmap。客户端保留 SHA-512、发布者签名及已配置的 Authenticode 校验；真实 GitHub 发布源的跨版本升级需在后续版本验证。\n` :
    `本次未配置 UPDATE_SIGNING_KEY，提供手动安装包，未发布 latest.yml 或 .sig，自动下载安装升级尚未启用。客户端仍要求有效的 Ed25519 更新签名；后续发布者配置与内置公钥配对的原有私钥后可发布签名更新。不生成新密钥、不内嵌 token。\n`) +
  (process.env.CSC_LINK || process.env.AZURE_SIGN_ENDPOINT ? `已配置 Windows Authenticode 并验证签名有效。\n` : `未配置 Windows Authenticode 证书，系统可能提示“未知发布者”；请核对仓库和校验和。\n`) +
  `\n## 内容与来源\n\n包含完整游戏、AI、编辑器、录像与存档功能，默认使用程序生成的画面和音效。第三方原版游戏安装程序及其素材不在发布资产或此标签的源码文件树中；经典画面需玩家在本机导入合法副本。既有 Git 历史保留。\n\n构建提交：${commit}\n`);
console.log(`发布文件：${[...names, 'SHA256SUMS.txt'].join(', ')}；签名更新：${signed ? '已校验' : '未配置，不发布清单'}`);
