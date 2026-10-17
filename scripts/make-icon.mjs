// 生成应用图标（512×512 PNG）。用法：node scripts/make-icon.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const html = `<canvas id="c" width="512" height="512"></canvas><script>
const c = document.getElementById('c'); const x = c.getContext('2d');
const bg = x.createRadialGradient(256, 200, 40, 256, 256, 300);
bg.addColorStop(0, '#2b3a7a'); bg.addColorStop(1, '#0b1024');
x.fillStyle = bg; x.beginPath(); x.roundRect(16, 16, 480, 480, 96); x.fill();
x.strokeStyle = 'rgba(167,139,250,0.8)'; x.lineWidth = 10; x.stroke();
const glow = x.createRadialGradient(256, 260, 10, 256, 260, 200);
glow.addColorStop(0, 'rgba(110,231,255,0.65)'); glow.addColorStop(1, 'rgba(110,231,255,0)');
x.fillStyle = glow; x.fillRect(0, 0, 512, 512);
const pts = [[256, 70], [372, 190], [330, 440], [182, 440], [140, 190]];
const g = x.createLinearGradient(140, 70, 372, 440);
g.addColorStop(0, '#e9fbff'); g.addColorStop(0.45, '#6ee7ff'); g.addColorStop(1, '#5b3fd6');
x.fillStyle = g; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(...p) : x.moveTo(...p)); x.closePath(); x.fill();
x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.moveTo(256, 70); x.lineTo(140, 190); x.lineTo(256, 250); x.closePath(); x.fill();
x.fillStyle = 'rgba(20,10,60,0.25)'; x.beginPath(); x.moveTo(372, 190); x.lineTo(330, 440); x.lineTo(256, 250); x.closePath(); x.fill();
x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 4; x.beginPath(); x.moveTo(256, 70); x.lineTo(256, 250); x.lineTo(182, 440); x.moveTo(256, 250); x.lineTo(330, 440); x.stroke();
const core = x.createRadialGradient(256, 260, 4, 256, 260, 40);
core.addColorStop(0, '#ffffff'); core.addColorStop(1, 'rgba(255,209,102,0)');
x.fillStyle = core; x.beginPath(); x.arc(256, 260, 40, 0, Math.PI * 2); x.fill();
</script>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 512, height: 512 } });
await p.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
const data = await p.evaluate(() => document.getElementById('c').toDataURL('image/png'));
writeFileSync('build/icon.png', Buffer.from(data.split(',')[1], 'base64'));
await b.close();
console.log('build/icon.png written');
