// API 基础 URL
// 真机调试：用电脑局域网 IP（手机和电脑需在同一 WiFi）
// iOS 模拟器：可以用 localhost
// Android 模拟器：用 10.0.2.2
import { Platform } from 'react-native';

// ⚠️ 改成你电脑的局域网 IP
const LAN_IP = '192.168.0.83';

const DEV_API_URL = Platform.select({
  android: `http://10.0.2.2:8020`,
  ios: `http://${LAN_IP}:8020`,
  web: 'http://localhost:8020',
  default: `http://${LAN_IP}:8020`,
});

export const API_BASE_URL = __DEV__ ? DEV_API_URL : 'https://your-production-url.com';
