/**
 * 经典主菜单：用导入的原版 SelectorScreen 动画重建“墓碑选择”界面
 * （开场滑入、木牌落下、云朵飘动、草叶摇摆、可点击的花朵与石碑按钮）。
 * 各热点映射到本游戏的模式与工具，悬停时给出说明。
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { navigate } from '../../app/nav';
import { store } from '../../app/store';
import { audio } from '../../audio/audio';
import { native } from '../../platform/native';
import { PVZ, PVZ_IMAGES } from '../../pvz/assets';
import { BitmapFont, FONTS } from '../../pvz/font';
import { IDENTITY, Reanim, type Mat, translate } from '../../pvz/reanim';
import { PvzDialog } from './PvzDialog';

interface Hotspot {
  id: string;
  label: string;
  tip: string;
  rect: () => [number, number, number, number] | null;
  image?: () => string | null;
  action: () => void;
  sound?: string;
}

const STONES: { id: string; track: string; img: string; hi: string; h: number }[] = [
  { id: 'adventure', track: 'SelectorScreen_Adventure_button', img: 'IMAGE_REANIM_SELECTORSCREEN_ADVENTURE_BUTTON', hi: 'IMAGE_REANIM_SELECTORSCREEN_ADVENTURE_HIGHLIGHT', h: 125 },
  { id: 'minigame', track: 'SelectorScreen_Survival_button', img: 'IMAGE_REANIM_SELECTORSCREEN_SURVIVAL_BUTTON', hi: 'IMAGE_REANIM_SELECTORSCREEN_SURVIVAL_HIGHLIGHT', h: 130 },
  { id: 'puzzle', track: 'SelectorScreen_Challenges_button', img: 'IMAGE_REANIM_SELECTORSCREEN_CHALLENGES_BUTTON', hi: 'IMAGE_REANIM_SELECTORSCREEN_CHALLENGES_HIGHLIGHT', h: 121 },
  { id: 'survival', track: 'SelectorScreen_ZenGarden_button', img: 'IMAGE_REANIM_SELECTORSCREEN_VASEBREAKER_BUTTON', hi: 'IMAGE_REANIM_SELECTORSCREEN_VASEBREAKER_HIGHLIGHT', h: 124 },
];

class SelectorScene {
  main: Reanim;
  clouds: Reanim[] = [];
  flowers: Reanim[] = [];
  leaves: Reanim;
  state: 'open' | 'sign' | 'idle' = 'open';
  hover = '';
  down = '';
  leafCounter = 0.5;
  constructor() {
    const def = PVZ.reanim('SelectorScreen')!;
    this.main = new Reanim(def, 'anim_open', 'hold');
    this.main.rate = 30;
    this.main.showPrefix('flower', false);
    this.main.showPrefix('leaf', false);
    for (const n of [1, 2, 4, 5, 6, 7]) {
      const c = new Reanim(def, `anim_cloud${n}`, 'loop');
      c.rate = 0.5;
      c.t = Math.random();
      for (let i = 0; i < def.tracks.length; i++) if (def.tracks[i].name !== `Cloud${n}`) c.hidden[i] = 1;
      this.clouds.push(c);
    }
    for (let i = 1; i <= 3; i++) {
      const f = new Reanim(def, `anim_flower${i}`, 'hold');
      f.rate = 0;
      for (let k = 0; k < def.tracks.length; k++) if (def.tracks[k].name !== `flower${i}`) f.hidden[k] = 1;
      this.flowers.push(f);
      this.main.attach('SelectorScreen_BG_Right', f, { relative: true, baseFrame: 40 });
    }
    this.leaves = new Reanim(def, 'anim_grass', 'loop');
    this.leaves.rate = 6;
    for (let k = 0; k < def.tracks.length; k++) if (!def.tracks[k].name.startsWith('leaf')) this.leaves.hidden[k] = 1;
  }

  trackPos(name: string): { x: number; y: number } | null {
    const i = this.main.def.index.get(name);
    if (i === undefined) return null;
    const x = this.main.trackXform(i);
    return { x: x.x, y: x.y };
  }

  update(dt: number): void {
    this.main.update(dt);
    if (this.state === 'open' && this.main.done) {
      this.state = 'sign';
      this.main.play('anim_sign', 'hold');
      this.main.rate = 30;
    } else if (this.state === 'sign' && this.main.done) this.state = 'idle';
    for (const c of this.clouds) c.update(dt);
    this.leaves.update(dt);
    this.leafCounter -= dt;
    if (this.leafCounter <= 0) {
      this.leaves.rate = 3 + Math.random() * 9;
      this.leafCounter = 2 + Math.random() * 2;
    }
  }

  draw(ctx: CanvasRenderingContext2D, base: Mat): void {
    const m = this.main;
    const bgIdx = m.def.index.get('SelectorScreen_BG')!;
    // 渲染顺序：背景 → 云朵 → 其余部件（与原版一致）
    const saved = m.hidden.slice();
    for (let i = 0; i < m.hidden.length; i++) m.hidden[i] = i === bgIdx ? 0 : 1;
    m.draw(ctx, base, PVZ_IMAGES);
    m.hidden.set(saved);
    for (const c of this.clouds) c.draw(ctx, base, PVZ_IMAGES);
    m.hidden[bgIdx] = 1;
    // 石碑按钮的悬停高亮
    for (const s of STONES) m.setImage(s.track, this.hover === s.id ? s.hi : s.img);
    m.setImage('SelectorScreen_StartAdventure_button', null);
    m.setTrackVisible('SelectorScreen_StartAdventure_button', false);
    m.setTrackVisible('SelectorScreen_StartAdventure_shadow', false);
    m.draw(ctx, base, PVZ_IMAGES);
    m.hidden[bgIdx] = saved[bgIdx];
    const r = this.trackPos('SelectorScreen_BG_Right');
    if (r) this.leaves.draw(ctx, translate(base, r.x - 71, r.y - 41), PVZ_IMAGES);
  }
}

function useSceneScale(ref: { current: HTMLDivElement | null }) {
  const [s, setS] = useState({ scale: 1, x: 0, y: 0 });
  useEffect(() => {
    const upd = () => {
      const el = ref.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const scale = Math.min(w / 800, h / 600);
      setS({ scale, x: (w - 800 * scale) / 2, y: (h - 600 * scale) / 2 });
    };
    upd();
    window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, []);
  return s;
}

export function ClassicMenu() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SelectorScene | null>(null);
  const hotRef = useRef<Hotspot[]>([]);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [toolbox, setToolbox] = useState(false);
  const view = useSceneScale(wrap);
  const viewRef = useRef(view);
  viewRef.current = view;
  const p = store.profile;
  const done = Object.values(p.progress).filter((x) => x.wins).length;

  useEffect(() => {
    audio.music('menu');
    let raf = 0;
    let alive = true;
    void PVZ.loadReanimsWithImages(['SelectorScreen']).then(async () => {
      await PVZ.preloadImages([
        'IMAGE_SELECTORSCREEN_ALMANAC',
        'IMAGE_SELECTORSCREEN_ALMANACHIGHLIGHT',
        'IMAGE_SELECTORSCREEN_STORE',
        'IMAGE_SELECTORSCREEN_STOREHIGHLIGHT',
        'IMAGE_SELECTORSCREEN_ZENGARDEN',
        'IMAGE_SELECTORSCREEN_ZENGARDENHIGHLIGHT',
        'IMAGE_SELECTORSCREEN_OPTIONS1',
        'IMAGE_SELECTORSCREEN_OPTIONS2',
        'IMAGE_SELECTORSCREEN_HELP1',
        'IMAGE_SELECTORSCREEN_HELP2',
        'IMAGE_SELECTORSCREEN_QUIT1',
        'IMAGE_SELECTORSCREEN_QUIT2',
        'IMAGE_SELECTORSCREEN_LEVELNUMBERS',
        'IMAGE_SELECTORSCREEN_ACHIEVEMENTS_PEDESTAL',
        'IMAGE_SELECTORSCREEN_ACHIEVEMENTS_PEDESTAL_PRESS',
        'IMAGE_REANIM_SELECTORSCREEN_WOODSIGN2_PRESS',
        'IMAGE_REANIM_SELECTORSCREEN_WOODSIGN3_PRESS',
        ...STONES.map((s) => s.hi),
      ]);
      await BitmapFont.load(FONTS.label);
      if (!alive) return;
      const scene = new SelectorScene();
      sceneRef.current = scene;
      audio.sfx('rollin');
      let last = performance.now();
      const loop = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        scene.update(dt);
        draw(scene);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  const rightOff = (dx: number, dy: number, w: number, h: number) => (): [number, number, number, number] | null => {
    const r = sceneRef.current?.trackPos('SelectorScreen_BG_Right');
    return r ? [r.x + dx, r.y + dy, w, h] : null;
  };
  const imgSize = (id: string) => {
    const li = PVZ.image(id);
    return li ? [li.w, li.h] : [80, 80];
  };
  hotRef.current = [
    ...STONES.map(
      (s): Hotspot => ({
        id: s.id,
        label: '',
        sound: 'gravebutton',
        tip: s.id === 'adventure' ? `冒险模式：30 个关卡（已通过 ${done} 关）` : s.id === 'minigame' ? '迷你游戏：无尽模式，挑战你能坚持多少波' : s.id === 'puzzle' ? '益智模式：规则挑战，限定卡牌/操作/消耗的解谜关卡' : '生存模式：多轮连续防守',
        rect: () => {
          const t = sceneRef.current?.trackPos(s.track);
          const [w] = imgSize(s.img);
          return t ? [t.x, t.y, w, s.h] : null;
        },
        action: () =>
          s.id === 'adventure' ? navigate({ name: 'levels' }) : s.id === 'minigame' ? navigate({ name: 'modes', mode: 'endless' }) : s.id === 'puzzle' ? navigate({ name: 'challenges' }) : navigate({ name: 'modes', mode: 'survival' }),
      }),
    ),
    { id: 'zen', label: '工具箱', tip: '工具箱：修改器、AI 控制台、编辑器、录像与战报', rect: rightOff(100, 360, 130, 130), image: () => 'IMAGE_SELECTORSCREEN_ZENGARDEN', action: () => setToolbox(true) },
    { id: 'almanac', label: '图鉴', tip: '图鉴：查看所有植物与僵尸', rect: rightOff(256, 387, ...(imgSize('IMAGE_SELECTORSCREEN_ALMANAC') as [number, number])), image: () => 'IMAGE_SELECTORSCREEN_ALMANAC', action: () => navigate({ name: 'almanac' }) },
    { id: 'store', label: '商店', tip: '戴夫的商店：升级、卡槽、技能、道具', rect: rightOff(334, 441, ...(imgSize('IMAGE_SELECTORSCREEN_STORE') as [number, number])), image: () => 'IMAGE_SELECTORSCREEN_STORE', action: () => navigate({ name: 'shop' }) },
    { id: 'options', label: '选项', tip: '选项：画面、声音、美术风格、更新', rect: rightOff(494, 434, imgSize('IMAGE_SELECTORSCREEN_OPTIONS1')[0], imgSize('IMAGE_SELECTORSCREEN_OPTIONS1')[1] + 23), image: () => 'IMAGE_SELECTORSCREEN_OPTIONS1', action: () => navigate({ name: 'settings' }) },
    { id: 'help', label: '帮助', tip: '帮助：成就与游戏说明', rect: rightOff(576, 458, imgSize('IMAGE_SELECTORSCREEN_HELP1')[0], imgSize('IMAGE_SELECTORSCREEN_HELP1')[1] + 33), image: () => 'IMAGE_SELECTORSCREEN_HELP1', action: () => navigate({ name: 'achievements' }) },
    {
      id: 'quit',
      label: '退出',
      tip: native ? '退出游戏（自动保存）' : '存档管理',
      rect: rightOff(644, 469, imgSize('IMAGE_SELECTORSCREEN_QUIT1')[0] + 10, imgSize('IMAGE_SELECTORSCREEN_QUIT1')[1] + 10),
      image: () => 'IMAGE_SELECTORSCREEN_QUIT1',
      action: () => (native ? void store.flush().then(() => native!.window.quit()) : navigate({ name: 'saves' })),
    },
    {
      id: 'user',
      label: '',
      tip: '更改用户：存档、备份与恢复',
      rect: () => {
        const t = sceneRef.current?.trackPos('woodsign2');
        return t && sceneRef.current?.state !== 'open' ? [t.x + 24, t.y + 10, 250, 30] : null;
      },
      action: () => navigate({ name: 'saves' }),
    },
    {
      id: 'zombatar',
      label: '',
      tip: '打造你的专属单位：单位编辑器',
      rect: () => {
        const t = sceneRef.current?.trackPos('woodsign3');
        const [w, h] = imgSize('IMAGE_REANIM_SELECTORSCREEN_WOODSIGN3_PRESS');
        return t && sceneRef.current?.state !== 'open' ? [t.x, t.y, w, h] : null;
      },
      action: () => navigate({ name: 'unitEditor' }),
    },
    {
      id: 'trophy',
      label: '成就',
      tip: `成就：已解锁 ${Object.keys(p.achievements).length} 个`,
      rect: () => {
        const t = sceneRef.current?.trackPos('SelectorScreen_BG_Left');
        const [w, h] = imgSize('IMAGE_SELECTORSCREEN_ACHIEVEMENTS_PEDESTAL');
        return t ? [t.x + 20, t.y + 480, w, h] : null;
      },
      image: () => 'IMAGE_SELECTORSCREEN_ACHIEVEMENTS_PEDESTAL',
      action: () => navigate({ name: 'achievements' }),
    },
  ];

  function draw(scene: SelectorScene) {
    const c = canvas.current;
    const el = wrap.current;
    if (!c || !el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
    }
    const ctx = c.getContext('2d')!;
    const v = viewRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#5fb4ef');
    g.addColorStop(0.6, '#a9dcf7');
    g.addColorStop(1, '#2f6b22');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    const base: Mat = [v.scale * dpr, 0, 0, v.scale * dpr, v.x * dpr, v.y * dpr];
    // 宽屏两侧：用放大并模糊的场景填充，避免黑边
    if (v.x > 1 || v.y > 1) {
      const cover = Math.max(c.width / 800, c.height / 600);
      ctx.save();
      ctx.filter = 'blur(14px) brightness(0.6)';
      scene.draw(ctx, [cover, 0, 0, cover, (c.width - 800 * cover) / 2, (c.height - 600 * cover) / 2]);
      ctx.restore();
      ctx.filter = 'none';
    }
    ctx.save();
    ctx.setTransform(...base);
    ctx.beginPath();
    ctx.rect(0, 0, 800, 600);
    ctx.clip();
    scene.draw(ctx, base);
    ctx.restore();
    ctx.setTransform(...base);
    // 热点按钮（图片按钮）
    for (const hs of hotRef.current) {
      if (!hs.image) continue;
      const r = hs.rect();
      if (!r) continue;
      let id = hs.image();
      if (!id) continue;
      if (scene.hover === hs.id) id = id.replace(/1$/, '2').replace(/(ALMANAC|STORE|ZENGARDEN)$/, '$1HIGHLIGHT').replace('PEDESTAL', 'PEDESTAL_PRESS');
      const li = PVZ.image(id) ?? PVZ.image(hs.image()!);
      if (!li) continue;
      const press = scene.down === hs.id ? 1 : 0;
      ctx.drawImage(li.img, r[0] + press, r[1] + press);
    }
    // 木牌按下态
    if (scene.state !== 'open') {
      for (const [hid, track, img] of [
        ['user', 'woodsign2', 'IMAGE_REANIM_SELECTORSCREEN_WOODSIGN2_PRESS'],
        ['zombatar', 'woodsign3', 'IMAGE_REANIM_SELECTORSCREEN_WOODSIGN3_PRESS'],
      ]) {
        if (scene.hover !== hid) continue;
        const i = scene.main.def.index.get(track)!;
        const x = scene.main.trackXform(i);
        const li = PVZ.image(img);
        if (li) ctx.drawImage(li.img, x.x, x.y);
      }
      // 欢迎木牌上的玩家名
      const i = scene.main.def.index.get('woodsign1')!;
      const ws = scene.main.trackXform(i);
      const font = BitmapFont.get(FONTS.label);
      const name = `${p.name}!`;
      if (font) font.draw(ctx, name, ws.x + 170.5 - Math.floor(font.measure(name) / 2), ws.y + 102.5 + 12, 'rgb(255,245,200)');
    }
    // 冒险石碑上的关卡号
    const adv = scene.trackPos('SelectorScreen_BG_Right');
    const nums = PVZ.image('IMAGE_SELECTORSCREEN_LEVELNUMBERS');
    if (adv && nums) {
      const next = Math.min(30, done + 1);
      const stage = Math.min(6, Math.floor((next - 1) / 6) + 1);
      const sub = next - (stage - 1) * 6;
      const off = scene.down === 'adventure' ? 1 : 0;
      ctx.drawImage(nums.img, stage * nums.cw, 0, nums.cw, nums.ch, adv.x + 486 + off, adv.y + 47 + off, nums.cw, nums.ch);
      ctx.drawImage(nums.img, sub * nums.cw, 0, nums.cw, nums.ch, adv.x + 509 + off, adv.y + 50 + off, nums.cw, nums.ch);
    }
    void IDENTITY;
  }

  const toScene = (e: MouseEvent) => {
    const rect = wrap.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - rect.left - v.x) / v.scale, y: (e.clientY - rect.top - v.y) / v.scale };
  };
  const hit = (x: number, y: number): Hotspot | null => {
    // 后注册的热点优先（图片按钮覆盖在背景之上）
    for (const hs of [...hotRef.current].reverse()) {
      const r = hs.rect();
      if (r && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) return hs;
    }
    return null;
  };

  return (
    <div class="screen classic-menu" ref={wrap}>
      <canvas
        ref={canvas}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        onMouseMove={(e) => {
          const s = sceneRef.current;
          if (!s) return;
          const p2 = toScene(e as unknown as MouseEvent);
          const h = hit(p2.x, p2.y);
          if ((h?.id ?? '') !== s.hover && h) audio.sfx('bleep');
          s.hover = h?.id ?? '';
          setTip(h ? { text: h.tip, x: (e as unknown as MouseEvent).clientX, y: (e as unknown as MouseEvent).clientY } : null);
          (e.currentTarget as HTMLCanvasElement).style.cursor = h ? 'pointer' : 'default';
        }}
        onMouseDown={(e) => {
          const s = sceneRef.current;
          if (!s) return;
          audio.ensure();
          const p2 = toScene(e as unknown as MouseEvent);
          s.down = hit(p2.x, p2.y)?.id ?? '';
          // 点击花朵会摇摆
          s.flowers.forEach((f, i) => {
            const t = s.main.trackXform(s.main.def.index.get(`flower${i + 1}`)!);
            if (Math.abs(p2.x - t.x - 40) < 45 && Math.abs(p2.y - t.y - 50) < 60) {
              f.play(`anim_flower${i + 1}`, 'hold');
              f.rate = 24;
              audio.sfx('click');
            }
          });
        }}
        onMouseUp={(e) => {
          const s = sceneRef.current;
          if (!s) return;
          const p2 = toScene(e as unknown as MouseEvent);
          const h = hit(p2.x, p2.y);
          if (h && h.id === s.down) {
            audio.sfx(h.sound ?? 'button');
            h.action();
          }
          s.down = '';
        }}
        onMouseLeave={() => setTip(null)}
      />
      {tip && (
        <div class="pvz-tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
          {tip.text}
        </div>
      )}
      {toolbox && (
        <PvzDialog title="工具箱" onClose={() => setToolbox(false)}>
          <div class="pvz-toolbox">
            {(
              [
                ['修改器', '无限资源、数值调整、自动部署', () => navigate({ name: 'cheats' })],
                ['AI 控制台', '观战、批量模拟、策略对比、阵容研究', () => navigate({ name: 'ai' })],
                ['挑战编辑器', '组合规则限制，验证与排行', () => navigate({ name: 'ruleEditor' })],
                ['关卡编辑器', '地形、路线、资源、波次、事件', () => navigate({ name: 'editor' })],
                ['自定义关卡', '游玩自己或他人制作的关卡', () => navigate({ name: 'custom' })],
                ['单位编辑器', '自定义植物与僵尸', () => navigate({ name: 'unitEditor' })],
                ['录像与战报', '回放、逐帧分析、导出战报', () => navigate({ name: 'replays' })],
                ['存档', '多存档、备份与恢复', () => navigate({ name: 'saves' })],
              ] as [string, string, () => void][]
            ).map(([t, d, go]) => (
              <button
                class="pvz-btn"
                title={d}
                onClick={() => {
                  audio.sfx('button');
                  go();
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </PvzDialog>
      )}
    </div>
  );
}
