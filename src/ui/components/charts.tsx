import { useState } from 'preact/hooks';

/** 分类调色板（已用 dataviz 校验器在深色面板 #161e40 上验证通过） */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export interface Series {
  name: string;
  values: { x: number; y: number }[];
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const fmt = (v: number) => (Math.abs(v) >= 10000 ? `${(v / 1000).toFixed(0)}k` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number.isInteger(v) ? String(v) : v.toFixed(1));

/** 折线图：单一 y 轴，十字准线 + 悬浮提示，≥2 条序列时显示图例并直接标注末端 */
export function LineChart(props: { series: Series[]; height?: number; xLabel?: string; yLabel?: string; colors?: string[] }) {
  const { series } = props;
  const H = props.height ?? 200;
  const W = 560;
  const pad = { l: 44, r: 70, t: 12, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const all = series.flatMap((s) => s.values);
  if (!all.length) return <div class="muted">暂无数据</div>;
  const xMin = Math.min(...all.map((p) => p.x));
  const xMax = Math.max(...all.map((p) => p.x), xMin + 1);
  const yMax = niceMax(Math.max(...all.map((p) => p.y)));
  const sx = (x: number) => pad.l + ((x - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
  const sy = (y: number) => H - pad.b - (y / yMax) * (H - pad.t - pad.b);
  const colors = props.colors ?? SERIES;
  const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
  const hx = hover != null ? xs.reduce((a, b) => (Math.abs(b - hover) < Math.abs(a - hover) ? b : a), xs[0]) : null;
  if (table)
    return (
      <div class="chart">
        <div class="row" style={{ justifyContent: 'flex-end' }}>
          <button class="btn small ghost" onClick={() => setTable(false)}>图表视图</button>
        </div>
        <div style={{ maxHeight: H, overflow: 'auto' }}>
          <table class="table">
            <thead>
              <tr>
                <th>{props.xLabel ?? 'x'}</th>
                {series.map((s) => (
                  <th>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {xs.map((x) => (
                <tr>
                  <td>{x}</td>
                  {series.map((s) => (
                    <td>{fmt(s.values.find((v) => v.x === x)?.y ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  return (
    <div class="chart" style={{ position: 'relative' }}>
      <div class="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        {series.length >= 2 ? (
          <div class="row" style={{ gap: 12, fontSize: 12 }}>
            {series.map((s, i) => (
              <span class="row" style={{ gap: 5 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: colors[i % colors.length] }} />
                <span class="muted">{s.name}</span>
              </span>
            ))}
          </div>
        ) : (
          <span />
        )}
        <button class="btn small ghost" onClick={() => setTable(true)}>表格视图</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseLeave={() => setHover(null)} onMouseMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        setHover(xMin + ((px - pad.l) / (W - pad.l - pad.r)) * (xMax - xMin));
      }}>
        {[0, 0.25, 0.5, 0.75, 1].map((k) => (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={sy(yMax * k)} y2={sy(yMax * k)} stroke="rgba(160,190,255,0.12)" stroke-width="1" />
            <text x={pad.l - 6} y={sy(yMax * k) + 4} text-anchor="end">{fmt(yMax * k)}</text>
          </g>
        ))}
        {[0, 0.5, 1].map((k) => (
          <text x={sx(xMin + (xMax - xMin) * k)} y={H - 8} text-anchor="middle">{fmt(xMin + (xMax - xMin) * k)}{k === 1 && props.xLabel ? ` ${props.xLabel}` : ''}</text>
        ))}
        {series.map((s, i) => {
          const pts = [...s.values].sort((a, b) => a.x - b.x);
          const d = pts.map((p, j) => `${j ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
          const last = pts[pts.length - 1];
          return (
            <g>
              <path d={d} fill="none" stroke={colors[i % colors.length]} stroke-width="2" stroke-linejoin="round" />
              {series.length <= 4 && last && (
                <text x={sx(last.x) + 6} y={sy(last.y) + 4} style={{ fill: '#c3c9e8' }}>{s.name}</text>
              )}
            </g>
          );
        })}
        {hx != null && (
          <g>
            <line x1={sx(hx)} x2={sx(hx)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,0.35)" stroke-width="1" />
            {series.map((s, i) => {
              const p = s.values.find((v) => v.x === hx);
              return p ? <circle cx={sx(p.x)} cy={sy(p.y)} r="4" fill={colors[i % colors.length]} stroke="#161e40" stroke-width="2" /> : null;
            })}
          </g>
        )}
      </svg>
      {hx != null && (
        <div class="tooltip" style={{ position: 'absolute', left: `${(sx(hx) / W) * 100}%`, top: 24, transform: 'translateX(8px)' }}>
          <div class="muted">{props.xLabel ?? 'x'} = {hx}</div>
          {series.map((s, i) => {
            const p = s.values.find((v) => v.x === hx);
            return p ? (
              <div class="row" style={{ gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length] }} />
                {s.name}：<b>{fmt(p.y)}</b>
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

/** 横向条形图：圆角柱端、悬浮提示、数值直接标注 */
export function BarChart(props: { items: { label: string; value: number; color?: string; note?: string }[]; max?: number; unit?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const items = props.items;
  if (!items.length) return <div class="muted">暂无数据</div>;
  const max = props.max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <div class="col" style={{ gap: 6, maxHeight: props.height, overflow: props.height ? 'auto' : undefined }}>
      {items.map((it, i) => (
        <div class="row" style={{ gap: 8, flexWrap: 'nowrap' }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={it.note ?? `${it.label}: ${fmt(it.value)}${props.unit ?? ''}`}>
          <span style={{ width: 96, flex: '0 0 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: hover === i ? 'var(--text)' : 'var(--muted)', fontSize: 12 }}>{it.label}</span>
          <div style={{ flex: 1, height: 12, position: 'relative' }}>
            <div style={{ width: `${Math.max(1, (it.value / max) * 100)}%`, height: '100%', borderRadius: '0 4px 4px 0', background: it.color ?? SERIES[0], opacity: hover == null || hover === i ? 1 : 0.55, transition: 'opacity .15s' }} />
          </div>
          <span style={{ width: 64, flex: '0 0 auto', textAlign: 'right', fontSize: 12 }}>
            {fmt(it.value)}
            {props.unit ?? ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 单个指标卡 */
export function Stat(props: { label: string; value: string | number; sub?: string; tone?: 'good' | 'bad' | 'gold' }) {
  return (
    <div class="panel" style={{ padding: '10px 12px', minWidth: 110 }}>
      <div class="muted" style={{ fontSize: 12 }}>{props.label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: props.tone === 'good' ? 'var(--good)' : props.tone === 'bad' ? 'var(--bad)' : props.tone === 'gold' ? 'var(--gold)' : 'var(--text)' }}>{props.value}</div>
      {props.sub && <div class="dim" style={{ fontSize: 11 }}>{props.sub}</div>}
    </div>
  );
}
