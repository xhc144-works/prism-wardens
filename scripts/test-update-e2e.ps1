# 自动更新端到端测试（Windows）：
#   1. 生成临时的代码签名证书（导入受信任根）和临时的 Ed25519 更新密钥；
#   2. 用它们构建 1.0.0（旧）与 1.0.1（新）两个经过 Authenticode 签名的安装包，更新源指向本机 HTTP 服务器；
#   3. 安装旧版本 → 提供被篡改签名的新版本 → 确认更新被拒绝、版本不变；
#   4. 提供正确签名的新版本 → 确认下载、双重签名校验、静默安装后版本变为新版本 → 卸载。
# 需要先 npm run build。只在 CI 的临时环境中运行：它会改写 electron/update-public-key.pem 并信任一个临时证书。
$ErrorActionPreference = 'Stop'
$port = 8765
$feed = "http://127.0.0.1:$port/"
$work = Join-Path $env:RUNNER_TEMP 'update-e2e'
if (-not $env:RUNNER_TEMP) { throw '只在 CI 中运行' }
New-Item -ItemType Directory -Force $work | Out-Null

Write-Host '== 临时代码签名证书 =='
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Prism Wardens CI Test' -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddDays(2)
$pfx = Join-Path $work 'ci-sign.pfx'
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password (ConvertTo-SecureString 'ci-test' -Force -AsPlainText) | Out-Null
$cer = Join-Path $work 'ci-sign.cer'
Export-Certificate -Cert $cert -FilePath $cer | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
$env:CSC_LINK = $pfx
$env:CSC_KEY_PASSWORD = 'ci-test'

Write-Host '== 临时 Ed25519 更新密钥 =='
node -e "const s=require('./electron/update-signature.cjs');const k=s.generateKeyPair();require('fs').writeFileSync('electron/update-public-key.pem',k.publicKey);require('fs').writeFileSync(process.argv[1],k.privateKey)" (Join-Path $work 'good.pem')
node -e "const s=require('./electron/update-signature.cjs');require('fs').writeFileSync(process.argv[1],s.generateKeyPair().privateKey)" (Join-Path $work 'evil.pem')

function Build($version, $out) {
  $env:UPDATE_SIGNING_KEY = Get-Content (Join-Path $work 'good.pem') -Raw
  # 在默认配置基础上只改版本号、输出目录与更新源（本机 HTTP 服务器）
  $cfg = Join-Path $work "builder-$version.json"
  node -e "const [v,o,u,f]=process.argv.slice(1);const b=require('./package.json').build;b.extraMetadata={version:v};b.directories={...b.directories,output:o};b.publish=[{provider:'generic',url:u}];require('fs').writeFileSync(f,JSON.stringify(b))" $version $out $feed $cfg
  npx electron-builder --win nsis --x64 --publish never --config $cfg
  if ($LASTEXITCODE) { throw "构建 $version 失败" }
}
Build '1.0.0' (Join-Path $work 'old')
Build '1.0.1' (Join-Path $work 'new')

Write-Host '== 校验 Authenticode 签名 =='
$oldSetup = Get-ChildItem (Join-Path $work 'old') -Filter 'PrismWardens-Setup-*.exe' | Select-Object -First 1
$newSetup = Get-ChildItem (Join-Path $work 'new') -Filter 'PrismWardens-Setup-*.exe' | Select-Object -First 1
foreach ($f in @($oldSetup.FullName, $newSetup.FullName, (Join-Path $work 'old\win-unpacked\Prism Wardens.exe'))) {
  $s = Get-AuthenticodeSignature -LiteralPath $f
  Write-Host "$(Split-Path $f -Leaf): $($s.Status) / $($s.SignerCertificate.Subject) / 时间戳 $([bool]$s.TimeStamperCertificate)"
  if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -ne 'CN=Prism Wardens CI Test') { throw "签名无效：$f" }
}
Get-Content (Join-Path $work 'old\win-unpacked\resources\app-update.yml')

Write-Host '== 安装旧版本 1.0.0 =='
$dir = Join-Path $env:LOCALAPPDATA 'Programs\Prism Wardens'
$exe = Join-Path $dir 'Prism Wardens.exe'
$p = Start-Process -FilePath $oldSetup.FullName -ArgumentList '/S', '/currentuser' -Wait -PassThru
Write-Host "安装程序退出码: $($p.ExitCode)"
for ($i = 0; $i -lt 300 -and -not (Test-Path $exe); $i++) { Start-Sleep 1 }
if (-not (Test-Path $exe)) { throw '旧版本安装失败' }
Start-Sleep 3
Write-Host "已安装版本: $((Get-Item $exe).VersionInfo.ProductVersion)"
$logFile = Join-Path $env:APPDATA 'Prism Wardens\logs\main.log'

function Serve($dirToServe) {
  $srv = Start-Process node -ArgumentList 'scripts/serve-dir.mjs', "`"$dirToServe`"", $port -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $work "serve-$(Split-Path $dirToServe -Leaf).log")
  Start-Sleep 2
  return $srv
}
function RunApp($pattern, $seconds) {
  if (Test-Path $logFile) { Remove-Item $logFile }
  $env:PRISM_UPDATE_E2E = '1'
  $app = Start-Process -FilePath $exe -PassThru
  $env:PRISM_UPDATE_E2E = $null
  for ($i = 0; $i -lt $seconds; $i++) {
    Start-Sleep 1
    if ((Test-Path $logFile) -and (Select-String -LiteralPath $logFile -Pattern $pattern -Quiet)) { break }
  }
  return $app
}
function FeedFrom($src, $name) {
  $d = Join-Path $work $name
  New-Item -ItemType Directory -Force $d | Out-Null
  Copy-Item (Join-Path $src 'latest.yml'), (Join-Path $src '*.exe'), (Join-Path $src '*.blockmap'), (Join-Path $src '*.sig') $d
  # 旧版本的 blockmap 让 electron-updater 可以做增量下载
  Copy-Item (Join-Path $work 'old\*.blockmap') $d
  return $d
}

Write-Host '== 1. 更新签名被篡改：必须拒绝 =='
$bad = FeedFrom (Join-Path $work 'new') 'feed-bad'
$sigFile = Join-Path $bad "$($newSetup.Name).sig"
$env:UPDATE_SIGNING_KEY = Get-Content (Join-Path $work 'evil.pem') -Raw
node scripts/update-signature.mjs sign (Join-Path $bad $newSetup.Name) 1.0.1
if ($LASTEXITCODE) { throw '生成伪造签名失败' }
$srv = Serve $bad
$app = RunApp 'e2e update-error|e2e update-downloaded' 180
Start-Sleep 3
Get-Content $logFile | Select-String 'updater|e2e|signature' | ForEach-Object { Write-Host "  $_" }
Stop-Process -Id $srv.Id -Force
if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
Start-Sleep 3
if (-not (Select-String -LiteralPath $logFile -Pattern 'e2e update-error.*INVALID_SIGNATURE' -Quiet)) { throw '伪造签名的更新没有被拒绝' }
if (-not (Get-Item $exe).VersionInfo.ProductVersion.StartsWith('1.0.0')) { throw '伪造签名的更新被安装了' }
Write-Host '伪造签名的更新已被拒绝，版本仍为 1.0.0'

Write-Host '== 2. 正确签名：下载、校验并静默安装 =='
$good = FeedFrom (Join-Path $work 'new') 'feed-good'
$srv = Serve $good
$app = RunApp 'e2e update-error|e2e update-downloaded' 300
Get-Content $logFile | Select-String 'updater|e2e|signature' | ForEach-Object { Write-Host "  $_" }
if (-not (Select-String -LiteralPath $logFile -Pattern 'update signature 1.0.1 ok' -Quiet)) { throw '更新签名校验没有通过' }
if (Select-String -LiteralPath $logFile -Pattern 'fallback to full download' -Quiet) { throw '增量下载失败，退回了完整下载' }
$v = ''
for ($i = 0; $i -lt 300; $i++) {
  Start-Sleep 1
  if (Test-Path $exe) {
    try { $v = (Get-Item $exe).VersionInfo.ProductVersion } catch { $v = '' }
    if ($v.StartsWith('1.0.1')) { break }
  }
}
Stop-Process -Id $srv.Id -Force
Get-Content (Join-Path $work 'serve-feed-good.log') | ForEach-Object { Write-Host "  [feed] $_" }
if (-not $v.StartsWith('1.0.1')) { throw "更新后版本为 '$v'，期望 1.0.1" }
Write-Host '已从 1.0.0 自动更新到 1.0.1'

Write-Host '== 卸载 =='
for ($i = 0; $i -lt 60 -and -not (Test-Path (Join-Path $dir 'Uninstall Prism Wardens.exe')); $i++) { Start-Sleep 1 }
Start-Process -FilePath (Join-Path $dir 'Uninstall Prism Wardens.exe') -ArgumentList '/S' -Wait
for ($i = 0; $i -lt 60 -and (Test-Path $exe); $i++) { Start-Sleep 1 }
Remove-Item Cert:\LocalMachine\Root\$($cert.Thumbprint) -ErrorAction SilentlyContinue
Write-Host '自动更新端到端测试通过'
