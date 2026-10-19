# 原版素材与授权说明

本项目区分三类素材，处理方式完全不同：

| 类别 | 内容 | 是否进入 git | 是否进入公开安装包 |
| --- | --- | --- | --- |
| 原创素材 | 全部游戏逻辑、关卡、AI、界面代码；“原创”美术风格中用 Canvas 绘制的角色、特效与界面；程序生成的音效与音乐 | 是 | 是 |
| 开源第三方组件 | Preact、Electron、electron-updater、7zip-bin、chiptune3（含 libopenmpt WebAssembly）等，见 [THIRD_PARTY.md](THIRD_PARTY.md) | 依赖清单在 git 中，代码由 npm 安装 | 是（遵守各自许可证） |
| 原版《植物大战僵尸》素材 | 贴图、reanim 动画、粒子、字体、音效、MO3 音乐、LawnStrings 文本 | **否** | **否** |

原版素材的版权属于 PopCap / Electronic Arts。公开构建不分发这些素材：它们只能在玩家自己的电脑上，从玩家自己合法持有的游戏副本中导入。既有仓库历史中的原版安装程序另见下文。

## 玩家如何启用经典画面

### 方式一：在游戏内导入（推荐，Windows 安装版）

1. 打开 **设置 → 美术风格与原版资源**（主菜单在未导入时也会提示“去导入”）。
2. 点击 **选择安装包导入**，选择《植物大战僵尸》年度版安装包（`.exe`），或点击 **选择游戏目录导入**，选择包含 `main.pak` 的游戏目录。
3. 导入在独立的 Electron 工具进程中运行：解压安装包（内置 7-Zip）→ 读取 `main.pak` → 转换贴图、动画、粒子、字体、文本与音效 → 写入 `%APPDATA%\Prism Wardens\pvz-assets`（先写入临时目录，完成后原子替换）。
4. 完成后自动切换到经典画面并重新载入。素材只保存在本机用户目录，可随时在同一面板中移除。

应用通过 `app://` 协议优先从用户目录提供 `/pvz/` 资源，因此导入的素材与安装包本身相互独立：自动更新不会删除它们，卸载时默认也保留用户数据。

### 方式二：命令行导入（开发 / Web 版）

```bash
npm run assets:import -- "D:\Downloads\自己的安装包.exe"
npm run assets:import -- "D:\Games\PvZ"     # 游戏目录（含 main.pak）
npm run assets:import -- setup.exe --out public/pvz
```

输出写入 `public/pvz/`（已在 `.gitignore` 中）。开发服务器 `npm run dev` 会直接使用它们。音乐需要本机安装 Python 3 与 libopenmpt（`render_music.py` 通过 ctypes 渲染分层 OGG 音轨）；缺少时会跳过预渲染，游戏改用浏览器内的 libopenmpt WebAssembly 实时播放原版 MO3。

## 公开构建与本地研究构建

| | 公开构建 | 本地研究构建 |
| --- | --- | --- |
| 命令 | `npm run build`、`npm run dist:win`、CI、Release 工作流 | `npm run dist:research` |
| `dist/pvz` | 构建结束时自动删除（Vite 插件 `strip-original-assets`） | 保留（`PVZ_BUNDLE_ASSETS=1`） |
| electron-builder | `files` 中排除 `!dist/pvz/**` | 使用 `electron-builder.research.cjs`，输出到 `release-research/` |
| 自动更新 | 启用（GitHub Releases） | 禁用（`researchBuild: true`，避免被替换为不含素材的公开版） |
| 用途 | 对外发布 | 仅供持有原版的本人在本机测试，**不得分发或上传** |

`scripts/check-public-build.mjs` 会在 CI 与 Release 工作流中检查 `dist/`（以及可选的 `app.asar`）里是否出现 `pvz/` 目录、`.reanim`、`.mo3`、`.pak`、`LawnStrings` 等原版文件，发现即构建失败。

## 关于仓库中的安装包

初始提交 `9d460b5` 含 `Plants vs. Zombies GOTY_CHS.exe`（75,460,638 字节），是第三方原版游戏安装程序，仓库内未发现再分发授权证据。仓库当前已经公开；本次发布从新版本文件树中移除该文件，避免安装包、便携包和标签源码压缩包再次附带它，未执行这个程序。按要求保留全部 Git 历史与原有分支，因此旧提交/原功能分支仍能找到此文件；本次没有改变仓库可见性，也没有重写历史。

## 截图与宣传材料

使用经典画面拍摄的截图包含原版美术，同样不应放入公开仓库或公开发布页。仓库中的文档与测试只引用原创画面，或在本地生成、不提交的截图。
