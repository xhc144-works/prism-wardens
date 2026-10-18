/**
 * 原版种子包绘制（战斗卡槽、选卡界面、图鉴、奖励共用）。
 * 规则取自原版 SeedPacket.cpp / ReanimationLawn.cpp：
 * - 50×70 尺寸下，土豆雷、大嘴花、魅惑菇、高坚果等 13 种植物直接使用预绘制的 IMAGE_PACKET_PLANTS；
 * - 其余植物用 anim_idle 第 0 帧按每种植物的缩放与偏移画进种子包；
 * - 升级植物使用紫色底板（IMAGE_SEEDS 第 1 格），普通植物使用第 2 格；
 * - 更大尺寸时使用高清底板 IMAGE_SEEDPACKET_LARGER，植物仍用动画绘制。
 */
import { CONTENT } from '../../core/content/registry';
import { PVZ, PVZ_IMAGES } from '../../pvz/assets';
import { Reanim, type Mat } from '../../pvz/reanim';
import { PLANT_SKINS } from './skins';
import { UnitActor } from './actors';

/** 预绘制种子包图像的格子序号（按原版动画名） */
const PREDRAWN: Record<string, number> = {
  PotatoMine: 0,
  Chomper: 1,
  HypnoShroom: 2,
  Tallnut: 3,
  Blover: 4,
  Pumpkin: 5,
  TwinSunflower: 6,
  CobCannon: 7,
  Cabbagepult: 8,
  Cornpult: 9,
  Melonpult: 10,
  WinterMelon: 11,
  SpikeRock: 12,
};

/** [缩放, x 偏移, y 偏移]（50×70 种子包坐标），默认 [0.5, 5, 8] */
const SEED_DRAW: Record<string, [number, number, number]> = {
  Tallnut: [0.3, 12, 22],
  CobCannon: [0.26, 6, 22],
  Cactus: [0.5, 9, 13],
  PotatoMine: [0.4, 8, 12],
  Magnetshroom: [0.5, 5, 12],
  FumeShroom: [0.4, 8, 12],
  Pumpkin: [0.4, 8, 12],
  Chomper: [0.4, 8, 12],
  DoomShroom: [0.4, 8, 12],
  Squash: [0.4, 8, 12],
  HypnoShroom: [0.4, 8, 12],
  Caltrop: [0.4, 8, 12],
  SpikeRock: [0.4, 8, 12],
  Plantern: [0.4, 8, 12],
  Torchwood: [0.4, 8, 12],
  Tanglekelp: [0.4, 8, 12],
  TwinSunflower: [0.45, 7, 14],
  GloomShroom: [0.45, 7, 14],
  Cattail: [0.45, 8, 13],
  Umbrellaleaf: [0.5, 5, 10],
  Cornpult: [0.4, 13, 14],
  Cabbagepult: [0.4, 15, 14],
  Melonpult: [0.35, 18, 19],
  WinterMelon: [0.35, 18, 19],
  Gravebuster: [0.4, 10, 15],
  SplitPea: [0.45, 12, 12],
  Blover: [0.4, 8, 17],
  Starfruit: [0.5, 6, 8],
  ThreePeater: [0.5, 5, 10],
  GatlingPea: [0.5, 2, 8],
  SeaShroom: [0.5, 5, 11.5],
};

/** 种子包里使用的动作（原版：水生植物用 anim_idle_aquarium，土豆雷用 anim_armed） */
function packetAnim(reanim: string, def: ReturnType<typeof PVZ.reanim>): string | null {
  if (!def) return null;
  if ((reanim === 'Tanglekelp' || reanim === 'SeaShroom') && def.index.has('anim_idle_aquarium')) return 'anim_idle_aquarium';
  if (reanim === 'PotatoMine') return 'anim_armed';
  return null;
}

export function isUpgradeUnit(id: string): boolean {
  return !!CONTENT.units.get(id)?.upgradeOf;
}

/** 种子包所需资源是否已载入 */
export function packetReady(id: string): boolean {
  const skin = PLANT_SKINS[id];
  if (!skin) return false;
  if (!PVZ.image('IMAGE_SEEDS')) return false;
  if (PREDRAWN[skin.reanim] !== undefined) return !!PVZ.image('IMAGE_PACKET_PLANTS');
  const def = PVZ.reanim(skin.reanim);
  return !!def && !def.images.some((img) => PVZ.hasImage(img) && !PVZ.image(img));
}

/** 只画种子包中的植物（原点为种子包左上角，k = 相对 50×70 的缩放） */
function drawSeed(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, k: number, allowPredrawn: boolean): void {
  const skin = PLANT_SKINS[id];
  if (!skin) return;
  const cell = PREDRAWN[skin.reanim];
  const pre = cell !== undefined && allowPredrawn ? PVZ.image('IMAGE_PACKET_PLANTS') : null;
  if (pre) {
    ctx.drawImage(pre.img, cell * pre.cw, 0, pre.cw, pre.ch, x, y, pre.cw * k, pre.ch * k);
    return;
  }
  const def = PVZ.reanim(skin.reanim);
  if (!def) return;
  const [s, ox, oy] = SEED_DRAW[skin.reanim] ?? [0.5, 5, 8];
  const base: Mat = [s * k, 0, 0, s * k, x + ox * k, y + (oy + 1) * k];
  const anim = packetAnim(skin.reanim, def);
  if (anim || skin.thumb) {
    const r = new Reanim(def);
    if (!r.play(anim ?? skin.thumb!)) r.playAll();
    r.draw(ctx, base, PVZ_IMAGES);
    return;
  }
  const a = new UnitActor(0, id, def, skin);
  a.body.t = 0;
  for (const h of a.heads) h.r.t = 0;
  a.body.draw(ctx, base, PVZ_IMAGES);
}

const cache = new Map<string, HTMLCanvasElement>();

/**
 * 生成种子包图像（不含价格）。shade：0 正常、1 置灰（阳光不足，原版 grayness 128）、2 冷却遮罩（原版 64）。
 * k ≤ 1 时与原版 50×70 卡槽一致；更大时使用高清底板。
 */
export function packetCanvas(id: string, k = 1, shade: 0 | 1 | 2 = 0): HTMLCanvasElement | null {
  const key = `${id}|${k}|${shade}`;
  const got = cache.get(key);
  if (got) return got;
  if (!packetReady(id)) return null;
  const c = document.createElement('canvas');
  c.width = Math.ceil(50 * k);
  c.height = Math.ceil(70 * k);
  const x = c.getContext('2d')!;
  if (shade) x.filter = shade === 1 ? 'brightness(50%)' : 'brightness(25%)';
  const large = k > 1 ? PVZ.image('IMAGE_SEEDPACKET_LARGER') : null;
  if (large) x.drawImage(large.img, 0, 0, 50 * k, 70 * k);
  else {
    const seeds = PVZ.image('IMAGE_SEEDS')!;
    const col = isUpgradeUnit(id) ? 1 : 2;
    x.drawImage(seeds.img, col * seeds.cw, 0, seeds.cw, seeds.ch, 0, 0, 50 * k, 70 * k);
  }
  drawSeed(x, id, 0, 0, k, !large);
  x.filter = 'none';
  cache.set(key, c);
  return c;
}

/** 种子包所需的图片与动画 */
export async function loadPacketAssets(id: string): Promise<void> {
  const skin = PLANT_SKINS[id];
  const jobs: Promise<unknown>[] = [PVZ.loadImage('IMAGE_SEEDS'), PVZ.loadImage('IMAGE_PACKET_PLANTS'), PVZ.loadImage('IMAGE_SEEDPACKET_LARGER')];
  if (skin) jobs.push(PVZ.loadReanimsWithImages([skin.reanim]));
  await Promise.all(jobs);
}
