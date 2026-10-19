/* 更新包的 Ed25519 签名：发布时用私钥签名安装包，桌面版用内置公钥校验后才允许安装。
 * 与 Windows Authenticode 代码签名相互独立：没有购买代码签名证书时，更新同样受到保护。 */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SIG_VERSION = 1;
const PUBLIC_KEY_FILE = path.join(__dirname, 'update-public-key.pem');

/** 签名覆盖的内容：版本号 + 文件名 + SHA-512，防止把旧版本的合法安装包冒充为新版本 */
function updateMessage(version, fileName, sha512) {
  return Buffer.from(`prism-wardens-update/v${SIG_VERSION}\n${version}\n${fileName}\n${sha512}`, 'utf8');
}

function sha512File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha512');
    fs.createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('base64')));
  });
}

function loadPublicKey(file = PUBLIC_KEY_FILE) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

async function signFile(file, version, privateKeyPem, fileName = path.basename(file)) {
  const sha512 = await sha512File(file);
  const sig = crypto.sign(null, updateMessage(version, fileName, sha512), crypto.createPrivateKey(privateKeyPem));
  return { v: SIG_VERSION, version, file: fileName, sha512, sig: sig.toString('base64') };
}

/** 返回 null 表示通过，否则返回失败原因 */
async function verifyFile(file, expected, sigDoc, publicKeyPem) {
  if (!sigDoc || sigDoc.v !== SIG_VERSION || typeof sigDoc.sig !== 'string') return '签名文件格式无效';
  if (sigDoc.version !== expected.version) return `签名对应版本 ${sigDoc.version}，期望 ${expected.version}`;
  if (sigDoc.file !== expected.fileName) return `签名对应文件 ${sigDoc.file}，期望 ${expected.fileName}`;
  const sha512 = await sha512File(file);
  if (sha512 !== sigDoc.sha512) return '安装包内容与签名不符';
  let ok = false;
  try {
    ok = crypto.verify(null, updateMessage(sigDoc.version, sigDoc.file, sha512), crypto.createPublicKey(publicKeyPem), Buffer.from(sigDoc.sig, 'base64'));
  } catch (e) {
    return `签名校验出错：${e.message}`;
  }
  return ok ? null : '签名无效（不是由发布者的密钥签名）';
}

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

module.exports = { PUBLIC_KEY_FILE, updateMessage, sha512File, loadPublicKey, signFile, verifyFile, generateKeyPair };
