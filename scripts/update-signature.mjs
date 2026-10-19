// 更新签名工具。
//   node scripts/update-signature.mjs keygen [私钥输出路径]   生成 Ed25519 密钥对：公钥写入 electron/update-public-key.pem
//   node scripts/update-signature.mjs sign <文件> [版本]       用环境变量 UPDATE_SIGNING_KEY（PEM）签名，写出 <文件>.sig
//   node scripts/update-signature.mjs verify <文件> [版本]     用仓库中的公钥校验 <文件>.sig
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sig = require('../electron/update-signature.cjs');
const pkgVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const [cmd, arg, version = pkgVersion] = process.argv.slice(2);

if (cmd === 'keygen') {
  const out = arg || 'update-signing-key.pem';
  if (fs.existsSync(sig.PUBLIC_KEY_FILE) && !process.argv.includes('--force')) {
    console.error(`${sig.PUBLIC_KEY_FILE} 已存在；更换密钥会让已安装的版本拒绝新签名的更新。确认要更换请加 --force`);
    process.exit(1);
  }
  const { publicKey, privateKey } = sig.generateKeyPair();
  fs.writeFileSync(sig.PUBLIC_KEY_FILE, publicKey);
  fs.writeFileSync(out, privateKey, { mode: 0o600 });
  console.log(`公钥：${sig.PUBLIC_KEY_FILE}（提交到仓库）`);
  console.log(`私钥：${path.resolve(out)}（不要提交；把文件内容保存为 GitHub 仓库机密 UPDATE_SIGNING_KEY）`);
} else if (cmd === 'sign') {
  const key = process.env.UPDATE_SIGNING_KEY;
  if (!key) throw new Error('缺少环境变量 UPDATE_SIGNING_KEY');
  const doc = await sig.signFile(arg, version, key);
  fs.writeFileSync(`${arg}.sig`, JSON.stringify(doc, null, 2));
  console.log(`已签名 ${arg}（版本 ${version}）`);
} else if (cmd === 'verify') {
  const pub = sig.loadPublicKey();
  if (!pub) throw new Error(`缺少公钥 ${sig.PUBLIC_KEY_FILE}`);
  const doc = JSON.parse(fs.readFileSync(`${arg}.sig`, 'utf8'));
  const err = await sig.verifyFile(arg, { version, fileName: path.basename(arg) }, doc, pub);
  if (err) {
    console.error(`校验失败：${err}`);
    process.exit(1);
  }
  console.log(`签名有效：${arg}（版本 ${version}）`);
} else {
  console.error('用法：update-signature.mjs keygen|sign|verify ...');
  process.exit(2);
}
