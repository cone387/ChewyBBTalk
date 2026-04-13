/**
 * API 配置 - 支持自定义服务地址（self-hosted）
 * 用户可在登录页配置后端地址，持久化到 AsyncStorage
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'bbtalk_api_base_url';

const LAN_IP = '192.168.0.83';

// 生产环境 API 地址（HTTPS）
const PRODUCTION_API_URL = 'https://api.chewy.example.com';

const DEFAULT_API_URL = Platform.select({
  android: __DEV__ ? `http://10.0.2.2:8020` : PRODUCTION_API_URL,
  ios: __DEV__ ? `http://${LAN_IP}:8020` : PRODUCTION_API_URL,
  web: __DEV__ ? 'http://localhost:8020' : PRODUCTION_API_URL,
  default: PRODUCTION_API_URL,
})!;

// 运行时可变的 API 地址
let _apiBaseUrl: string = DEFAULT_API_URL;

export function getApiBaseUrl(): string {
  return _apiBaseUrl;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  const trimmed = url.replace(/\/+$/, ''); // 去掉末尾斜杠
  _apiBaseUrl = trimmed;
  await AsyncStorage.setItem(STORAGE_KEY, trimmed);
}

export async function loadApiBaseUrl(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) {
      _apiBaseUrl = saved;
      return saved;
    }
  } catch {}
  return DEFAULT_API_URL;
}

export const DEFAULT_URL = DEFAULT_API_URL;

// 兼容旧的导入方式
export const API_BASE_URL = DEFAULT_API_URL;
