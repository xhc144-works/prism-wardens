// 本地研究构建配置：在默认配置基础上保留 dist/pvz，并禁用发布与自动更新源。
const base = require('./package.json').build;

module.exports = {
  ...base,
  files: base.files.filter((f) => f !== '!dist/pvz/**'),
  directories: { ...base.directories, output: 'release-research' },
  win: { ...base.win, artifactName: 'PrismWardens-research-${version}-${arch}.${ext}' },
  nsis: { ...base.nsis, artifactName: 'PrismWardens-research-Setup-${version}.${ext}' },
  publish: null,
  extraMetadata: { researchBuild: true },
};
