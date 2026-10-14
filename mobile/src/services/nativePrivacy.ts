import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export interface DeviceLockState {
  /** Native observations since this module instance started; retained during JS suspension. */
  revision: number;
  locked: boolean;
  supported: boolean;
}

interface PrivacyNativeModule {
  getDeviceLockState?: () => Promise<DeviceLockState>;
  addListener?: (event: string, listener: (state: unknown) => void) => { remove(): void };
  setAppPreviewProtection?: (enabled: boolean) => Promise<void>;
  getPrivacyPreviewRevision?: () => Promise<number>;
  resumePrivacyPreview?: (expectedRevision: number) => Promise<void>;
}

const unsupported = (): DeviceLockState => ({ revision: 0, locked: false, supported: false });

function nativeModule(): PrivacyNativeModule | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  return requireOptionalNativeModule<PrivacyNativeModule>('ExpoScreenCapture');
}

function isState(state: unknown): state is DeviceLockState {
  if (!state || typeof state !== 'object') return false;
  const value = state as DeviceLockState;
  return Number.isSafeInteger(value.revision) && value.revision >= 0
    && typeof value.locked === 'boolean' && typeof value.supported === 'boolean';
}

/**
 * iOS reports protected-data unavailability, not every power-button press. Android
 * records screen-off/keyguard observations. Neither API guarantees events while
 * the OS suspends the native process; supported means bridge availability only.
 */
export async function getDeviceLockState(): Promise<DeviceLockState> {
  const module = nativeModule();
  if (!module?.getDeviceLockState) return unsupported();
  const state = await module.getDeviceLockState();
  if (!isState(state)) throw new Error('Invalid native device lock state');
  return state;
}

export function onDeviceLock(listener: (state: DeviceLockState) => void): () => void {
  const module = nativeModule();
  if (!module?.getDeviceLockState || !module.addListener) return () => {};
  const subscription = module.addListener('onDeviceLock', (state) => {
    if (isState(state)) listener(state);
  });
  return () => subscription.remove();
}

/** iOS blur; Android 13+ system recents placeholder. Does not block screenshots. */
export async function setAppPreviewProtection(enabled: boolean): Promise<void> {
  await nativeModule()?.setAppPreviewProtection?.(enabled);
}

/** Capture for each active cycle before scheduling the foreground acknowledgement. */
export async function getPrivacyPreviewRevision(): Promise<number | null> {
  const module = nativeModule();
  if (!module?.getPrivacyPreviewRevision) return null;
  const revision = await module.getPrivacyPreviewRevision();
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid native privacy preview revision');
  return revision;
}

/** Call after the foreground lock/content view has committed, using that cycle's token. */
export async function resumePrivacyPreview(expectedRevision: number | null): Promise<void> {
  if (expectedRevision === null) return;
  await nativeModule()?.resumePrivacyPreview?.(expectedRevision);
}
