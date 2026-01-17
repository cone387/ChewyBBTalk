import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../services/auth';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Toast from '../components/ui/Toast';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true); // true: 登录, false: 注册
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const navigate = useNavigate();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }
    
    setLoading(true);
    
    try {
      if (isLogin) {
        // 登录
        const result = await login(username, password);
        if (result.success) {
          setSuccess('登录成功！');
          // 延迟跳转，确保认证状态生效
          setTimeout(() => {
            window.location.href = '/';
          }, 800);
        } else {
          setError(result.error || '登录失败');
        }
      } else {
        // 注册
        const result = await register({
          username,
          password,
          email: email || undefined,
          display_name: displayName || undefined,
        });
        if (result.success) {
          setSuccess('注册成功！');
          // 延迟跳转
          setTimeout(() => {
            window.location.href = '/';
          }, 800);
        } else {
          setError(result.error || '注册失败');
        }
      }
    } catch (error) {
      console.error('[Login] 错误:', error);
      setError('操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo 和标题 */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">
            {isLogin ? '登录' : '注册'} ChewyBBTalk
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {isLogin ? '欢迎回来！' : '创建您的账户'}
          </p>
        </div>
        
        {/* 表单 */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* 用户名 */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                用户名 *
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                disabled={loading}
                className="mt-1"
              />
            </div>
            
            {/* 密码 */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                密码 *
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                disabled={loading}
                className="mt-1"
              />
            </div>
            
            {/* 注册额外字段 */}
            {!isLogin && (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    邮箱（可选）
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="请输入邮箱"
                    disabled={loading}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
                    显示名称（可选）
                  </label>
                  <Input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="请输入显示名称"
                    disabled={loading}
                    className="mt-1"
                  />
                </div>
              </>
            )}
          </div>
          
          {/* 提交按钮 */}
          <div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? '处理中...' : isLogin ? '登录' : '注册'}
            </Button>
          </div>
          
          {/* 切换登录/注册 */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
                setSuccess(null);
              }}
              className="text-sm text-blue-600 hover:text-blue-500"
              disabled={loading}
            >
              {isLogin ? '没有账户？立即注册' : '已有账户？立即登录'}
            </button>
          </div>
        </form>
      </div>
      
      {/* Toast 提示 */}
      {error && (
        <Toast
          message={error}
          type="error"
          onClose={() => setError(null)}
        />
      )}
      {success && (
        <Toast
          message={success}
          type="success"
          onClose={() => setSuccess(null)}
        />
      )}
    </div>
  );
}
