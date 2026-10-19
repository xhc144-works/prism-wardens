import { useEffect, useRef, useState } from 'preact/hooks';
import { ReplayPlayer, type ReplayData } from '../../core/replay/replay';
import { reportToMarkdown, nameOf, type BattleReport } from '../../core/report/report';
import { CONTENT } from '../../core/content/registry';
import { DT, TICK_RATE } from '../../core/constants';
import { Renderer } from '../../render/renderer';
import { navigate, back } from '../../app/nav';
import { store, useStore } from '../../app/store';
import { exportFile, importFile } from '../../platform/storage';
import { Btn, Tabs, TopBar, fmtDate, fmtTime, toast } from '../components/ui';
import { BarChart, LineChart, SERIES, Stat } from '../components/charts';
import { SCREENS } from './registry';

function ReplaysScreen() {
  const data = useStore();
  const [tab, setTab] = useState<'replays' | 'reports'>('replays');
  return (
    <div class="screen">
      <TopBar title="录像与战报" onBack={() => back()}>
        <Btn onClick={async () => {
          const f = await importFile('.json');
          if (!f) return;
          try {
            const r = JSON.parse(f.content) as ReplayData;
            if (r.format !== 'prism-wardens-replay') throw new Error('不是录像文件');
            await store.saveReplay({ ...r, id: `rp_${Date.now().toString(36)}` });
            toast('录像已导入', 'good');
          } catch (e) {
            toast(`导入失败：${(e as Error).message}`, 'bad');
          }
        }}>导入录像</Btn>
      </TopBar>
      <div class="content">
        <Tabs tabs={[{ id: 'replays', label: `录像（${data.replays.length}）` }, { id: 'reports', label: `战报（${data.reports.length}）` }]} value={tab} onChange={setTab} />
        {tab === 'replays' && (
          <div class="panel">
            <div class="muted" style={{ fontSize: 12, marginBottom: 8 }}>每场对局都会自动录制（随机种子 + 指令序列，体积很小）。回放会逐帧重新模拟，结果与原对局完全一致，可暂停、逐帧、拖动时间轴分析。</div>
            <table class="table">
              <thead><tr><th>名称</th><th>关卡</th><th>玩家</th><th>结果</th><th>用时</th><th>日期</th><th /></tr></thead>
              <tbody>
                {data.replays.map((r) => (
                  <tr>
                    <td>{r.name}</td>
                    <td>{r.level}</td>
                    <td>{r.player}</td>
                    <td class={r.won ? 'good' : 'bad'}>{r.won ? '胜利' : '失败'}</td>
                    <td>{fmtTime(r.time)}</td>
                    <td class="dim">{fmtDate(r.created)}</td>
                    <td>
                      <div class="row" style={{ gap: 4 }}>
                        <Btn small kind="primary" onClick={() => navigate({ name: 'replay', id: r.id })}>回放</Btn>
                        <Btn small onClick={async () => {
                          const d = await store.loadReplay(r.id);
                          if (d) void exportFile(`录像-${r.name}.json`, JSON.stringify(d));
                        }}>导出</Btn>
                        <Btn small kind="danger" onClick={() => void store.deleteReplay(r.id)}>删除</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
                {!data.replays.length && <tr><td colSpan={7} class="muted">还没有录像，打一局吧！</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'reports' && (
          <div class="panel">
            <table class="table">
              <thead><tr><th>战报</th><th>玩家</th><th>模式</th><th>用时</th><th>消耗</th><th>操作</th><th>日期</th><th /></tr></thead>
              <tbody>
                {data.reports.map((r) => (
                  <tr>
                    <td class={r.won ? 'good' : 'bad'}>{r.title}</td>
                    <td>{r.player}</td>
                    <td>{r.mode}</td>
                    <td>{fmtTime(r.time)}</td>
                    <td>{r.economy.spent}</td>
                    <td>{r.operations.total}</td>
                    <td class="dim">{fmtDate(r.created)}</td>
                    <td>
                      <div class="row" style={{ gap: 4 }}>
                        <Btn small kind="primary" onClick={() => navigate({ name: 'report', report: r })}>查看</Btn>
                        <Btn small kind="danger" onClick={() => store.update(['reports'], (d) => (d.reports = d.reports.filter((x) => x.id !== r.id)))}>删除</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
                {!data.reports.length && <tr><td colSpan={8} class="muted">还没有战报</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ReplayViewer(props: { id: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<ReplayData | null>(null);
  const player = useRef<ReplayPlayer | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const st = useRef({ playing: true, speed: 1 });
  st.current = { playing, speed };
  const [, setV] = useState(0);
  const [verify, setVerify] = useState('');
  useEffect(() => {
    let raf = 0;
    void store.loadReplay(props.id).then((d) => {
      if (!d) return toast('录像不存在', 'bad');
      setData(d);
      player.current = new ReplayPlayer(d);
      const r = new Renderer(canvas.current!);
      r.settings = { particles: 'high', damageNumbers: true, showHp: true, screenShake: true, showGrid: false };
      let last = performance.now();
      let acc = 0;
      let ui = 0;
      const loop = (ts: number) => {
        const dt = Math.min(0.1, (ts - last) / 1000);
        last = ts;
        const p = player.current!;
        if (st.current.playing && !p.done) {
          acc += dt * st.current.speed;
          let n = 0;
          while (acc >= DT && n < 64) {
            p.step();
            acc -= DT;
            n++;
          }
        }
        r.consume(p.world, p.world.drainFx());
        r.render(p.world, 0, dt);
        if (ts - ui > 150) {
          ui = ts;
          setV((v) => v + 1);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  const p = player.current;
  const w = p?.world;
  const total = data?.finalTick ?? 1;
  const timeline = w?.stats.timeline ?? [];
  const recent = (w?.stats.deployLog ?? []).slice(-8).reverse();
  return (
    <div class="screen battle">
      <TopBar title={`回放 · ${data?.name ?? ''}`} onBack={() => back()}>
        {data && <span class="muted">{data.player} · 种子 {data.config.seed} · v{data.gameVersion}</span>}
      </TopBar>
      <div class="battle-main">
        <div class="battle-canvas-wrap">
          <canvas ref={canvas} />
        </div>
        <div class="side-panel">
          {w && (
            <>
              <div class="row">
                <Stat label="时间" value={fmtTime(w.time)} />
                <Stat label="波次" value={`${w.waveIndex}`} />
                <Stat label="光能" value={Math.round(w.lumen)} />
              </div>
              <div class="row" style={{ marginTop: 6 }}>
                <Stat label="已消耗" value={w.stats.lumenSpent} />
                <Stat label="击败" value={w.stats.killsTotal} />
                <Stat label="操作" value={w.stats.ops} />
              </div>
              <div class="panel" style={{ marginTop: 8 }}>
                <h3>最近部署</h3>
                {recent.map((d) => (
                  <div class="muted" style={{ fontSize: 12 }}>{d.t}s 第{d.wave}波：{nameOf(d.unit)} → ({d.row + 1},{d.col + 1}) ☀{d.cost}</div>
                ))}
              </div>
              {timeline.length > 1 && (
                <div class="panel" style={{ marginTop: 8 }}>
                  <h3>光能（截至当前）</h3>
                  <LineChart height={150} xLabel="秒" series={[{ name: '光能', values: timeline.map((t) => ({ x: t.t, y: t.lumen })) }]} />
                  <h3 style={{ marginTop: 8 }}>场上敌人数</h3>
                  <LineChart height={150} xLabel="秒" colors={[SERIES[1]]} series={[{ name: '敌人', values: timeline.map((t) => ({ x: t.t, y: t.enemies })) }]} />
                </div>
              )}
              <div class="panel" style={{ marginTop: 8 }}>
                <h3>确定性校验</h3>
                <Btn small onClick={() => data && setVerify(ReplayPlayer.verify(data).detail)}>重新模拟并比对</Btn>
                {verify && <div class="muted" style={{ fontSize: 12, marginTop: 6 }}>{verify}</div>}
              </div>
            </>
          )}
        </div>
      </div>
      <div class="battle-bottom">
        <Btn small onClick={() => setPlaying(!playing)}>{playing ? '⏸ 暂停' : '▶ 播放'}</Btn>
        <Btn small disabled={playing} onClick={() => p?.step()}>⏭ 逐帧</Btn>
        <Btn small onClick={() => p?.seek(Math.max(0, (p?.tick ?? 0) - TICK_RATE * 10))}>⏪ 10s</Btn>
        <Btn small onClick={() => p?.seek(Math.min(total, (p?.tick ?? 0) + TICK_RATE * 10))}>10s ⏩</Btn>
        <input type="range" min={0} max={total} value={p?.tick ?? 0} style={{ flex: 1, width: 'auto' }} onChange={(e) => p?.seek(Number((e.target as HTMLInputElement).value))} />
        <span class="muted">{fmtTime((p?.tick ?? 0) / TICK_RATE)} / {fmtTime(total / TICK_RATE)}</span>
        {[0.5, 1, 2, 4, 8].map((s) => (
          <Btn small active={speed === s} onClick={() => setSpeed(s)}>{s}×</Btn>
        ))}
      </div>
    </div>
  );
}

function ReportView(props: { report: BattleReport }) {
  const r = props.report;
  const top = (rec: Record<string, number>, n = 10) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  return (
    <div class="screen">
      <TopBar title={`战报 · ${r.title}`} onBack={() => back()}>
        <Btn onClick={() => void exportFile(`战报-${r.levelName}-${r.id}.md`, reportToMarkdown(r))}>导出 Markdown</Btn>
        <Btn onClick={() => void exportFile(`战报-${r.levelName}-${r.id}.json`, JSON.stringify(r, null, 2))}>导出 JSON</Btn>
      </TopBar>
      <div class="content col" style={{ gap: 14 }}>
        <div class="row">
          <Stat label="结果" value={r.won ? '胜利' : '失败'} tone={r.won ? 'good' : 'bad'} sub={r.reason} />
          <Stat label="用时" value={fmtTime(r.time)} />
          <Stat label="波次" value={`${r.waves}${r.totalWaves > 0 ? `/${r.totalWaves}` : ''}`} />
          <Stat label="资源利用率" value={`${Math.round(r.economy.utilization * 100)}%`} sub={`消耗 ${r.economy.spent} / 产出 ${r.economy.generated}`} />
          <Stat label="收集率" value={`${Math.round(r.economy.collectionRate * 100)}%`} sub={`过期 ${r.economy.expired}`} />
          <Stat label="操作" value={r.operations.total} sub={`APM ${r.operations.apm} · 拒绝 ${r.operations.rejected}`} />
          <Stat label="峰值单位" value={r.units.peak} sub={`哨卫 ${r.sentinelsUsed}`} />
          <Stat label="玩家" value={r.player.length > 10 ? r.player.slice(0, 10) + '…' : r.player} sub={r.cheatsUsed ? '使用了修改器' : '无修改器'} tone={r.cheatsUsed ? 'gold' : undefined} />
        </div>
        <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
          <div class="panel">
            <h3>光能变化</h3>
            <LineChart xLabel="秒" series={[{ name: '持有光能', values: r.timeline.map((t) => ({ x: t.t, y: t.lumen })) }, { name: '累计消耗', values: r.timeline.map((t) => ({ x: t.t, y: t.spent })) }]} />
          </div>
          <div class="panel">
            <h3>场上敌人总生命（威胁）</h3>
            <LineChart xLabel="秒" colors={[SERIES[1]]} series={[{ name: '敌方生命', values: r.timeline.map((t) => ({ x: t.t, y: t.threat })) }]} />
          </div>
          <div class="panel">
            <h3>伤害贡献</h3>
            <BarChart items={top(r.units.damage).map(([k, v], i) => ({ label: nameOf(k), value: v, color: SERIES[i % SERIES.length] }))} />
          </div>
          <div class="panel">
            <h3>部署次数 / 损失</h3>
            <table class="table">
              <thead><tr><th>单位</th><th>部署</th><th>损失</th><th>击杀</th></tr></thead>
              <tbody>
                {top(r.units.placed, 20).map(([k, v]) => (
                  <tr><td>{nameOf(k)}</td><td>{v}</td><td>{r.units.lost[k] ?? 0}</td><td>{r.units.kills[k] ?? 0}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="panel">
            <h3>敌人</h3>
            <table class="table">
              <thead><tr><th>敌人</th><th>出现</th><th>击败</th></tr></thead>
              <tbody>
                {top(r.enemies.spawned, 20).map(([k, v]) => (
                  <tr><td>{CONTENT.enemies.get(k)?.name ?? k}</td><td>{v}</td><td>{r.enemies.killed[k] ?? 0}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="panel">
            <h3>复盘分析</h3>
            <div style={{ fontWeight: 700 }} class={r.won ? 'good' : 'bad'}>{r.analysis.cause}</div>
            {r.analysis.details.map((d) => (
              <div class="muted">· {d}</div>
            ))}
            {r.analysis.adjustments.length > 0 && (
              <>
                <h4>改进建议</h4>
                {r.analysis.adjustments.map((a) => (
                  <div>→ {a.text}</div>
                ))}
              </>
            )}
            {r.rules && (
              <>
                <h4>挑战规则：{r.rules.name}</h4>
                {r.rules.rules.map((x) => (
                  <div class="muted" style={{ fontSize: 12 }}>· {x}</div>
                ))}
              </>
            )}
            <h4>环境</h4>
            <div class="muted">天气：{r.weather.join('、') || '—'}；事件：{r.events.join('、') || '—'}；组合技：{Object.keys(r.combos).length ? Object.entries(r.combos).map(([k, v]) => `${k}×${v}`).join('、') : '—'}</div>
          </div>
        </div>
        <div class="panel">
          <h3>部署时机</h3>
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            <table class="table">
              <thead><tr><th>时间</th><th>波次</th><th>单位</th><th>位置</th><th>花费</th><th>来源</th></tr></thead>
              <tbody>
                {r.deployments.map((d) => (
                  <tr><td>{d.t}s</td><td>{d.wave}</td><td>{nameOf(d.unit)}</td><td>第{d.row + 1}行第{d.col + 1}列</td><td>{d.cost}</td><td class="dim">{d.src === 'ai' ? 'AI' : d.src === 'human' ? '人类' : d.src === 'cheat' ? '修改器' : d.src}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {r.ai && (
          <div class="panel">
            <h3>AI 决策（{r.ai.strategy}，思考 {r.ai.decisions} 次）</h3>
            {r.ai.strategyChanges.map((c) => (
              <div class="gold-text">{c.t}s：{c.from} → {c.to}（{c.why}）</div>
            ))}
            {r.ai.topDecisions.map((d) => (
              <div class="trace-item">
                <span class="dim">{d.t}s [{d.goal}]</span> <b>{d.label}</b>
                <div class="muted" style={{ fontSize: 12 }}>{d.reasons.join('；')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

SCREENS.replays = () => <ReplaysScreen />;
SCREENS.replay = (r) => <ReplayViewer id={(r as { id: string }).id} />;
SCREENS.report = (r) => <ReportView report={(r as { report: BattleReport }).report} />;
