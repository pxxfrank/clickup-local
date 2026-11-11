import { useState } from 'react';
import { ArrowRight, HardDrive, LogOut, Plus, Sparkles } from 'lucide-react';
import { Logo, Spinner } from './ui.jsx';

export default function WorkspaceOnboarding({ user, onCreate, onLogout }) {
  const [name, setName] = useState(`${user?.name || '我'}的工作空间`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onCreate(name.trim());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-glow onboarding-glow-a" />
      <div className="onboarding-glow onboarding-glow-b" />
      <div className="onboarding-top">
        <Logo />
        <button type="button" className="onboarding-logout" onClick={onLogout}>
          <LogOut size={14} /> 退出登录
        </button>
      </div>

      <div className="onboarding-card">
        <div className="onboarding-symbol">
          <Sparkles size={21} />
        </div>
        <span className="onboarding-eyebrow">新的开始</span>
        <h1>创建你的工作空间</h1>
        <p className="onboarding-desc">
          当前账号还没有加入任何工作空间。项目、任务和文档都归属于工作空间，先创建一个，开始组织你的工作。
        </p>

        <form className="onboarding-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">工作空间名称</span>
            <input
              className="input"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：我的团队"
              maxLength={60}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-lg onboarding-submit" disabled={busy || !name.trim()}>
            {busy ? <Spinner size={17} /> : <Plus size={17} />}
            创建工作空间
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>

        <div className="onboarding-note">
          <HardDrive size={15} />
          <span>工作空间数据保存在本机 SQLite 数据库中，不会上传到外部服务器。</span>
        </div>
      </div>

      <div className="onboarding-foot">
        <span>ClickUp 本地版</span>
        <span>·</span>
        <span>数据始终属于你</span>
      </div>
    </div>
  );
}
