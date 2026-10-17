import type { CheatConfig, RuleSet } from '../core/types';
import { type Profile, migrateProfile, newProfile } from '../core/meta/profile';
import { CONTENT, type ContentPack } from '../core/content/registry';
import { BUILTIN_PRESETS, DEFAULT_CHEATS, type CheatPreset } from '../core/cheats/presets';
import type { BattleReport } from '../core/report/report';
import type { ReplayData } from '../core/replay/replay';
import type { LevelKnowledge } from '../ai/coach';
import { getJSON, kv, setJSON } from '../platform/storage';
import { native } from '../platform/native';

export interface Settings {
  volume: { master: number; music: number; sfx: number };
  fullscreen: boolean;
  resolution: string;
  particles: 'high' | 'low';
  damageNumbers: boolean;
  showHp: boolean;
  screenShake: boolean;
  showGrid: boolean;
  autoCollect: boolean;
  defaultSpeed: number;
  showFps: boolean;
  autosave: boolean;
  cheatsEnabled: boolean;
  cheats: CheatConfig;
  activePreset: string;
  aiOverlay: boolean;
  difficulty: number;
}

export const DEFAULT_SETTINGS: Settings = {
  volume: { master: 0.8, music: 0.5, sfx: 0.8 },
  fullscreen: false,
  resolution: '1280x720',
  particles: 'high',
  damageNumbers: true,
  showHp: true,
  screenShake: true,
  showGrid: false,
  autoCollect: false,
  defaultSpeed: 1,
  showFps: false,
  autosave: true,
  cheatsEnabled: false,
  cheats: DEFAULT_CHEATS,
  activePreset: 'default',
  aiOverlay: true,
  difficulty: 1,
};

export interface ReplayMeta {
  id: string;
  name: string;
  created: number;
  level: string;
  player: string;
  won: boolean;
  time: number;
}

export interface LeaderEntry {
  board: string; // 挑战 id 或关卡 id
  who: string;
  won: boolean;
  time: number;
  spent: number;
  ops: number;
  units: number;
  date: number;
  replayId?: string;
  verified: boolean; // 无修改器
}

export interface ResearchRecord {
  id: string;
  created: number;
  level: string;
  rules?: string;
  objective: string;
  deck: string[];
  params: Record<string, unknown>;
  fitness: number;
  winRate: number;
  avgSpent: number;
  avgOps: number;
  avgTime: number;
}

export interface AppData {
  settings: Settings;
  profiles: Profile[];
  activeProfile: string;
  customPack: ContentPack;
  cheatPresets: CheatPreset[];
  customRules: RuleSet[];
  replays: ReplayMeta[];
  reports: BattleReport[];
  leaderboard: LeaderEntry[];
  aiKnowledge: Record<string, LevelKnowledge>;
  research: ResearchRecord[];
}

type Key = keyof AppData;
const PERSIST: Key[] = ['settings', 'profiles', 'activeProfile', 'customPack', 'cheatPresets', 'customRules', 'replays', 'reports', 'leaderboard', 'aiKnowledge', 'research'];
const MAX_REPLAYS = 40;
const MAX_REPORTS = 40;
const MAX_LOCAL_BACKUPS = 8;

class Store {
  data: AppData = {
    settings: { ...DEFAULT_SETTINGS },
    profiles: [],
    activeProfile: '',
    customPack: { format: 'prism-wardens-pack', version: 1, units: [], enemies: [], maps: [], levels: [], rules: [] },
    cheatPresets: [],
    customRules: [],
    replays: [],
    reports: [],
    leaderboard: [],
    aiKnowledge: {},
    research: [],
  };
  loaded = false;
  lastSaved = 0;
  saving = false;
  private listeners = new Set<() => void>();
  private dirty = new Set<Key>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  version = 0;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  async load(): Promise<void> {
    for (const k of PERSIST) {
      const v = await getJSON<unknown>(k, undefined);
      if (v !== undefined && v !== null) (this.data as unknown as Record<string, unknown>)[k] = v;
    }
    this.data.settings = { ...DEFAULT_SETTINGS, ...this.data.settings, volume: { ...DEFAULT_SETTINGS.volume, ...(this.data.settings?.volume ?? {}) } };
    this.data.profiles = (this.data.profiles ?? []).map(migrateProfile);
    if (!this.data.profiles.length) {
      const p = newProfile('守卫者');
      this.data.profiles.push(p);
      this.data.activeProfile = p.id;
      this.dirty.add('profiles');
      this.dirty.add('activeProfile');
    }
    if (!this.data.profiles.some((p) => p.id === this.data.activeProfile)) this.data.activeProfile = this.data.profiles[0].id;
    CONTENT.setCustomPack(this.data.customPack);
    this.loaded = true;
    this.notify();
    if (this.dirty.size) await this.flush();
  }

  get settings(): Settings {
    return this.data.settings;
  }

  get profile(): Profile {
    return this.data.profiles.find((p) => p.id === this.data.activeProfile) ?? this.data.profiles[0];
  }

  /** 修改数据并安排自动保存 */
  update(keys: Key[], fn: (d: AppData) => void): void {
    fn(this.data);
    for (const k of keys) this.dirty.add(k);
    if (keys.includes('customPack')) CONTENT.setCustomPack(this.data.customPack);
    this.notify();
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 600);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const keys = [...this.dirty];
    this.dirty.clear();
    if (!keys.length) return;
    this.saving = true;
    try {
      for (const k of keys) await setJSON(k, this.data[k]);
      this.lastSaved = Date.now();
    } catch (e) {
      console.error('保存失败', e);
      for (const k of keys) this.dirty.add(k);
    } finally {
      this.saving = false;
      this.notify();
    }
  }

  /* ---------------------------- 存档（档案） ---------------------------- */

  createProfile(name: string): Profile {
    const p = newProfile(name);
    this.update(['profiles', 'activeProfile'], (d) => {
      d.profiles.push(p);
      d.activeProfile = p.id;
    });
    return p;
  }

  deleteProfile(id: string): void {
    this.update(['profiles', 'activeProfile'], (d) => {
      d.profiles = d.profiles.filter((p) => p.id !== id);
      if (!d.profiles.length) d.profiles.push(newProfile('守卫者'));
      if (!d.profiles.some((p) => p.id === d.activeProfile)) d.activeProfile = d.profiles[0].id;
    });
  }

  switchProfile(id: string): void {
    this.update(['activeProfile'], (d) => {
      d.activeProfile = id;
    });
  }

  saveProfile(): void {
    this.update(['profiles'], (d) => {
      const p = d.profiles.find((x) => x.id === d.activeProfile);
      if (p) p.updated = Date.now();
    });
  }

  /* ---------------------------- 录像 ---------------------------- */

  async saveReplay(r: ReplayData): Promise<void> {
    try {
      await setJSON(`replay:${r.id}`, r);
    } catch {
      // 空间不足时删除最旧的录像再试
      const old = this.data.replays[this.data.replays.length - 1];
      if (old) await this.deleteReplay(old.id);
      await setJSON(`replay:${r.id}`, r);
    }
    this.update(['replays'], (d) => {
      d.replays.unshift({ id: r.id, name: r.name, created: r.created, level: r.config.level.name, player: r.player, won: r.result.won, time: r.result.time });
      while (d.replays.length > MAX_REPLAYS) {
        const x = d.replays.pop()!;
        void kv.remove(`replay:${x.id}`);
      }
    });
  }

  async loadReplay(id: string): Promise<ReplayData | null> {
    return getJSON<ReplayData | null>(`replay:${id}`, null);
  }

  async deleteReplay(id: string): Promise<void> {
    await kv.remove(`replay:${id}`);
    this.update(['replays'], (d) => {
      d.replays = d.replays.filter((x) => x.id !== id);
    });
  }

  addReport(r: BattleReport): void {
    this.update(['reports'], (d) => {
      d.reports.unshift(r);
      if (d.reports.length > MAX_REPORTS) d.reports.length = MAX_REPORTS;
    });
  }

  addLeader(e: LeaderEntry): void {
    this.update(['leaderboard'], (d) => {
      d.leaderboard.push(e);
      if (d.leaderboard.length > 1000) d.leaderboard.splice(0, d.leaderboard.length - 1000);
    });
  }

  /* ---------------------------- 备份 ---------------------------- */

  async snapshot(): Promise<string> {
    await this.flush();
    const all: Record<string, unknown> = { __format: 'prism-wardens-backup', __version: 1, __time: Date.now() };
    for (const k of PERSIST) all[k] = this.data[k];
    const replayData: Record<string, unknown> = {};
    for (const r of this.data.replays.slice(0, 10)) {
      const d = await this.loadReplay(r.id);
      if (d) replayData[r.id] = d;
    }
    all.__replays = replayData;
    return JSON.stringify(all);
  }

  async restoreSnapshot(json: string): Promise<string | null> {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(json);
    } catch {
      return '文件不是有效的 JSON';
    }
    if (obj.__format !== 'prism-wardens-backup') return '不是棱镜守卫的备份文件';
    for (const k of PERSIST) if (obj[k] !== undefined) (this.data as unknown as Record<string, unknown>)[k] = obj[k];
    const reps = (obj.__replays ?? {}) as Record<string, unknown>;
    for (const [id, d] of Object.entries(reps)) await setJSON(`replay:${id}`, d);
    for (const k of PERSIST) this.dirty.add(k);
    await this.flush();
    await this.load();
    return null;
  }

  async createBackup(label = '手动备份'): Promise<void> {
    await this.flush();
    if (native) {
      await native.backup.create(label);
      return;
    }
    const snap = await this.snapshot();
    const id = `backup:${Date.now()}`;
    await kv.set(id, JSON.stringify({ label, time: Date.now(), data: snap }));
    const keys = (await kv.list()).filter((k) => k.startsWith('backup:')).sort();
    while (keys.length > MAX_LOCAL_BACKUPS) await kv.remove(keys.shift()!);
  }

  async listBackups(): Promise<{ id: string; label: string; time: number; size: number }[]> {
    if (native) return native.backup.list();
    const keys = (await kv.list()).filter((k) => k.startsWith('backup:')).sort().reverse();
    const out: { id: string; label: string; time: number; size: number }[] = [];
    for (const k of keys) {
      const s = await kv.get(k);
      if (!s) continue;
      try {
        const o = JSON.parse(s);
        out.push({ id: k, label: o.label, time: o.time, size: s.length });
      } catch {
        /* ignore */
      }
    }
    return out;
  }

  async restoreBackup(id: string): Promise<string | null> {
    if (native) {
      const ok = await native.backup.restore(id);
      if (!ok) return '恢复失败';
      await this.load();
      return null;
    }
    const s = await kv.get(id);
    if (!s) return '备份不存在';
    const o = JSON.parse(s);
    return this.restoreSnapshot(o.data);
  }

  async deleteBackup(id: string): Promise<void> {
    if (native) return native.backup.remove(id);
    await kv.remove(id);
  }

  allCheatPresets(): CheatPreset[] {
    return [...BUILTIN_PRESETS, ...this.data.cheatPresets];
  }
}

export const store = new Store();

/* ---------------------------- Preact hook ---------------------------- */
import { useEffect, useState } from 'preact/hooks';

export function useStore(): AppData {
  const [, setV] = useState(0);
  useEffect(() => store.subscribe(() => setV((v) => v + 1)), []);
  return store.data;
}
