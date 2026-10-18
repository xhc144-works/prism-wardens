/* =========================================================================
 * 棱镜守卫 Prism Wardens — 核心数据类型
 * core/ 目录下的代码不依赖 DOM，可在浏览器、Web Worker 与 Node 中运行。
 * ========================================================================= */

/** 地形编码：g 苔原 / w 灵泉(水) / r 岩石 / h 高地 / v 晶脉 / b 蚀地 / i 冰面 / x 虚空 */
export type TerrainCode = 'g' | 'w' | 'r' | 'h' | 'v' | 'b' | 'i' | 'x';

export type UnitCategory =
  | 'producer'
  | 'shooter'
  | 'lobber'
  | 'wall'
  | 'trap'
  | 'bomb'
  | 'melee'
  | 'support'
  | 'aquatic'
  | 'utility';

export type AttackKind = 'projectile' | 'lob' | 'chain' | 'melee' | 'instant' | 'aura' | 'none';

export type UnitBehavior =
  | 'producer'
  | 'upgradeProducer'
  | 'shooter'
  | 'lobber'
  | 'chain'
  | 'wall'
  | 'spike'
  | 'mine'
  | 'instantBomb'
  | 'laneBomb'
  | 'freezeAll'
  | 'devourer'
  | 'totem'
  | 'bell'
  | 'mender'
  | 'plate'
  | 'lurker'
  | 'lantern'
  | 'gale'
  | 'magnet'
  | 'gravity'
  | 'squash'
  | 'aura'
  | 'gravebuster'
  | 'garlic';

export type ProjKind = 'bolt' | 'frost' | 'fire' | 'steam' | 'thorn' | 'rock' | 'meteor' | 'moon' | 'spark' | 'spore' | 'fume' | 'kernel' | 'butter' | 'icemeteor';

export interface ArtColors {
  a: string; // 主色
  b: string; // 副色
  glow: string; // 发光色
}

export interface UnitDef {
  id: string;
  name: string;
  nameEn: string;
  desc: string;
  lore?: string;
  category: UnitCategory;
  attack: AttackKind;
  behavior: UnitBehavior;
  cost: number;
  cooldown: number; // 秒
  hp: number;
  damage?: number;
  interval?: number; // 攻击/生产间隔（秒）
  shots?: number; // 每轮发射数
  lanes?: number[]; // 相对行（射手）
  back?: number; // 向后发射数量
  range?: number; // 射程（列）/作用半径
  slow?: { mul: number; dur: number };
  pierce?: boolean;
  splash?: number;
  splashMul?: number;
  projSpeed?: number;
  projKind?: ProjKind;
  antiAir?: boolean;
  produce?: number;
  firstDelay?: [number, number];
  armTime?: number;
  fuse?: number;
  radius?: number;
  chains?: number;
  chainRange?: number;
  heal?: number;
  buffRate?: number;
  digest?: number;
  aquatic?: boolean; // 只能放在水上（无需浮台）
  upgradeOf?: string; // 只能放在该单位之上
  tall?: boolean; // 高大：阻挡跳跃
  noBite?: boolean; // 敌人可直接踩过（地刺）
  instant?: boolean; // 一次性（炸弹类）
  lunar?: number; // 夜晚/月蚀伤害倍率
  solar?: number; // 白天伤害倍率
  grow?: { after: number; produce: number }; // 生产者：放置 after 秒后成长，产出提升
  popCost?: number; // 地刺类：每刺破一辆载具损失的生命（不设则刺破后自毁）
  butter?: number; // 投手：每次投掷改为黄油的概率（定身）
  stun?: number; // 定身秒数
  ignoreShield?: boolean; // 攻击穿透盾牌
  divert?: boolean; // 被啃咬后把敌人赶到相邻行
  crater?: number; // 爆炸后在所在格留下弹坑的秒数
  colors: ArtColors;
  art: string;
  tags?: string[];
  custom?: boolean;
}

export type ArmorKind = 'helm' | 'shield' | 'mask';
export type BossKind = 'wyrm' | 'tempest' | 'king';

export interface EnemyDef {
  id: string;
  name: string;
  nameEn: string;
  desc: string;
  hp: number;
  speed: number; // 列/秒
  dps: number;
  armor?: { kind: ArmorKind; hp: number; metal: boolean };
  flying?: boolean;
  burrow?: boolean;
  swim?: boolean;
  vehicle?: boolean;
  jumper?: boolean;
  summoner?: boolean;
  healer?: boolean;
  splitter?: { into: string; count: number };
  stealth?: boolean;
  crusher?: boolean;
  bomber?: boolean;
  catapult?: boolean;
  berserk?: boolean;
  thrower?: boolean;
  ram?: boolean;
  pogo?: boolean; // 连续跳跃，遇到高大单位或被磁力吸走跳杆后停止
  rider?: boolean; // 水面骑乘（不潜水），遇到第一个单位时跃过
  bungee?: boolean; // 从空中降下偷走一个单位
  boss?: BossKind;
  cost: number; // 波次预算点
  weight: number; // 生成权重
  minWave?: number;
  noSpawn?: boolean; // 仅作为召唤物出现
  coin: number; // 掉落金币概率
  scale: number;
  art: string;
  colors: { a: string; b: string; eye: string };
  custom?: boolean;
}

export type Theme = 'day' | 'night' | 'lake' | 'fog' | 'sky';

export interface MapDef {
  id: string;
  name: string;
  theme: Theme;
  rows: number;
  cols: number;
  terrain: string[]; // 每行一个字符串，长度 = cols
  spawnRows?: number[];
  arrows?: { row: number; col: number; dir: -1 | 1 }[];
  nodes?: { row: number; col: number }[];
  tombs?: { row: number; col: number }[];
  preplaced?: { row: number; col: number; unit: string }[];
  sentinels?: boolean;
  custom?: boolean;
}

export type WeatherId = 'clear' | 'sunny' | 'rain' | 'storm' | 'fog' | 'blizzard' | 'eclipse' | 'sandstorm';

export type WeatherPlan =
  | { mode: 'fixed'; id: WeatherId }
  | { mode: 'cycle'; list: { id: WeatherId; duration: number }[] }
  | { mode: 'random'; pool: WeatherId[]; min: number; max: number };

export interface WaveSpawn {
  enemy: string;
  count: number;
  row?: number;
  delay?: number;
}

export interface WaveDef {
  spawns: WaveSpawn[];
  flag?: boolean;
  note?: string;
}

export interface WaveGen {
  count: number;
  flagEvery: number;
  base: number;
  growth: number;
  pool: string[];
  flagMul?: number;
  bossAtEnd?: string;
}

export type Objective =
  | { type: 'waves' }
  | { type: 'survive'; seconds: number }
  | { type: 'kills'; count: number }
  | { type: 'endless' };

export interface LevelDef {
  id: string;
  name: string;
  chapter?: number;
  index?: number;
  desc: string;
  map: string | MapDef;
  time: 'day' | 'night';
  startLumen: number;
  skyDrops?: boolean;
  skyInterval?: [number, number];
  waves?: WaveDef[];
  gen?: WaveGen;
  firstWaveDelay?: number;
  waveGap?: [number, number];
  weather?: WeatherPlan;
  events?: { enabled: boolean; interval: [number, number]; pool?: string[] };
  enemyPool: string[];
  objective?: Objective;
  rewards?: { card?: string; coins?: number; skill?: string; item?: string };
  deckSize?: number;
  forcedCards?: string[];
  bannedCards?: string[];
  relics?: { row: number; col: number; hp: number }[];
  hpMul?: number;
  tutorial?: string[];
  bossLevel?: boolean;
  custom?: boolean;
}

export type GameMode = 'adventure' | 'endless' | 'survival' | 'challenge' | 'custom' | 'sandbox' | 'research';

/* ---------------------------- 修改器 ---------------------------- */

export interface StatMul {
  damage?: number;
  rate?: number;
  hp?: number;
  cost?: number;
  cooldown?: number;
}

export interface EnemyMul {
  hp?: number;
  speed?: number;
  count?: number;
  spawnRate?: number;
  damage?: number;
}

export interface AutoDeploy {
  unit: string;
  interval: number;
  mode: 'threat' | 'fill' | 'front' | 'back';
}

export interface CheatConfig {
  infiniteLumen?: boolean;
  noCooldown?: boolean;
  freeCards?: boolean;
  unit?: StatMul;
  perUnit?: Record<string, StatMul>;
  enemy?: EnemyMul;
  perEnemy?: Record<string, EnemyMul>;
  autoCollect?: boolean;
  autoDeploy?: AutoDeploy | null;
  invincibleUnits?: boolean;
  infiniteSentinels?: boolean;
  oneHitKill?: boolean;
  noLose?: boolean;
}

/* ---------------------------- 挑战规则 ---------------------------- */

export interface RuleConstraints {
  allowedCards?: string[];
  allowedCategories?: UnitCategory[];
  allowedAttackKinds?: AttackKind[];
  bannedCards?: string[];
  bannedCategories?: UnitCategory[];
  bannedSkills?: string[];
  bannedItems?: string[];
  maxDeckSize?: number;
  maxTotalSpend?: number;
  maxUnitsAlive?: number;
  maxPlacements?: number;
  maxOperations?: number;
  countCollectAsOp?: boolean;
  maxPerCard?: Record<string, number>;
  placementCols?: [number, number];
  placementRows?: number[];
  placementWindows?: { from: number; to: number }[];
  placeOnlyBetweenWaves?: boolean;
  noUpgrades?: boolean;
  maxRank?: number;
  noRemove?: boolean;
  noSkills?: boolean;
  noItems?: boolean;
  cooldownMul?: number;
  costMul?: number;
  protect?: { row: number; col: number; hp: number }[];
  timeLimit?: number;
  noSentinels?: boolean;
  startLumen?: number;
  noSkyDrops?: boolean;
  weather?: WeatherPlan;
  maxUnitLosses?: number;
}

export type ScoringMetric = 'clear' | 'min-spend' | 'min-ops' | 'fastest' | 'min-units' | 'max-lumen';

export interface RuleSet {
  id: string;
  name: string;
  desc: string;
  level?: string;
  constraints: RuleConstraints;
  script?: string;
  scoring?: ScoringMetric;
  builtin?: boolean;
  author?: string;
  created?: number;
}

/* ---------------------------- 指令 ---------------------------- */

export type Command =
  | { type: 'place'; card: string; row: number; col: number }
  | { type: 'remove'; row: number; col: number }
  | { type: 'collect'; orb: number }
  | { type: 'upgrade'; row: number; col: number }
  | { type: 'skill'; skill: string; row?: number; col?: number }
  | { type: 'item'; item: string; row?: number; col?: number }
  | { type: 'cheats'; config: CheatConfig | null }
  | { type: 'setLumen'; value: number }
  | { type: 'spawn'; enemy: string; row: number }
  | { type: 'killAll' }
  | { type: 'reselect'; deck: string[] }
  | { type: 'option'; autoCollect: boolean };

export type CommandSource = 'human' | 'ai' | 'auto' | 'cheat' | 'replay' | 'system';

export interface CommandResult {
  ok: boolean;
  reason?: string;
  rule?: boolean; // 被挑战规则拒绝
}

export interface RecordedCommand {
  tick: number;
  cmd: Command;
  src: CommandSource;
}

/* ---------------------------- 对局配置 ---------------------------- */

export interface GameConfig {
  mode: GameMode;
  level: LevelDef;
  deck: string[];
  skills: string[];
  items: Record<string, number>;
  seed: number;
  rules?: RuleSet | null;
  cheats?: CheatConfig | null;
  cheatsAllowed?: boolean;
  upgrades?: Record<string, number>;
  difficulty?: number;
  survivalRounds?: number;
  label?: string;
  options?: { autoCollect?: boolean; fullVision?: boolean };
}

/* ---------------------------- 表现事件 ---------------------------- */

export type FxEvent =
  | { t: 'shoot'; x: number; row: number; kind: ProjKind; unit: number }
  | { t: 'hit'; x: number; row: number; kind: ProjKind; dmg: number }
  | { t: 'explode'; x: number; row: number; radius: number; kind: 'nova' | 'mine' | 'fire' | 'bomber' | 'meteor' | 'steam' | 'doom' | 'squash' }
  | { t: 'lane'; row: number; kind: 'fire' }
  | { t: 'freeze' }
  | { t: 'place'; row: number; col: number; unit: string }
  | { t: 'remove'; row: number; col: number }
  | { t: 'upgrade'; row: number; col: number; rank: number }
  | { t: 'unitDie'; row: number; col: number; unit: string }
  | { t: 'enemyDie'; x: number; row: number; enemy: string; y: number }
  | { t: 'armorBreak'; x: number; row: number; kind: ArmorKind }
  | { t: 'orb'; id: number }
  | { t: 'collect'; id: number; value: number; x: number; y: number }
  | { t: 'coin'; x: number; row: number }
  | { t: 'wave'; index: number; flag: boolean }
  | { t: 'flagWarn' }
  | { t: 'weather'; id: WeatherId }
  | { t: 'event'; id: string; text: string }
  | { t: 'combo'; id: string; row: number; col: number }
  | { t: 'lightning'; x: number; row: number; x2?: number; row2?: number }
  | { t: 'chain'; pts: { x: number; row: number }[] }
  | { t: 'sentinel'; row: number }
  | { t: 'bite'; row: number; col: number }
  | { t: 'devour'; row: number; col: number }
  | { t: 'boss'; text: string }
  | { t: 'text'; text: string; color?: string }
  | { t: 'skill'; id: string; row?: number; col?: number }
  | { t: 'heal'; row: number; col: number }
  | { t: 'gale' }
  | { t: 'pull'; row: number }
  | { t: 'magnet'; x: number; row: number; ux: number; urow: number }
  | { t: 'splash'; x: number; row: number }
  | { t: 'squash'; row: number; col: number; x: number }
  | { t: 'aura'; row: number; col: number; unit: number }
  | { t: 'tombBreak'; row: number; col: number }
  | { t: 'divert'; x: number; row: number; from: number }
  | { t: 'steal'; row: number; col: number; unit: string; by: number }
  | { t: 'bungee'; x: number; row: number; id: number }
  | { t: 'end'; won: boolean };

export interface FxRecord {
  tick: number;
  e: FxEvent;
}
