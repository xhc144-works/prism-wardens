/** 开发用：reanim 动画预览页（npm run dev 后访问 /pvz-preview.html） */
import { PVZ, PVZ_IMAGES } from './assets';
import { Reanim, IDENTITY, translate, scaleMat } from './reanim';

const params = new URLSearchParams(location.search);
const list = (params.get('r') ?? 'PeaShooterSingle:anim_full_idle,SunFlower:anim_idle,Wallnut:anim_idle,Zombie:anim_walk,Zombie:anim_eat,Zombie_football:anim_walk,Zombie_polevaulter:anim_run,CherryBomb:anim_idle,Chomper:anim_idle,SnowPea:anim_full_idle,Sun:*,LawnMower:anim_normal').split(',');
const time = Number(params.get('t') ?? 0.4);

async function main() {
  const ok = await PVZ.init('/pvz/');
  const c = document.getElementById('c') as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  if (!ok) {
    ctx.fillStyle = '#fff';
    ctx.fillText('no assets', 20, 20);
    return;
  }
  if (params.has('img')) {
    const ids = params.get('img')!.split(',');
    await PVZ.preloadImages(ids);
    ctx.fillStyle = '#777';
    ctx.fillRect(0, 0, c.width, c.height);
    let x = 10;
    let y = 10;
    let rowH = 0;
    for (const id of ids) {
      const li = PVZ.image(id);
      if (!li) continue;
      const sc = Math.min(1, 700 / li.w);
      if (x + li.w * sc > c.width) {
        x = 10;
        y += rowH + 20;
        rowH = 0;
      }
      ctx.drawImage(li.img, x, y, li.w * sc, li.h * sc);
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.fillText(`${id} ${li.w}x${li.h} ${li.rows}x${li.cols}`, x, y + li.h * sc + 12);
      x += li.w * sc + 16;
      rowH = Math.max(rowH, li.h * sc);
    }
    (window as unknown as { __ready: boolean }).__ready = true;
    return;
  }
  const items: { r: Reanim; label: string }[] = [];
  for (const spec of list) {
    const [name, anim] = spec.split(':');
    await PVZ.loadReanimsWithImages([name]);
    const def = PVZ.reanim(name);
    if (!def) continue;
    const r = new Reanim(def);
    if (!anim || anim === '*') r.playAll();
    else if (!r.play(anim)) r.playAll();
    items.push({ r, label: `${name}:${anim}` });
  }
  const draw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#5a8f3c';
    ctx.fillRect(0, 0, c.width, c.height);
    items.forEach((it, k) => {
      const cx = (k % 6) * 260 + 40;
      const cy = Math.floor(k / 6) * 300 + 40;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = 'rgba(255,255,255,.3)';
      ctx.strokeRect(cx, cy, 240, 260);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText(it.label, cx + 4, cy + 254);
      it.r.draw(ctx, scaleMat(translate(IDENTITY, cx + 40, cy + 40), 1.4), PVZ_IMAGES);
    });
  };
  for (const it of items) it.r.update(time);
  // 等待图片加载
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (params.has('anim')) {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      for (const it of items) it.r.update(dt);
      draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  } else draw();
  (window as unknown as { __ready: boolean }).__ready = true;
}
void main();
