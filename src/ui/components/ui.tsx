import { PvzDialog } from '../classic/PvzDialog';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { UnitDef } from '../../core/types';
import { unitIcon } from '../../render/icons';
import { audio } from '../../audio/audio';
import { categoryName, attackName } from '../../core/rules/ruleEngine';

/* ---------------------------- 提示消息 ---------------------------- */
type Toast = { id: number; text: string; tone?: 'good' | 'bad' | 'gold' };
let toasts: Toast[] = [];
let toastId = 1;
const toastListeners = new Set<() => void>();
export function toast(text: string, tone?: Toast['tone'], ms = 2800): void {
  const t = { id: toastId++, text, tone };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((l) => l());
  }, ms);
}
export function Toasts() {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((v) => v + 1);
    toastListeners.add(l);
    return () => void toastListeners.delete(l);
  }, []);
  return (
    <div class="toast-wrap">
      {toasts.map((t) => (
        <div class={`toast ${t.tone ?? ''}`} key={t.id}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- 基础组件 ---------------------------- */
export function Btn(props: { children: ComponentChildren; onClick?: () => void; kind?: 'primary' | 'gold' | 'danger' | 'ghost'; small?: boolean; disabled?: boolean; active?: boolean; title?: string; style?: Record<string, string | number> }) {
  return (
    <button
      class={`btn ${props.kind ?? ''} ${props.small ? 'small' : ''} ${props.active ? 'active' : ''}`}
      disabled={props.disabled}
      title={props.title}
      style={props.style}
      onClick={() => {
        audio.ensure();
        audio.sfx('click');
        props.onClick?.();
      }}
    >
      {props.children}
    </button>
  );
}

export function TopBar(props: { title: string; onBack?: () => void; children?: ComponentChildren }) {
  return (
    <div class="topbar">
      {props.onBack && (
        <Btn small kind="ghost" onClick={props.onBack}>
          ← 返回
        </Btn>
      )}
      <h2>{props.title}</h2>
      <div class="spacer" />
      {props.children}
    </div>
  );
}

export function Tabs<T extends string>(props: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div class="tabs">
      {props.tabs.map((t) => (
        <div
          class={`tab ${props.value === t.id ? 'active' : ''}`}
          onClick={() => {
            audio.sfx('click');
            props.onChange(t.id);
          }}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}

export function Modal(props: { children: ComponentChildren; onClose?: () => void; title?: string; width?: number }) {
  if (document.documentElement.classList.contains('skin-classic'))
    return (
      <PvzDialog title={props.title} onClose={undefined} width={(props.width ?? 520) + 80}>
        <div class="pvz-modal-body" onClick={(e) => e.stopPropagation()}>
          {props.children}
        </div>
      </PvzDialog>
    );
  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && props.onClose?.()}>
      <div class="modal" style={{ width: props.width }}>
        {props.title && <h2>{props.title}</h2>}
        {props.children}
      </div>
    </div>
  );
}

export function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label class="check" title={props.title}>
      <input type="checkbox" checked={props.value} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
      {props.label}
    </label>
  );
}

export function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div class="field">
      <span class="label">{props.label}</span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))} />
      <span style={{ minWidth: 56 }}>{props.format ? props.format(props.value) : props.value}</span>
    </div>
  );
}

export function NumberField(props: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; placeholder?: string; allowEmpty?: boolean }) {
  return (
    <div class="field">
      <span class="label">{props.label}</span>
      <input
        type="number"
        value={props.value ?? ''}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        placeholder={props.placeholder}
        onChange={(e) => {
          const s = (e.target as HTMLInputElement).value;
          if (s === '' && props.allowEmpty) return props.onChange(undefined);
          const n = Number(s);
          if (!Number.isNaN(n)) props.onChange(n);
        }}
      />
    </div>
  );
}

export function Select<T extends string | number>(props: { label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const sel = (
    <select
      value={String(props.value)}
      onChange={(e) => {
        const raw = (e.target as HTMLSelectElement).value;
        const opt = props.options.find((o) => String(o.value) === raw);
        if (opt) props.onChange(opt.value);
      }}
    >
      {props.options.map((o) => (
        <option value={String(o.value)}>{o.label}</option>
      ))}
    </select>
  );
  if (!props.label) return sel;
  return (
    <div class="field">
      <span class="label">{props.label}</span>
      {sel}
    </div>
  );
}

export function Progress(props: { value: number; max: number }) {
  return (
    <div class="progress">
      <div style={{ width: `${Math.min(100, (props.value / Math.max(1, props.max)) * 100)}%` }} />
    </div>
  );
}

/* ---------------------------- 卡牌 ---------------------------- */
export function CardTile(props: {
  def: UnitDef;
  cost?: number;
  cooldown?: number;
  maxCooldown?: number;
  selected?: boolean;
  disabled?: boolean;
  locked?: boolean;
  small?: boolean;
  hotkey?: string;
  onClick?: () => void;
  onHover?: (def: UnitDef | null, e?: MouseEvent) => void;
  showName?: boolean;
}) {
  const d = props.def;
  const cdk = props.maxCooldown && props.cooldown ? Math.min(1, props.cooldown / props.maxCooldown) : 0;
  return (
    <div
      class={`card ${props.small ? 'small' : ''} ${props.selected ? 'selected' : ''} ${props.disabled ? 'disabled' : ''} ${props.locked ? 'locked' : ''}`}
      onClick={() => !props.locked && props.onClick?.()}
      onMouseEnter={(e) => props.onHover?.(d, e as unknown as MouseEvent)}
      onMouseMove={(e) => props.onHover?.(d, e as unknown as MouseEvent)}
      onMouseLeave={() => props.onHover?.(null)}
      style={{ background: `linear-gradient(180deg, ${d.colors.b}55, #18204a 70%)` }}
    >
      <img src={unitIcon(d, 96)} alt={d.name} draggable={false} />
      {props.hotkey && <div class="hotkey">{props.hotkey}</div>}
      {props.showName !== false && <div class="name">{props.locked ? '???' : d.name}</div>}
      <div class="cost">☀ {props.cost ?? d.cost}</div>
      {cdk > 0 && (
        <>
          <div class="cd" style={{ height: `${cdk * 100}%` }} />
          <div class="cdtext">{Math.ceil(props.cooldown!)}</div>
        </>
      )}
    </div>
  );
}

/** 单位详情提示 */
export function UnitTooltip(props: { def: UnitDef; x: number; y: number; level?: number }) {
  const d = props.def;
  const rows: [string, string][] = [];
  rows.push(['费用 / 冷却', `${d.cost} / ${d.cooldown}s`]);
  rows.push(['生命', String(d.hp)]);
  if (d.damage) rows.push(['伤害', `${d.damage}${d.shots && d.shots > 1 ? ` ×${d.shots}` : ''}${d.interval ? ` / ${d.interval}s` : ''}`]);
  if (d.produce) rows.push(['产出', `${d.produce}${d.shots && d.shots > 1 ? ` ×${d.shots}` : ''} / ${d.interval}s`]);
  rows.push(['类型', `${categoryName(d.category)} · ${attackName(d.attack)}`]);
  if (props.level && props.level > 1) rows.push(['局外等级', `Lv.${props.level}（+${(props.level - 1) * 8}%）`]);
  const left = Math.min(props.x + 16, window.innerWidth - 320);
  const top = Math.min(props.y + 16, window.innerHeight - 220);
  return (
    <div class="tooltip" style={{ left, top }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
        {d.name} <span class="dim" style={{ fontWeight: 400 }}>{d.nameEn}</span>
      </div>
      <div style={{ marginBottom: 6 }}>{d.desc}</div>
      <div class="kv">{rows.map(([k, v]) => [<span>{k}</span>, <span>{v}</span>])}</div>
    </div>
  );
}

export function useTooltip(): [{ def: UnitDef; x: number; y: number } | null, (def: UnitDef | null, e?: MouseEvent) => void] {
  const [tip, setTip] = useState<{ def: UnitDef; x: number; y: number } | null>(null);
  return [tip, (def, e) => setTip(def && e ? { def, x: e.clientX, y: e.clientY } : null)];
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

export function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
