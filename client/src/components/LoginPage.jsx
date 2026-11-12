import { useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles, User } from 'lucide-react';
import { api } from '../lib/api.js';
import { Logo, LogoMark, Spinner } from './ui.jsx';

const FEATURES = [
  '列表、看板、日历、甘特图四种视图',
  '任务、子任务、检查项与进展协作',
  '本地 SQLite 存储，数据留在你的电脑',
];

export default function LoginPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('demo@clickup.local');
  const [password, setPassword] = useState('demo1234');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event?.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await api.post('/auth/login', { email, password });
      } else {
        await api.post('/auth/register', { name, email, password });
      }
      await onAuthenticated();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function useDemo() {
    setMode('login');
    setEmail('demo@clickup.local');
    setPassword('demo1234');
    setError('');
    setTimeout(() => {
      const form = document.getElementById('login-form');
      form?.requestSubmit();
    }, 40);
  }

  return (
    <div className="login-page">
      <div className="login-visual">
        <div className="login-visual-glow login-visual-glow-a" />
        <div className="login-visual-glow login-visual-glow-b" />
        <div className="login-visual-top">
          <Logo />
          <span className="local-pill">
            <ShieldCheck size={14} /> 单机部署
          </span>
        </div>
        <div className="login-hero">
          <span className="eyebrow">
            <Sparkles size={14} /> 团队工作操作系统
          </span>
          <h1>
            把复杂的工作
            <br />
            变得<span>简单清晰</span>
          </h1>
          <p>规划、执行、协作和复盘，一个地方全部完成。数据保存在你自己的电脑上，无需云端账号。</p>
          <ul className="login-features">
            {FEATURES.map((feature) => (
              <li key={feature}>
                <span>
                  <Check size={13} />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="login-mock">
          <div className="mock-window">
            <div className="mock-sidebar">
              <div className="mock-ws">
                <span>星</span> 星野科技
              </div>
              <div className="mock-nav is-active">
                <span className="mock-dot" /> 产品研发
              </div>
              <div className="mock-nav mock-indent">
                <span className="mock-dot mock-dot-blue" /> 迭代计划
              </div>
              <div className="mock-nav mock-indent">
                <span className="mock-dot mock-dot-red" /> 缺陷跟踪
              </div>
              <div className="mock-nav">
                <span className="mock-dot mock-dot-orange" /> 市场增长
              </div>
              <div className="mock-sep" />
              <div className="mock-nav mock-muted">设计走查</div>
              <div className="mock-nav mock-muted">内容日历</div>
            </div>
            <div className="mock-main">
              <div className="mock-breadcrumb">产品研发 / 移动端 App</div>
              <div className="mock-title">
                <span>🏃</span> 迭代计划
                <div className="mock-avatars">
                  <span className="mock-avatar" style={{ background: '#26C6DA' }}>陈</span>
                  <span className="mock-avatar" style={{ background: '#FF8A65' }}>苏</span>
                  <span className="mock-avatar" style={{ background: '#7B68EE' }}>林</span>
                </div>
              </div>
              <div className="mock-tabs">
                <span className="is-active">列表</span>
                <span>看板</span>
                <span>日历</span>
                <span>甘特</span>
              </div>
              <div className="mock-group">
                <div className="mock-group-head">
                  <span className="mock-status" /> 进行中 <em>3</em>
                </div>
                {[
                  ['完成 v2.4 版本发布检查清单', '11月13日', '#f59e0b'],
                  ['优化工作台首屏加载性能', '11月16日', '#4a9eff'],
                  ['用户反馈问题批量修复', '今天', '#e5484d'],
                ].map(([title, date, color]) => (
                  <div className="mock-task" key={title}>
                    <span className="mock-check" />
                    <span className="mock-task-name">{title}</span>
                    <span className="mock-tag" style={{ color }}>{color === '#e5484d' ? '紧急' : '进行中'}</span>
                    <span className="mock-date">{date}</span>
                  </div>
                ))}
              </div>
              <div className="mock-group">
                <div className="mock-group-head">
                  <span className="mock-status mock-status-done" /> 已完成 <em>2</em>
                </div>
                <div className="mock-task is-done">
                  <span className="mock-check is-checked">
                    <Check size={9} />
                  </span>
                  <span className="mock-task-name">S23 迭代回顾会议纪要</span>
                  <span className="mock-date">11月10日</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mock-float mock-float-a">
            <span className="mock-float-icon">
              <Check size={13} />
            </span>
            <div>
              <strong>发布检查已完成 75%</strong>
              <span>4 个检查项 · 刚刚更新</span>
            </div>
          </div>
          <div className="mock-float mock-float-b">
            <span className="mock-avatar" style={{ background: '#FF8A65' }}>苏</span>
            <div>
              <strong>苏晴</strong>
              <span>记录了「客户案例」的进展</span>
            </div>
          </div>
        </div>

        <div className="login-visual-foot">
          <span>本地优先</span>
          <span>·</span>
          <span>无需联网</span>
          <span>·</span>
          <span>数据可备份</span>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-mobile-brand">
          <LogoMark size={34} />
          <span>ClickUp 本地版</span>
        </div>
        <div className="login-box">
          <div className="login-heading">
            <h2>{mode === 'login' ? '欢迎回来' : '创建你的账号'}</h2>
            <p>{mode === 'login' ? '登录到你的本地工作空间，继续推进工作。' : '几秒钟即可拥有一个完全属于你的工作空间。'}</p>
          </div>

          <form id="login-form" className="login-form" onSubmit={submit}>
            {mode === 'register' && (
              <label className="field">
                <span className="field-label">姓名</span>
                <div className="input-with-icon">
                  <User size={16} />
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="你的名字"
                    autoComplete="name"
                    required
                  />
                </div>
              </label>
            )}
            <label className="field">
              <span className="field-label">邮箱</span>
              <div className="input-with-icon">
                <Mail size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </label>
            <label className="field">
              <span className="field-label">密码</span>
              <div className="input-with-icon">
                <Lock size={16} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 6 位"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={6}
                  required
                />
                <button type="button" className="input-action" onClick={() => setShowPassword((value) => !value)} aria-label="显示密码">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && <div className="form-error">{error}</div>}

            <button type="submit" className="btn btn-primary btn-lg login-submit" disabled={busy}>
              {busy ? <Spinner size={17} /> : null}
              {mode === 'login' ? '登录' : '创建账号'}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>

          {mode === 'login' && (
            <>
              <div className="login-divider">
                <span>或</span>
              </div>
              <button type="button" className="btn btn-demo btn-lg" onClick={useDemo} disabled={busy}>
                <span className="demo-dot" />
                使用演示工作空间
                <span className="demo-hint">星野科技 · 4 位成员</span>
              </button>
              <p className="login-demo-help">
                演示账号 <code>demo@clickup.local</code> · 密码 <code>demo1234</code>
              </p>
            </>
          )}

          <p className="login-switch">
            {mode === 'login' ? '还没有账号？' : '已经有账号？'}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
            >
              {mode === 'login' ? '立即注册' : '返回登录'}
            </button>
          </p>

          <div className="login-local-note">
            <ShieldCheck size={14} />
            所有数据保存在本机 <code>data/clickup.db</code>，不会上传到任何服务器
          </div>
        </div>
      </div>
    </div>
  );
}
