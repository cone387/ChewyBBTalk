import { apiErrorMessage } from './apiErrorMessage';
import { getApiBaseUrl } from '../config';

export async function publicAuthRequest(path: string, data?: unknown) {
  const base = getApiBaseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}/api/v1/bbtalk/auth/${path}`, {
      method: data ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' },
      ...(data ? { body: JSON.stringify(data) } : {}), signal: controller.signal,
    });
    const body = await response.json();
    if (base !== getApiBaseUrl()) throw new Error('服务已切换，请重新操作');
    if (!response.ok) throw new Error(apiErrorMessage(body, Object.values(body).flat().filter(value => typeof value === 'string').join('；') || '请求失败，请重试'));
    return body;
  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error('请求超时，请检查网络后重试');
    throw error;
  } finally { clearTimeout(timer); }
}
