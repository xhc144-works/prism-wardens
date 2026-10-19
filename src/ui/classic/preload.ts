/** 不显示载入画面时（快捷入口、自动化测试）直接预载经典资源 */
import { PVZ } from '../../pvz/assets';
import { BitmapFont, FONTS } from '../../pvz/font';
import { PLANT_SKINS, ZOMBIE_SKINS } from '../../render/classic/skins';

export async function preloadClassic(): Promise<void> {
  const names = new Set<string>(['Zombie_flagpole', 'Sun']);
  for (const s of Object.values(PLANT_SKINS)) names.add(s.reanim);
  for (const s of Object.values(ZOMBIE_SKINS)) names.add(s.reanim);
  await Promise.all([PVZ.loadReanimsWithImages([...names]), ...Object.values(FONTS).map((f) => BitmapFont.load(f))]);
}
