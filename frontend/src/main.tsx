import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

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
