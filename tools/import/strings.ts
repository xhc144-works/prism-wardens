/** 解析 LawnStrings.txt（UTF-16 或 UTF-8，格式为 [KEY] 换行 文本 空行） */
export function decodeText(buf: Uint8Array): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder('utf-8').decode(buf.subarray(3));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gbk').decode(buf);
  }
}

export function parseLawnStrings(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let key: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (key) out[key] = buf.join('\n').replace(/\n+$/, '');
    buf = [];
  };
  for (const line of lines) {
    const m = /^\[([A-Z0-9_]+)\]\s*$/.exec(line);
    if (m) {
      flush();
      key = m[1];
    } else if (key) buf.push(line);
  }
  flush();
  return out;
}
