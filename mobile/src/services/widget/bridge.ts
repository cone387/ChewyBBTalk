/**
 * Widget_Bridge — JS 侧封装
 *
 * 真正的原生模块位于 mobile/modules/home-widget/（见 Task 1.2-1.4）。
 * 为了 Expo Go / Web / Jest 环境不报错，这里做一层安全包装：
 *   - NativeModules.HomeWidget 存在：走原生实现
 *   - 不存在：变为 no-op，isSupported() 返回 false
 */
import { NativeModules, Platform } from 'react-native';

// 原生模块名（与 ios/android 端 ModuleDefinition 的名字保持一致）
const NATIVE_MODULE_NAME = 'HomeWidget';

interface HomeWidgetNativeModule {
  writeWidgetData(json: string): Promise<void>;
  reloadWidget(): Promise<void>;
  readWidgetData(): Promise<string | null>;
}

function getNativeModule(): HomeWidgetNativeModule | null {
  const mod = (NativeModules as Record<string, unknown>)[NATIVE_MODULE_NAME];
  if (!mod) return null;
  return mod as HomeWidgetNativeModule;
}

export function isSupported(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  return getNativeModule() !== null;
}

export async function writeWidgetData(json: string): Promise<void> {
  const mod = getNativeModule();
  if (!mod) {
    if (__DEV__) console.info('[HomeWidget] native module not available, skip writeWidgetData');
    return;
  }
  await mod.writeWidgetData(json);
}

export async function reloadWidget(): Promise<void> {
  const mod = getNativeModule();
  if (!mod) {
    if (__DEV__) console.info('[HomeWidget] native module not available, skip reloadWidget');
    return;
  }
  await mod.reloadWidget();
}

export async function readWidgetData(): Promise<string | null> {
  const mod = getNativeModule();
  if (!mod) return null;
  return mod.readWidgetData();
}
