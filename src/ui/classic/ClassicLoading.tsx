/**
 * 经典皮肤的载入画面：标题图、Logo 弹入、草皮卷滚动的载入条与冒出的小芽，
 * 期间预载全部植物/僵尸动画与常用界面资源，完成后“点击开始”。
 */
import { useEffect, useRef } from 'preact/hooks';
import { PVZ, PVZ_IMAGES } from '../../pvz/assets';
import { BitmapFont, FONTS } from '../../pvz/font';
import { Reanim, type Mat, translate, mul } from '../../pvz/reanim';
import { PLANT_SKINS, ZOMBIE_SKINS } from '../../render/classic/skins';
import { audio } from '../../audio/audio';

const UI_IMAGES = [
  'IMAGE_SEEDBANK',
  'IMAGE_SEEDPACKET_LARGER',
  'IMAGE_SEEDPACKETSILHOUETTE',
  'IMAGE_SHOVELBANK',
  'IMAGE_SHOVEL',
  'IMAGE_PLANTSHADOW',
  'IMAGE_SEEDCHOOSER_BACKGROUND',
  'IMAGE_CHALLENGE_BACKGROUND',
  'IMAGE_CHALLENGE_WINDOW',
  'IMAGE_CHALLENGE_WINDOW_HIGHLIGHT',
  'IMAGE_SURVIVAL_THUMBNAILS',
  'IMAGE_LOCK',
  'IMAGE_MINIGAME_TROPHY',
  'IMAGE_ALMANAC_INDEXBACK',
  'IMAGE_ALMANAC_PLANTBACK',
  'IMAGE_ALMANAC_ZOMBIEBACK',
];

export function ClassicLoading(props: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    let raf = 0;
    let progress = 0;
    let shown = 0;
    let done = false;
    let t = 0;
    const sprouts: { r: Reanim; x: number; y: number; sx: number; sy: number }[] = [];
    const triggers = [0.11, 0.32, 0.54, 0.72, 0.91];
    let fired = 0;
    const tasks: (() => Promise<unknown>)[] = [];
    const plantReanims = [...new Set(Object.values(PLANT_SKINS).map((s) => s.reanim))];
    const zombieReanims = [...new Set(Object.values(ZOMBIE_SKINS).flatMap((s) => [s.reanim, ...(s.charred ? [s.charred] : [])]))];
    for (const n of [...plantReanims, ...zombieReanims, 'SelectorScreen', 'Sun', 'LawnMower', 'Zombie_flagpole', 'StartReadySetPlant']) tasks.push(() => PVZ.loadReanimsWithImages([n]));
    tasks.push(() => PVZ.preloadImages(UI_IMAGES));
    for (const f of Object.values(FONTS)) tasks.push(() => BitmapFont.load(f));
    void (async () => {
      await PVZ.preloadImages(['IMAGE_TITLESCREEN', 'IMAGE_PVZ_LOGO', 'IMAGE_LOADBAR_DIRT', 'IMAGE_LOADBAR_GRASS', 'IMAGE_REANIM_SODROLLCAP']);
      await PVZ.loadReanimsWithImages(['LoadBar_sprout', 'LoadBar_Zombiehead']);
      let n = 0;
      const queue = [...tasks];
      const worker = async () => {
        while (queue.length && alive) {
          const job = queue.shift()!;
          await job();
          n++;
          progress = n / tasks.length;
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      progress = 1;
    })();
    let last = performance.now();
    const loop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      shown = Math.min(progress, shown + dt * 0.9);
      const c = ref.current;
      if (c) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const W = c.clientWidth;
        const H = c.clientHeight;
        if (c.width !== Math.round(W * dpr)) {
          c.width = Math.round(W * dpr);
          c.height = Math.round(H * dpr);
        }
        const ctx = c.getContext('2d')!;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, c.width, c.height);
        const s = Math.min(W / 800, H / 600) * dpr;
        const base: Mat = [s, 0, 0, s, (c.width - 800 * s) / 2, (c.height - 600 * s) / 2];
        ctx.setTransform(...base);
        const title = PVZ.image('IMAGE_TITLESCREEN');
        if (title) ctx.drawImage(title.img, 0, 0);
        const logo = PVZ.image('IMAGE_PVZ_LOGO');
        if (logo) {
          // Logo 从上方落下并轻微回弹
          const k = Math.min(1, t / 0.6);
          const y = k < 1 ? -150 + 160 * k * k : 10 + Math.max(0, 5 * Math.sin(Math.min(1, (t - 0.6) / 0.4) * Math.PI));
          ctx.drawImage(logo.img, 400 - logo.w / 2, y);
        }
        const dirt = PVZ.image('IMAGE_LOADBAR_DIRT');
        const grass = PVZ.image('IMAGE_LOADBAR_GRASS');
        const total = dirt?.w ?? 314;
        const bx = 400 - total / 2;
        const gy = 511;
        if (dirt) ctx.drawImage(dirt.img, bx, gy + 18);
        const cur = total * shown;
        if (grass) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(bx, gy, cur, grass.h);
          ctx.clip();
          ctx.drawImage(grass.img, bx, gy);
          ctx.restore();
        }
        while (fired < triggers.length && shown >= triggers[fired]) {
          const zombie = fired === 4;
          const def = PVZ.reanim(zombie ? 'LoadBar_Zombiehead' : 'LoadBar_sprout');
          if (def) {
            const r = new Reanim(def);
            r.playAll('hold');
            r.rate = 18;
            const x = triggers[fired] * total + bx - 15;
            sprouts.push({ r, x: zombie ? x - 20 : x, y: fired === 2 ? gy - 5 : gy, sx: fired === 1 || fired === 3 ? -1 : fired === 2 ? 1.1 : 1, sy: fired === 2 ? 1.3 : 1 });
          }
          audio.sfx('loadingbar');
          fired++;
        }
        for (const sp of sprouts) {
          sp.r.update(dt);
          sp.r.draw(ctx, mul(translate(base, sp.x, sp.y), sp.sx, 0, 0, sp.sy, 0, 0), PVZ_IMAGES);
        }
        if (shown < 1) {
          const cap = PVZ.image('IMAGE_REANIM_SODROLLCAP');
          if (cap) {
            const roll = cur * 0.94;
            const rot = (-roll / 180) * Math.PI * 2;
            const sc = 1 - 0.5 * shown;
            ctx.setTransform(...mul(base, 1, 0, 0, 1, bx + 11 + roll, gy - 3 - 35 * sc + 35));
            ctx.rotate(rot);
            ctx.scale(sc, sc);
            ctx.drawImage(cap.img, -cap.w / 2, -cap.h / 2);
            ctx.setTransform(...base);
          }
        }
        ctx.setTransform(...base);
        const font = BitmapFont.get(FONTS.label);
        const text = shown >= 1 ? '点击开始！' : '载入中……';
        const col = shown >= 1 ? (Math.sin(t * 6) > 0 ? '#ffd23c' : '#ffe98a') : '#d6c38a';
        if (font) font.draw(ctx, text, 400, gy + 53, col, 0.5);
        if (shown >= 1 && !done) {
          done = true;
          // 自动化环境（测试/录屏）中无需点击
          if (navigator.webdriver) setTimeout(click, 300);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const click = () => {
      audio.ensure();
      if (done) {
        audio.sfx('button');
        alive = false;
        props.onDone();
      }
    };
    const el = ref.current!;
    el.addEventListener('click', click);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      el.removeEventListener('click', click);
    };
  }, []);
  return <canvas ref={ref} class="classic-loading" style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }} />;
}
