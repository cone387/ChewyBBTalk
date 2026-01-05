/**
 * wujie 主应用集成示例
 * 
 * 此文件展示如何在主应用中加载 ChewyBBTalk 子应用
 */

import WujieVue from 'wujie-vue3';  // 或 wujie-react
import { bus, setupApp, preloadApp, startApp } from 'wujie';

// ==============================
// 方案一：基础集成（最简单）
// ==============================

export function loadBBTalkBasic() {
  // 1. 注入认证桥接（必须在启动子应用前）
  window.__AUTH_BRIDGE__ = {
    getToken: () => {
      return localStorage.getItem('token') || null;
    }
  };

  // 2. 启动子应用
  startApp({
    name: 'bbtalk',
    url: 'http://localhost:4001',  // 开发环境
    el: '#subapp-container',       // 挂载点
  });
}

// ==============================
// 方案二：完整集成（推荐）
// ==============================

export function loadBBTalkFull() {
  // 1. 注入完整的认证桥接
  window.__AUTH_BRIDGE__ = {
    getToken: () => {
      return localStorage.getItem('token') || null;
    },
    
    refreshToken: async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
          return true;
        }
        return false;
      } catch (error) {
        console.error('Token refresh failed:', error);
        return false;
      }
    },
    
    getUserInfo: async () => {
      try {
        const response = await fetch('/api/user/me', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        return await response.json();
      } catch (error) {
        console.error('Get user info failed:', error);
        return null;
      }
    }
  };

  // 2. 配置子应用
  setupApp({
    name: 'bbtalk',
    url: 'http://localhost:4001',
    el: '#subapp-container',
    alive: true,  // 保活模式
    
    // 生命周期钩子
    beforeLoad: (appWindow) => {
      console.log('BBTalk 准备加载');
      // 可以在这里做一些准备工作
    },
    
    beforeMount: (appWindow) => {
      console.log('BBTalk 准备挂载');
    },
    
    afterMount: (appWindow) => {
      console.log('BBTalk 已挂载');
    },
    
    beforeUnmount: (appWindow) => {
      console.log('BBTalk 准备卸载');
    },
    
    afterUnmount: (appWindow) => {
      console.log('BBTalk 已卸载');
    },
    
    // 激活钩子（保活模式有效）
    activated: (appWindow) => {
      console.log('BBTalk 已激活');
    },
    
    deactivated: (appWindow) => {
      console.log('BBTalk 已失活');
    },
    
    // 加载错误处理
    loadError: (url, error) => {
      console.error('BBTalk 加载失败:', url, error);
    }
  });

  // 3. 启动子应用
  startApp({
    name: 'bbtalk',
    url: 'http://localhost:4001',
    el: '#subapp-container',
  });
}

// ==============================
// 方案三：预加载优化
// ==============================

export function preloadBBTalk() {
  // 预加载子应用资源（提升首屏速度）
  preloadApp({
    name: 'bbtalk',
    url: 'http://localhost:4001',
  });
}

// 在路由切换前预加载
export function setupBBTalkPreload() {
  // 监听路由变化
  window.addEventListener('hashchange', () => {
    if (window.location.hash.includes('bbtalk')) {
      preloadBBTalk();
    }
  });
}

// ==============================
// 方案四：通信机制
// ==============================

export function setupBBTalkCommunication() {
  // 主应用 -> 子应用通信
  bus.$on('main-to-bbtalk', (data) => {
    console.log('主应用发送消息给 BBTalk:', data);
  });

  // 子应用 -> 主应用通信
  bus.$on('bbtalk-to-main', (data) => {
    console.log('BBTalk 发送消息给主应用:', data);
  });

  // 示例：通知子应用 token 已更新
  window.addEventListener('token-updated', () => {
    bus.$emit('main-to-bbtalk', {
      type: 'token-updated',
      token: localStorage.getItem('token')
    });
  });
}

// ==============================
// Vue 3 集成示例
// ==============================

// 在 main.js 中
import { createApp } from 'vue';
import App from './App.vue';
import WujieVue from 'wujie-vue3';

const app = createApp(App);

// 安装 wujie 插件
app.use(WujieVue, {
  // 全局配置
});

// 注册子应用
setupApp({
  name: 'bbtalk',
  url: 'http://localhost:4001',
  // ...其他配置
});

app.mount('#app');

// ==============================
// React 集成示例
// ==============================

import React, { useEffect } from 'react';
import WujieReact from 'wujie-react';

function BBTalkContainer() {
  useEffect(() => {
    // 注入认证桥接
    window.__AUTH_BRIDGE__ = {
      getToken: () => localStorage.getItem('token'),
    };
  }, []);

  return (
    <WujieReact
      name="bbtalk"
      url="http://localhost:4001"
      alive={true}
      beforeLoad={() => console.log('准备加载')}
      afterMount={() => console.log('已挂载')}
    />
  );
}

export default BBTalkContainer;

// ==============================
// 生产环境配置
// ==============================

const BBTALK_CONFIG = {
  development: {
    url: 'http://localhost:4001',
    apiBase: 'http://localhost:8000'
  },
  production: {
    url: 'https://bbtalk.example.com',
    apiBase: 'https://api.example.com'
  }
};

export function loadBBTalkForEnv() {
  const env = process.env.NODE_ENV;
  const config = BBTALK_CONFIG[env] || BBTALK_CONFIG.development;

  // 注入配置
  window.__AUTH_BRIDGE__ = {
    getToken: () => localStorage.getItem('token'),
  };

  // 可以通过 props 传递配置给子应用
  startApp({
    name: 'bbtalk',
    url: config.url,
    el: '#subapp-container',
    props: {
      apiBase: config.apiBase,
    }
  });
}

// ==============================
// HTML 示例
// ==============================

/*
<!DOCTYPE html>
<html>
<head>
  <title>主应用</title>
</head>
<body>
  <div id="app">
    <nav>
      <a href="#/">首页</a>
      <a href="#/bbtalk">BBTalk</a>
    </nav>
    
    <!-- 子应用挂载点 -->
    <div id="subapp-container"></div>
  </div>

  <script>
    // 注入认证桥接
    window.__AUTH_BRIDGE__ = {
      getToken: () => localStorage.getItem('token')
    };
  </script>
  
  <script src="/main.js"></script>
</body>
</html>
*/
