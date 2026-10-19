# 只执行本仓库已发布且固定 SHA-256 的 1.0.2；不生成密钥/证书，不修改已安装程序和更新源。
param([Parameter(Mandatory=$true)][string]$TargetVersion)
$ErrorActionPreference = 'Stop'
if ($TargetVersion -notmatch '^\d+\.\d+\.\d+$' -or [version]$TargetVersion -le [version]'1.0.2') { throw '目标版本必须高于 1.0.2，格式为 x.y.z' }
if ($env:GITHUB_REPOSITORY -ne 'xhc144/prism-wardens' -or -not $env:RUNNER_TEMP) { throw '只在此仓库的 Actions 临时 runner 运行' }
$repo = $env:GITHUB_REPOSITORY
$private = gh api "repos/$repo" --jq '.private'
if ($LASTEXITCODE) { throw '无法确认仓库可见性' }
if ($private.Trim() -ne 'false') { throw '仓库为私有：1.0.2 的匿名 GitHub 更新源无法访问；拒绝给客户端注入凭据' }
$tag = "v$TargetVersion"
$latest = gh release view --repo $repo --json tagName,isDraft,isPrerelease | ConvertFrom-Json
if ($LASTEXITCODE -or $latest.tagName -ne $tag -or $latest.isDraft -or $latest.isPrerelease) { throw '目标必须是已经公开发布的最新正式版本' }
New-Item -ItemType Directory -Force 'release' | Out-Null
$work = Join-Path $env:RUNNER_TEMP 'published-update'
New-Item -ItemType Directory -Force $work | Out-Null
gh release download v1.0.2 --repo $repo --pattern 'PrismWardens-Setup-1.0.2.exe' --dir $work
if ($LASTEXITCODE) { throw '下载本仓库 1.0.2 安装包失败' }
$setup = Join-Path $work 'PrismWardens-Setup-1.0.2.exe'
$expectedHash = 'ca21e8c600b4a59ec69d1973eeda6fa8d7a1ecdd3e9d2838e07950272504398c'
if ((Get-FileHash -Algorithm SHA256 $setup).Hash.ToLowerInvariant() -ne $expectedHash) { throw '1.0.2 与已记录的发布安装包 SHA-256 不符，拒绝执行' }
$dir = Join-Path $env:LOCALAPPDATA 'Programs\Prism Wardens'
$exe = Join-Path $dir 'Prism Wardens.exe'
$data = Join-Path $env:APPDATA 'Prism Wardens'
$logFile = Join-Path $data 'logs\main.log'
$sentinel = Join-Path $data 'data\published-update-proof.json'
$marker = '{"purpose":"published-upgrade-preservation","from":"1.0.2"}'
$proof = [ordered]@{ from='1.0.2'; target=$TargetVersion; repository=$repo; baselineSHA256=$expectedHash; clientCredentials=$false; feedUnchanged=$false; publicKeyUnchanged=$false; signatureVerified=$false; downloaded=$false; installed=$false; dataPreserved=$false; uiPassed=$false; success=$false }
$appProcess = $null
try {
  $p = Start-Process -FilePath $setup -ArgumentList '/S', '/currentuser' -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "1.0.2 安装程序退出码 $($p.ExitCode)" }
  if (-not (Test-Path $exe) -or (Get-Item $exe).VersionInfo.ProductVersion -notin @('1.0.2','1.0.2.0')) { throw '起始安装版本不是 1.0.2' }
  # 验证历史二进制中的公钥与当前发布用公钥相同，不替换历史文件。
  node -e 'const fs=require("node:fs"),p=require("node:path"),c=require("node:crypto"),a=require("@electron/asar");const old=a.extractFile(p.join(process.argv[1],"resources/app.asar"),"electron/update-public-key.pem");const der=x=>c.createPublicKey(x).export({type:"spki",format:"der"});if(!der(old).equals(der(fs.readFileSync("electron/update-public-key.pem"))))process.exit(1);' $dir
  if ($LASTEXITCODE) { throw '历史已安装版本与仓库公钥不一致' }
  $proof.publicKeyUnchanged = $true
  $feedFile = Join-Path $dir 'resources\app-update.yml'
  $feedHash = (Get-FileHash -Algorithm SHA256 $feedFile).Hash
  $feed = Get-Content $feedFile -Raw
  if ($feed -notmatch '(?m)^repo: zwdzjs\s*$' -or $feed -match '(?m)^(token|private):') { throw '历史 1.0.2 更新源不符合已审计配置' }
  New-Item -ItemType Directory -Force (Split-Path $sentinel) | Out-Null
  [IO.File]::WriteAllText($sentinel, $marker)
  if (Test-Path $logFile) { Remove-Item $logFile }
  $start = [Diagnostics.ProcessStartInfo]::new($exe)
  $start.UseShellExecute = $false
  foreach ($name in @($start.Environment.Keys)) {
    if ($name -match '^(GH_|GITHUB_|ACTIONS_|RUNNER_|CSC_|WIN_CSC_|AZURE_)|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|^UPDATE_SIGNING_KEY$') { [void]$start.Environment.Remove($name) }
  }
  $start.Environment['PRISM_UPDATE_E2E'] = '1'
  if ((Get-FileHash -Algorithm SHA256 $feedFile).Hash -ne $feedHash) { throw '更新源被意外修改' }
  $proof.feedUnchanged = $true
  $appProcess = [Diagnostics.Process]::Start($start)
  for ($i = 0; $i -lt 600; $i++) {
    Start-Sleep 1
    if (Test-Path $logFile) {
      if (Select-String -LiteralPath $logFile -Pattern 'e2e update-error' -Quiet) { throw '真实 GitHub 更新失败，参阅过滤后的日志' }
    }
    if (Test-Path $exe) {
      try { $installed = (Get-Item $exe).VersionInfo.ProductVersion } catch { $installed = '' }
      if ($installed -in @($TargetVersion,"$TargetVersion.0")) { $proof.installed = $true; break }
    }
  }
  if (-not $proof.installed) { throw '等待真实下载及升级安装超时' }
  $proof.signatureVerified = [bool](Select-String -LiteralPath $logFile -SimpleMatch "update signature $TargetVersion ok" -Quiet)
  $proof.downloaded = [bool](Select-String -LiteralPath $logFile -SimpleMatch "e2e update-downloaded $TargetVersion" -Quiet)
  $proof.dataPreserved = (Test-Path $sentinel) -and ([IO.File]::ReadAllText($sentinel) -eq $marker)
  $proof.fullDownloadFallback = [bool](Select-String -LiteralPath $logFile -Pattern 'fallback to full download' -Quiet)
  if (-not ($proof.signatureVerified -and $proof.downloaded -and $proof.dataPreserved)) { throw '验签、下载完成或升级保留用户数据的证据缺失' }
  node scripts/test-installed-app.mjs $exe $TargetVersion
  if ($LASTEXITCODE) { throw '升级后主窗口、原生接口或更新检查验收失败' }
  $proof.uiPassed = $true
  $proof.success = $true
  Write-Host "真实 GitHub 升级通过：1.0.2 -> $TargetVersion；原公钥验签通过；用户数据保留；客户端无凭据"
} finally {
  if (Test-Path $logFile) {
    # 不上传原始日志；即使错误包含临时下载 URL，也不暴露其查询参数。
    $safe = Get-Content $logFile | Where-Object { $_ -match 'updater|e2e|signature' } | ForEach-Object { $_ -replace 'https?://[^\s"<>]+', '[download-url]' }
    $safe | Set-Content 'release/published-update-safe.log'
    $safe | Select-Object -Last 35 | ForEach-Object { Write-Host $_ }
  }
  $proof | ConvertTo-Json | Set-Content 'release/published-update-proof.json'
  if ($appProcess -and -not $appProcess.HasExited) { Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue }
  Get-Process -Name 'Prism Wardens' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  $uninstaller = Join-Path $dir 'Uninstall Prism Wardens.exe'
  if (Test-Path $uninstaller) { Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait }
}
