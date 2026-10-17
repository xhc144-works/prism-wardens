import { useEffect, useState } from 'preact/hooks';
import { GAME_VERSION } from '../../core/constants';
import { back } from '../../app/nav';
import { store, useStore, DEFAULT_SETTINGS } from '../../app/store';
import { audio } from '../../audio/audio';
import { native } from '../../platform/native';
import { exportFile, importFile } from '../../platform/storage';
import { migrateProfile } from '../../core/meta/profile';
import { Btn, Select, Slider, Toggle, TopBar, fmtDate, toast } from '../components/ui';
import { SCREENS } from './registry';

const RESOLUTIONS = ['1024x640', '1280x720', '1366x768', '1600x900', '1920x1080', '2560x1440'];

function SettingsScreen() {
  const data = useStore();
  const s = data.settings;
  const set = (fn: (s: typeof data.settings) => void) => store.update(['settings'], (d) => fn(d.settings));
  const [upd, setUpd] = useState<{ status: string; version?: string; percent?: number; message?: string } | null>(null);
  const [path, setPath] = useState('');
  useEffect(() => {
    native?.update.onStatus((st) => setUpd(st));
    void native?.dataPath().then(setPath);
  }, []);
  return (
    <div class="screen">
      <TopBar title="设置" onBack={() => back()}>
        <Btn small kind="ghost" onClick={() => store.update(['settings'], (d) => (d.settings = { ...DEFAULT_SETTINGS, cheats: d.settings.cheats, cheatsEnabled: d.settings.cheatsEnabled }))}>恢复默认设置</Btn>
      </TopBar>
      <div class="content grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', alignContent: 'start' }}>
        <div class="panel">
          <h3>声音</h3>
          {(['master', 'music', 'sfx'] as const).map((k) => (
            <Slider
              label={{ master: '主音量', music: '音乐', sfx: '音效' }[k]}
              value={s.volume[k]}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => {
                set((x) => (x.volume = { ...x.volume, [k]: v }));
                audio.ensure();
                audio.setVolumes({ [k]: v });
                if (k === 'sfx') audio.sfx('collect');
              }}
            />
          ))}
        </div>
        <div class="panel">
          <h3>显示</h3>
          <Toggle
            label="全屏"
            value={s.fullscreen}
            onChange={async (v) => {
              set((x) => (x.fullscreen = v));
              if (native) await native.window.setFullscreen(v);
              else if (v) await document.documentElement.requestFullscreen?.().catch(() => undefined);
              else if (document.fullscreenElement) await document.exitFullscreen();
            }}
          />
          <Select
            label="窗口分辨率"
            value={s.resolution}
            options={RESOLUTIONS.map((r) => ({ value: r, label: r.replace('x', ' × ') }))}
            onChange={(v) => {
              set((x) => (x.resolution = v));
              const [w, h] = v.split('x').map(Number);
              if (native) void native.window.setSize(w, h);
              else toast('浏览器版本的窗口大小由浏览器控制；桌面版会直接调整窗口', 'gold');
            }}
          />
          <Select label="特效画质" value={s.particles} options={[{ value: 'high', label: '高（更多粒子）' }, { value: 'low', label: '低（省电）' }]} onChange={(v) => set((x) => (x.particles = v))} />
          <Toggle label="显示伤害数字" value={s.damageNumbers} onChange={(v) => set((x) => (x.damageNumbers = v))} />
          <Toggle label="显示生命条" value={s.showHp} onChange={(v) => set((x) => (x.showHp = v))} />
          <Toggle label="屏幕震动" value={s.screenShake} onChange={(v) => set((x) => (x.screenShake = v))} />
          <Toggle label="显示网格线" value={s.showGrid} onChange={(v) => set((x) => (x.showGrid = v))} />
          <Toggle label="显示帧率" value={s.showFps} onChange={(v) => set((x) => (x.showFps = v))} />
        </div>
        <div class="panel">
          <h3>游戏</h3>
          <Toggle label="自动收集光能（辅助功能，挑战中计入操作的规则下自动关闭）" value={s.autoCollect} onChange={(v) => set((x) => (x.autoCollect = v))} />
          <Select label="默认游戏速度" value={s.defaultSpeed} options={[0.5, 1, 2, 4].map((v) => ({ value: v, label: `${v}×` }))} onChange={(v) => set((x) => (x.defaultSpeed = v))} />
          <Select label="默认难度" value={s.difficulty} options={[{ value: 0.7, label: '简单' }, { value: 1, label: '普通' }, { value: 1.35, label: '困难' }, { value: 1.8, label: '噩梦' }]} onChange={(v) => set((x) => (x.difficulty = v))} />
          <Toggle label="AI 决策可视化叠加层" value={s.aiOverlay} onChange={(v) => set((x) => (x.aiOverlay = v))} />
          <Toggle label="自动保存" value={s.autosave} onChange={(v) => set((x) => (x.autosave = v))} />
        </div>
        <div class="panel">
          <h3>关于与更新</h3>
          <div class="kv">
            <span>版本</span><span>v{GAME_VERSION}{native ? `（桌面版 ${native.version}）` : '（浏览器版）'}</span>
            <span>平台</span><span>{native ? native.platform : navigator.platform}</span>
            {path && <><span>数据目录</span><span style={{ wordBreak: 'break-all' }}>{path}</span></>}
          </div>
          {native ? (
            <div class="col" style={{ marginTop: 10 }}>
              <div class="row">
                <Btn onClick={async () => setUpd(await native!.update.check())}>检查更新</Btn>
                {upd?.status === 'available' && <Btn kind="primary" onClick={() => void native!.update.download()}>下载更新 {upd.version}</Btn>}
                {upd?.status === 'downloaded' && <Btn kind="gold" onClick={() => void native!.update.install()}>重启并安装</Btn>}
              </div>
              {upd && (
                <div class="muted">
                  {({ checking: '正在检查…', available: `发现新版本 ${upd.version}`, 'not-available': '已是最新版本', downloading: `下载中 ${Math.round(upd.percent ?? 0)}%（增量下载）`, downloaded: '更新已下载，重启即可安装', error: `更新失败：${upd.message}`, disabled: '开发模式下未启用自动更新' } as Record<string, string>)[upd.status] ?? upd.status}
                </div>
              )}
              <div class="dim" style={{ fontSize: 12 }}>自动更新通过 GitHub Releases 发布，支持基于 blockmap 的增量下载。</div>
            </div>
          ) : (
            <div class="dim" style={{ fontSize: 12, marginTop: 8 }}>浏览器版本无需更新；Windows 桌面版内置自动更新。</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SavesScreen() {
  const data = useStore();
  const [name, setName] = useState('');
  const [backups, setBackups] = useState<{ id: string; label: string; time: number; size: number }[]>([]);
  const refresh = async () => setBackups(await store.listBackups());
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <div class="screen">
      <TopBar title="存档管理" onBack={() => back()} />
      <div class="content grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', alignContent: 'start' }}>
        <div class="panel">
          <h3>存档（档案）</h3>
          <table class="table">
            <thead>
              <tr><th>名称</th><th>进度</th><th>金币</th><th>更新</th><th /></tr>
            </thead>
            <tbody>
              {data.profiles.map((p) => (
                <tr>
                  <td>
                    {p.id === data.activeProfile ? '▶ ' : ''}
                    <b>{p.name}</b>
                  </td>
                  <td>{Object.values(p.progress).filter((x) => x.wins).length}/30</td>
                  <td>{p.coins}</td>
                  <td class="dim">{fmtDate(p.updated)}</td>
                  <td>
                    <div class="row" style={{ gap: 4 }}>
                      {p.id !== data.activeProfile && <Btn small onClick={() => store.switchProfile(p.id)}>切换</Btn>}
                      <Btn small onClick={() => void exportFile(`档案-${p.name}.json`, JSON.stringify({ format: 'prism-wardens-profile', profile: p }, null, 2))}>导出</Btn>
                      <Btn
                        small
                        onClick={() => {
                          const n = prompt('新名称', p.name);
                          if (n) {
                            p.name = n;
                            store.update(['profiles'], () => {});
                          }
                        }}
                      >
                        改名
                      </Btn>
                      <Btn small kind="danger" onClick={() => confirm(`确定删除存档「${p.name}」？`) && store.deleteProfile(p.id)}>删除</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div class="row" style={{ marginTop: 10 }}>
            <input type="text" placeholder="新存档名称" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            <Btn kind="primary" disabled={!name.trim()} onClick={() => { store.createProfile(name.trim()); setName(''); toast('已创建新存档', 'good'); }}>新建存档</Btn>
            <Btn
              onClick={async () => {
                const f = await importFile('.json');
                if (!f) return;
                try {
                  const o = JSON.parse(f.content);
                  if (o.format !== 'prism-wardens-profile') throw new Error('格式不正确');
                  const p = migrateProfile({ ...o.profile, id: `p_${Date.now().toString(36)}` });
                  store.update(['profiles'], (d) => d.profiles.push(p));
                  toast(`已导入存档：${p.name}`, 'good');
                } catch (e) {
                  toast(`导入失败：${(e as Error).message}`, 'bad');
                }
              }}
            >
              导入存档
            </Btn>
          </div>
        </div>
        <div class="panel">
          <h3>备份与恢复</h3>
          <div class="muted" style={{ fontSize: 12, marginBottom: 8 }}>备份包含全部存档、设置、自定义内容、挑战、修改器预设、AI 经验库与最近录像。{native ? '桌面版备份保存在数据目录的 backups 文件夹。' : '浏览器版最多保留 8 份本地备份，可导出为文件。'}</div>
          <div class="row" style={{ marginBottom: 10 }}>
            <Btn kind="primary" onClick={async () => { await store.createBackup('手动备份'); await refresh(); toast('备份已创建', 'good'); }}>立即备份</Btn>
            <Btn onClick={async () => void exportFile(`棱镜守卫-完整备份-${new Date().toISOString().slice(0, 10)}.json`, await store.snapshot())}>导出全部数据</Btn>
            <Btn
              onClick={async () => {
                const f = await importFile('.json');
                if (!f) return;
                if (!confirm('导入会覆盖当前所有数据（会先自动备份当前数据），继续？')) return;
                await store.createBackup('导入前自动备份');
                const err = await store.restoreSnapshot(f.content);
                toast(err ?? '数据已恢复', err ? 'bad' : 'good');
                await refresh();
              }}
            >
              从文件恢复
            </Btn>
            {native && <Btn onClick={() => void native!.backup.openFolder()}>打开备份目录</Btn>}
          </div>
          <table class="table">
            <thead><tr><th>备份</th><th>时间</th><th>大小</th><th /></tr></thead>
            <tbody>
              {backups.map((b) => (
                <tr>
                  <td>{b.label}</td>
                  <td class="dim">{fmtDate(b.time)}</td>
                  <td class="dim">{(b.size / 1024).toFixed(0)} KB</td>
                  <td>
                    <div class="row" style={{ gap: 4 }}>
                      <Btn small onClick={async () => {
                        if (!confirm('恢复此备份会覆盖当前数据（会先自动备份），继续？')) return;
                        await store.createBackup('恢复前自动备份');
                        const err = await store.restoreBackup(b.id);
                        toast(err ?? '已恢复备份', err ? 'bad' : 'good');
                        await refresh();
                      }}>恢复</Btn>
                      <Btn small kind="danger" onClick={async () => { await store.deleteBackup(b.id); await refresh(); }}>删除</Btn>
                    </div>
                  </td>
                </tr>
              ))}
              {!backups.length && <tr><td colSpan={4} class="muted">还没有备份</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

SCREENS.settings = () => <SettingsScreen />;
SCREENS.saves = () => <SavesScreen />;
