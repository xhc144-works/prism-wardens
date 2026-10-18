/**
 * 经典皮肤的界面主题：把导入资源中的界面贴图注册为 CSS 变量，
 * 样式表通过 var(--pvz-*) 引用（未导入资源时这些变量不存在，界面保持原创风格）。
 */
import { PVZ } from '../../pvz/assets';
import { store } from '../../app/store';

const VARS: Record<string, string> = {
  'btn-l': 'IMAGE_BUTTON_LEFT',
  'btn-m': 'IMAGE_BUTTON_MIDDLE',
  'btn-r': 'IMAGE_BUTTON_RIGHT',
  'btn-dl': 'IMAGE_BUTTON_DOWN_LEFT',
  'btn-dm': 'IMAGE_BUTTON_DOWN_MIDDLE',
  'btn-dr': 'IMAGE_BUTTON_DOWN_RIGHT',
  'dlg-tl': 'IMAGE_DIALOG_TOPLEFT',
  'dlg-tm': 'IMAGE_DIALOG_TOPMIDDLE',
  'dlg-tr': 'IMAGE_DIALOG_TOPRIGHT',
  'dlg-cl': 'IMAGE_DIALOG_CENTERLEFT',
  'dlg-cm': 'IMAGE_DIALOG_CENTERMIDDLE',
  'dlg-cr': 'IMAGE_DIALOG_CENTERRIGHT',
  'dlg-bl': 'IMAGE_DIALOG_BOTTOMLEFT',
  'dlg-bm': 'IMAGE_DIALOG_BOTTOMMIDDLE',
  'dlg-br': 'IMAGE_DIALOG_BOTTOMRIGHT',
  'dlg-header': 'IMAGE_DIALOG_HEADER',
  'seedchooser': 'IMAGE_SEEDCHOOSER_BACKGROUND',
  'seedchooser-btn': 'IMAGE_SEEDCHOOSER_BUTTON',
  'seedchooser-btn-dis': 'IMAGE_SEEDCHOOSER_BUTTON_DISABLED',
  'packet': 'IMAGE_SEEDPACKET_LARGER',
  'almanac-index': 'IMAGE_ALMANAC_INDEXBACK',
  'almanac-plant': 'IMAGE_ALMANAC_PLANTBACK',
  'almanac-zombie': 'IMAGE_ALMANAC_ZOMBIEBACK',
  'store-bg': 'IMAGE_STORE_BACKGROUND',
  'options': 'IMAGE_OPTIONS_MENUBACK',
  'checkbox0': 'IMAGE_OPTIONS_CHECKBOX0',
  'checkbox1': 'IMAGE_OPTIONS_CHECKBOX1',
  'slider-slot': 'IMAGE_OPTIONS_SLIDERSLOT',
  'slider-knob': 'IMAGE_OPTIONS_SLIDERKNOB2',
  'challenge-bg': 'IMAGE_CHALLENGE_BACKGROUND',
  'challenge-window': 'IMAGE_CHALLENGE_WINDOW',
  'titlescreen': 'IMAGE_TITLESCREEN',
};

/** 把需要的图片（含 jpg+遮罩合成）转为 object URL 并写入 CSS 变量 */
export async function applyClassicTheme(): Promise<void> {
  if (!PVZ.available) return;
  const root = document.documentElement;
  root.classList.add('pvz-theme');
  if (store.settings.skin !== 'original') root.classList.add('skin-classic');
  await Promise.all(
    Object.entries(VARS).map(async ([k, id]) => {
      const e = PVZ.imageEntry(id);
      if (!e) return;
      if (!e.mask) {
        root.style.setProperty(`--pvz-${k}`, `url("${PVZ.url(e.src)}")`);
        return;
      }
      const li = await PVZ.loadImage(id);
      if (!li) return;
      const c = li.img as HTMLCanvasElement;
      const url = await new Promise<string>((res) => c.toBlob((b) => res(b ? URL.createObjectURL(b) : PVZ.url(e.src)), 'image/png'));
      root.style.setProperty(`--pvz-${k}`, `url("${url}")`);
    }),
  );
}
