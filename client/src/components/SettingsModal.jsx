import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Download,
  HardDrive,
  Lock,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  Tag as TagIcon,
  Trash2,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { formatBytes, relativeTime } from '../lib/date.js';
import {
  Avatar,
  ConfirmDialog,
  Modal,
  Spinner,
} from './ui.jsx';

const AVATAR_COLORS = ['#7B68EE', '#4A9EFF', '#26C6DA', '#2EA44F', '#F59E0B', '#FF8A65', '#E5484D', '#A25DDC'];
const TAG_COLORS = ['#61bd8f', '#5b8def', '#f78fb3', '#e5484d', '#f2a93b', '#9b7ede', '#8898aa', '#26c6da'];
const ROLE_LABELS = { owner: '所有者', admin: '管理员', member: '成员' };

export default function SettingsModal({ open, initialTab = 'profile', onClose }) {
  const { bootstrap, user, refresh, toast, logout, navigate } = useApp();
  const [tab, setTab] = useState(initialTab);
  const [profile, setProfile] = useState({ name: '', title: '', color: '#7B68EE', current_password: '', new_password: '', confirm_password: '' });
  const [workspaceForm, setWorkspaceForm] = useState({ name: '', color: '#7B68EE' });
  const [invite, setInvite] = useState({ email: '', name: '', role: 'member' });
  const [inviteResult, setInviteResult] = useState(null);
  const [tagDraft, setTagDraft] = useState({ name: '', color: '#61bd8f' });
  const [system, setSystem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [removeMember, setRemoveMember] = useState(null);
  const [deleteWorkspaceOpen, setDeleteWorkspaceOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setProfile({
      name: user?.name || '',
      title: user?.title || '',
      color: user?.color || '#7B68EE',
      current_password: '',
      new_password: '',
      confirm_password: '',
    });
    setWorkspaceForm({
      name: bootstrap?.workspace?.name || '',
      color: bootstrap?.workspace?.color || '#7B68EE',
    });
    setInviteResult(null);
    setInvite({ email: '', name: '', role: 'member' });
    setDeleteWorkspaceOpen(false);
    setDeleteConfirmName('');
    api.get('/system').then(setSystem).catch(() => setSystem(null));
    // Intentionally only reinitialize when the dialog opens or the requested tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);

  const isOwner = bootstrap?.role === 'owner';
  const isAdmin = isOwner || bootstrap?.role === 'admin';

  async function saveProfile(event) {
    event.preventDefault();
    if (profile.new_password && profile.new_password !== profile.confirm_password) {
      toast('两次输入的新密码不一致', 'error');
      return;
    }
    setBusy(true);
    try {
      const payload = { name: profile.name, title: profile.title, color: profile.color };
      if (profile.new_password) {
        payload.current_password = profile.current_password;
        payload.new_password = profile.new_password;
      }
      await api.patch('/me', payload);
      await refresh();
      setProfile((current) => ({ ...current, current_password: '', new_password: '', confirm_password: '' }));
      toast('个人资料已保存');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveWorkspace(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/workspaces/${bootstrap.workspace.id}`, workspaceForm);
      await refresh();
      toast('工作空间已更新');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorkspace() {
    if (!bootstrap?.workspace || deleteConfirmName !== bootstrap.workspace.name) return;
    setDeletingWorkspace(true);
    try {
      await api.delete(`/workspaces/${bootstrap.workspace.id}`, { confirm_name: deleteConfirmName });
      setDeleteWorkspaceOpen(false);
      onClose();
      navigate('/home');
      await refresh();
      toast('工作空间已删除');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setDeletingWorkspace(false);
    }
  }

  async function sendInvite(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.post(`/workspaces/${bootstrap.workspace.id}/members`, invite);
      setInviteResult(result);
      setInvite({ email: '', name: '', role: 'member' });
      await refresh();
      toast(result.temp_password ? '成员已创建，请复制临时密码' : '成员已加入工作空间');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member, role) {
    try {
      await api.patch(`/workspaces/${bootstrap.workspace.id}/members/${member.id}`, { role });
      await refresh();
      toast('成员角色已更新');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function removeMemberNow() {
    if (!removeMember) return;
    setBusy(true);
    try {
      await api.delete(`/workspaces/${bootstrap.workspace.id}/members/${removeMember.id}`);
      setRemoveMember(null);
      await refresh();
      toast('成员已移出工作空间');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function createTag(event) {
    event.preventDefault();
    if (!tagDraft.name.trim()) return;
    setBusy(true);
    try {
      await api.post('/tags', {
        workspace_id: bootstrap.workspace.id,
        name: tagDraft.name.trim(),
        color: tagDraft.color,
      });
      setTagDraft({ name: '', color: '#61bd8f' });
      await refresh();
      toast('标签已创建');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteTag(tag) {
    try {
      await api.delete(`/tags/${tag.id}`);
      await refresh();
      toast('标签已删除');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function copyPassword() {
    if (!inviteResult?.temp_password) return;
    try {
      await navigator.clipboard.writeText(inviteResult.temp_password);
      toast('临时密码已复制');
    } catch {
      toast('复制失败', 'error');
    }
  }

  const tabs = [
    { id: 'profile', label: '个人资料', icon: User },
    { id: 'workspace', label: '工作空间', icon: SettingsIcon },
    { id: 'members', label: '成员', icon: Users, count: bootstrap?.members?.length },
    { id: 'tags', label: '标签', icon: TagIcon, count: bootstrap?.tags?.length },
  ];

  return (
    <>
      <Modal open={open} onClose={onClose} title="设置" subtitle={bootstrap?.workspace?.name} width={820} className="settings-modal">
        <div className="settings-shell">
          <nav className="settings-nav">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`settings-nav-item ${tab === item.id ? 'is-active' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  <Icon size={16} />
                  {item.label}
                  {item.count !== undefined && <span>{item.count}</span>}
                </button>
              );
            })}
            <div className="settings-nav-spacer" />
            <div className="settings-local-note">
              <ShieldCheck size={14} />
              <span>本地优先</span>
              <p>数据只保存在这台电脑上</p>
            </div>
          </nav>

          <div className="settings-content">
            {tab === 'profile' && (
              <form className="settings-form" onSubmit={saveProfile}>
                <div className="settings-content-head">
                  <h3>个人资料</h3>
                  <p>这些信息会显示在任务、评论和成员列表中。</p>
                </div>
                <div className="profile-avatar-row">
                  <Avatar user={{ ...user, ...profile }} size={64} />
                  <div>
                    <strong>{profile.name || '你的名字'}</strong>
                    <span>{user?.email}</span>
                    <div className="avatar-colors">
                      {AVATAR_COLORS.map((color) => (
                        <button
                          type="button"
                          key={color}
                          className={`avatar-color ${profile.color === color ? 'is-active' : ''}`}
                          style={{ background: color }}
                          onClick={() => setProfile({ ...profile, color })}
                          aria-label={`头像颜色 ${color}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="form-grid-2">
                  <label className="field">
                    <span className="field-label">姓名</span>
                    <input className="input" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field-label">职位</span>
                    <input className="input" value={profile.title} onChange={(event) => setProfile({ ...profile, title: event.target.value })} placeholder="例如：产品负责人" />
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">邮箱</span>
                  <input className="input" value={user?.email || ''} readOnly />
                </label>

                <div className="settings-divider" />
                <div className="settings-subhead">
                  <Lock size={15} />
                  <div>
                    <strong>修改密码</strong>
                    <span>如果不修改密码，请留空下方字段。</span>
                  </div>
                </div>
                <div className="form-grid-3">
                  <label className="field">
                    <span className="field-label">当前密码</span>
                    <input className="input" type="password" value={profile.current_password} onChange={(event) => setProfile({ ...profile, current_password: event.target.value })} autoComplete="current-password" />
                  </label>
                  <label className="field">
                    <span className="field-label">新密码</span>
                    <input className="input" type="password" value={profile.new_password} onChange={(event) => setProfile({ ...profile, new_password: event.target.value })} autoComplete="new-password" />
                  </label>
                  <label className="field">
                    <span className="field-label">确认新密码</span>
                    <input className="input" type="password" value={profile.confirm_password} onChange={(event) => setProfile({ ...profile, confirm_password: event.target.value })} autoComplete="new-password" />
                  </label>
                </div>
                <div className="settings-actions">
                  <button type="button" className="btn btn-ghost btn-danger-text" onClick={logout}>退出登录</button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? <Spinner size={15} /> : null} 保存资料
                  </button>
                </div>
              </form>
            )}

            {tab === 'workspace' && (
              <div className="settings-form">
                <div className="settings-content-head">
                  <h3>工作空间</h3>
                  <p>管理工作空间名称与外观。当前角色：{ROLE_LABELS[bootstrap?.role] || '成员'}</p>
                </div>
                <form onSubmit={saveWorkspace}>
                  <div className="workspace-preview">
                    <span className="ws-avatar ws-avatar-lg" style={{ background: workspaceForm.color }}>{workspaceForm.name.slice(0, 1)}</span>
                    <div>
                      <strong>{workspaceForm.name || '工作空间名称'}</strong>
                      <span>{bootstrap?.members?.length} 位成员 · {bootstrap?.spaces?.length} 个空间</span>
                    </div>
                  </div>
                  <label className="field">
                    <span className="field-label">工作空间名称</span>
                    <input className="input" value={workspaceForm.name} onChange={(event) => setWorkspaceForm({ ...workspaceForm, name: event.target.value })} disabled={!isAdmin} />
                  </label>
                  <div className="field">
                    <span className="field-label">工作空间颜色</span>
                    <div className="color-picker">
                      {AVATAR_COLORS.map((color) => (
                        <button
                          type="button"
                          key={color}
                          className={`color-option ${workspaceForm.color === color ? 'is-active' : ''}`}
                          style={{ background: color }}
                          onClick={() => setWorkspaceForm({ ...workspaceForm, color })}
                          disabled={!isAdmin}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="settings-actions">
                    <button type="submit" className="btn btn-primary" disabled={busy || !isAdmin}>
                      {busy ? <Spinner size={15} /> : null} 保存工作空间
                    </button>
                  </div>
                </form>

                {isOwner && (
                  <div className="danger-zone">
                    <div className="danger-zone-head">
                      <span className="danger-zone-icon"><AlertTriangle size={17} /></span>
                      <div>
                        <strong>删除工作空间</strong>
                        <span>永久删除此工作空间及其中所有内容。此操作无法撤销。</span>
                      </div>
                    </div>
                    <p>
                      删除后，所有空间、列表、任务、子任务、评论、文档和附件都会从本机删除。
                      你仍然可以创建一个新的工作空间。
                    </p>
                    <button
                      type="button"
                      className="btn btn-danger-outline"
                      onClick={() => {
                        setDeleteConfirmName('');
                        setDeleteWorkspaceOpen(true);
                      }}
                    >
                      <Trash2 size={14} /> 删除工作空间
                    </button>
                  </div>
                )}

                <div className="settings-divider" />
                <div className="settings-content-head">
                  <h3>数据与备份</h3>
                  <p>所有内容存储在本机的 SQLite 数据库中，可随时下载备份。</p>
                </div>
                <div className="system-cards">
                  <div className="system-card">
                    <HardDrive size={18} />
                    <div>
                      <span>数据库大小</span>
                      <strong>{system ? formatBytes(system.db_bytes) : '—'}</strong>
                    </div>
                  </div>
                  <div className="system-card">
                    <Database size={18} />
                    <div>
                      <span>任务总数</span>
                      <strong>{system ? system.tasks : '—'}</strong>
                    </div>
                  </div>
                  <div className="system-card">
                    <Users size={18} />
                    <div>
                      <span>工作空间成员</span>
                      <strong>{bootstrap?.members?.length ?? '—'}</strong>
                    </div>
                  </div>
                </div>
                {system && <p className="system-path">数据目录：<code>{system.data_dir}</code></p>}
                <a className="btn btn-ghost" href="/api/backup" download>
                  <Download size={15} /> 下载数据库备份
                </a>
              </div>
            )}

            {tab === 'members' && (
              <div className="settings-form">
                <div className="settings-content-head">
                  <h3>成员</h3>
                  <p>邀请团队成员一起协作。新成员会获得独立账号。</p>
                </div>
                <div className="member-list">
                  {bootstrap?.members?.map((member) => (
                    <div className="member-row" key={member.id}>
                      <Avatar user={member} size={36} />
                      <div className="member-main">
                        <strong>{member.name}{member.id === user?.id ? '（你）' : ''}</strong>
                        <span>{member.email}{member.title ? ` · ${member.title}` : ''}</span>
                      </div>
                      {isOwner && member.role !== 'owner' ? (
                        <select className="member-role-select" value={member.role} onChange={(event) => changeRole(member, event.target.value)}>
                          <option value="admin">管理员</option>
                          <option value="member">成员</option>
                        </select>
                      ) : (
                        <span className={`member-role member-role-${member.role}`}>{ROLE_LABELS[member.role]}</span>
                      )}
                      {isAdmin && member.role !== 'owner' && member.id !== user?.id && (
                        <button type="button" className="icon-btn icon-btn-danger" onClick={() => setRemoveMember(member)} title="移除成员">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {isAdmin && (
                  <>
                    <div className="settings-divider" />
                    <div className="settings-subhead">
                      <UserPlus size={15} />
                      <div>
                        <strong>邀请成员</strong>
                        <span>如果邮箱尚未注册，系统会自动创建账号并生成临时密码。</span>
                      </div>
                    </div>
                    <form className="invite-form" onSubmit={sendInvite}>
                      <div className="form-grid-2">
                        <label className="field">
                          <span className="field-label">邮箱</span>
                          <input className="input" type="email" required value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="teammate@example.com" />
                        </label>
                        <label className="field">
                          <span className="field-label">姓名</span>
                          <input className="input" value={invite.name} onChange={(event) => setInvite({ ...invite, name: event.target.value })} placeholder="成员姓名" />
                        </label>
                      </div>
                      <div className="invite-form-foot">
                        <select className="mini-select" value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}>
                          <option value="member">成员</option>
                          <option value="admin">管理员</option>
                        </select>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                          {busy ? <Spinner size={14} /> : <UserPlus size={14} />} 发送邀请
                        </button>
                      </div>
                    </form>
                    {inviteResult && (
                      <div className="invite-result">
                        <Check size={16} />
                        <div>
                          <strong>{inviteResult.user.name} 已加入工作空间</strong>
                          {inviteResult.temp_password ? (
                            <span>临时密码：<code>{inviteResult.temp_password}</code>
                              <button type="button" onClick={copyPassword}><Copy size={12} /></button>
                            </span>
                          ) : (
                            <span>对方可以使用已有账号登录。</span>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === 'tags' && (
              <div className="settings-form">
                <div className="settings-content-head">
                  <h3>标签</h3>
                  <p>标签是工作空间级别的，可跨列表为任务分类。</p>
                </div>
                <div className="tag-settings-list">
                  {bootstrap?.tags?.map((tag) => (
                    <div className="tag-setting-row" key={tag.id}>
                      <span className="tag-setting-swatch" style={{ background: tag.color }} />
                      <span>{tag.name}</span>
                      <button type="button" className="icon-btn icon-btn-danger" onClick={() => deleteTag(tag)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {!bootstrap?.tags?.length && <p className="settings-empty">还没有标签。</p>}
                </div>
                <form className="tag-create-form" onSubmit={createTag}>
                  <input className="input" value={tagDraft.name} onChange={(event) => setTagDraft({ ...tagDraft, name: event.target.value })} placeholder="标签名称" />
                  <div className="color-picker color-picker-sm">
                    {TAG_COLORS.map((color) => (
                      <button
                        type="button"
                        key={color}
                        className={`color-option color-option-sm ${tagDraft.color === color ? 'is-active' : ''}`}
                        style={{ background: color }}
                        onClick={() => setTagDraft({ ...tagDraft, color })}
                      />
                    ))}
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !tagDraft.name.trim()}>
                    <Plus size={14} /> 添加标签
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteWorkspaceOpen}
        onClose={() => setDeleteWorkspaceOpen(false)}
        title="删除工作空间"
        subtitle="此操作不可撤销"
        width={500}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDeleteWorkspaceOpen(false)} disabled={deletingWorkspace}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={deleteWorkspace}
              disabled={deletingWorkspace || deleteConfirmName !== bootstrap?.workspace?.name}
            >
              {deletingWorkspace ? <Spinner size={15} /> : <Trash2 size={15} />}
              永久删除工作空间
            </button>
          </>
        }
      >
        <div className="delete-workspace-warning">
          <AlertTriangle size={20} />
          <div>
            <strong>你将永久删除「{bootstrap?.workspace?.name}」</strong>
            <p>所有成员将立即失去访问权限。工作空间内的所有数据会从本机删除，且无法恢复。</p>
          </div>
        </div>
        <label className="field delete-confirm-field">
          <span className="field-label">
            请输入工作空间名称 <code>{bootstrap?.workspace?.name}</code> 以确认
          </span>
          <input
            className="input"
            autoFocus
            value={deleteConfirmName}
            onChange={(event) => setDeleteConfirmName(event.target.value)}
            placeholder={bootstrap?.workspace?.name}
            onKeyDown={(event) => {
              if (event.key === 'Enter') deleteWorkspace();
            }}
          />
        </label>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeMember)}
        title="移除成员"
        message={`确定将「${removeMember?.name}」移出工作空间吗？该成员将无法再访问这里的任务和文档。`}
        busy={busy}
        onClose={() => setRemoveMember(null)}
        onConfirm={removeMemberNow}
      />
    </>
  );
}
