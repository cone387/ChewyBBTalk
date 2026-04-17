import { Alert, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/** 错误类型枚举 */
export enum ErrorType {
  Network = 'NETWORK',
  Auth = 'AUTH',
  Server = 'SERVER',
  Validation = 'VALIDATION',
  Unknown = 'UNKNOWN',
}

/** 分类后的错误信息 */
export interface ClassifiedError {
  type: ErrorType;
  title: string;
  message: string;
  originalError: unknown;
}

const NETWORK_KEYWORDS = ['网络', 'network', 'Network request failed', 'fetch', 'ECONNREFUSED', 'ETIMEDOUT', 'timeout'];
const AUTH_KEYWORDS = ['认证', '登录', '过期', 'unauthorized', 'token', '401'];
const SERVER_KEYWORDS = ['服务器', 'server', 'internal', '500', '502', '503', '504'];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as any;
    return e.message || e.msg || e.detail || JSON.stringify(error);
  }
  return String(error);
}

function getStatusCode(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const e = error as any;
    const status = e.status || e.statusCode || e.response?.status;
    if (typeof status === 'number') return status;
  }
  return null;
}

/** 错误分类函数 — 纯函数，根据错误对象判断类型并生成中文提示 */
export function classifyError(error: unknown): ClassifiedError {
  const msg = getErrorMessage(error).toLowerCase();
  const status = getStatusCode(error);

  // 网络错误
  if (NETWORK_KEYWORDS.some(kw => msg.includes(kw.toLowerCase()))) {
    return { type: ErrorType.Network, title: '网络错误', message: '网络连接失败，请检查网络设置', originalError: error };
  }

  // 认证错误
  if (status === 401 || AUTH_KEYWORDS.some(kw => msg.includes(kw.toLowerCase()))) {
    return { type: ErrorType.Auth, title: '认证失败', message: '登录已过期，请重新登录', originalError: error };
  }

  // 服务器错误
  if ((status && status >= 400 && status < 600) || SERVER_KEYWORDS.some(kw => msg.includes(kw.toLowerCase()))) {
    return { type: ErrorType.Server, title: '服务器错误', message: '服务器错误，请稍后重试', originalError: error };
  }

  // 未知错误
  return { type: ErrorType.Unknown, title: '操作失败', message: '操作失败，请稍后重试', originalError: error };
}

/** 显示错误弹窗（Alert + 复制按钮） */
export function showError(error: unknown): void {
  try {
    const classified = classifyError(error);
    console.warn(`[ErrorHandler] ${classified.type}: ${classified.message}`, error);
    Alert.alert(classified.title, classified.message, [
      { text: '复制', onPress: () => Clipboard.setStringAsync(`${classified.title}: ${classified.message}`) },
      { text: '关闭' },
    ]);
  } catch (e) {
    console.warn('[ErrorHandler] 错误处理失败:', e);
  }
}

/** 显示错误弹窗（自定义标题和消息） */
export function showErrorMessage(title: string, message: string): void {
  try {
    Alert.alert(title, message, [
      { text: '复制', onPress: () => Clipboard.setStringAsync(`${title}: ${message}`) },
      { text: '关闭' },
    ]);
  } catch (e) {
    console.warn('[ErrorHandler] 错误处理失败:', e);
  }
}

/** 静默记录错误（console.warn），不弹窗 */
export function logError(error: unknown, context?: string): void {
  try {
    const msg = getErrorMessage(error);
    console.warn(`[ErrorHandler]${context ? ` [${context}]` : ''} ${msg}`, error);
  } catch {
    // 最后的兜底
  }
}
