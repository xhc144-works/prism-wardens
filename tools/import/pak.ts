/**
 * PopCap PAK 读取器（main.pak）。
 * 格式：整个文件按字节 XOR 0xF7；解码后为 magic 0xBAC04AC0、版本号、文件记录表，
 * 之后按记录顺序紧密排列文件数据。只读取格式本身，不包含任何游戏素材。
 */
export interface PakEntry {
  name: string;
  offset: number;
  size: number;
}

const MAGIC = 0xbac04ac0;
const KEY = 0xf7;

export function readPak(raw: Uint8Array): { entries: PakEntry[]; data: Uint8Array } {
  const data = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw[i] ^ KEY;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('不是有效的 PopCap PAK 文件');
  let p = 8;
  const recs: { name: string; size: number }[] = [];
  const dec = new TextDecoder('latin1');
  while (p < data.length) {
    const flag = data[p++];
    if (flag & 0x80) break;
    const len = data[p++];
    const name = dec.decode(data.subarray(p, p + len)).replace(/\\/g, '/');
    p += len;
    const size = dv.getUint32(p, true);
    p += 4 + 8;
    recs.push({ name, size });
  }
  const entries: PakEntry[] = [];
  for (const r of recs) {
    entries.push({ name: r.name, offset: p, size: r.size });
    p += r.size;
  }
  if (p > data.length) throw new Error('PAK 文件不完整');
  return { entries, data };
}
