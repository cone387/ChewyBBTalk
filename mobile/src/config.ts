/**
 * API 配置 - 支持自定义服务地址（self-hosted）
 *
 * 优先级：
 * 1. 用户在登录页手动设置的地址（AsyncStorage 持久化）
 * 2. app.json extra.apiBaseUrl（通过 expo-constants 读取）
 * 3. 开发环境本地地址（__DEV__ 模式）
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const STORAGE_KEY = 'bbtalk_api_base_url';

const LAN_IP = '192.168.31.217';

// 从 app.json extra 或 EAS Build env 读取生产地址
const PRODUCTION_API_URL =
  Constants.expoConfig?.extra?.apiBaseUrl || 'https://bbtalk.cone387.top';

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
