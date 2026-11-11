import { useEffect, useMemo, useState } from 'react';
import {
  AtSign,
  Bell,
  CheckCheck,
  FileText,
  Flag,
  LayoutTemplate,
  Lightbulb,
  ListPlus,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { format, isSameDay, parseDateValue, relativeTime } from '../lib/date.js';
import { Avatar, EmptyState, Spinner } from './ui.jsx';

const TYPE_META = {
  task_created: { icon: Plus, color: '#7B68EE', label: '任务' },
  task_updated: { icon: RefreshCw, color: '#4A9EFF', label: '更新' },
  task_deleted: { icon: Trash2, color: '#E5484D', label: '删除' },
  comment: { icon: MessageSquare, color: '#F59E0B', label: '评论' },
  attachment: { icon: Paperclip, color: '#26C6DA', label: '附件' },
  member_joined: { icon: UserPlus, color: '#2EA44F', label: '成员' },
  workspace_created: { icon: Sparkles, color: '#A25DDC', label: '空间' },
  workspace_joined: { icon: UserPlus, color: '#2EA44F', label: '成员' },
  list_created: { icon: ListPlus, color: '#26A69A', label: '列表' },
  list_deleted: { icon: Trash2, color: '#E5484D', label: '列表' },
  space_created: { icon: Sparkles, color: '#A25DDC', label: '空间' },
  space_deleted: { icon: Trash2, color: '#E5484D', label: '空间' },
  doc_created: { icon: FileText, color: '#4A9EFF', label: '文档' },
  contact_added: { icon: UserPlus, color: '#F59E0B', label: '外部责任人' },
  template_created: { icon: LayoutTemplate, color: '#7B68EE', label: '模板' },
  brainstorm_committed: { icon: Lightbulb, color: '#F2A93B', label: '头脑风暴' },
  milestone_created: { icon: Flag, color: '#2EA44F', label: '里程碑' },
};

const FILTERS = [
  { value: 'all', label: '全部动态' },
  { value: 'task', label: '任务' },
  { value: 'comment', label: '评论' },
  { value: 'member', label: '成员与空间' },
];

export default function InboxPage() {
  const { bootstrap, dataVersion, openTask, toast, navigate, openSettings, refresh } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [markingRead, setMarkingRead] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/inbox', { workspaceId: bootstrap?.workspace?.id })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error) => {
        if (!cancelled) toast(error.message, 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrap?.workspace?.id, dataVersion, toast]);

  const filtered = useMemo(() => {
    const items = data?.activity || [];
    if (filter === 'all') return items;
    if (filter === 'task') return items.filter((item) => item.type.startsWith('task_'));
    if (filter === 'comment') return items.filter((item) => item.type === 'comment');
    return items.filter((item) => ['member_joined', 'workspace_created', 'workspace_joined', 'list_created', 'list_deleted', 'space_created', 'space_deleted'].includes(item.type));
  }, [data, filter]);

  const grouped = useMemo(() => {
    const groups = [];
    for (const item of filtered) {
      const date = parseDateValue(item.created_at) || new Date(item.created_at);
      const key = isSameDay(date, new Date())
        ? '今天'
        : isSameDay(date, new Date(Date.now() - 86400000))
          ? '昨天'
          : format(date, 'M月d日');
      const last = groups[groups.length - 1];
      if (last && last.label === key) last.items.push(item);
      else groups.push({ label: key, items: [item] });
    }
    return groups;
  }, [filtered]);

  async function markAllRead() {
    setMarkingRead(true);
    try {
      await api.post('/inbox/read', { workspace_id: bootstrap?.workspace?.id });
      setData((current) =>
        current
          ? {
              ...current,
              unread_count: 0,
              activity: current.activity.map((item) => ({ ...item, unread: false })),
            }
          : current
      );
      await refresh();
      toast('已将全部动态标记为已读');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setMarkingRead(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="home-loading">
        <Spinner size={22} />
        <span>正在加载动态…</span>
      </div>
    );
  }

  return (
    <div className="inbox-page">
      <div className="page-head-simple">
        <div>
          <span className="eyebrow-plain"><Bell size={14} /> 收件箱</span>
          <h1>工作空间动态</h1>
          <p>任务、评论和团队变更都会汇总在这里。</p>
        </div>
        <div className="inbox-head-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={markAllRead}
            disabled={markingRead || !(data?.unread_count > 0)}
          >
            {markingRead ? <Spinner size={14} /> : <CheckCheck size={15} />} 全部标为已读
          </button>
        </div>
      </div>

      <div className="inbox-tabs">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`inbox-tab ${filter === item.value ? 'is-active' : ''}`}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
            <span>{item.value === 'all' ? (data?.activity?.length || 0) : ''}</span>
          </button>
        ))}
      </div>

      <div className="inbox-layout">
        <div className="inbox-feed">
          {grouped.map((group) => (
            <div className="inbox-group" key={group.label}>
              <div className="inbox-group-label">{group.label}</div>
              {group.items.map((item) => {
                const meta = TYPE_META[item.type] || { icon: Bell, color: '#87909e', label: '动态' };
                const Icon = meta.icon;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`inbox-item ${item.unread ? 'is-unread' : ''}`}
                    onClick={() => {
                      if (item.task_id) openTask(item.task_id);
                    }}
                  >
                    <span className="inbox-type-icon" style={{ background: `${meta.color}18`, color: meta.color }}>
                      <Icon size={15} />
                    </span>
                    <Avatar user={{ name: item.user_name, color: item.user_color }} size={28} />
                    <div className="inbox-item-main">
                      <p>
                        <strong>{item.user_name}</strong>
                        <span> {item.message}</span>
                      </p>
                      <span className="inbox-item-meta">
                        {item.task_name && <span className="inbox-task-name">{item.task_name}</span>}
                        {item.list_name && <span> · {item.list_name}</span>}
                        <span> · {relativeTime(item.created_at)}</span>
                      </span>
                    </div>
                    {item.unread && <span className="inbox-unread-dot" />}
                  </button>
                );
              })}
            </div>
          ))}
          {!filtered.length && (
            <EmptyState
              icon={<AtSign size={24} />}
              title="这里很安静"
              description="当团队创建任务、发表评论或加入空间时，动态会出现在这里。"
              action={<button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/home')}>返回主页</button>}
            />
          )}
        </div>

        <aside className="inbox-side">
          <div className="inbox-side-card">
            <h3>我的工作空间</h3>
            <div className="inbox-workspace">
              <span className="ws-avatar" style={{ background: bootstrap?.workspace?.color }}>{bootstrap?.workspace?.name?.slice(0, 1)}</span>
              <div>
                <strong>{bootstrap?.workspace?.name}</strong>
                <span>{bootstrap?.members?.length} 位成员 · 本地</span>
              </div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm inbox-invite" onClick={() => openSettings('members')}>
              <UserPlus size={14} /> 邀请更多成员
            </button>
          </div>
          <div className="inbox-side-card inbox-tip">
            <Sparkles size={16} />
            <div>
              <strong>保持工作流整洁</strong>
              <p>每周花 10 分钟清理已完成任务和过期提醒，让收件箱只保留真正需要关注的事。</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
