/**
 * 经典皮肤下，全局单位/敌人图标改用原版动画截帧（卡牌、图鉴、编辑器、战报等处共用）。
 */
import { setIconProvider } from '../../render/icons';
import { PLANT_SKINS, ZOMBIE_SKINS } from '../../render/classic/skins';
import { snapshot } from './thumbs';

export function installClassicIcons(): void {
  const cache = new Map<string, string>();
  const make = (kind: 'plant' | 'zombie', id: string, size: number): string | null => {
    const key = `${kind}:${id}:${size}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const img = snapshot(kind, id);
    if (!img) return null;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const pad = size * 0.04;
    const k = Math.min((size - pad * 2) / img.width, (size - pad * 2) / img.height);
    ctx.drawImage(img, (size - img.width * k) / 2, size - pad - img.height * k, img.width * k, img.height * k);
    const url = c.toDataURL();
    cache.set(key, url);
    return url;
  };
  setIconProvider({
    unit: (def, size) => (PLANT_SKINS[def.id] ? make('plant', def.id, size) : null),
    enemy: (def, size) => (ZOMBIE_SKINS[def.id] ? make('zombie', def.id, size) : null),
  });
}
