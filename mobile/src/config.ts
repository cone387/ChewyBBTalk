// API 基础 URL - 开发时指向本地后端，生产时改为实际地址
// 注意：Android 模拟器用 10.0.2.2 访问宿主机 localhost
// iOS 模拟器可以直接用 localhost
import { Platform } from 'react-native';

const DEV_API_URL = Platform.select({
  android: 'http://10.0.2.2:8020',
  ios: 'http://localhost:8020',
  default: 'http://localhost:8020',
});

export const API_BASE_URL = __DEV__ ? DEV_API_URL : 'https://your-production-url.com';
