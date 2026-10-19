# Windows 发布审计（最终版本 1.0.2）

审计日期：2026-10-19，仓库 `xhc144/zwdzjs`，默认分支 `main`，公开可见性保持不变。

## 分支与历史

开始时仅有两个分支，无 PR、无标签、无 Release，17 次 Actions 均已结束：

| 分支 | 初始提交 | 内容与合并情况 |
| --- | --- | --- |
| `main` | `9d460b5` | 只有第三方原版游戏安装程序，没有本项目的源码或打包工作流 |
| `claude/tender-cerf-k5pm7r` | `87fcad5` | 比 main 多 29 个提交，尚未合并；完整 TypeScript/Preact/Canvas 游戏、AI/模拟/编辑器/录像、原创画面、经典资源的本地导入、Electron 外壳、Windows NSIS/ZIP、签名更新和测试 |

功能分支基于 main 线性开发，无分叉冲突。保留上述全部有效代码与历史，不删除原分支、不重写提交。发布修复在 `codex/release-1.0.1` 准备，Windows CI 通过后再合并主分支并打版本标签。

## 原因与修复

- 找不到安装包：主分支没有软件源码；功能分支 CI 的安装包只上传为临时 Actions artifact；没有 `v*` 标签触发过 Release。
- 既有 Release 工作流要求生产更新私钥，否则在打包前失败。改为缺少私钥时仍发布手动安装包、便携版、blockmap 和 SHA-256 校验和，不公开未签名的 `latest.yml` 或 `.sig`。
- 有配对私钥时仍必须校验 Ed25519 签名、版本、文件名及清单 SHA-512；签名不匹配阻止发布。已有 Authenticode 配置保持原样。未生成/上传生产凭据，不改变认证或安全权限，不在客户端内嵌 token。
- 构建一次后验证同一份安装包的安装、主程序版本、注册表、真实渲染与 native bridge、设置中的更新入口、公开 GitHub 更新检查、卸载；先上传草稿资产再发布，拒绝覆盖已发布版本。
- 修复“版本字符串不同即提示更新”的误判；改用 electron-updater 的版本判断。缺公钥/安全钩子时禁用更新。下载缓存也在发出完成通知、允许安装之前重新校验签名。正确选择 `.exe` 的签名，避免清单先列 ZIP 时匹配错误。
- 无更新清单时提示手动下载安装。更新按钮只在 Electron 桌面版显示；浏览器没有 native bridge，研究版主动禁用公开更新源，均非发布包丢失。
- 版本先设为 1.0.1，首次发布遇到仅有标签时的 GitHub feed 错误后，修复并增至 1.0.2；原标签不改写。游戏显示版本从 package.json 读取。

## 第三方原版程序

`9d460b5` 的 `Plants vs. Zombies GOTY_CHS.exe` 为 75,460,638 字节。未发现再分发授权证据，未执行它。本次从发布文件树中移除，避免新标签源码压缩包携带它；原历史和功能分支仍保留该文件。公开包使用程序生成的画面与音效，经典资源需玩家本机自行导入，未上传研究构建或原版素材。

## 已运行的验证

- AI 冒烟模拟：4 关 × 2 策略 × 5 次，共 40 局，39 胜，完整生成 JSON 战报。
- 本地 `npm run typecheck` 通过；`npm test`：7 文件、57 测试通过（含真实 app.asar 素材隔离测试）。
- `npm run build` 与 `node scripts/check-public-build.mjs` 通过；两份 workflow 可解析，`git diff --check` 通过。
- Playwright：5 个公开版用例通过，3 个需要原版素材的经典画面用例跳过（未导入原版素材）。覆盖菜单/设置、手动部署、AI 通关及录像、Worker 批量模拟、修改器。
- 历史 Windows [CI run 39141623341](https://github.com/xhc144/zwdzjs/actions/runs/39141623341) 的安装/卸载与签名升级步骤成功；该升级源为本机 HTTP、临时证书/测试密钥，不是生产 GitHub 发布源。
- 本轮不执行会创建测试证书并改变临时信任库的完整升级夹具；保留为明确手动选项。新增模拟回归测试覆盖缓存拒绝、安装安全门及发布资产隔离。

## 待远端验证

本记录写入时，1.0.1 的 Windows CI、正式 Release 和匿名下载尚待运行。通过真实 GitHub Release 的跨版本自动升级须具备与内置公钥配对的生产私钥以及后续新版本；本地单元测试或历史夹具不代表生产升级已经通过。

当前 GitHub 集成读取 Secrets/Variables 名称返回 HTTP 403（Resource not accessible by integration），未修改权限。是否具备可用签名配置以 Release 工作流实际运行结果为准。

## 本轮失败及处理

- 本地首次 `npm ci` 在 Electron Linux 二进制下载时连接被拒绝；改为 `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`，在 Linux 完成源码测试，Windows 二进制由 GitHub Windows runner 构建与运行。
- [CI 39187519836](https://github.com/xhc144/zwdzjs/actions/runs/39187519836)：构建、安装、主程序/注册表版本校验、界面渲染、更新按钮和 native bridge 均成功，但首次真实 GitHub 检查返回 `No published versions on GitHub`，当时未归入“手动安装”状态，测试因此失败。追查依赖发现，完全空的 Atom feed 会先抛 `ERR_XML_MISSED_ELEMENT`，无稳定版本标签时则为 `ERR_UPDATER_NO_PUBLISHED_VERSIONS`；已分别处理，仅把明确的空 feed XML 错误映射为手动安装，其他格式错误仍报错。未把这次失败记为完整 Windows 验证成功。
- 复查发现 app.asar 路径在 Windows 使用反斜杠；统一分隔符后再做素材目录检查，新增真实 asar 的隔离回归测试，防止检查被路径格式绕过。
- [CI 39187992576](https://github.com/xhc144/zwdzjs/actions/runs/39187992576) 完整通过 Windows 安装、渲染、native bridge、真实 GitHub 更新入口和卸载。其 artifact 12158288676 已通过现有授权 GitHub 工具下载并验证官方 SHA-256 `22b3cf961aa7aa3cf21e68d18858db40109d699f0bc26bb3b942582537e791b7`；安装器与 x64 主程序格式正确，app.asar 内的主进程、预加载、签名实现和公钥与源码一致。
- [首次 Release 39188402639](https://github.com/xhc144/zwdzjs/actions/runs/39188402639) 中类型检查、57 测试、打包、安装及界面均成功；标签存在后 GitHub Atom feed 有条目，而 `/releases/latest` 因无正式 Release 返回 HTTP 406，被依赖包装为 `ERR_UPDATER_INVALID_RELEASE_FEED`，发布前更新检查再次失败。已为此真实依赖路径增加回归测试并修复；其他格式错误仍报错。正式私钥和 Authenticode 配置在该工作流中确认为空。
- 原生 CLI 下载 Actions 临时直链返回 403，使用既有授权的 GitHub 下载工具成功获取并校验同一 artifact，未修改认证。随后创建空的 v1.0.1 草稿（ID 416839028），CLI 对 uploads.github.com 上传资产返回 HTTP 401，草稿资产仍为空；未重新登录、未生成凭据、未修改权限。改由原有 Actions 的现成 GITHUB_TOKEN 发布 1.0.2，继续使用已有 contents:write 权限。

## 最终发布验收与已合并分支恢复记录（2026-10-19）

最终软件源码为 `68144090a7dd54aa8f490bbb15c130d631cf72e9`，原始合并提交为 `66cbf9d9ecc8009df9a9505827aee1c9349088c2`。正式 [v1.0.2 Release](https://github.com/xhc144/zwdzjs/releases/tag/v1.0.2)、[Release 工作流 39188976503](https://github.com/xhc144/zwdzjs/actions/runs/39188976503) 与 [主分支 CI 39188974378](https://github.com/xhc144/zwdzjs/actions/runs/39188974378) 均已成功；58 个测试和 Windows 安装、界面、更新入口、版本、注册表、卸载验证通过。

正式安装 EXE（85,878,684 字节）、便携 ZIP（118,567,794 字节）、blockmap、SHA256SUMS 已匿名下载，均为 HTTP 200，SHA-256 全部匹配。ZIP 完整，主程序为 x64；app.asar 中主进程、预加载、更新校验实现及公钥与发布提交一致，公开包与远端标签源码归档均不含原版游戏程序或素材。未配置生产 Ed25519 私钥及 Authenticode 证书；`latest.yml` 为预期的 404，实际安装版更新检查返回手动安装提示。真实跨版本签名升级仍未验收。

用户最初要求保留分支，随后明确授权只清理 `xhc144/zwdzjs` 已完整合入 `main` 的多余分支。以下清单在执行删除前写入并推送，用于恢复；`claude-lab` 仅只读核对，不清理其分支。

| 已清理远端分支 | 删除前冻结的 tip SHA | 合并依据 |
| --- | --- | --- |
| `claude/tender-cerf-k5pm7r` | `87fcad5c67cb2c6fdbaef09229e4a96edd056ed2` | tip 是验收主分支 `6814409` 的祖先，完整历史经 `66cbf9d` 合并 |
| `codex/release-1.0.1` | `2d92e827d740d2b1320f7ae7f9f9e76c2cb45ae7` | tip 是验收主分支 `6814409` 的祖先，完整历史经 `66cbf9d` 合并 |

删除使用精确 tip 的租约检查，远端分支若被其他写者推进则拒绝删除。保留 `main`、任何未合入分支，以及全部 tags 和 Git 历史。

需要恢复分支名时，原提交仍由 `main` 历史保留，可执行：

```bash
git push origin 87fcad5c67cb2c6fdbaef09229e4a96edd056ed2:refs/heads/claude/tender-cerf-k5pm7r
git push origin 2d92e827d740d2b1320f7ae7f9f9e76c2cb45ae7:refs/heads/codex/release-1.0.1
```

执行状态：恢复点先通过提交 `bdcc5fa4006aa07845b495be3d8906dee5b013d8` 写入远端，经 API 核对提交和文件 blob 后，以精确 tip 租约原子删除上述两分支。删除后远端仅有 `main`；`v1.0.1`、`v1.0.2` 标签及其指向均未改动。未触及 `claude-lab` 的分支。

## 仓库改名（2026-10-19）

核查时 GitHub 已将 `xhc144/zwdzjs` 重命名为 `xhc144/prism-wardens`；新旧地址返回相同仓库 ID `1423054528`，仍为 public，默认分支仍为 main，已有 Release ID `416841212` 保留。没有重复创建仓库或再次执行改名。

本地 origin 已改为新地址；README 下载入口、package.json 的 repository/homepage/GitHub publish 配置、更新器缺省仓库名和后续 Release 说明下载地址统一改为 `prism-wardens`。不改软件版本、不覆盖已发布安装包，不改公钥、签名要求或权限。已发布 `v1.0.2` 中仍内嵌旧地址，须单独核验旧 URL 重定向与该版本的真实 Windows 更新检查；不能仅以文档替换作为验收。
