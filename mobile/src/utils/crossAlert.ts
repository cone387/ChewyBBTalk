import { Alert, ActionSheetIOS, Platform } from 'react-native';
import { webAlert, webConfirm, webActionSheet } from './webAlert';

/**
 * 跨平台通知弹窗（单按钮"确定"）
 * Web 端使用 iOS 风格弹窗，Native 端使用 Alert.alert
 */
export function xAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    webAlert(title, message);
  } else {
    Alert.alert(title, message);
  }
}

/**
 * 跨平台确认弹窗（确定/取消双按钮）
 * Web 端使用 iOS 风格弹窗，Native 端使用 Alert.alert
 */
export function xConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
  options?: { confirmText?: string; cancelText?: string; destructive?: boolean },
): void {
  if (Platform.OS === 'web') {
    webConfirm(title, message, onConfirm, onCancel, options);
  } else {
    Alert.alert(title, message, [
      { text: options?.cancelText || '取消', style: 'cancel', onPress: onCancel },
      { text: options?.confirmText || '确定', style: options?.destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
}

interface ActionSheetOption {
  text: string;
  destructive?: boolean;
}

/**
 * 跨平台操作菜单
 * iOS 使用 ActionSheetIOS，Android 使用 Alert.alert，Web 使用 iOS 风格底部菜单
 */
export function xActionSheet(
  title: string,
  options: ActionSheetOption[],
  onSelect: (index: number) => void,
): void {
  if (Platform.OS === 'web') {
    webActionSheet(title, options, onSelect);
  } else if (Platform.OS === 'ios') {
    const labels = [...options.map(o => o.text), '取消'];
    const destructiveIndex = options.findIndex(o => o.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: labels,
        destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
        cancelButtonIndex: labels.length - 1,
      },
      (idx) => {
        if (idx < options.length) onSelect(idx);
      },
    );
  } else {
    // Android
    Alert.alert(
      title,
      '',
      [
        ...options.map((o, i) => ({
          text: o.text,
          style: (o.destructive ? 'destructive' : 'default') as 'destructive' | 'default',
          onPress: () => onSelect(i),
        })),
        { text: '取消', style: 'cancel' as const },
      ],
    );
  }
}
