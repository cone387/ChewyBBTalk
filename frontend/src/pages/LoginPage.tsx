import { useState, useEffect, useRef } from 'react';
import { login, register, getAuthPolicy } from '../services/auth';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

const REMEMBER_USERNAME_KEY = 'bbtalk_remember_username';
const SAVED_USERNAME_KEY = 'bbtalk_saved_username';
const PRIVACY_STATE_KEY = 'bbtalk_privacy_mode';
const PRIVACY_TIMESTAMP_KEY = 'bbtalk_privacy_timestamp';

function loginDestination() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next?.startsWith('/desktop/authorize?') ? next : '/';
}

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true); // true: 登录, false: 注册
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rememberUsername, setRememberUsername] = useState(true);
  
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
  const [policyError, setPolicyError] = useState(false);
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const redirectTimer = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
    };
  }, []);

  const completeAuthentication = (message: string) => {
    localStorage.removeItem(PRIVACY_STATE_KEY);
    localStorage.removeItem(PRIVACY_TIMESTAMP_KEY);
    setSuccess(message);
    redirectTimer.current = window.setTimeout(() => {
      window.location.href = loginDestination();
    }, 800);
  };

  useEffect(() => {
    const controller = new AbortController();
    getAuthPolicy(controller.signal).then(policy => {
      if (controller.signal.aborted) return;
      setRegistrationEnabled(policy.registration_enabled);
      if (!policy.registration_enabled) setIsLogin(true);
    }).catch(() => {
      if (!controller.signal.aborted) setPolicyError(true);
    });
    return () => controller.abort();
  }, [policyAttempt]);

  // 初始化时读取保存的用户名
  useEffect(() => {
    // 只有明确设置为 false 才不勾选，否则默认勾选
    const remembered = localStorage.getItem(REMEMBER_USERNAME_KEY) !== 'false';
    setRememberUsername(remembered);
    if (remembered) {
      const savedUsername = localStorage.getItem(SAVED_USERNAME_KEY) || '';
      setUsername(savedUsername);
    }
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setError(null);
    setSuccess(null);
    
    if (!username || !password) {
      setError('请输入用户名和密码');
      document.getElementById(!username ? 'username' : 'password')?.focus();
      return;
    }
    
    if (!isLogin && registrationEnabled !== true) {
      setError('当前服务未开放注册，请联系管理员');
      return;
    }
    submitting.current = true;
    setLoading(true);
    
    try {
      if (isLogin) {
        // 登录
        const result = await login(username, password);
        if (!mounted.current) return;
        if (result.success) {
          // 保存/清除用户名
          if (rememberUsername) {
            localStorage.setItem(REMEMBER_USERNAME_KEY, 'true');
            localStorage.setItem(SAVED_USERNAME_KEY, username);
          } else {
            localStorage.removeItem(REMEMBER_USERNAME_KEY);
            localStorage.removeItem(SAVED_USERNAME_KEY);
          }
          completeAuthentication('登录成功！');
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
        if (!mounted.current) return;
        if (result.success) {
          completeAuthentication('注册成功！');
        } else {
          setError(result.error || '注册失败');
        }
      }
    } catch (error) {
      if (!mounted.current) return;
      console.error('[Login] 错误:', error);
      setError('操作失败，请稍后重试');
    } finally {
      if (mounted.current && redirectTimer.current === null) {
        submitting.current = false;
        setLoading(false);
      }
    }
  };
  
  return (
    <div className="app-page auth-layout">
      <main className="auth-panel">
          <section aria-labelledby="auth-title">
            <div className="auth-heading">
              <h1 id="auth-title">{isLogin ? '登录 BBTalk' : '注册 BBTalk'}</h1>
              <p>{isLogin ? '继续记录你的想法。' : '创建账户，开始你的第一条记录。'}</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5" aria-describedby={error ? 'auth-error' : undefined}>
              <Input id="username" name="username" label="用户名" value={username}
                onChange={e => setUsername(e.target.value)} placeholder="请输入用户名"
                autoComplete="username" autoCapitalize="none" spellCheck={false} disabled={loading} />
              <Input id="password" name="password" label="密码" type={showPassword ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码"
                autoComplete={isLogin ? 'current-password' : 'new-password'} disabled={loading}
                suffix={<button type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} aria-pressed={showPassword}
                  onClick={() => setShowPassword(value => !value)} disabled={loading}
                  className="flex min-h-11 min-w-12 items-center justify-center rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                  {showPassword ? '隐藏' : '显示'}
                </button>} />
              {isLogin && <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5 text-sm text-gray-600">
                <input type="checkbox" checked={rememberUsername} onChange={e => setRememberUsername(e.target.checked)}
                  disabled={loading} className="h-4 w-4 rounded border-gray-300 accent-blue-600" />
                记住用户名
              </label>}
              {!isLogin && <>
                <Input id="email" name="email" label="邮箱（可选）" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="请输入邮箱" autoComplete="email" disabled={loading} />
                <Input id="displayName" name="displayName" label="显示名称（可选）" value={displayName}
                  onChange={e => setDisplayName(e.target.value)} placeholder="请输入显示名称" autoComplete="nickname" disabled={loading} />
              </>}
              {error && <p id="auth-error" role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</p>}
              {success && <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm leading-6 text-green-800">{success}</p>}
              <Button type="submit" size="large" loading={loading} className="w-full">
                {loading ? '处理中...' : isLogin ? '登录' : '注册'}
              </Button>
            </form>
            <div className="mt-6 border-t border-gray-100 pt-4">
              {(registrationEnabled === true || !isLogin) && <div className="flex flex-wrap items-center justify-center gap-x-1 text-sm">
                <span className="text-gray-500">{isLogin ? '还没有账户？' : '已有账户？'}</span>
                <Button type="button" variant="ghost" disabled={loading} onClick={() => {
                  setIsLogin(!isLogin);
                  setShowPassword(false);
                  setError(null);
                  setSuccess(null);
                }} className="px-2 text-blue-700 hover:text-blue-800">
                  {isLogin ? '创建新账户' : '登录已有账户'}
                </Button>
              </div>}
              {registrationEnabled === false && <p className="py-2 text-sm leading-6 text-gray-500">当前服务未开放注册，请联系管理员</p>}
              {policyError && <div role="status" className="text-sm leading-6 text-gray-600">
                <p>无法读取注册设置，已有账户可继续登录。</p>
                <Button type="button" variant="ghost" className="mt-1 px-0 text-blue-700" onClick={() => {
                  setPolicyError(false);
                  setPolicyAttempt(value => value + 1);
                }}>重试读取注册设置</Button>
              </div>}
              {registrationEnabled === null && !policyError && <p role="status" className="py-2 text-sm text-gray-500">正在读取注册设置…</p>}
            </div>
          </section>
      </main>
    </div>
  );
}
