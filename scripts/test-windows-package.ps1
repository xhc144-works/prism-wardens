# 只运行本次从仓库源码构建的安装包；不执行第三方游戏安装程序。
$ErrorActionPreference = 'Stop'
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$setup = Get-Item "release/PrismWardens-Setup-$version.exe"
$dir = Join-Path $env:LOCALAPPDATA 'Programs\Prism Wardens'
$exe = Join-Path $dir 'Prism Wardens.exe'
$p = Start-Process -FilePath $setup.FullName -ArgumentList '/S', '/currentuser' -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "安装程序退出码 $($p.ExitCode)" }
for ($i = 0; $i -lt 300 -and -not (Test-Path $exe); $i++) { Start-Sleep 1 }
if (-not (Test-Path $exe)) { throw "安装后找不到 $exe" }
$installed = (Get-Item $exe).VersionInfo.ProductVersion
if ($installed -notin @($version, "$version.0")) { throw "已安装版本 $installed，期望 $version" }
$reg = $null
for ($i = 0; $i -lt 60 -and -not $reg; $i++) {
  $reg = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Get-ItemProperty | Where-Object { $_.DisplayName -like '*Prism Wardens*' }
  if (-not $reg) { Start-Sleep 1 }
}
if (-not $reg) { throw '找不到卸载注册表项' }
if ($reg.DisplayVersion -ne $version) { throw "注册表版本 $($reg.DisplayVersion)，期望 $version" }
Write-Host "已安装并校验 $installed；卸载项 $($reg.DisplayName)"
if ($env:CSC_LINK -or $env:AZURE_SIGN_ENDPOINT) {
  foreach ($file in @($setup.FullName, $exe)) {
    $sig = Get-AuthenticodeSignature -LiteralPath $file
    if ($sig.Status -ne 'Valid') { throw "Authenticode 校验失败：$file ($($sig.Status))" }
    Write-Host "Authenticode Valid：$($sig.SignerCertificate.Subject)"
  }
}
node scripts/test-installed-app.mjs $exe
if ($LASTEXITCODE) { throw '已安装应用的渲染、原生接口或 GitHub 更新检查失败' }
Start-Process -FilePath (Join-Path $dir 'Uninstall Prism Wardens.exe') -ArgumentList '/S' -Wait
for ($i = 0; $i -lt 60 -and (Test-Path $exe); $i++) { Start-Sleep 1 }
if (Test-Path $exe) { throw '卸载后程序文件仍存在' }
Write-Host '发布安装包：安装、版本、注册表、启动、卸载验证通过'
