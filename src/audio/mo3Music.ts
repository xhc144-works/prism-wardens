/**
 * 原版音乐的实时分层播放（AudioWorklet + libopenmpt WebAssembly）。
 * 用于应用内导入（没有预渲染 OGG）时，与原版一样按通道静音实现主旋律/鼓/镲分层。
 */
import { PVZ } from '../pvz/assets';

export class Mo3Music {
  private node: AudioWorkletNode | null = null;
  private loading: Promise<boolean> | null = null;
  private tune = '';
  private layer = false;
  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
  ) {}

  available(): boolean {
    return !!PVZ.manifest?.mo3 && typeof AudioWorkletNode !== 'undefined';
  }

  private init(): Promise<boolean> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const m = PVZ.manifest?.mo3;
        if (!m) return false;
        await this.ctx.audioWorklet.addModule(new URL('vendor/openmpt/pvz-music.worklet.js', document.baseURI).href);
        const [main, hihats] = await Promise.all([fetch(PVZ.url(m.main)).then((r) => r.arrayBuffer()), m.hihats ? fetch(PVZ.url(m.hihats)).then((r) => r.arrayBuffer()) : Promise.resolve(null)]);
        this.node = new AudioWorkletNode(this.ctx, 'pvz-music', { numberOfInputs: 0, outputChannelCount: [2] });
        this.node.connect(this.out);
        this.node.port.postMessage({ cmd: 'load', main, hihats });
        return true;
      } catch (e) {
        console.warn('MO3 播放器初始化失败', e);
        return false;
      }
    })();
    return this.loading;
  }

  play(tune: string | null): void {
    if ((tune ?? '') === this.tune) return;
    this.tune = tune ?? '';
    this.layer = false;
    void this.init().then((ok) => {
      if (!ok || !this.node) return;
      this.node.port.postMessage(tune ? { cmd: 'play', tune } : { cmd: 'stop' });
    });
  }

  setLayer(on: boolean): void {
    if (on === this.layer || !this.node) return;
    this.layer = on;
    this.node.port.postMessage({ cmd: 'layer', on });
  }
}
