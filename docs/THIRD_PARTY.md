# 第三方项目调研与使用情况

本文记录为“经典画面”调研过的第三方项目、它们的许可证，以及本项目实际如何使用它们。所有项目都已克隆到本地阅读源码，而不只是浏览说明页。

使用原则：

- **随应用分发的第三方代码**只来自宽松许可证（MIT / BSD），并保留许可证文本。
- GPL / AGPL / 非商业许可的项目只作为**资料参考**（文件格式、坐标常量、行为数值等事实），本项目没有复制它们的代码。格式解析器、reanim 播放器、粒子系统、位图字体、导入器均为本项目独立实现的 TypeScript 代码。
- 反编译项目只用来查证原版行为与绘制坐标，本项目不包含任何反编译代码。

## 随应用分发的第三方组件

| 组件 | 许可证 | 用途 |
| --- | --- | --- |
| [chiptune3](https://github.com/DrSnuggles/chiptune) 0.8.9 | MIT | 其中的 libopenmpt WebAssembly 构建（`libopenmpt.worklet.js`）在构建时由 `scripts/vendor-openmpt.mjs` 复制到 `public/vendor/openmpt/`，并打补丁导出 `wasmTable`；本项目自己的 `pvz-music.worklet.js` 用它实时播放原版 MO3 音乐的分层音轨。许可证随文件一起复制。 |
| [libopenmpt](https://lib.openmpt.org/)（包含在 chiptune3 中） | BSD-3-Clause | MO3/XM 模块音乐解码。命令行导入器也可通过 ctypes 调用系统 libopenmpt 预渲染 OGG。 |
| [Preact](https://preactjs.com/) | MIT | 界面框架 |
| [Electron](https://www.electronjs.org/) | MIT | 桌面外壳 |
| [electron-updater](https://www.electron.build/auto-update) | MIT | 自动更新（GitHub Releases，blockmap 增量下载） |
| [7zip-bin](https://github.com/develar/7zip-bin) | MIT（7-Zip 本体为 LGPL） | 游戏内导入时解压玩家选择的原版安装包 |

开发与构建工具（不随应用分发）：Vite、TypeScript、Vitest、Playwright、esbuild、electron-builder 26、tsx（均为 MIT / Apache-2.0）。Windows 安装程序由 electron-builder 的 NSIS 3.12 工具集生成（NSIS 为 zlib/libpng 许可，安装程序中只包含其运行时存根与插件）。

## 调研过的项目

| 项目 | 许可证 | 研究内容 | 本项目中的使用方式 |
| --- | --- | --- | --- |
| [ec50n9/pvz2godot](https://github.com/ec50n9/pvz2godot) | GPL-3.0 | 原版资源到 Godot 的完整转换管线：7z 解包安装包 → main.pak → reanim / 粒子 / 字体 / 音乐 | 参考其流程设计导入器的步骤与 reanim 语义（默认值向前填充、动作区间、附着），代码独立实现 |
| [YingFengTingYu/PopStudio](https://github.com/YingFengTingYu/PopStudio) | Apache-2.0 | PopCap 各类文件格式（PAK、编译后的 reanim、RTON 等） | 参考 PAK（XOR 0xF7、魔数 0xBAC04AC0）与编译 reanim（0xB393B4C0 + zlib）格式说明；`tools/import/pak.ts`、`reanim.ts` 独立实现 |
| [Patoke/re-plants-vs-zombies](https://github.com/Patoke/re-plants-vs-zombies)、[headshot2017 分支](https://github.com/headshot2017/re-plants-vs-zombies) | CC0（反编译代码） | 年度版 1.2.0.1073 的反编译源码 | 只查证事实：草坪原点与格子尺寸、僵尸绘制原点公式、种子包绘制（`SeedPacket.cpp`）、冰道（`Board::DrawIce`）、海豚骑士偏移（`Zombie.cpp`）、小游戏选择界面布局、音乐曲目起始位置与分层逻辑、各植物机制数值 |
| [InLiothixi/stabledecompile](https://github.com/InLiothixi/stabledecompile) | MIT | 另一份可编译的反编译版本 | 与上一项交叉核对绘制与行为 |
| [wszqkzqk/PvZ-Portable](https://github.com/wszqkzqk/PvZ-Portable) | GPL-3.0 | 跨平台重新实现 | 参考，未使用代码 |
| [sheepbox8646/cloud-pvz](https://github.com/sheepbox8646/cloud-pvz) | GPL-3.0 | 把 PvZ-Portable 编译为 WebAssembly 在浏览器运行 | 参考其“玩家自备素材”的分发思路 |
| [43aquarius/web-pvz](https://github.com/43aquarius/web-pvz) | MIT | 基于原版 reanim 与素材的 Canvas 复刻（48 种植物） | 参考 Web 端 reanim 播放与素材组织方式 |
| [BestTianqi/pvz](https://github.com/BestTianqi/pvz) | 未声明 | React + Canvas 复刻 | 参考，未使用代码 |
| [cheng1559/pvz-remake](https://github.com/cheng1559/pvz-remake) | MIT | Cocos Creator 复刻 | 参考场景与界面流程 |
| [gonewx/pvz](https://github.com/gonewx/pvz) | MIT | AI 辅助开发的复刻 | 参考 |
| [hsk-dream/PVZ-Godot-Dream](https://github.com/hsk-dream/PVZ-Godot-Dream) | 自定义非商业许可 | Godot 复刻与改版框架 | 仅浏览，未使用 |
| [HYTommm/PVZ_reanim2godot_animation](https://github.com/HYTommm/PVZ_reanim2godot_animation) | GPL-3.0 | reanim → Godot 动画转换 | 核对 reanim 变换矩阵（kx/ky 斜切、缩放顺序） |
| [Wanxiaace/PVZReanimViewer](https://github.com/Wanxiaace/PVZReanimViewer) | MIT | reanim 查看器 | 核对附着轨道的处理 |
| [LambdaEd1th/ed1ths-pvz-toolkit](https://github.com/LambdaEd1th/ed1ths-pvz-toolkit) | AGPL-3.0 | Rust 资源工具集（RTON、PAM 等，偏向 PvZ2） | 仅浏览，未使用 |
| [marblexu/PythonPlantsVsZombies](https://github.com/marblexu/PythonPlantsVsZombies) | 未声明 | Pygame 复刻 | 参考 |
| [inky03/pvz](https://github.com/inky03/pvz) | 未声明 | LÖVE 复刻（未完成） | 参考 |
| [librePvZ/librePvZ](https://github.com/librePvZ/librePvZ) | AGPL-3.0 | Rust 重新实现 | 仅浏览，未使用 |
| [IsraelDXPP/PvZ-Windows-Phone-decomp](https://github.com/IsraelDXPP/PvZ-Windows-Phone-decomp) | 未声明 | Windows Phone 版反编译与移植 | 参考 |
| [Electr0Gunner/PvZ-Quality-of-the-Lawn-Decompile](https://github.com/Electr0Gunner/PvZ-Quality-of-the-Lawn-Decompile) | 未声明 | 已停止维护的改版底座 | 参考 |
| [lmintlcx/pvztoolkit](https://github.com/lmintlcx/pvztoolkit)、[pvztools](https://github.com/lmintlcx/pvztools) | GPL-3.0 | 原版修改器 | 参考修改器功能清单（无限阳光、免冷却、一键布阵等），本项目的修改器作用于自身模拟而非内存 |
| [vector-wlc/AsmVsZombies](https://github.com/vector-wlc/AsmVsZombies)、[qrmd0/AvZLib](https://github.com/qrmd0/AvZLib) | GPL-3.0 / 未声明 | 高精度键控框架 | 参考 AI 操作接口的设计（精确到帧的指令） |
| [greinermachine/PVZRL](https://github.com/greinermachine/PVZRL) | 未声明 | 强化学习训练环境 | 参考 AI 观测/动作空间设计 |
| [dnartz/pvz-emulator](https://github.com/dnartz/pvz-emulator) | BSD-3-Clause | 生存无尽模拟器 | 参考无尽模式波次与批量模拟思路 |
| [deskjet/chiptune2.js](https://github.com/deskjet/chiptune2.js) | MIT（libopenmpt BSD） | 旧版 libopenmpt JS 播放器 | 被 chiptune3 取代，未使用 |

## 没有采用的方案

- **直接移植 C++ 反编译版本到 WebAssembly**（cloud-pvz 的路线）：画面会完全等同原版，但本项目的模拟、AI、规则编辑器、修改器与回放都建立在自己的确定性模拟之上，移植会失去这些功能，且反编译代码的版权状态不适合随项目分发。
- **Godot 转换管线**（pvz2godot）：需要整体迁移引擎；本项目保留 TypeScript + Canvas，复用其格式知识即可在现有架构中播放原版动画。
- **直接打包原版素材**：不合法，见 [ASSETS.md](ASSETS.md)。
