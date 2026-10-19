/**
 * 经典皮肤下的显示名称：单位/敌人使用导入的原版文本（LawnStrings）中的名称，
 * 章节使用原版场景名。只修改显示用字段，模拟逻辑只依赖 id，不受影响。
 */
import { CONTENT } from '../../core/content/registry';
import { CHAPTERS, LEVELS } from '../../core/content/levels';
import { SKILLS, ITEMS } from '../../core/content/abilities';
import { BUILTIN_CHALLENGES } from '../../core/content/challenges';
import { COMBOS, EVENTS, TERRAIN, WEATHER } from '../../core/content/environment';
import { ACHIEVEMENTS } from '../../core/meta/achievements';
import { PVZ } from '../../pvz/assets';
import { PLANT_SKINS, ZOMBIE_SKINS } from '../../render/classic/skins';

export const CLASSIC_CHAPTERS = ['白天', '黑夜', '泳池', '浓雾', '屋顶'];

let applied = false;

export function applyClassicNames(): void {
  if (applied || !PVZ.available) return;
  applied = true;
  for (const u of CONTENT.allUnits()) {
    const k = PLANT_SKINS[u.id]?.nameKey;
    const n = k ? PVZ.str(k) : '';
    if (n) {
      (u as { originalName?: string }).originalName = u.name;
      u.name = n;
    }
  }
  for (const e of CONTENT.enemies.values()) {
    const k = ZOMBIE_SKINS[e.id]?.nameKey;
    const n = k ? PVZ.str(k) : '';
    if (n && !e.boss) {
      (e as { originalName?: string }).originalName = e.name;
      e.name = n;
    }
  }
  CHAPTERS.forEach((c, i) => {
    c.name = `${CLASSIC_CHAPTERS[i] ?? c.name}`;
  });
  // 术语替换：单位/敌人旧名 -> 原版名，以及通用词汇
  const pairs: [string, string][] = [];
  for (const u of CONTENT.allUnits()) {
    const o = (u as { originalName?: string }).originalName;
    if (o && o !== u.name) pairs.push([o, u.name]);
  }
  for (const e of CONTENT.enemies.values()) {
    const o = (e as { originalName?: string }).originalName;
    if (o && o !== e.name) pairs.push([o, e.name]);
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  pairs.push(...TERMS);
  const tr = (t: string | undefined): string | undefined => {
    if (!t) return t;
    let r = t;
    for (const [a, b] of pairs) if (r.includes(a)) r = r.split(a).join(b);
    return r;
  };
  // 背景故事：优先使用原版图鉴中的风味文字；否则只替换通用术语（避免把名称替换进其他词语里）
  const termsOnly = (t: string) => {
    let r = t;
    for (const [a, b] of TERMS) if (r.includes(a)) r = r.split(a).join(b);
    return r;
  };
  for (const u of CONTENT.allUnits()) {
    u.desc = tr(u.desc)!;
    const k = PLANT_SKINS[u.id]?.nameKey;
    const raw = k ? PVZ.str(`${k}_DESCRIPTION`) : '';
    const flavor = raw.includes('{FLAVOR}') ? raw.slice(raw.indexOf('{FLAVOR}') + 8).replace(/\{[^}]*\}/g, '').trim() : '';
    if (flavor) u.lore = flavor;
    else if (u.lore) u.lore = termsOnly(u.lore);
  }
  for (const e of CONTENT.enemies.values()) e.desc = tr(e.desc)!;
  for (const l of LEVELS) {
    l.desc = tr(l.desc)!;
    if (l.tutorial) l.tutorial = l.tutorial.map((x) => tr(x)!);
  }
  for (const c of CHAPTERS) c.desc = tr(c.desc)!;
  for (const x of [...SKILLS, ...ITEMS]) x.desc = tr(x.desc)!;
  for (const x of BUILTIN_CHALLENGES) x.desc = tr(x.desc)!;
  for (const x of Object.values(WEATHER)) x.desc = tr(x.desc)!;
  for (const x of EVENTS) x.desc = tr(x.desc)!;
  for (const x of COMBOS) x.desc = tr(x.desc)!;
  for (const x of Object.values(TERRAIN)) x.desc = tr(x.desc)!;
  for (const x of ACHIEVEMENTS) x.desc = tr(x.desc)!;
}

/** 本作原创术语 -> 原版风格术语 */
export const TERMS: [string, string][] = [
  ['光能晶簇', '阳光花束'],
  ['天降光能', '天降阳光'],
  ['月华光能', '月光阳光'],
  ['光能', '阳光'],
  ['光球', '阳光'],
  ['虚蚀者', '僵尸'],
  ['蚀灵', '僵尸'],
  ['蚀潮', '尸潮'],
  ['符文哨卫', '小推车'],
  ['守卫们', '植物们'],
  ['守卫', '植物'],
  ['浮晶台', '睡莲'],
  ['蚀晶碑', '墓碑'],
];

/** 运行时文本（界面上的提示等）也做同样的术语替换 */
export function classicText(t: string): string {
  if (!applied) return t;
  let r = t;
  for (const [a, b] of TERMS) if (r.includes(a)) r = r.split(a).join(b);
  return r;
}

/**
 * 经典皮肤下把界面上硬编码的本作术语替换为原版术语（光能 → 阳光 等）。
 * 监听 DOM 文本与提示文字的变化；替换是幂等的，不会与 Preact 的更新互相触发。
 */
export function installClassicDomTerms(root: HTMLElement): void {
  if (!applied) return;
  const fixText = (n: Text) => {
    const t = n.data;
    if (!t || !/[光蚀守符浮]/.test(t)) return;
    const r = classicText(t);
    if (r !== t) n.data = r;
  };
  const fixAttr = (el: Element) => {
    for (const a of ['title', 'placeholder']) {
      const v = el.getAttribute(a);
      if (v && /[光蚀守符浮]/.test(v)) {
        const r = classicText(v);
        if (r !== v) el.setAttribute(a, r);
      }
    }
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return fixText(node as Text);
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEXTAREA') return;
    fixAttr(el);
    for (const c of Array.from(el.childNodes)) walk(c);
  };
  walk(root);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') fixText(m.target as Text);
      else if (m.type === 'attributes') fixAttr(m.target as Element);
      else for (const n of Array.from(m.addedNodes)) walk(n);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
}
