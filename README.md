# 棱镜守卫 Prism Wardens

一款完整的策略塔防游戏：确定性战斗模拟、可托管/接管的 AI、规则与关卡编辑器、修改器、录像与战报，提供 Web 版与带安装/卸载/自动更新的 Windows 桌面版。

游戏有两种画面：

- **原创画面**（公开版默认内置）：全部角色、特效与界面由 Canvas 程序绘制，不依赖任何外部素材。
- **经典画面**：导入你自己合法持有的《植物大战僵尸》年度版后启用，使用原版的角色动画、场景、种子包、界面、字体、音效与分层音乐。原版素材只在你的电脑上转换和保存，从不随本项目分发，详见 [docs/ASSETS.md](docs/ASSETS.md)。

## 内容

- **42 种防御单位、28 种敌人（含 3 个首领）**。经典画面下对应原版的全部植物机制：向日葵、豌豆射手家族、坚果、樱桃炸弹、土豆雷、寒冰射手、大嘴花、小喷菇、阳光菇、大喷菇、咬咬碑、魅惑菇、胆小菇、寒冰菇、毁灭菇、睡莲、窝瓜、三线射手、缠绕海草、火爆辣椒、地刺、火炬树桩、高坚果、水兵菇、路灯花、仙人掌、三叶草、裂荚射手、磁力菇、卷心菜投手、玉米投手、大蒜、叶子保护伞、金盏花、西瓜投手，以及机枪射手、双子向日葵、忧郁菇、香蒲、冰西瓜、钢地刺等升级植物；僵尸包括撑杆、读报、铁门、橄榄球、舞王与伴舞、潜水、冰车、海豚骑士、小丑、气球、矿工、跳跳、蹦极、梯子、投石车、巨人与小鬼。
- **冒险模式**：5 章 30 关（白天、黑夜、泳池、浓雾、屋顶），首领关、天气、随机事件、地形（水面、岩石、高地、晶脉、冰面、墓碑）。
- **无尽模式、生存挑战、挑战模式**（规则限制 + 排行榜）、**自定义关卡**。
- **AI**：完全托管、只托管经济/防守、提示模式；战场上可视化 AI 的候选决策；Tab 随时在人类与 AI 之间切换。AI 控制台支持观战、多线程批量模拟、策略对比、卡组研究、“AI 闯关”自动重试。
- **编辑器**：挑战规则编辑器、关卡编辑器（地形、路线、资源、波次、事件）、单位编辑器。
- **修改器**：无限资源、免冷却、伤害/生命倍率、一击必杀、敌人数量与属性、自动部署等；挑战模式下强制禁用。
- **录像与战报**：完整回放、逐帧分析、伤害贡献、导出。
- **商店、成就、图鉴、多存档与备份恢复**。

操作：数字键 1-9 选卡，Q 铲除，W 强化，空格暂停，F 逐帧，Tab 切换 AI。

## 下载与安装

在 [Releases](https://github.com/xhc144/prism-wardens/releases) 下载 `PrismWardens-Setup-<版本>.exe`（Windows 10/11 64 位安装版，含卸载程序）或 `PrismWardens-<版本>-x64.zip`（便携版）。安装版运行安装向导；便携版解压全部文件后运行 `Prism Wardens.exe`。GitHub 自动提供的 Source code ZIP/TAR 是源码，不是安装包。可用 `SHA256SUMS.txt` 核对下载完整性。

安装版只接受有效签名的自动更新；是否已配置签名更新见各版本发布说明。没有签名更新清单时，请从发布页手动下载安装。便携版请手动下载新版本并解压。未配置 Windows 代码签名证书的版本可能提示“未知发布者”。安装后在 **设置 → 美术风格与原版资源** 中导入自己合法持有的副本即可切换到经典画面。

## 从源码运行

需要 Node.js 22。

```bash
npm ci
npm run dev                 # 开发服务器 http://localhost:5173
npm run assets:import -- "D:\Games\PvZ" # （可选）从自己的游戏目录导入经典画面素材
npm run electron            # 以桌面应用运行（需先 npm run build）
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 单元测试（模拟、规则、AI、扩展单位机制） |
| `npx playwright test` | 端到端测试（构建后的 Web 版；`dist/pvz` 存在时额外运行经典画面用例） |
| `npm run sim -- --level 1-1,2-1 --strategy balanced,defense --runs 5 --json out.json` | 无渲染 AI 批量模拟 |
| `npm run build` | 构建 Web 版（公开构建，自动剔除原版素材） |
| `npm run dist:win` | 打包 Windows NSIS 安装包与便携版 |
| `npm run update-key -- <私钥路径>` | 生成新的更新签名密钥对（见 docs/SIGNING.md） |
| `npm run dist:research` | 本地研究构建：把已导入的原版素材一起打包，仅限本人本机使用 |

开发时可用 `?quick=关卡ID&ai=1&deck=卡牌1,卡牌2&skin=classic|original` 直接进入战斗。

## 发布与自动更新

推送与 `package.json` 版本一致的 `v*` 标签会触发 Release 工作流：先确认 Actions 内的 `UPDATE_SIGNING_KEY` 与内置 Ed25519 公钥匹配，再运行测试、构建一次、检查不含原版素材、验证同一份安装包的安装/启动/卸载，最后发布安装包、便携版、校验和、`latest.yml`、blockmap 与 `.sig`。缺少或不匹配的私钥会阻止新发布，已经发布的手动安装版本保留。

发布后可手动运行 `Verify published update` 工作流：安装已发布的 1.0.2，在不向客户端传递 GitHub 凭据、不更改更新源和公钥的条件下，从真实 GitHub Releases 下载并升级到指定新版。该验收与临时证书、本地服务器的测试独立，不生成密钥或改动证书信任。私有仓库的匿名客户端无法直接访问更新源，不能通过内嵌 token 解决。

桌面版通过 electron-updater 检查更新、增量下载，校验发布者的 Ed25519 签名（以及配置证书后的 Windows Authenticode 签名）后才会安装，复用缓存也重新校验。签名配置见 [docs/SIGNING.md](docs/SIGNING.md)。

CI（`.github/workflows/ci.yml`）在每次推送时运行类型检查、单元测试、AI 模拟冒烟测试、端到端测试，并在 Windows 上构建安装包、静默安装、校验注册表与文件、再静默卸载。

完整签名升级的测试夹具需要在临时 runner 创建测试密钥和证书，仅手动运行 CI 并明确选择 `run_signed_update_fixture` 时执行；日常构建不创建这些测试凭据。此前通过记录见 [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md)，不代表已验证真实 GitHub 跨版本升级。

## 目录结构

```
src/core/        确定性模拟、内容数据、规则、回放、战报（不依赖 DOM）
src/ai/          AI 代理、观测、卡组构建、教练、研究
src/render/      原创画面渲染器；classic/ 为经典画面渲染器
src/pvz/         原版格式运行时：资源加载、reanim 播放器、粒子、位图字体
src/audio/       程序化音效与音乐；经典画面的原版音效与 MO3 分层音乐
src/ui/          界面（screens/ 原创界面，classic/ 经典界面）
tools/import/    原版资源导入器（PAK、reanim、粒子、文本、字体、音乐）
electron/        桌面外壳：存储、备份、自动更新、游戏内导入
scripts/         构建辅助：libopenmpt 拷贝、导入器打包、公开构建检查
tests/  e2e/     单元测试与端到端测试
docs/            文档
```

## 文档

- [docs/ASSETS.md](docs/ASSETS.md)：原版素材、授权与公开/研究构建的区分
- [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)：第三方项目调研与使用情况
- [docs/FORMATS.md](docs/FORMATS.md)：原版资源格式与还原要点
- [docs/SIGNING.md](docs/SIGNING.md)：自动更新、更新签名与代码签名
- [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md)：测试结果记录

## 声明

本项目的代码与原创美术为项目作者所有。《植物大战僵尸》及其素材的版权属于 PopCap Games / Electronic Arts，本项目与其没有任何关联，也不分发其素材；经典画面仅在玩家导入自己合法持有的游戏副本后可用。
