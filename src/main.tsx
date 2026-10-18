import { render } from 'preact';
import './ui/styles.css';
import { App } from './ui/App';
import { store } from './app/store';
import { audio } from './audio/audio';
import { PVZ } from './pvz/assets';
import { applyClassicTheme } from './ui/classic/theme';

async function boot(): Promise<void> {
  await Promise.all([store.load(), PVZ.init()]);
  audio.setVolumes(store.settings.volume);
  audio.preferClassic = store.settings.skin !== 'original';
  void applyClassicTheme();
  // 开发/测试快捷入口：?quick=关卡ID[&ai=1] 直接进入战斗
  const q = new URLSearchParams(location.search);
  if (q.get('skin')) {
    store.settings.skin = q.get('skin') as 'classic' | 'original';
    audio.preferClassic = store.settings.skin !== 'original';
  }
  const quick = q.get('quick');
  if (quick) {
    const [{ CONTENT }, { makeAIGameConfig }, { navigate }] = await Promise.all([import('./core/content/registry'), import('./ai/runner'), import('./app/nav')]);
    if (q.get('grid')) store.settings.showGrid = true;
    const level = CONTENT.level(quick);
    if (level) {
      const cfg = makeAIGameConfig(level, { strategy: 'balanced' }, Number(q.get('seed') ?? 1));
      navigate({ name: 'battle', setup: { mode: 'adventure', level, deck: cfg.deck, control: q.get('ai') ? 'ai' : 'human', seed: Number(q.get('seed') ?? 1) } });
    }
  }
  render(<App />, document.getElementById('app')!);

  // 首次用户交互后启用音频（浏览器策略要求）
  const unlock = () => {
    audio.ensure();
    audio.setVolumes(store.settings.volume);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('beforeunload', () => void store.flush());
  // 定期自动保存
  setInterval(() => {
    if (store.settings.autosave) void store.flush();
  }, 30000);
}

void boot();
