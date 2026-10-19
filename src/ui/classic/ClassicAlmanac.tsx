/**
 * 经典皮肤的图鉴：目录页（向日葵与僵尸迎宾）、植物页（种子包网格 + 卡片详情）、
 * 僵尸页（窗格网格 + 卡片详情），坐标与原版一致；描述使用本作机制说明 + 原版风味文字。
 */
import { useState } from 'preact/hooks';
import { CONTENT } from '../../core/content/registry';
import { COMBOS, EVENTS, TERRAIN, WEATHER } from '../../core/content/environment';
import { SKILLS, ITEMS } from '../../core/content/abilities';
import { back } from '../../app/nav';
import { store, useStore } from '../../app/store';
import { audio } from '../../audio/audio';
import { PVZ } from '../../pvz/assets';
import { FONTS } from '../../pvz/font';
import { PLANT_SKINS, ZOMBIE_SKINS } from '../../render/classic/skins';
import { Stage } from './Stage';
import { PvzDialog } from './PvzDialog';
import { AlmanacText, LiveActor, PvzImage, PvzText, SeedPacket, ZombieThumb } from './thumbs';

type Page = 'index' | 'plants' | 'zombies';

function recharge(cd: number): string {
  return cd <= 8 ? '快' : cd <= 20 ? '较慢' : '很慢';
}

function plantGround(id: string): string {
  const u = CONTENT.unit(id);
  if (u.category === 'aquatic' || id === 'drift_plate' || id === 'tide_lurker') return 'IMAGE_ALMANAC_GROUNDPOOL';
  const reanim = PLANT_SKINS[id]?.reanim ?? '';
  if (/Shroom|Plantern/i.test(reanim)) return 'IMAGE_ALMANAC_GROUNDNIGHT';
  return 'IMAGE_ALMANAC_GROUNDDAY';
}

export function ClassicAlmanac() {
  useStore();
  const p = store.profile;
  const [page, setPage] = useState<Page>('index');
  const units = CONTENT.allUnits().filter((u) => PLANT_SKINS[u.id]);
  const enemies = [...CONTENT.enemies.values()].filter((e) => ZOMBIE_SKINS[e.id] && !e.boss);
  const bosses = [...CONTENT.enemies.values()].filter((e) => e.boss);
  const [plant, setPlant] = useState(units[0]?.id ?? '');
  const [zombie, setZombie] = useState(enemies[0]?.id ?? '');
  const [extra, setExtra] = useState<string | null>(null);
  const go = (pg: Page) => {
    audio.sfx('button');
    setPage(pg);
  };
  const closeRow = (
    <>
      <button class="pvz-almanac-btn" style={{ left: 32, top: 567, width: 164 }} onClick={() => go('index')}>
        {PVZ.str('ALMANAC_INDEX', '图鉴索引')}
      </button>
      <button class="pvz-almanac-btn" style={{ left: 676, top: 567, width: 89 }} onClick={() => back()}>
        关闭
      </button>
    </>
  );

  if (page === 'index')
    return (
      <Stage bg="IMAGE_ALMANAC_INDEXBACK">
        <div style={{ left: 0, top: 28, width: 800, display: 'flex', justifyContent: 'center' }}>
          <PvzText font={FONTS.title} text={PVZ.str('SUBURBAN_ALMANAC_INDEX', '图鉴')} color="rgb(220,220,220)" />
        </div>
        <div style={{ left: 50, top: 160, width: 260, height: 180, overflow: 'hidden' }}>
          <LiveActor kind="plant" id="lumen_moss" w={260} h={180} x={117} y={95} />
        </div>
        <div style={{ left: 380, top: 100, width: 300, height: 230, overflow: 'hidden' }}>
          <LiveActor kind="zombie" id="husk" w={300} h={230} x={155} y={115} />
        </div>
        <button class="pvz-rock" style={{ left: 130, top: 345 }} onClick={() => go('plants')}>
          {PVZ.str('VIEW_PLANTS', '查看植物')}
        </button>
        <button class="pvz-rock stone" style={{ left: 487, top: 345, width: 210, height: 48 }} onClick={() => go('zombies')}>
          {PVZ.str('VIEW_ZOMBIES', '查看僵尸')}
        </button>
        <div class="pvz-almanac-more" style={{ left: 60, top: 430, width: 680 }}>
          {[
            ['combos', '组合技'],
            ['skills', '技能与道具'],
            ['weather', '天气与随机事件'],
            ['terrain', '地形'],
          ].map(([k, t]) => (
            <button class="pvz-btn small" onClick={() => setExtra(k)}>
              {t}
            </button>
          ))}
        </div>
        <button class="pvz-almanac-btn" style={{ left: 676, top: 567, width: 89 }} onClick={() => back()}>
          关闭
        </button>
        {extra && (
          <PvzDialog
            width={640}
            title={extra === 'combos' ? '组合技' : extra === 'skills' ? '技能与道具' : extra === 'weather' ? '天气与随机事件' : '地形'}
            onClose={() => setExtra(null)}
          >
            <div class="pvz-almanac-list">
              {(extra === 'combos'
                ? COMBOS.map((c) => [c.name, c.desc])
                : extra === 'skills'
                  ? [...SKILLS.map((s) => [`${s.icon} ${s.name}`, s.desc]), ...ITEMS.map((s) => [`${s.icon} ${s.name}`, s.desc])]
                  : extra === 'weather'
                    ? [...Object.values(WEATHER).map((w) => [`${w.icon} ${w.name}`, w.desc]), ...EVENTS.map((e) => [e.name, e.desc])]
                    : Object.values(TERRAIN).map((t) => [t.name, t.desc])
              ).map(([n, d]) => (
                <div>
                  <b>{n}</b>：{d}
                </div>
              ))}
            </div>
          </PvzDialog>
        )}
      </Stage>
    );

  if (page === 'plants') {
    const u = CONTENT.unit(plant);
    const skin = PLANT_SKINS[plant];
    const flavor = skin?.nameKey ? PVZ.str(`${skin.nameKey}_DESCRIPTION`) : '';
    const flavorOnly = flavor.includes('{FLAVOR}') ? flavor.slice(flavor.indexOf('{FLAVOR}')) : '';
    const lvl = p.upgrades[u.id] ?? 0;
    return (
      <Stage bg="IMAGE_ALMANAC_PLANTBACK">
        <div style={{ left: 0, top: 26, width: 800, display: 'flex', justifyContent: 'center' }}>
          <PvzText font="FONT_HOUSEOFTERROR20" text={PVZ.str('SUBURBAN_ALMANAC_PLANTS', '植物')} color="rgb(213,159,43)" />
        </div>
        {units.map((d, i) => {
          const unlocked = p.unlockedCards.includes(d.id);
          return (
            <div
              class={`pvz-almanac-seed ${plant === d.id ? 'sel' : ''}`}
              style={{ left: (i % 8) * 52 + 26, top: Math.floor(i / 8) * 78 + 92 }}
              onClick={() => {
                audio.sfx('click');
                setPlant(d.id);
              }}
            >
              {unlocked ? <SeedPacket id={d.id} cost={d.cost} scale={0.5} /> : <PvzImage id="IMAGE_SEEDPACKETSILHOUETTE" />}
            </div>
          );
        })}
        <PvzImage id={plantGround(plant)} style={{ left: 521, top: 107 }} />
        <div style={{ left: 521, top: 107, width: 200, height: 160, overflow: 'hidden' }} key={plant}>
          <LiveActor kind="plant" id={plant} w={200} h={160} x={57} y={plant === 'monolith' ? 51 : 33} />
        </div>
        <PvzImage id="IMAGE_ALMANAC_PLANTCARD" style={{ left: 459, top: 86 }} />
        <div style={{ left: 459, top: 276, width: 316, display: 'flex', justifyContent: 'center' }}>
          <PvzText font={FONTS.yellow} text={u.name} color="#ffffff" />
        </div>
        <div class="pvz-almanac-desc" style={{ left: 485, top: 309, width: 258, height: 205 }}>
          <div class="kw">{u.desc}</div>
          {lvl > 0 && <div class="stat">局外升级 Lv.{lvl}</div>}
          {flavorOnly && <AlmanacText text={flavorOnly} />}
        </div>
        <div class="pvz-almanac-cost" style={{ left: 485, top: 520, width: 134 }}>
          {PVZ.str('COST', '花费')}：<b>{u.cost}</b>
        </div>
        <div class="pvz-almanac-recharge" style={{ left: 600, top: 520, width: 139 }}>
          {PVZ.str('WAIT_TIME', '恢复时间')}：<b>{recharge(u.cooldown)}</b>
        </div>
        {closeRow}
      </Stage>
    );
  }

  const e = CONTENT.enemies.get(zombie)!;
  const zskin = ZOMBIE_SKINS[zombie];
  const zflavor = zskin?.nameKey ? PVZ.str(`${zskin.nameKey}_DESCRIPTION`) : '';
  const zflavorOnly = zflavor.includes('{FLAVOR}') ? zflavor.slice(zflavor.indexOf('{FLAVOR}')) : '';
  return (
    <Stage bg="IMAGE_ALMANAC_ZOMBIEBACK">
      <div style={{ left: 0, top: 30, width: 800, display: 'flex', justifyContent: 'center' }}>
        <PvzText font={FONTS.button24} text={PVZ.str('SUBURBAN_ALMANAC_ZOMBIES', '僵尸')} color="rgb(0,196,0)" />
      </div>
      {[...enemies, ...bosses].map((d, i) => (
        <div
          class={`pvz-almanac-zombie ${zombie === d.id ? 'sel' : ''}`}
          style={{ left: (i % 5) * 85 + 22, top: Math.floor(i / 5) * 80 + 86 }}
          onClick={() => {
            audio.sfx('click');
            setZombie(d.id);
          }}
          title={d.name}
        >
          <PvzImage id={zombie === d.id ? 'IMAGE_ALMANAC_ZOMBIEWINDOW2' : 'IMAGE_ALMANAC_ZOMBIEWINDOW'} style={{ position: 'absolute', left: 0, top: 0 }} />
          <div style={{ position: 'absolute', left: 2, top: 2, width: 72, height: 72, overflow: 'hidden' }}>
            <ZombieThumb id={d.id} size={72} />
          </div>
        </div>
      ))}
      <PvzImage id={zombie === 'frost_hauler' ? 'IMAGE_ALMANAC_GROUNDICE' : 'IMAGE_ALMANAC_GROUNDDAY'} style={{ left: 518, top: 110 }} />
      <div style={{ left: 500, top: 60, width: 240, height: 230, overflow: 'hidden' }} key={zombie}>
        <LiveActor kind="zombie" id={zombie} w={240} h={230} x={30} y={60} />
      </div>
      <PvzImage id="IMAGE_ALMANAC_ZOMBIECARD" style={{ left: 455, top: 78 }} />
      <div style={{ left: 455, top: 354, width: 316, display: 'flex', justifyContent: 'center' }}>
        <PvzText font={FONTS.green} text={e.name} color="rgb(190,255,235)" />
      </div>
      <div class="pvz-almanac-desc" style={{ left: 484, top: 377, width: 258, height: 170 }}>
        <div class="kw">
          生命 {e.hp}
          {e.armor ? ` · 护甲 ${e.armor.hp}${e.armor.metal ? '（金属）' : ''}` : ''} · 速度 {e.speed}
        </div>
        <div>{e.desc}</div>
        {zflavorOnly && <AlmanacText text={zflavorOnly} />}
      </div>
      {closeRow}
    </Stage>
  );
}
