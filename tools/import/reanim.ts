import type { RawFrame, ReanimFile } from '../../src/pvz/format';

const NUM_KEYS = ['x', 'y', 'kx', 'ky', 'sx', 'sy', 'f', 'a'] as const;

/** 解析文本格式的 .reanim（PC 1.2 版本随游戏附带的 XML 片段，没有根节点） */
export function parseReanimXml(name: string, xml: string): ReanimFile {
  const fps = Number(/<fps>\s*([\d.]+)\s*<\/fps>/.exec(xml)?.[1] ?? 12);
  const tracks: ReanimFile['tracks'] = [];
  const trackRe = /<track>([\s\S]*?)<\/track>/g;
  let m: RegExpExecArray | null;
  while ((m = trackRe.exec(xml))) {
    const body = m[1];
    const tname = /<name>([\s\S]*?)<\/name>/.exec(body)?.[1]?.trim() ?? '';
    const frames: RawFrame[] = [];
    const frameRe = /<t>([\s\S]*?)<\/t>|<t\s*\/>/g;
    let fm: RegExpExecArray | null;
    while ((fm = frameRe.exec(body))) {
      const fb = fm[1] ?? '';
      const fr: RawFrame = {};
      if (fb) {
        const fieldRe = /<(\w+)>([\s\S]*?)<\/\1>/g;
        let km: RegExpExecArray | null;
        while ((km = fieldRe.exec(fb))) {
          const k = km[1];
          const v = km[2].trim();
          if ((NUM_KEYS as readonly string[]).includes(k)) (fr as Record<string, number>)[k] = Number(v);
          else if (k === 'i' || k === 'font' || k === 'text') (fr as Record<string, string>)[k] = v;
        }
      }
      frames.push(fr);
    }
    tracks.push({ name: tname, t: frames });
  }
  return { name, fps, tracks };
}

/**
 * 解析二进制 .reanim.compiled（部分版本只在 pak 中提供编译格式）。
 * 布局：可选 zlib 外壳（D4 FE AD DE），头部 magic 0xB393B4C0，随后是各轨道帧数、轨道名、
 * 变换（8 个 f32，-10000 表示缺省）与图片/字体/文本字符串。
 */
export function parseReanimCompiled(name: string, buf: Uint8Array, inflate: (b: Uint8Array) => Uint8Array): ReanimFile {
  let data = buf;
  const dv0 = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (dv0.getUint32(0, true) === 0xdeadfed4) data = inflate(data.subarray(8));
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 0;
  const u32 = () => {
    const v = dv.getUint32(p, true);
    p += 4;
    return v;
  };
  const f32 = () => {
    const v = dv.getFloat32(p, true);
    p += 4;
    return v;
  };
  const str = () => {
    const n = u32();
    const s = new TextDecoder('latin1').decode(data.subarray(p, p + n));
    p += n;
    return s;
  };
  if (u32() !== 0xb393b4c0) throw new Error(`${name}: 不是 compiled reanim`);
  p += 4;
  const trackCount = u32();
  const fps = f32();
  p += 4;
  u32();
  const counts: number[] = [];
  for (let i = 0; i < trackCount; i++) {
    p += 8;
    counts.push(u32());
  }
  const tracks: ReanimFile['tracks'] = [];
  for (let ti = 0; ti < trackCount; ti++) {
    const tname = str();
    u32();
    const frames: RawFrame[] = [];
    for (let fi = 0; fi < counts[ti]; fi++) {
      const fr: RawFrame = {};
      for (const k of NUM_KEYS) {
        const v = f32();
        if (v !== -10000) (fr as Record<string, number>)[k] = Math.round(v * 1000) / 1000;
      }
      p += 12;
      frames.push(fr);
    }
    for (let fi = 0; fi < counts[ti]; fi++) {
      const img = str();
      const font = str();
      const text = str();
      if (img) frames[fi].i = img;
      if (font) frames[fi].font = font;
      if (text) frames[fi].text = text;
    }
    tracks.push({ name: tname, t: frames });
  }
  return { name, fps, tracks };
}
