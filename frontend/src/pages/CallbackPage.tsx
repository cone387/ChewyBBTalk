import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { handleCallback } from '../services/auth';

/**
 * OIDC 回调页面
 * 处理 Authelia 授权后的回调，用 code 换取 token
 */
export default function CallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    // 防止重复执行
    if (processing) return;
    
    const processCallback = async () => {
      setProcessing(true);
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // 检查是否有错误
      if (errorParam) {
        setError(errorDescription || errorParam);
        return;
      }

      // 检查必要参数
      if (!code || !state) {
        setError('缺少必要的授权参数');
        return;
      }

      try {
        // 处理回调
        const success = await handleCallback(code, state);
        if (success) {
          // 登录成功，强制刷新跳转到首页（重置认证状态）
          window.location.href = '/';
        } else {
          setError('登录失败，请重试');
        }
      } catch (err) {
        console.error('[Callback] Error:', err);
        setError('处理登录回调时发生错误');
      }
    };

    processCallback();
  }, [searchParams, processing]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">登录失败</div>
          <div className="text-gray-600 mb-4">{error}</div>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <div className="text-gray-600">正在处理登录...</div>
      </div>
    </div>
  );
}
