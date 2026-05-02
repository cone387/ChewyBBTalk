/**
 * iOS-style alert / confirm / action-sheet for Expo Web
 * 替代浏览器原生 window.alert / confirm / prompt，保持与 Native 一致的视觉风格
 */

let openCount = 0;
let zCounter = 99999;

// ─── Color Palette ───────────────────────────────────────
interface Palette {
  backdrop: string;
  bg: string;
  title: string;
  msg: string;
  border: string;
  accent: string;
  danger: string;
  hover: string;
}

const Light: Palette = {
  backdrop: 'rgba(0,0,0,0.3)',
  bg: 'rgba(255,255,255,0.97)',
  title: '#1c1c1e',
  msg: '#3c3c43',
  border: 'rgba(60,60,67,0.12)',
  accent: '#007AFF',
  danger: '#FF3B30',
  hover: 'rgba(0,0,0,0.04)',
};

const Dark: Palette = {
  backdrop: 'rgba(0,0,0,0.48)',
  bg: 'rgba(44,44,46,0.97)',
  title: '#f2f2f7',
  msg: '#ababab',
  border: 'rgba(84,84,88,0.36)',
  accent: '#0A84FF',
  danger: '#FF453A',
  hover: 'rgba(255,255,255,0.06)',
};

const palette = (): Palette =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ? Dark : Light;

const FONT =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

// ─── Low-level helpers ───────────────────────────────────
function css(el: HTMLElement, s: Record<string, string>) {
  Object.assign(el.style, s);
}

function lockBody() {
  if (++openCount === 1) document.body.style.overflow = 'hidden';
}
function unlockBody() {
  if (--openCount <= 0) { openCount = 0; document.body.style.overflow = ''; }
}

/** Create full-screen backdrop overlay */
function mkOverlay(p: Palette, onTap?: () => void): HTMLDivElement {
  const el = document.createElement('div');
  css(el, {
    position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
    backgroundColor: p.backdrop,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: String(zCounter++),
    opacity: '0',
    transition: 'opacity 0.2s ease-out',
  });
  el.style.setProperty('backdrop-filter', 'blur(4px)');
  el.style.setProperty('-webkit-backdrop-filter', 'blur(4px)');
  if (onTap) el.addEventListener('mousedown', e => { if (e.target === el) onTap(); });
  document.body.appendChild(el);
  lockBody();
  el.getBoundingClientRect(); // force reflow
  el.style.opacity = '1';
  return el;
}

/** Animate out & remove overlay; callback fires immediately */
function dismiss(root: HTMLDivElement, cb?: () => void) {
  if ((root as any)._closed) return;
  (root as any)._closed = true;
  cb?.();
  root.style.opacity = '0';
  const c = root.querySelector<HTMLElement>('[data-c]');
  if (c) {
    c.style.opacity = '0';
    c.style.transform = c.dataset.c === 's' ? 'translateY(16px)' : 'scale(0.96)';
  }
  setTimeout(() => { root.remove(); unlockBody(); }, 200);
}

/** Centered alert card (270 px) */
function mkCard(p: Palette): HTMLDivElement {
  const el = document.createElement('div');
  el.dataset.c = 'a';
  css(el, {
    width: '270px', maxWidth: 'calc(100vw - 48px)',
    backgroundColor: p.bg, borderRadius: '14px', overflow: 'hidden',
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    transform: 'scale(1.05)', opacity: '0',
    transition: 'transform 0.2s ease-out, opacity 0.2s ease-out',
    fontFamily: FONT,
  });
  requestAnimationFrame(() => { el.style.transform = 'scale(1)'; el.style.opacity = '1'; });
  return el;
}

/** Title + optional message */
function mkHeading(parent: HTMLElement, p: Palette, title: string, msg?: string) {
  const wrap = document.createElement('div');
  wrap.style.padding = '20px 16px';

  const t = document.createElement('div');
  css(t, {
    fontSize: '17px', fontWeight: '600', textAlign: 'center',
    color: p.title, lineHeight: '1.35', wordBreak: 'break-word',
  });
  t.textContent = title;
  wrap.appendChild(t);

  if (msg) {
    const m = document.createElement('div');
    css(m, {
      fontSize: '13px', textAlign: 'center', color: p.msg,
      lineHeight: '1.5', marginTop: '6px', wordBreak: 'break-word',
      whiteSpace: 'pre-wrap',
    });
    m.textContent = msg;
    wrap.appendChild(m);
  }
  parent.appendChild(wrap);
}

/** Hairline separator (horizontal or vertical) */
function hairline(parent: HTMLElement, p: Palette, vertical = false) {
  const el = document.createElement('div');
  css(el, vertical
    ? { width: '0.5px', alignSelf: 'stretch', backgroundColor: p.border }
    : { height: '0.5px', backgroundColor: p.border });
  parent.appendChild(el);
}

/** Tappable button */
function mkBtn(text: string, p: Palette, o: {
  bold?: boolean; destructive?: boolean; onClick: () => void;
}): HTMLDivElement {
  const el = document.createElement('div');
  css(el, {
    padding: '11px 8px', textAlign: 'center', fontSize: '17px',
    fontWeight: o.bold ? '600' : '400',
    color: o.destructive ? p.danger : p.accent,
    cursor: 'pointer', userSelect: 'none', lineHeight: '1.35',
    transition: 'background-color 0.1s',
  });
  el.style.setProperty('-webkit-user-select', 'none');
  el.style.setProperty('-webkit-tap-highlight-color', 'transparent');
  el.textContent = text;
  el.addEventListener('mouseenter', () => { el.style.backgroundColor = p.hover; });
  el.addEventListener('mouseleave', () => { el.style.backgroundColor = 'transparent'; });
  el.addEventListener('click', o.onClick);
  return el;
}

/** Keyboard shortcut handler (auto-cleaned when overlay is removed) */
function onKey(root: HTMLDivElement, map: Record<string, () => void>) {
  const h = (e: KeyboardEvent) => { const fn = map[e.key]; if (fn) { e.preventDefault(); fn(); } };
  document.addEventListener('keydown', h);
  const ob = new MutationObserver(() => {
    if (!document.body.contains(root)) { document.removeEventListener('keydown', h); ob.disconnect(); }
  });
  ob.observe(document.body, { childList: true });
}

// ─── Public API ──────────────────────────────────────────

/** iOS-style single-button alert */
export function webAlert(title: string, message?: string): void {
  const p = palette();
  const root = mkOverlay(p);
  const c = mkCard(p);
  mkHeading(c, p, title, message);
  hairline(c, p);
  c.appendChild(mkBtn('好的', p, { bold: true, onClick: () => dismiss(root) }));
  root.appendChild(c);
  onKey(root, { Enter: () => dismiss(root), Escape: () => dismiss(root) });
}

/** iOS-style two-button confirm dialog */
export function webConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
  options?: { confirmText?: string; cancelText?: string; destructive?: boolean },
): void {
  const p = palette();
  const root = mkOverlay(p, () => dismiss(root, onCancel));
  const c = mkCard(p);
  mkHeading(c, p, title, message);
  hairline(c, p);

  const row = document.createElement('div');
  row.style.display = 'flex';

  const cancelBtn = mkBtn(options?.cancelText || '取消', p, {
    onClick: () => dismiss(root, onCancel),
  });
  cancelBtn.style.flex = '1';
  row.appendChild(cancelBtn);

  hairline(row, p, true);

  const confirmBtn = mkBtn(options?.confirmText || '确定', p, {
    bold: true,
    destructive: options?.destructive,
    onClick: () => dismiss(root, onConfirm),
  });
  confirmBtn.style.flex = '1';
  row.appendChild(confirmBtn);

  c.appendChild(row);
  root.appendChild(c);
  onKey(root, { Escape: () => dismiss(root, onCancel) });
}

/** iOS-style bottom action sheet */
export function webActionSheet(
  title: string,
  options: { text: string; destructive?: boolean }[],
  onSelect: (index: number) => void,
): void {
  const p = palette();
  const root = mkOverlay(p, () => dismiss(root));
  css(root, { alignItems: 'flex-end', justifyContent: 'flex-end', padding: '8px' });
  root.style.paddingBottom = 'max(8px, env(safe-area-inset-bottom, 8px))';

  const wrap = document.createElement('div');
  wrap.dataset.c = 's';
  css(wrap, {
    width: '100%', maxWidth: '400px', margin: '0 auto',
    display: 'flex', flexDirection: 'column', gap: '8px',
    transform: 'translateY(20px)', opacity: '0',
    transition: 'transform 0.25s ease-out, opacity 0.2s ease-out',
  });

  // Options group
  const grp = document.createElement('div');
  css(grp, { backgroundColor: p.bg, borderRadius: '14px', overflow: 'hidden', fontFamily: FONT });
  if (title) {
    const t = document.createElement('div');
    css(t, {
      padding: '14px 16px', fontSize: '13px', textAlign: 'center',
      color: p.msg, lineHeight: '1.4', fontFamily: FONT,
    });
    t.textContent = title;
    grp.appendChild(t);
  }
  options.forEach((opt, i) => {
    hairline(grp, p);
    grp.appendChild(mkBtn(opt.text, p, {
      destructive: opt.destructive,
      onClick: () => { dismiss(root); onSelect(i); },
    }));
  });
  wrap.appendChild(grp);

  // Cancel group
  const cg = document.createElement('div');
  css(cg, { backgroundColor: p.bg, borderRadius: '14px', overflow: 'hidden', fontFamily: FONT });
  cg.appendChild(mkBtn('取消', p, { bold: true, onClick: () => dismiss(root) }));
  wrap.appendChild(cg);

  root.appendChild(wrap);
  requestAnimationFrame(() => { wrap.style.transform = 'translateY(0)'; wrap.style.opacity = '1'; });
  onKey(root, { Escape: () => dismiss(root) });
}
