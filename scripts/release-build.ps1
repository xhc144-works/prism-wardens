# 发布构建：按已配置的机密选择 Authenticode 签名方式，然后调用 electron-builder。
#   ./scripts/release-build.ps1 never|always
# - WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD（传入为 CSC_LINK / CSC_KEY_PASSWORD）：PFX 证书，electron-builder 自动签名
# - Azure Trusted Signing：AZURE_SIGN_ENDPOINT / ACCOUNT / PROFILE / PUBLISHER 变量 + AZURE_TENANT_ID / CLIENT_ID / CLIENT_SECRET 机密
# - UPDATE_SIGNING_KEY：Ed25519 更新签名私钥，由 afterAllArtifactBuild 钩子生成 .sig
param([ValidateSet('never', 'always')][string]$publish = 'never')
$ErrorActionPreference = 'Stop'
$ebArgs = @('electron-builder', '--win', '--x64', '--publish', $publish)
if (-not $env:CSC_LINK) { Remove-Item Env:CSC_LINK, Env:CSC_KEY_PASSWORD -ErrorAction SilentlyContinue }
if (-not $env:CSC_LINK -and $env:AZURE_SIGN_ENDPOINT) {
  $ebArgs += "-c.win.azureSignOptions.endpoint=$env:AZURE_SIGN_ENDPOINT"
  $ebArgs += "-c.win.azureSignOptions.codeSigningAccountName=$env:AZURE_SIGN_ACCOUNT"
  $ebArgs += "-c.win.azureSignOptions.certificateProfileName=$env:AZURE_SIGN_PROFILE"
  $ebArgs += "-c.win.azureSignOptions.publisherName=$env:AZURE_SIGN_PUBLISHER"
}
npx @ebArgs
if ($LASTEXITCODE) { throw "electron-builder 失败（退出码 $LASTEXITCODE）" }
