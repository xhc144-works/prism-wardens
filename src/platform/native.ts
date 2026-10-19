/** Electron 预加载脚本暴露的原生接口（浏览器环境下不存在） */
export interface NativeBridge {
  isElectron: true;
  version: string;
  platform: string;
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
    list(): Promise<string[]>;
  };
  backup: {
    create(label: string): Promise<string>;
    list(): Promise<{ id: string; label: string; time: number; size: number }[]>;
    restore(id: string): Promise<boolean>;
    remove(id: string): Promise<void>;
    openFolder(): Promise<void>;
  };
  window: {
    setFullscreen(on: boolean): Promise<void>;
    isFullscreen(): Promise<boolean>;
    setSize(w: number, h: number): Promise<void>;
    quit(): Promise<void>;
  };
  update: {
    check(): Promise<{ status: string; version?: string; message?: string }>;
    download(): Promise<void>;
    install(): Promise<void>;
    info?(): Promise<{ enabled: boolean; signature: boolean; publisherName: string[] | null }>;
    onStatus(cb: (s: { status: string; version?: string; percent?: number; message?: string }) => void): void;
  };
  file: {
    save(name: string, content: string): Promise<boolean>;
    open(filters?: { name: string; extensions: string[] }[]): Promise<{ name: string; content: string } | null>;
  };
  dataPath(): Promise<string>;
  reload(): Promise<void>;
  assets: {
    status(): Promise<AssetStatus>;
    pick(kind: 'dir' | 'file'): Promise<string | null>;
    import(source: string): Promise<AssetImportMessage>;
    remove(): Promise<boolean>;
    onProgress(cb: (m: AssetImportMessage) => void): void;
  };
}

export interface AssetStatus {
  imported: boolean;
  bundled: boolean;
  source: string;
  importedAt: string;
  bytes: number;
}

export type AssetImportMessage =
  | { type: 'log'; text: string }
  | { type: 'progress'; done: number; total: number; stage: string }
  | { type: 'done'; reanims: number; images: number; sounds: number; source: string; music: boolean }
  | { type: 'error'; text: string };

declare global {
  interface Window {
    prismNative?: NativeBridge;
  }
}

export const native: NativeBridge | undefined = typeof window !== 'undefined' ? window.prismNative : undefined;
export const isElectron = !!native;
