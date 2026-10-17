import { native } from './native';

/** 键值存储：Electron 下写入用户数据目录的 JSON 文件，浏览器下使用 localStorage。 */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  list(): Promise<string[]>;
}

const PREFIX = 'pw:';

class LocalKV implements KV {
  private mem = new Map<string, string>();
  private ok = true;
  constructor() {
    try {
      localStorage.setItem('__pw_test', '1');
      localStorage.removeItem('__pw_test');
    } catch {
      this.ok = false;
    }
  }
  async get(key: string): Promise<string | null> {
    if (!this.ok) return this.mem.get(key) ?? null;
    try {
      return localStorage.getItem(PREFIX + key);
    } catch {
      return this.mem.get(key) ?? null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    this.mem.set(key, value);
    if (!this.ok) return;
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch (e) {
      console.warn('存储失败（可能超出容量）', key, e);
      throw e;
    }
  }
  async remove(key: string): Promise<void> {
    this.mem.delete(key);
    if (!this.ok) return;
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  }
  async list(): Promise<string[]> {
    if (!this.ok) return [...this.mem.keys()];
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
      }
    } catch {
      return [...this.mem.keys()];
    }
    return out;
  }
}

export const kv: KV = native ? native.storage : new LocalKV();

export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  const s = await kv.get(key);
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  await kv.set(key, JSON.stringify(value));
}

/** 浏览器下载文件 / Electron 保存对话框 */
export async function exportFile(name: string, content: string): Promise<boolean> {
  if (native) return native.file.save(name, content);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/** 打开文件（JSON/JS/文本） */
export async function importFile(accept = '.json,.js,.txt'): Promise<{ name: string; content: string } | null> {
  if (native) return native.file.open([{ name: '棱镜守卫文件', extensions: accept.split(',').map((x) => x.replace('.', '')) }]);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      resolve({ name: f.name, content: await f.text() });
    };
    input.click();
  });
}
