/**
 * Ball 窗口：全屏透明覆盖层。
 *
 * 关键设计（跟传统做法不同）：
 *   - 窗口尺寸 = 所有显示器工作区的包围盒（多屏也能覆盖）
 *   - 窗口位置 = 包围盒左上角，基本不会动（跨屏是渲染侧 transform 的事）
 *   - 整窗 setIgnoreMouseEvents(true, forward:true) — 默认点透
 *   - 鼠标进入 Ball 圆形实体区时，渲染侧通知主进程临时关掉 ignore
 *
 * 这样拖动 = 改 CSS transform，完全不调 setPosition，
 * 就能做到 60fps 丝滑，也不会有"跨屏消失"、"点不到别处"等 Electron 透明窗口的老坑。
 */
import { BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

let ballWindow: BrowserWindow | null = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 计算所有显示器的 workArea 包围盒（左上角 + 总宽高） */
export function computeOverlayBounds(): { x: number; y: number; width: number; height: number } {
  const displays = screen.getAllDisplays();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of displays) {
    const { x, y, width, height } = d.workArea;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + width > maxX) maxX = x + width;
    if (y + height > maxY) maxY = y + height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function createBallWindow(): BrowserWindow {
  const bounds = computeOverlayBounds();

  ballWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false, // 覆盖层不抢焦点
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  ballWindow.setAlwaysOnTop(true, 'screen-saver');
  ballWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  // 默认整窗点透，渲染侧会根据鼠标位置动态开关
  ballWindow.setIgnoreMouseEvents(true, { forward: true });

  console.log('[Ball] overlay created', bounds);

  ballWindow.once('ready-to-show', () => {
    ballWindow?.show();
  });

  ballWindow.webContents.on('did-fail-load', (_, code, desc, url) => {
    console.error('[Ball] did-fail-load:', { code, desc, url });
  });
  ballWindow.webContents.on('render-process-gone', (_, details) => {
    console.error('[Ball] render-process-gone:', details);
  });
  ballWindow.webContents.on('console-message', (...args: unknown[]) => {
    // Electron 33+ 签名变化，统一当成 any 处理
    // 参数：(event, level, message, line, sourceId)
    const [, level, message] = args as [unknown, number, string, number, string];
    console.log(`[Ball renderer L${level}] ${message}`);
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    ballWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/ball/index.html`);
  } else {
    ballWindow.loadFile(resolve(__dirname, '../renderer/ball/index.html'));
  }

  ballWindow.on('closed', () => {
    ballWindow = null;
  });

  return ballWindow;
}

export function getBallWindow(): BrowserWindow | null {
  return ballWindow;
}

/**
 * 显示器热插拔时重新调整 overlay 大小。
 * 注意窗口位置会跟着包围盒左上角一起变，渲染侧需要把 transform 原点也同步。
 */
export function resizeOverlayToDisplays(): { x: number; y: number; width: number; height: number } | null {
  if (!ballWindow || ballWindow.isDestroyed()) return null;
  const b = computeOverlayBounds();
  ballWindow.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
  return b;
}
