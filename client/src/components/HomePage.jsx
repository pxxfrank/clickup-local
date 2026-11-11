import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Flame,
  ListChecks,
  Plus,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { format, formatDateSmart, greeting, parseDateValue, relativeTime, zhCN } from '../lib/date.js';
import { Avatar, DueBadge, EmptyState, PriorityFlag, ProgressBar, Spinner } from './ui.jsx';

const STAT_CARDS = [
  { key: 'open', label: '待办任务', icon: CircleDashed, tone: 'violet', hint: '所有未完成的工作' },
  { key: 'dueToday', label: '今日到期', icon: CalendarClock, tone: 'orange', hint: '需要今天处理' },
  { key: 'completedThisWeek', label: '本周完成', icon: CheckCircle2, tone: 'green', hint: '保持这个节奏' },
  { key: 'overdue', label: '逾期任务', icon: Flame, tone: 'red', hint: '建议优先清理' },
];

export default function HomePage() {
  const { bootstrap, dataVersion, openTask, openCreateTask, navigate, toast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/home', { workspaceId: bootstrap?.workspace?.id })
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

  const maxSeries = Math.max(1, ...(data?.completed_series?.map((item) => item.count) || [1]));
  const weekTotal = data?.completed_series?.reduce((sum, item) => sum + item.count, 0) || 0;
  const maxWorkload = Math.max(1, ...(data?.workload?.map((item) => item.count) || [1]));

  const dateLabel = useMemo(
    () => format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhCN }),
    []
  );

  if (loading && !data) {
    return (
      <div className="home-loading">
        <Spinner size={22} />
        <span>正在整理你的工作台…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="home-page">
        <EmptyState title="还没有数据" description="创建一个任务，开始你的工作空间。" />
      </div>
    );
  }

  const focusText =
    data.stats.overdue > 0
      ? `有 ${data.stats.overdue} 个任务已经逾期，建议先清理。`
      : data.stats.dueToday > 0
        ? `今天有 ${data.stats.dueToday} 个任务到期，保持专注。`
        : '今天没有紧急到期任务，适合推进长期项目。';

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-bg home-hero-bg-a" />
        <div className="home-hero-bg home-hero-bg-b" />
        <div className="home-hero-main">
          <span className="home-date"><Clock3 size={13} /> {dateLabel}</span>
          <h1>{greeting()}，{bootstrap?.user?.name} <span className="hero-wave">👋</span></h1>
          <p>{focusText}</p>
          <div className="home-hero-actions">
            <button type="button" className="btn btn-white" onClick={() => openCreateTask()}>
              <Plus size={16} /> 新建任务
            </button>
            <button type="button" className="btn btn-hero-ghost" onClick={() => navigate('/inbox')}>
              查看动态 <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <div className="home-hero-focus">
          <div className="hero-focus-head">
            <span>任务完成率</span>
            <Sparkles size={15} />
          </div>
          <div className="hero-ring" style={{ background: `conic-gradient(#ffffff ${data.stats.completionRate * 3.6}deg, rgba(255,255,255,.18) 0deg)` }}>
            <div className="hero-ring-inner">
              <strong>{data.stats.completionRate}%</strong>
              <span>完成度</span>
            </div>
          </div>
          <div className="hero-focus-foot">
            <span>{weekTotal} 个任务本周完成</span>
            <span className="hero-focus-dot" />
            <span>共 {data.stats.total} 个任务</span>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon;
          const value = data.stats[card.key];
          return (
            <div key={card.key} className={`stat-card tone-${card.tone}`}>
              <div className="stat-card-top">
                <span className="stat-icon"><Icon size={18} /></span>
                <span className="stat-label">{card.label}</span>
                {card.key === 'overdue' && value > 0 && <span className="stat-alert">!</span>}
              </div>
              <div className="stat-value">{value}</div>
              <div className="stat-hint">{card.hint}</div>
            </div>
          );
        })}
      </section>

      <div className="home-grid">
        <section className="panel my-tasks-panel">
          <div className="panel-head">
            <div>
              <h2>我的任务</h2>
              <p>指派给你且尚未完成的任务</p>
            </div>
            <button type="button" className="panel-link" onClick={() => navigate('/inbox')}>
              查看全部 <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="my-task-list">
            {data.my_tasks.map((task) => (
              <button type="button" key={task.id} className="my-task-row" onClick={() => openTask(task.id)}>
                <span className="my-task-check" />
                <div className="my-task-main">
                  <span className="my-task-name">{task.name}</span>
                  <span className="my-task-list-name">
                    <span className="list-color-dot" style={{ background: task.list_color }} />
                    {task.list_name}
                  </span>
                </div>
                <PriorityFlag priority={task.priority} />
                <DueBadge date={task.due_date} statusType={task.status_type} />
              </button>
            ))}
            {!data.my_tasks.length && (
              <EmptyState
                compact
                icon={<CheckCircle2 size={22} />}
                title="今天的任务都清空了"
                description="给自己安排一个新的目标，或者享受片刻轻松。"
                action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => openCreateTask()}>新建任务</button>}
              />
            )}
          </div>
        </section>

        <section className="panel weekly-panel">
          <div className="panel-head">
            <div>
              <h2>本周节奏</h2>
              <p>最近 7 天完成的任务</p>
            </div>
            <span className="week-total"><TrendingUp size={14} /> {weekTotal}</span>
          </div>
          <div className="week-chart">
            {data.completed_series.map((item, index) => {
              const height = Math.max(4, Math.round((item.count / maxSeries) * 100));
              const isToday = index === data.completed_series.length - 1;
              const date = parseDateValue(item.date);
              return (
                <div className="week-bar-col" key={item.date}>
                  <span className="week-bar-value">{item.count || ''}</span>
                  <div className="week-bar-track">
                    <div className={`week-bar ${isToday ? 'is-today' : ''}`} style={{ height: `${height}%` }} />
                  </div>
                  <span className={`week-bar-label ${isToday ? 'is-today' : ''}`}>
                    {isToday ? '今天' : date ? format(date, 'EEEEEE', { locale: zhCN }) : ''}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="weekly-summary">
            <span><span className="dot green" /> 已完成 {data.stats.completed}</span>
            <span><span className="dot violet" /> 进行中 {data.stats.open}</span>
            <span><span className="dot red" /> 逾期 {data.stats.overdue}</span>
          </div>
        </section>

        <section className="panel workload-panel">
          <div className="panel-head">
            <div>
              <h2>工作负载</h2>
              <p>按列表查看未完成任务分布</p>
            </div>
            <span className="panel-badge">{data.stats.open} 待办</span>
          </div>
          <div className="workload-list">
            {data.workload.map((item) => (
              <button type="button" key={item.id} className="workload-row" onClick={() => navigate(`/list/${item.id}`)}>
                <span className="workload-name"><span className="list-color-dot" style={{ background: item.color }} />{item.name}</span>
                <div className="workload-track"><span style={{ width: `${(item.count / maxWorkload) * 100}%`, background: item.color }} /></div>
                <span className="workload-count">{item.count}</span>
              </button>
            ))}
            {!data.workload.length && <p className="panel-empty">还没有待办任务。</p>}
          </div>
        </section>

        <section className="panel activity-panel">
          <div className="panel-head">
            <div>
              <h2>团队动态</h2>
              <p>工作空间中最近发生的事情</p>
            </div>
            <button type="button" className="panel-link" onClick={() => navigate('/inbox')}>
              全部 <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="home-activity">
            {data.activity.slice(0, 7).map((item) => (
              <button
                type="button"
                key={item.id}
                className="home-activity-row"
                onClick={() => item.task_id && openTask(item.task_id)}
              >
                <Avatar user={{ name: item.user_name, color: item.user_color }} size={24} />
                <div>
                  <p><strong>{item.user_name}</strong> {item.message}</p>
                  <span>{relativeTime(item.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
