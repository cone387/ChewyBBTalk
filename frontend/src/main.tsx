import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// PWA Service Worker 注册
import { registerSW } from 'virtual:pwa-register';

// 注册 Service Worker
const updateSW = registerSW({
  onNeedRefresh() {
    // 当有新版本可用时的处理
    if (confirm('发现新版本，是否立即更新？')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    // 当应用可以离线使用时的处理
    console.log('应用已准备好离线使用');
  },
});

let root: ReactDOM.Root | null = null;

// wujie 生命周期函数
if (window.__POWERED_BY_WUJIE__) {
  // wujie mount
  (window as any).__WUJIE_MOUNT = () => {
    const container = window.__WUJIE?.shadowRoot?.querySelector('#root') || document.getElementById('root');
    if (container) {
      // 复用已存在的 root
      if (!root) {
        root = ReactDOM.createRoot(container);
      }
      root.render(
        <React.StrictMode>
          <App basename={window.__WUJIE?.props?.basePath || '/'} />
        </React.StrictMode>
      );
    }
  };
  
  // wujie unmount
  (window as any).__WUJIE_UNMOUNT = () => {
    root?.unmount();
    root = null;
  };
  
  // 如果已经 mount 过，直接执行
  if (window.__WUJIE?.mount) {
    (window as any).__WUJIE_MOUNT();
  }
} else {
  // 独立运行模式
  root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(
    <React.StrictMode>
      <App basename="/" />
    </React.StrictMode>
  );
}
