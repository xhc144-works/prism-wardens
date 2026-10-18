/**
 * 原版资源包（由导入工具生成）的数据格式定义。
 * 运行时与导入工具共用；这里只描述格式，不含任何素材。
 */

/** reanim 单帧：缺省字段表示沿用上一帧 */
export interface RawFrame {
  x?: number;
  y?: number;
  kx?: number;
  ky?: number;
  sx?: number;
  sy?: number;
  /** 0 = 显示，-1 = 隐藏 */
  f?: number;
  /** 图片资源 id（如 IMAGE_REANIM_PEASHOOTER_HEAD） */
  i?: string;
  a?: number;
  font?: string;
  text?: string;
}

export interface RawTrack {
  name: string;
  t: RawFrame[];
}

export interface ReanimFile {
  name: string;
  fps: number;
  tracks: RawTrack[];
}

export interface ImageEntry {
  /** 相对资源包根目录的路径（小写） */
  src: string;
  /** 灰度透明遮罩（jpg 配套的 _.png 或 alphagrid） */
  mask?: string;
  rows?: number;
  cols?: number;
}

export interface MusicTune {
  main: string;
  drums?: string;
  hihats?: string;
  loopStart: number;
  loopEnd: number;
}

export interface FontEntry {
  /** 字体描述文本（已转为 UTF-8） */
  desc: string;
  image?: string;
}

export interface AssetManifest {
  format: 1;
  /** 导入来源描述（文件名、版本） */
  source: string;
  importedAt: string;
  importerVersion: string;
  images: Record<string, ImageEntry>;
  /** reanim 名（原始大小写） -> json 路径 */
  reanims: Record<string, string>;
  /** 粒子名 -> json 路径 */
  particles: Record<string, string>;
  /** 音效 id（小写文件名，无扩展名）-> 路径 */
  sounds: Record<string, string>;
  /** 音乐曲目（分层 OGG 与循环点） */
  music: Record<string, MusicTune>;
  fonts: Record<string, FontEntry>;
  /** 本地化文本 */
  strings: string;
  stats: { files: number; bytes: number };
}

export interface ParticleFieldDef {
  type: string;
  x?: string;
  y?: string;
}

export interface ParticleEmitterDef {
  /** 发射器属性（数值轨道为原始字符串） */
  props: Record<string, string>;
  fields: ParticleFieldDef[];
  systemFields: ParticleFieldDef[];
}

export interface ParticleFile {
  name: string;
  emitters: ParticleEmitterDef[];
}
