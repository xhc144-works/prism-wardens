/**
 * 原版风格的石质对话框（九宫格贴图 + 骷髅头标题牌），用于经典皮肤下的弹窗。
 */
import type { ComponentChildren } from 'preact';

export function PvzDialog(props: { title?: string; onClose?: () => void; width?: number; children: ComponentChildren; footer?: ComponentChildren }) {
  return (
    <div class="pvz-dialog-veil" onClick={(e) => e.target === e.currentTarget && props.onClose?.()}>
      <div class="pvz-dialog" style={{ width: props.width ?? 520 }}>
        <div class="pvz-dlg-grid">
          <div class="tl" />
          <div class="tm" />
          <div class="tr" />
          <div class="cl" />
          <div class="cm" />
          <div class="cr" />
          <div class="bl" />
          <div class="bm" />
          <div class="br" />
        </div>
        <div class="pvz-dlg-header" />
        <div class="pvz-dlg-body">
          {props.title && <div class="pvz-dlg-title">{props.title}</div>}
          <div class="pvz-dlg-content">{props.children}</div>
          {(props.footer || props.onClose) && (
            <div class="pvz-dlg-footer">
              {props.footer ?? (
                <button class="pvz-btn" onClick={props.onClose}>
                  关闭
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
