import { render } from 'preact';
import './ui/styles.css';
import { App } from './ui/App';
import { store } from './app/store';
import { audio } from './audio/audio';

async function boot(): Promise<void> {
  await store.load();
  audio.setVolumes(store.settings.volume);
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
