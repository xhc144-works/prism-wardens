/**
 * 800×600 原版比例舞台：内容按原版坐标排布，整体等比缩放居中；两侧用模糊背景填充。
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { PvzImage } from './thumbs';

export function useFit(ref: { current: HTMLElement | null }, w = 800, h = 600) {
  const [v, setV] = useState({ scale: 1, x: 0, y: 0 });
  useEffect(() => {
    const upd = () => {
      const el = ref.current;
      if (!el) return;
      const scale = Math.min(el.clientWidth / w, el.clientHeight / h);
      setV({ scale, x: (el.clientWidth - w * scale) / 2, y: (el.clientHeight - h * scale) / 2 });
    };
    upd();
    const ro = new ResizeObserver(upd);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return v;
}

export function Stage(props: { bg?: string; children: ComponentChildren; class?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const v = useFit(wrap);
  return (
    <div class={`screen pvz-stage-wrap ${props.class ?? ''}`} ref={wrap}>
      {props.bg && (
        <div class="pvz-stage-blur">
          <PvzImage id={props.bg} w={800} h={600} style={{ width: '100%', height: '100%' }} />
        </div>
      )}
      <div class="pvz-stage" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.scale})` }}>
        {props.bg && <PvzImage id={props.bg} w={800} h={600} style={{ position: 'absolute', left: 0, top: 0 }} />}
        {props.children}
      </div>
    </div>
  );
}
