import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const VERSION_CHECK_COOLDOWN_KEY = 'version_check_cooldown_timestamp';
const COOLDOWN_HOURS = 24;

/** Compare two semantic version strings. Returns 1 if a > b, -1 if a < b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/** Check if we're within the 24-hour cooldown period */
async function isInCooldown(): Promise<boolean> {
  try {
    const ts = await AsyncStorage.getItem(VERSION_CHECK_COOLDOWN_KEY);
    if (!ts) return false;
    const cooldownEnd = new Date(ts).getTime() + COOLDOWN_HOURS * 60 * 60 * 1000;
    return Date.now() < cooldownEnd;
  } catch {
    return false;
  }
}

/** Set the cooldown timestamp */
async function setCooldown(): Promise<void> {
  await AsyncStorage.setItem(VERSION_CHECK_COOLDOWN_KEY, new Date().toISOString());
}

/** Check for OTA updates via expo-updates */
async function checkOTAUpdate(): Promise<boolean> {
  // expo-updates doesn't work in dev mode
  if (__DEV__) return false;

  try {
    const Updates = await import('expo-updates');
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      Alert.alert(
        '更新已就绪',
        '新版本已下载完成，重启应用即可生效。',
        [
          { text: '稍后', style: 'cancel' },
          { text: '立即重启', onPress: () => Updates.reloadAsync() },
        ]
      );
      return true;
    }
  } catch (e) {
    console.warn('[VersionChecker] OTA 检查失败:', e);
  }
  return false;
}

/** Check App Store / Google Play for a newer version */
async function checkStoreUpdate(): Promise<{ hasUpdate: boolean; version?: string; url?: string }> {
  const currentVersion = Constants.expoConfig?.version || '1.0.0';
  const bundleId = Constants.expoConfig?.ios?.bundleIdentifier || 'com.chewy.bbtalk';

  if (Platform.OS === 'ios') {
    try {
      const response = await fetch(`https://itunes.apple.com/lookup?bundleId=${bundleId}`);
      const data = await response.json();
      if (data.resultCount > 0) {
        const storeVersion = data.results[0].version;
        const storeUrl = data.results[0].trackViewUrl;
        if (compareVersions(storeVersion, currentVersion) > 0) {
          return { hasUpdate: true, version: storeVersion, url: storeUrl };
        }
      }
    } catch (e) {
      console.warn('[VersionChecker] App Store 版本检查失败:', e);
    }
  } else if (Platform.OS === 'android') {
    // Android: use Google Play link (simplified — full implementation would scrape or use an API)
    const playUrl = `https://play.google.com/store/apps/details?id=${bundleId}`;
    return { hasUpdate: false, url: playUrl };
  }

  return { hasUpdate: false };
}

/** Main entry point: run the full version check flow */
export async function checkForUpdates(): Promise<void> {
  try {
    // Check OTA first
    const hadOTA = await checkOTAUpdate();
    if (hadOTA) return; // OTA update found, no need to check store

    // Check cooldown before store check
    if (await isInCooldown()) return;

    // Check store version
    const storeResult = await checkStoreUpdate();
    if (storeResult.hasUpdate && storeResult.version && storeResult.url) {
      const url = storeResult.url;
      Alert.alert(
        '发现新版本',
        `v${storeResult.version} 已发布，建议更新以获得最佳体验。`,
        [
          { text: '稍后提醒', style: 'cancel', onPress: () => setCooldown() },
          { text: '前往更新', onPress: () => Linking.openURL(url).catch(() => {}) },
        ]
      );
    }
  } catch (e) {
    console.warn('[VersionChecker] 版本检测失败:', e);
  }
}
