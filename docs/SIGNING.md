# 自动更新与签名

桌面版有两层相互独立的签名：

| | Ed25519 更新签名 | Windows Authenticode 代码签名 |
| --- | --- | --- |
| 作用 | 保证自动更新下载的安装包确实来自发布者、未被篡改、版本号未被冒充 | 让 Windows / SmartScreen 显示发布者名称，减少“未知发布者”警告；更新时 electron-updater 额外校验发布者 |
| 需要 | 一对 Ed25519 密钥（免费，已生成，公钥在 `electron/update-public-key.pem`） | 代码签名证书（需要向证书机构购买，或使用 Azure Trusted Signing） |
| 状态 | 客户端强制校验；配对私钥可用时发布签名更新，否则仅发布手动安装包，不发布 `latest.yml` | 配置证书后自动启用；未配置时安装包不带 Authenticode 签名 |

## 自动更新流程

1. 启动 8 秒后静默检查 GitHub Releases 上的 `latest.yml`；有新版本时在 **设置 → 关于与更新** 中提示。
2. 玩家点击下载：electron-updater 根据 blockmap 增量下载，并按 `latest.yml` 中的 SHA-512 校验完整性。
3. 下载完成后、标记为可安装之前，依次校验：
   - Authenticode（仅当安装包使用证书签名时）：签名者必须与当前版本的发布者一致；
   - Ed25519：从同一个 Release 获取 `<安装包>.sig`，用应用内置的公钥校验。签名覆盖“版本号 + 文件名 + SHA-512”，因此既不能篡改安装包，也不能把旧版本的合法安装包冒充为新版本。
   任何一项失败都会删除下载的文件并显示“更新失败”，不会安装。
4. 点击“重启并安装”，或在退出游戏时自动静默安装。原版素材、存档与设置保存在用户目录，更新不会影响它们。

缓存文件在发送“下载完成”通知前也会重新验证，验证完成前不允许手动或退出安装。缺少内置公钥或校验钩子时关闭自动更新；没有公开更新清单时，界面提示从 Releases 手动下载安装，不把“没有清单”当成“已是最新版”。便携 ZIP 的升级方式为手动下载解压。

Ed25519 校验是对 Authenticode 的补充：electron-updater 在 PowerShell 无法执行时会跳过 Authenticode 校验，而 Ed25519 校验在应用内部用 Node.js 完成，不依赖外部程序。

## 发布者需要配置的仓库机密

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中添加：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `UPDATE_SIGNING_KEY` | Secret（签名更新必需） | Ed25519 私钥 PEM 全文（`-----BEGIN PRIVATE KEY-----` 开头）。与 `electron/update-public-key.pem` 配对；没有时仍可发布手动安装包 |
| `WIN_CSC_LINK` | Secret（可选） | PFX 代码签名证书：base64 编码的 `.pfx` 内容或可下载的 HTTPS 链接 |
| `WIN_CSC_KEY_PASSWORD` | Secret（可选） | PFX 密码 |
| `AZURE_TENANT_ID`、`AZURE_CLIENT_ID`、`AZURE_CLIENT_SECRET` | Secret（可选） | Azure Trusted Signing 的服务主体 |
| `AZURE_SIGN_ENDPOINT`、`AZURE_SIGN_ACCOUNT`、`AZURE_SIGN_PROFILE`、`AZURE_SIGN_PUBLISHER` | Variable（可选） | Azure Trusted Signing 的端点、账户名、证书配置名、发布者名称（证书主题的 CN） |

PFX 与 Azure Trusted Signing 二选一，同时配置时使用 PFX。

## 密钥管理

- 生成新密钥：`npm run update-key -- <私钥输出路径>`。公钥写入 `electron/update-public-key.pem`（提交到仓库），私钥只放进上面的机密，**不要提交**（`.gitignore` 已忽略 `update-signing-key.pem` 与 `*.pfx`）。
- 手动签名 / 校验：`UPDATE_SIGNING_KEY="$(cat key.pem)" node scripts/update-signature.mjs sign <安装包> [版本]`、`node scripts/update-signature.mjs verify <安装包> [版本]`。
- **更换密钥**会让已经安装的旧版本拒绝之后用新密钥签名的更新。必须更换时，先用旧私钥发布一个内置新公钥的版本，等用户更新到该版本后再切换私钥。
- 私钥泄露的影响：攻击者还需要控制 GitHub Release 才能推送恶意更新；发现泄露应立即按上一条轮换密钥。
- 更换 Authenticode 证书时，如果新证书的发布者名称（CN）不同，旧版本会拒绝新版本的更新；在 `win.signtoolOptions.publisherName` 中同时列出新旧名称可以平滑过渡。

## 验证

- 单元测试 `tests/update-signature.test.ts`：签名与校验、篡改内容、冒充版本号、错误密钥、electron-builder 钩子。
- 发布工作流：打包后用仓库内的公钥校验 `.sig`（确认私钥与公钥配对）；配置证书时校验安装包与主程序的 Authenticode 状态为 Valid。
- CI 的自动更新端到端测试 `scripts/test-update-e2e.ps1`（Windows）：用临时证书与临时密钥构建 1.0.0 与 1.0.1，安装 1.0.0，本机 HTTP 服务器模拟发布源；先提供伪造签名的 1.0.1，确认更新被拒绝、版本不变，再提供正确签名的 1.0.1，确认下载、双重校验、静默安装后版本变为 1.0.1。
- 上述完整夹具会创建测试密钥并在临时 runner 信任测试证书，现仅在手动运行 CI 并明确选择 `run_signed_update_fixture` 时执行。日常 CI/Release 不创建凭据、不改认证或仓库权限。`tests/updater.test.ts` 使用模拟接口覆盖缺公钥、缺校验钩子、旧版本误报、缺更新清单、缓存签名拒绝及安装安全门；密码学单元测试使用进程内临时测试数据，不用于认证或生产发布。
