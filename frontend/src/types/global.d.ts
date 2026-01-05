declare global {
  interface Window {
    // wujie 全局变量
    __POWERED_BY_WUJIE__?: boolean;
    __WUJIE?: {
      shadowRoot?: ShadowRoot;
      props?: {
        basePath?: string;
        getToken?: () => string | null;
        [key: string]: any;
      };
      mount?: boolean;
    };
    __WUJIE_MOUNT?: () => void;
    __WUJIE_UNMOUNT?: () => void;
    
    // 认证桥接对象（主应用注入）
    __AUTH_BRIDGE__?: {
      getToken(): string | null;
      refreshToken?(): Promise<boolean>;
      getUserInfo?(): Promise<any>;
    };
  }
}

export {};
