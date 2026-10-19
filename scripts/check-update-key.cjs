'use strict';
const { createPrivateKey, createPublicKey } = require('node:crypto');
const { loadPublicKey } = require('../electron/update-signature.cjs');

// 只在内存中比较公钥；不导出、写入或记录生产私钥。
function matchesPublicKey(privatePem, publicPem) {
  try {
    const key = createPrivateKey(privatePem);
    const expected = createPublicKey(publicPem);
    return key.asymmetricKeyType === 'ed25519' && expected.asymmetricKeyType === 'ed25519' &&
      createPublicKey(key).export({ type: 'spki', format: 'der' }).equals(expected.export({ type: 'spki', format: 'der' }));
  } catch { return false; }
}
if (require.main === module) {
  if (!process.env.UPDATE_SIGNING_KEY) {
    console.error('缺少 UPDATE_SIGNING_KEY：本次签名更新发布已停止，现有版本不受影响。');
    process.exitCode = 1;
  } else if (!matchesPublicKey(process.env.UPDATE_SIGNING_KEY, loadPublicKey())) {
    console.error('UPDATE_SIGNING_KEY 无效或不匹配内置 Ed25519 公钥；拒绝更换信任密钥或发布不可升级版本。');
    process.exitCode = 1;
  } else console.log('生产更新密钥与内置 Ed25519 公钥匹配（未导出私钥）。');
}
module.exports = { matchesPublicKey };
