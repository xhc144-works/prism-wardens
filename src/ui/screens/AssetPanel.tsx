/**
 * 设置中的“美术风格与原版资源”面板：切换经典/原创美术，导入或移除玩家本地的原版资源。
 * 公开发布的安装包不含任何原版素材；只有玩家自己选择的安装包/游戏目录会被在本机转换。
 */
import { useEffect, useState } from 'preact/hooks';
import { store, useStore } from '../../app/store';
import { native, type AssetImportMessage, type AssetStatus } from '../../platform/native';
import { PVZ } from '../../pvz/assets';
import { Btn, Select, toast } from '../components/ui';

export function AssetPanel() {
  const data = useStore();
  const s = data.settings;
  const [st, setSt] = useState<AssetStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [prog, setProg] = useState(0);
  useEffect(() => {
    void native?.assets?.status().then(setSt);
    native?.assets?.onProgress((m: AssetImportMessage) => {
      if (m.type === 'log') setLog((l) => [...l.slice(-6), m.text]);
      if (m.type === 'progress') setProg(m.done / Math.max(1, m.total));
    });
  }, []);
  const reload = () => (native ? void native.reload() : location.reload());
  const run = async (kind: 'dir' | 'file') => {
    if (!native?.assets) return;
    const src = await native.assets.pick(kind);
    if (!src) return;
    setBusy(true);
    setLog([`来源：${src}`]);
    const r = await native.assets.import(src);
    setBusy(false);
    if (r.type === 'done') {
      toast(`导入完成：${r.reanims} 个动画、${r.images} 张图片、${r.sounds} 个音效`, 'gold', 4000);
      store.update(['settings'], (d) => (d.settings.skin = 'classic'));
      await store.flush();
      setTimeout(reload, 800);
    } else if (r.type === 'error') {
      toast(`导入失败：${r.text}`, 'bad', 5000);
      setLog((l) => [...l, `失败：${r.text}`]);
    }
  };
  return (
    <div class="panel">
      <h3>美术风格与原版资源</h3>
      <Select
        label="美术风格"
        value={s.skin}
        options={[
          { value: 'classic', label: '经典（使用导入的原版资源）' },
          { value: 'original', label: '原创（内置美术，无需任何资源）' },
        ]}
        onChange={async (v) => {
          store.update(['settings'], (d) => (d.settings.skin = v));
          await store.flush();
          toast('美术风格已切换，正在重新载入…', 'gold');
          setTimeout(reload, 600);
        }}
      />
      <div class="muted" style={{ fontSize: 12, margin: '6px 0' }}>
        {PVZ.available ? `已载入原版资源：${PVZ.manifest?.source ?? ''}（导入于 ${PVZ.manifest?.importedAt?.slice(0, 10) ?? '?'}）` : '尚未导入原版资源：经典风格不可用，当前使用原创美术。'}
      </div>
      <div class="dim" style={{ fontSize: 12, lineHeight: 1.6 }}>
        经典风格需要你自己合法持有的《植物大战僵尸》PC 版（年度版 1.2.0.1073 或兼容版本）。选择其安装包（.exe）或已安装的游戏目录（含 main.pak），导入器会在本机提取动画、贴图、音效与音乐，资源只保存在本机用户目录，不会上传或随本游戏分发。
      </div>
      {native?.assets ? (
        <>
          <div class="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <Btn small kind="primary" disabled={busy} onClick={() => void run('file')}>
              选择安装包导入
            </Btn>
            <Btn small disabled={busy} onClick={() => void run('dir')}>
              选择游戏目录导入
            </Btn>
            {st?.imported && (
              <Btn
                small
                kind="danger"
                disabled={busy}
                onClick={async () => {
                  await native!.assets.remove();
                  store.update(['settings'], (d) => (d.settings.skin = 'original'));
                  await store.flush();
                  reload();
                }}
              >
                移除已导入资源
              </Btn>
            )}
          </div>
          {busy && (
            <div style={{ marginTop: 8 }}>
              <div class="wavebar" style={{ width: '100%' }}>
                <div class="fill" style={{ width: `${Math.round(prog * 100)}%` }} />
              </div>
            </div>
          )}
          {log.length > 0 && (
            <div class="dim" style={{ fontSize: 11, marginTop: 6, whiteSpace: 'pre-line' }}>
              {log.join('\n')}
            </div>
          )}
          {st && <div class="dim" style={{ fontSize: 11, marginTop: 4 }}>{st.imported ? `用户目录资源包：${(st.bytes / 1048576).toFixed(1)} MB` : st.bundled ? '使用安装包内置的本地研究版资源' : ''}</div>}
        </>
      ) : (
        <div class="dim" style={{ fontSize: 12, marginTop: 6 }}>网页版请使用命令行导入：npm run assets:import -- &lt;安装包或游戏目录&gt;（输出到 public/pvz）。</div>
      )}
    </div>
  );
}
