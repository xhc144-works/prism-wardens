# 原版资源格式与还原要点

导入器（`tools/import/`）与经典画面渲染（`src/pvz/`、`src/render/classic/`）依据的格式知识。数值来自对原版安装包的实际解析，并与反编译源码交叉核对（见 [THIRD_PARTY.md](THIRD_PARTY.md)）。

## 安装包与 PAK

- 年度版中文安装包是 7z 自解压（LZMA + BCJ2），用 7-Zip 直接解出游戏目录。
- `main.pak`：整体按字节 XOR `0xF7`；文件头魔数 `0xBAC04AC0`、版本 0；随后是文件表（名称长度 + 名称 + 大小 + FILETIME，以 `0x80` 结束），之后按顺序存放文件数据。
- `properties/resources.xml`：`<SetDefaults path idprefix>` 决定资源 ID 与路径；`rows/cols` 表示图集分格；`alphagrid`、`alphaimage` 指定透明通道来源。
- 图片：大量 `.jpg` 配同名 `_xxx.png` 灰度蒙版作为 alpha；导入时合成为带透明的 PNG。
- `LawnStrings.txt`：UTF-16，`[KEY]` 段落，含 `{FLAVOR}` 等格式标记。
- 位图字体：PopCap 字体脚本（`Define` 列表、`CreateLayer`、`LayerSet*`），字形图集有的为不透明灰度图，渲染时把亮度转为 alpha。

## reanim 动画

- XML 片段（无根节点），也支持编译格式（魔数 `0xB393B4C0`，zlib 包裹 `0xDEADFED4`）。
- 每条轨道逐帧给出 `x y kx ky sx sy f a i`，缺省值**向前填充**（初始 `x=y=kx=ky=0, sx=sy=1, f=0, a=1`）。
- 动作区间：`anim_xxx` 轨道 `f ≥ 0` 的第一帧到最后一帧；循环时 `pos = start + t·(count−1)`，帧间线性插值（角度不做环绕处理），下一帧消失（`f=-1`）时不插值。
- 变换矩阵：`(cos kx·sx, sin kx·sx, −sin ky·sy, cos ky·sy, x, y)`，图片左上角对齐原点。
- 附着：子动画矩阵 = 父 · Track(t) · Track(基准帧)⁻¹ · 偏移，基准帧为父动作区间的起点。豌豆类植物的头部是第二个实例，播放 `anim_head_idle` 并附着到 `anim_stem`（没有时附着到 `anim_idle`，如机枪射手）。
- 僵尸配件默认隐藏（路障、铁桶、铁门、鸭子泳圈等）；护甲按剩余耐久切换 1/2/3 号贴图（2/3、1/3 阈值）；生命低于 2/3 掉手臂，低于 1/3 掉头。
- 行走速度：用 `_ground` 轨道位移换算动画速率，使脚步与模拟移速一致，避免滑步。

## 场景坐标

- 800×600 场景；背景图宽 1400，绘制在 x = −220。
- 草坪原点 (40, 80)，格宽 80；白天/黑夜行高 100，泳池/屋顶行高 85；屋顶坡度 `(5 − col)·20 − 10`。
- 僵尸 reanim 原点：`mPosX + 15 + 30(1−s)`, `rowTop − 38 + 120(1−s)`；本项目模拟坐标到 `mPosX` 的映射为 `front − 72`。
- 种子包（`SeedPacket.cpp`）：卡槽 50×70，底板为 `IMAGE_SEEDS` 第 2 格（升级植物第 1 格）；土豆雷、大嘴花、魅惑菇、高坚果、三叶草、南瓜头、双子向日葵、玉米加农炮、卷心菜投手、玉米投手、西瓜投手、冰西瓜、钢地刺使用预绘制的 `IMAGE_PACKET_PLANTS`；其余植物按每种植物的缩放与偏移绘制 `anim_idle` 第 0 帧。阳光不足整包乘 128/255，冷却中自上而下覆盖 64/255。
- 冰道（`Board::DrawIce`）：从冰道起点 +13 向右平铺 `IMAGE_ICE`，起点画 `IMAGE_ICE_CAP`，纵向位于行顶 +20。
- 海豚骑士：骑乘与跳跃时图像右移 70 像素；跳过植物后脱离海豚，在水中裁剪下半身。

## 粒子

- XML 发射器，属性是“轨道字符串”（如 `.9,70 0`、`[.4 .6] [.8 1.2]`）：可带随机区间与关键帧。
- 原版以 100 Hz 更新；换算为秒：加速度 ×100 px/s²，摩擦 `(1−x)^ticks`，发射方向 `(sin θ, cos θ)·speed`（0° 向下），自旋 °/s，地面约束反弹。
- 颜色乘法着色通过量化缓存实现；additive 混合对应 Canvas 的 `lighter`。

## 音乐

- `mainmusic.mo3` 是 30 声道的 XM（236 个 order），`mainmusic_hihats.mo3` 为额外的镲片层。
- 各曲目的起始 order：白天 0x00、黑夜 0x30、泳池 0x5E、浓雾 0x7D、屋顶 0xB8、选卡 0x7A、标题 0x98、首领 0x9E、小游戏 0xA6、解谜 0xB1、传送带 0xD4、禅境花园 0xDD。
- 分层：主旋律 / 鼓 / 镲片三组声道掩码（29 号声道始终发声）。僵尸 ≥ 10 或出现大波时开启鼓层，< 4 时关闭；镲片淡入 4 秒、淡出 8 秒；鼓在半个 pattern 边界切换。
- 播放方式：命令行导入时可用 libopenmpt 预渲染为 OGG 分轨；否则浏览器内用 libopenmpt WebAssembly（AudioWorklet）实时解码并按上述规则切换声道。
