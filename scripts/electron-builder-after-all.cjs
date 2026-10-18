// electron-builder 的 afterAllArtifactBuild 钩子：为安装包生成 Ed25519 更新签名（<安装包>.sig），
// 返回的路径会作为额外文件随 Release 一起上传。没有配置私钥时只给出警告。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { signFile } = require('../electron/update-signature.cjs');

module.exports = async function afterAllArtifactBuild(result) {
  const key = process.env.UPDATE_SIGNING_KEY;
  const installers = result.artifactPaths.filter((p) => /Setup-.*\.exe$/i.test(path.basename(p)));
  if (!installers.length) return [];
  if (!key) {
    console.warn('  • 未设置 UPDATE_SIGNING_KEY，跳过更新签名（已安装的版本会拒绝没有签名的更新）');
    return [];
  }
  // 打包时可以用 -c.extraMetadata.version 覆盖版本号（自动更新测试会这样构建新旧两个版本）
  const version = (result.configuration && result.configuration.extraMetadata && result.configuration.extraMetadata.version) || require('../package.json').version;
  const out = [];
  for (const file of installers) {
    const doc = await signFile(file, version, key);
    fs.writeFileSync(`${file}.sig`, JSON.stringify(doc, null, 2));
    console.log(`  • 更新签名 ${path.basename(file)}.sig`);
    out.push(`${file}.sig`);
  }
  return out;
};
