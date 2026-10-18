/*
 * 原版分层音乐播放器（AudioWorklet）。
 * 使用 libopenmpt（WebAssembly，BSD 许可，经 chiptune3 构建）实时播放玩家导入的 mainmusic.mo3，
 * 与原版一样同时运行“主旋律 / 鼓 / 镲”三个实例，通过静音通道分层，并按增益淡入淡出。
 */
import libopenmpt from './libopenmpt.worklet.js';

let M = null;
const ready = libopenmpt().then((m) => (M = m));

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const ALL = range(0, 28);
// 曲目：起始 order、主旋律/鼓/镲通道（镲来自 hihats 文件）；night 的鼓层是独立段落
const TUNES = {
  day: { start: 0x00, main: range(0, 23), drums: range(24, 26), hihats: [27] },
  night: { start: 0x30, main: ALL, drums: ALL, drumsStart: 0x5c, burst: true },
  pool: { start: 0x5e, main: range(0, 17), drums: range(25, 28), hihats: range(18, 24) },
  fog: { start: 0x7d, main: range(0, 15), drums: range(16, 22), hihats: [23] },
  roof: { start: 0xb8, main: range(0, 17), drums: range(18, 20), hihats: [21] },
  choose: { start: 0x7a, main: ALL },
  title: { start: 0x98, main: ALL },
  zen: { start: 0xdd, main: ALL },
  puzzle: { start: 0xb1, main: ALL },
  minigame: { start: 0xa6, main: ALL },
  conveyor: { start: 0xd4, main: ALL },
  boss: { start: 0x9e, main: ALL },
};

function cstr(s) {
  const p = M._malloc(s.length + 1);
  for (let i = 0; i < s.length; i++) M.HEAPU8[p + i] = s.charCodeAt(i);
  M.HEAPU8[p + s.length] = 0;
  return p;
}

class Inst {
  constructor(bytes, mask, order) {
    this.ptr = M._malloc(bytes.byteLength);
    M.HEAPU8.set(new Uint8Array(bytes), this.ptr);
    this.ext = M._openmpt_module_ext_create_from_memory(this.ptr, bytes.byteLength, 0, 0, 0, 0, 0, 0, 0);
    this.mod = M._openmpt_module_ext_get_module(this.ext);
    const name = cstr('interactive');
    this.iface = M._malloc(64);
    M._openmpt_module_ext_get_interface(this.ext, name, this.iface, 64);
    M._free(name);
    M._openmpt_module_set_repeat_count(this.mod, -1);
    const n = M._openmpt_module_get_num_channels(this.mod);
    // 原版只设置 0..28 通道音量，29 号通道始终可闻
    for (let c = 0; c < Math.min(29, n); c++) if (!mask.includes(c)) this.call(10, this.ext, c, 1);
    M._openmpt_module_set_position_order_row(this.mod, order, 0);
    this.left = M._malloc(4 * 256);
    this.right = M._malloc(4 * 256);
    this.gain = 0;
    this.target = 0;
    this.step = 0;
  }
  call(i, ...args) {
    const fp = new Uint32Array(M.HEAPU8.buffer)[(this.iface >> 2) + i];
    return M.wasmTable.get(fp)(...args);
  }
  ramp(v, seconds) {
    this.target = v;
    const frames = Math.max(1, seconds * sampleRate);
    this.step = (v - this.gain) / frames;
    if (seconds <= 0) {
      this.gain = v;
      this.step = 0;
    }
  }
  render(outL, outR, n) {
    const got = M._openmpt_module_read_float_stereo(this.mod, sampleRate, n, this.left, this.right);
    const f = new Float32Array(M.HEAPU8.buffer);
    const l = this.left >> 2;
    const r = this.right >> 2;
    for (let i = 0; i < got; i++) {
      if (this.step !== 0) {
        this.gain += this.step;
        if ((this.step > 0 && this.gain >= this.target) || (this.step < 0 && this.gain <= this.target)) {
          this.gain = this.target;
          this.step = 0;
        }
      }
      if (this.gain > 0) {
        outL[i] += f[l + i] * this.gain;
        outR[i] += f[r + i] * this.gain;
      }
    }
  }
  order() {
    return M._openmpt_module_get_current_order(this.mod);
  }
  row() {
    return M._openmpt_module_get_current_row(this.mod);
  }
  destroy() {
    M._openmpt_module_ext_destroy(this.ext);
    M._free(this.ptr);
    M._free(this.iface);
    M._free(this.left);
    M._free(this.right);
  }
}

class PvzMusic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.main = null;
    this.hihat = null;
    this.inst = {};
    this.tune = null;
    this.pendingDrums = null;
    this.lastHalf = -1;
    this.port.onmessage = (e) => this.onMsg(e.data);
  }
  stopAll() {
    for (const k of Object.keys(this.inst)) this.inst[k].destroy();
    this.inst = {};
    this.tune = null;
  }
  async onMsg(m) {
    await ready;
    if (m.cmd === 'load') {
      this.main = m.main;
      this.hihat = m.hihats ?? null;
      this.port.postMessage({ cmd: 'ready' });
    } else if (m.cmd === 'play') {
      this.stopAll();
      const t = TUNES[m.tune];
      if (!t || !this.main) return;
      this.tune = m.tune;
      this.inst.main = new Inst(this.main, t.main, t.start);
      this.inst.main.ramp(1, 0);
      if (t.drums) this.inst.drums = new Inst(this.main, t.drums, t.drumsStart ?? t.start);
      if (t.hihats && this.hihat) this.inst.hihats = new Inst(this.hihat, t.hihats, t.start);
      this.layer = false;
    } else if (m.cmd === 'stop') {
      this.stopAll();
    } else if (m.cmd === 'layer') {
      this.setLayer(m.on);
    }
  }
  setLayer(on) {
    if (!this.tune || on === this.layer) return;
    this.layer = on;
    const t = TUNES[this.tune];
    const { main, drums, hihats } = this.inst;
    if (t.burst && drums) {
      // 夜晚：在主旋律换 order 时把鼓点实例跳到 76/77，并交叉淡化
      if (on) this.pendingDrums = 'burst';
      else {
        drums.ramp(0, 8);
        main.ramp(1, 4);
      }
      return;
    }
    if (hihats) hihats.ramp(on ? 1 : 0, on ? 4 : 8);
    if (drums) {
      if (on) this.pendingDrums = 'on';
      else drums.ramp(0, 0.5);
    }
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] ?? out[0];
    if (!M || !this.inst.main) return true;
    L.fill(0);
    if (R !== L) R.fill(0);
    const n = L.length;
    const main = this.inst.main;
    // 鼓点在半个 pattern 的边界切入，保持节拍对齐
    if (this.pendingDrums) {
      const half = main.order() * 2 + (main.row() >= 32 ? 1 : 0);
      if (this.lastHalf >= 0 && half !== this.lastHalf) {
        const d = this.inst.drums;
        if (d) {
          if (this.pendingDrums === 'burst') {
            M._openmpt_module_set_position_order_row(d.mod, main.order() % 2 === 0 ? 0x4c : 0x4d, 0);
            d.ramp(1, 0);
            main.ramp(0, 4);
          } else d.ramp(1, 0);
        }
        this.pendingDrums = null;
      }
      this.lastHalf = half;
    } else this.lastHalf = main.order() * 2 + (main.row() >= 32 ? 1 : 0);
    for (const k of Object.keys(this.inst)) this.inst[k].render(L, R, n);
    return true;
  }
}

registerProcessor('pvz-music', PvzMusic);
