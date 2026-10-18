/**
 * 经典皮肤映射：把本游戏的单位/敌人/弹道对应到原版资源中的动画与贴图。
 * 只引用资源 id，不包含任何素材；资源由玩家本地导入。
 */

export interface HeadSpec {
  /** 头部挂点轨道（找不到时依次尝试后续名称） */
  track: string[];
  idle: string;
  shoot: string;
}

export interface PlantSkin {
  reanim: string;
  idle: string;
  /** 身体射击/攻击动作 */
  shoot?: string;
  heads?: HeadSpec[];
  /** 眨眼动作及其挂点 */
  blink?: { anim: string; track: string };
  /** 受损贴图：[轨道, 轻损贴图, 重损贴图] */
  cracked?: [string, string, string];
  scale?: number;
  dx?: number;
  dy?: number;
  /** 动画速率随机范围 */
  rate?: [number, number];
  hide?: string[];
  /** 名称文本 key（取自导入的 LawnStrings） */
  nameKey?: string;
  /** 卡牌缩略图用动作 */
  thumb?: string;
}

export const PLANT_SKINS: Record<string, PlantSkin> = {
  lumen_moss: { reanim: 'SunFlower', idle: 'anim_idle', blink: { anim: 'anim_blink', track: 'anim_idle' }, rate: [10, 14], nameKey: 'SUNFLOWER' },
  prism_shooter: { reanim: 'PeaShooterSingle', idle: 'anim_idle', heads: [{ track: ['anim_stem'], idle: 'anim_head_idle', shoot: 'anim_shooting' }], rate: [15, 20], nameKey: 'PEASHOOTER', thumb: 'anim_full_idle' },
  stone_warden: { reanim: 'Wallnut', idle: 'anim_idle', cracked: ['anim_face', 'IMAGE_REANIM_WALLNUT_CRACKED1', 'IMAGE_REANIM_WALLNUT_CRACKED2'], nameKey: 'WALL_NUT' },
  volatile_geode: { reanim: 'PotatoMine', idle: 'anim_armed', nameKey: 'POTATO_MINE', thumb: 'anim_armed' },
  nova_core: { reanim: 'CherryBomb', idle: 'anim_idle', nameKey: 'CHERRY_BOMB' },
  frost_shard: { reanim: 'SnowPea', idle: 'anim_idle', heads: [{ track: ['anim_stem'], idle: 'anim_head_idle', shoot: 'anim_shooting' }], rate: [15, 20], nameKey: 'SNOW_PEA', thumb: 'anim_full_idle' },
  maw_crystal: { reanim: 'Chomper', idle: 'anim_idle', shoot: 'anim_bite', rate: [10, 14], nameKey: 'CHOMPER' },
  repeater_prism: { reanim: 'PeaShooter', idle: 'anim_idle', heads: [{ track: ['anim_stem'], idle: 'anim_head_idle', shoot: 'anim_shooting' }], rate: [15, 20], nameKey: 'REPEATER', thumb: 'anim_full_idle' },
  moon_archer: { reanim: 'ScaredyShroom', idle: 'anim_idle', shoot: 'anim_shooting', nameKey: 'SCAREDY_SHROOM' },
  spike_crystal: { reanim: 'Caltrop', idle: 'anim_idle', shoot: 'anim_attack', nameKey: 'SPIKEWEED' },
  ember_totem: { reanim: 'Torchwood', idle: 'anim_idle', nameKey: 'TORCHWOOD' },
  janus_prism: {
    reanim: 'SplitPea',
    idle: 'anim_idle',
    heads: [
      { track: ['anim_stem', 'anim_idle'], idle: 'anim_head_idle', shoot: 'anim_shooting' },
      { track: ['anim_stem', 'anim_idle'], idle: 'anim_splitpea_idle', shoot: 'anim_splitpea_shooting' },
    ],
    rate: [15, 20],
    nameKey: 'SPLIT_PEA',
  },
  frost_bloom: { reanim: 'IceShroom', idle: 'anim_idle', nameKey: 'ICE_SHROOM' },
  twin_moss: { reanim: 'TwinSunflower', idle: 'anim_idle', rate: [10, 14], nameKey: 'TWIN_SUNFLOWER' },
  drift_plate: { reanim: 'LilyPad', idle: 'anim_idle', nameKey: 'LILY_PAD' },
  tide_lurker: { reanim: 'Tanglekelp', idle: 'anim_idle', shoot: 'anim_grab', nameKey: 'TANGLE_KELP' },
  pebble_lobber: { reanim: 'Cabbagepult', idle: 'anim_idle', shoot: 'anim_shooting', rate: [10, 14], nameKey: 'CABBAGE_PULT' },
  flame_pillar: { reanim: 'Jalapeno', idle: 'anim_idle', nameKey: 'JALAPENO' },
  resonance_bell: { reanim: 'Umbrellaleaf', idle: 'anim_idle', shoot: 'anim_block', nameKey: 'UMBRELLA_LEAF' },
  boomerang_thorn: { reanim: 'Cactus', idle: 'anim_idle', shoot: 'anim_shooting', nameKey: 'CACTUS' },
  trident_prism: {
    reanim: 'ThreePeater',
    idle: 'anim_idle',
    heads: [
      { track: ['anim_head1'], idle: 'anim_head_idle1', shoot: 'anim_shooting1' },
      { track: ['anim_head2'], idle: 'anim_head_idle2', shoot: 'anim_shooting2' },
      { track: ['anim_head3'], idle: 'anim_head_idle3', shoot: 'anim_shooting3' },
    ],
    rate: [15, 20],
    nameKey: 'THREEPEATER',
  },
  lantern_crystal: { reanim: 'Plantern', idle: 'anim_idle', nameKey: 'PLANTERN' },
  gale_fan: { reanim: 'Blover', idle: 'anim_idle', shoot: 'anim_blow', nameKey: 'BLOVER' },
  magnet_crystal: { reanim: 'Magnetshroom', idle: 'anim_idle', shoot: 'anim_shooting', nameKey: 'MAGNET_SHROOM' },
  storm_spire: { reanim: 'Cattail', idle: 'anim_idle', shoot: 'anim_shooting', nameKey: 'CATTAIL' },
  mender_crystal: { reanim: 'Marigold', idle: 'anim_idle', nameKey: 'MARIGOLD' },
  meteor_lobber: { reanim: 'Melonpult', idle: 'anim_idle', shoot: 'anim_shooting', rate: [10, 14], nameKey: 'MELON_PULT' },
  monolith: { reanim: 'Tallnut', idle: 'anim_idle', cracked: ['anim_idle', 'IMAGE_REANIM_TALLNUT_CRACKED1', 'IMAGE_REANIM_TALLNUT_CRACKED2'], nameKey: 'TALL_NUT' },
  gravity_well: { reanim: 'HypnoShroom', idle: 'anim_idle', nameKey: 'HYPNO_SHROOM' },
};

export type ArmorVisual = 'cone' | 'bucket' | 'door' | 'paper' | 'flag' | 'none';

export interface ZombieSkin {
  reanim: string;
  walk: string[];
  eat: string;
  death?: string[];
  idle?: string;
  armor?: ArmorVisual;
  scale?: number;
  dx?: number;
  dy?: number;
  tint?: string;
  alpha?: number;
  /** 烧焦死亡动画 */
  charred?: string;
  /** 掉臂：上臂轨道、换成的断臂贴图、隐藏的前臂/手 */
  arm?: { upper: string; img: string; drop: string[] };
  /** 掉头时隐藏的轨道 */
  head?: string[];
  hide?: string[];
  nameKey?: string;
  /** 行走动画的标称地面速度（像素/秒）未知时自动计算 */
  flying?: boolean;
}

/** 普通僵尸 reanim 中默认隐藏的配件 */
export const ZOMBIE_ACCESSORIES = [
  'anim_cone',
  'anim_bucket',
  'anim_screendoor',
  'Zombie_innerarm_screendoor',
  'Zombie_innerarm_screendoor_hand',
  'Zombie_outerarm_screendoor',
  'Zombie_flaghand',
  'Zombie_duckytube',
  'Zombie_whitewater',
  'Zombie_whitewater2',
  'Zombie_mustache',
  'anim_tongue',
];

const BASIC_ARM = { upper: 'Zombie_outerarm_upper', img: 'IMAGE_REANIM_ZOMBIE_OUTERARM_UPPER2', drop: ['Zombie_outerarm_lower', 'Zombie_outerarm_hand'] };
const BASIC_HEAD = ['anim_head1', 'anim_head2', 'anim_hair', 'anim_tongue', 'Zombie_mustache'];

const basic = (extra: Partial<ZombieSkin> = {}): ZombieSkin => ({
  reanim: 'Zombie',
  walk: ['anim_walk', 'anim_walk2'],
  eat: 'anim_eat',
  death: ['anim_death', 'anim_death2'],
  idle: 'anim_idle',
  arm: BASIC_ARM,
  head: BASIC_HEAD,
  hide: ZOMBIE_ACCESSORIES,
  charred: 'Zombie_charred',
  ...extra,
});

export const ZOMBIE_SKINS: Record<string, ZombieSkin> = {
  husk: basic({ nameKey: 'ZOMBIE' }),
  shard_husk: basic({ armor: 'cone', nameKey: 'CONEHEAD_ZOMBIE' }),
  iron_husk: basic({ armor: 'bucket', nameKey: 'BUCKETHEAD_ZOMBIE' }),
  banner_husk: basic({ armor: 'flag', walk: ['anim_walk2'], nameKey: 'FLAG_ZOMBIE' }),
  leaper: {
    reanim: 'Zombie_polevaulter',
    walk: ['anim_walk'],
    eat: 'anim_eat',
    death: ['anim_death'],
    arm: { upper: 'Zombie_polevaulter_outerarm_upper', img: 'IMAGE_REANIM_ZOMBIE_POLEVAULTER_OUTERARM_UPPER2', drop: ['Zombie_polevaulter_outerarm_lower', 'Zombie_outerarm_hand'] },
    head: ['anim_head1', 'anim_head2', 'anim_hair'],
    charred: 'Zombie_charred',
    nameKey: 'POLE_VAULTING_ZOMBIE',
  },
  shieldbearer: basic({ armor: 'door', nameKey: 'SCREEN_DOOR_ZOMBIE' }),
  berserker: {
    reanim: 'Zombie_paper',
    walk: ['anim_walk'],
    eat: 'anim_eat',
    death: ['anim_death'],
    armor: 'paper',
    arm: { upper: 'Zombie_paper_leftarm_upper', img: 'IMAGE_REANIM_ZOMBIE_PAPER_LEFTARM_UPPER2', drop: ['Zombie_paper_leftarm_lower'] },
    head: ['anim_head1', 'anim_head_look', 'anim_head_pupils', 'anim_hairpiece', 'anim_head_jaw', 'anim_head_glasses', 'anim_hair'],
    hide: ['anim_head_look', 'anim_head_pupils'],
    charred: 'Zombie_charred',
    nameKey: 'NEWSPAPER_ZOMBIE',
  },
  burrower: {
    reanim: 'Zombie_digger',
    walk: ['anim_walk'],
    eat: 'anim_eat',
    death: ['anim_death'],
    arm: { upper: 'Zombie_digger_outerarm_upper', img: 'IMAGE_REANIM_ZOMBIE_DIGGER_OUTERARM_UPPER2', drop: ['Zombie_outerarm_lower', 'Zombie_outerarm_hand'] },
    head: ['anim_head1', 'anim_head2', 'Zombie_digger_head_eye', 'Zombie_digger_hardhat'],
    hide: ['Zombie_digger_dirt', 'Zombie_digger_rise', 'Zombie_digger_dig'],
    charred: 'Zombie_charred_digger',
    nameKey: 'DIGGER_ZOMBIE',
  },
  floater: {
    reanim: 'Zombie_balloon',
    walk: ['anim_idle'],
    eat: 'anim_eat',
    death: ['anim_death'],
    flying: true,
    arm: { upper: 'Zombie_outerarm_upper', img: 'IMAGE_REANIM_ZOMBIE_BALLOON_OUTERARM_UPPER2', drop: ['Zombie_outerarm_lower', 'Zombie_outerarm_hand'] },
    head: ['anim_head1', 'anim_head2', 'hat'],
    hide: ['balloon_pop'],
    nameKey: 'BALLOON_ZOMBIE',
  },
  summoner: {
    reanim: 'Zombie_dancer',
    walk: ['anim_walk'],
    eat: 'anim_eat',
    death: ['anim_death'],
    head: ['anim_head1', 'anim_head2', 'anim_earing', 'anim_hair'],
    charred: 'Zombie_charred',
    nameKey: 'DANCING_ZOMBIE',
  },
  colossus: { reanim: 'Zombie_gargantuar', walk: ['anim_walk'], eat: 'anim_smash', death: ['anim_death'], idle: 'anim_idle', head: [], charred: 'Zombie_charred_gargantuar', nameKey: 'GARGANTUAR' },
  imp: { reanim: 'Zombie_imp', walk: ['anim_walk'], eat: 'anim_eat', death: ['anim_death'], head: ['anim_head1', 'anim_head2'], charred: 'Zombie_charred_imp', nameKey: 'IMP' },
  frost_hauler: { reanim: 'Zombie_zamboni', walk: ['anim_drive'], eat: 'anim_drive', death: ['anim_wheelie2'], head: [], charred: 'Zombie_charred_zamboni', nameKey: 'ZOMBONI' },
  catapult: { reanim: 'Zombie_catapult', walk: ['anim_walk'], eat: 'anim_walk', death: ['anim_bounce'], idle: 'anim_idle', head: [], charred: 'Zombie_charred_catapult', hide: ['Zombie_catapult_basketball2'], nameKey: 'CATAPULT_ZOMBIE' },
  diver: {
    reanim: 'Zombie_snorkle',
    walk: ['anim_swim'],
    eat: 'anim_eat',
    death: ['anim_death'],
    head: ['anim_head1', 'anim_head_lips', 'anim_head_jaw', 'anim_head_snorkle'],
    nameKey: 'SNORKEL_ZOMBIE',
  },
  splitter: { reanim: 'Zombie_yeti', walk: ['anim_walk'], eat: 'anim_eat', death: ['anim_death'], head: ['anim_head1', 'anim_head2'], charred: 'Zombie_charred', nameKey: 'YETI_ZOMBIE' },
  shardling: { reanim: 'Zombie_imp', walk: ['anim_walk'], eat: 'anim_eat', death: ['anim_death'], head: ['anim_head1', 'anim_head2'], scale: 0.85, tint: '#c8e6ff', charred: 'Zombie_charred_imp', nameKey: 'IMP' },
  shade: {
    reanim: 'Zombie_backup',
    walk: ['anim_walk'],
    eat: 'anim_eat',
    death: ['anim_death'],
    head: ['anim_head1', 'anim_head2'],
    alpha: 0.85,
    charred: 'Zombie_charred',
    nameKey: 'BACKUP_DANCER',
  },
  priest: { reanim: 'Zombie_ladder', walk: ['anim_ladderwalk'], eat: 'anim_laddereat', death: ['anim_death'], head: ['anim_head1', 'anim_head2'], charred: 'Zombie_charred', nameKey: 'LADDER_ZOMBIE' },
  bomber: { reanim: 'Zombie_jackbox', walk: ['anim_walk'], eat: 'anim_eat', death: ['anim_death'], head: ['anim_head1', 'anim_head2'], charred: 'Zombie_charred', nameKey: 'JACK_IN_THE_BOX_ZOMBIE' },
  ram: {
    reanim: 'Zombie_football',
    walk: ['anim_walk'],
    eat: 'anim_eat',
    death: ['anim_death'],
    head: ['anim_head1', 'anim_head2', 'anim_hair'],
    charred: 'Zombie_charred',
    nameKey: 'FOOTBALL_ZOMBIE',
  },
  boss_wyrm: { reanim: 'Zombie_digger', walk: ['anim_walk'], eat: 'anim_eat', death: ['anim_death'], scale: 1.7, tint: '#ffb0b0', head: [], hide: ['Zombie_digger_dirt', 'Zombie_digger_rise', 'Zombie_digger_dig'], nameKey: 'DIGGER_ZOMBIE' },
  boss_tempest: { reanim: 'Zombie_balloon', walk: ['anim_idle'], eat: 'anim_idle', death: ['anim_death'], scale: 1.8, tint: '#c9b8ff', flying: true, head: [], hide: ['balloon_pop'], nameKey: 'BALLOON_ZOMBIE' },
  boss_king: { reanim: 'Zombie_boss', walk: ['anim_idle'], eat: 'anim_idle', death: ['anim_death'], idle: 'anim_idle', head: [], nameKey: 'BOSS' },
  blight_orb: { reanim: 'Zombie_boss_fireball', walk: ['anim_role'], eat: 'anim_role', death: ['anim_role'], head: [] },
};

export interface ProjectileSkin {
  image?: string;
  reanim?: string;
  scale?: number;
  spin?: number;
  /** 绘制锚点（图片中心偏移） */
  shadow?: boolean;
  tint?: string;
}

export const PROJECTILE_SKINS: Record<string, ProjectileSkin> = {
  bolt: { image: 'IMAGE_PROJECTILEPEA', shadow: true },
  frost: { image: 'IMAGE_PROJECTILESNOWPEA', shadow: true },
  fire: { reanim: 'FirePea', shadow: true },
  steam: { image: 'IMAGE_PROJECTILESNOWPEA', shadow: true, tint: '#ffffff' },
  thorn: { image: 'IMAGE_PROJECTILECACTUS', shadow: true },
  rock: { image: 'IMAGE_REANIM_CABBAGEPULT_CABBAGE', spin: 6, shadow: true },
  meteor: { image: 'IMAGE_REANIM_MELONPULT_MELON', spin: 4, shadow: true },
  moon: { image: 'IMAGE_PROJECTILE_STAR', spin: 10, shadow: true },
  enemy: { image: 'IMAGE_REANIM_ZOMBIE_CATAPULT_BASKETBALL', spin: 8, shadow: true },
};

/** 每个主题对应的原版音乐曲目 */
export const MUSIC_FOR_THEME: Record<string, string> = {
  day: 'day',
  night: 'night',
  lake: 'pool',
  fog: 'fog',
  sky: 'roof',
  boss: 'boss',
  menu: 'title',
  choose: 'choose',
  minigame: 'minigame',
  puzzle: 'puzzle',
  zen: 'zen',
};
