import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Flag,
  LayoutTemplate,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { addDays, dueTone, format, formatDateSmart, parseDateValue, todayKey, zhCN } from '../lib/date.js';
import { ConfirmDialog, Modal, ProgressBar, Spinner } from './ui.jsx';

function emptyMilestoneForm(listColor) {
  return {
    id: null,
    name: '',
    due_date: format(addDays(new Date(), 14), 'yyyy-MM-dd'),
    description: '',
    color: listColor || '#7B68EE',
  };
}

export default function ProjectOverview({ list, tasks, milestones, onChanged, onOpenTask, onSaveAsTemplate }) {
  const { toast } = useApp();
  const [editingPurpose, setEditingPurpose] = useState(false);
  const [purposeDraft, setPurposeDraft] = useState(list.purpose || '');
  const [savingPurpose, setSavingPurpose] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState(null);
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setPurposeDraft(list.purpose || '');
    setEditingPurpose(false);
  }, [list.id, list.purpose]);

  const stats = useMemo(() => {
    const today = todayKey();
    const done = tasks.filter((task) => ['done', 'closed'].includes(task.status?.type)).length;
    const open = tasks.filter((task) => !['done', 'closed'].includes(task.status?.type));
    const overdue = open.filter((task) => task.due_date && task.due_date < today).length;
    const milestonesDone = milestones.filter((milestone) => milestone.completed).length;
    const nextMilestone = [...milestones]
      .filter((milestone) => !milestone.completed)
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0] || null;
    return {
      total: tasks.length,
      done,
      open: open.length,
      overdue,
      completion: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
      milestonesDone,
      milestoneTotal: milestones.length,
      nextMilestone,
    };
  }, [tasks, milestones]);

  const sortedMilestones = useMemo(
    () =>
      [...milestones].sort((a, b) => {
        const byDate = (a.due_date || '').localeCompare(b.due_date || '');
        if (byDate !== 0) return byDate;
        return (a.order_index || 0) - (b.order_index || 0);
      }),
    [milestones]
  );

  const upcomingTasks = useMemo(
    () =>
      tasks
        .filter((task) => !['done', 'closed'].includes(task.status?.type))
        .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
        .slice(0, 5),
    [tasks]
  );

  async function savePurpose() {
    setSavingPurpose(true);
    try {
      await api.patch(`/lists/${list.id}`, { purpose: purposeDraft });
      await onChanged();
      setEditingPurpose(false);
      toast('项目背景与目的已保存');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSavingPurpose(false);
    }
  }

  function openMilestone(milestone = null) {
    setMilestoneForm(
      milestone
        ? {
            id: milestone.id,
            name: milestone.name,
            due_date: milestone.due_date,
            description: milestone.description || '',
            color: milestone.color || list.color,
          }
        : emptyMilestoneForm(list.color)
    );
  }

  async function saveMilestone(event) {
    event.preventDefault();
    if (!milestoneForm?.name?.trim() || !milestoneForm.due_date) return;
    setSavingMilestone(true);
    try {
      const payload = {
        name: milestoneForm.name.trim(),
        due_date: milestoneForm.due_date,
        description: milestoneForm.description,
        color: milestoneForm.color,
      };
      if (milestoneForm.id) await api.patch(`/milestones/${milestoneForm.id}`, payload);
      else await api.post(`/lists/${list.id}/milestones`, payload);
      setMilestoneForm(null);
      await onChanged();
      toast(milestoneForm.id ? '里程碑已更新' : '里程碑已添加');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSavingMilestone(false);
    }
  }

  async function toggleMilestone(milestone) {
    try {
      await api.patch(`/milestones/${milestone.id}`, { completed: !milestone.completed });
      await onChanged();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function removeMilestone() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/milestones/${deleteTarget.id}`);
      setDeleteTarget(null);
      await onChanged();
      toast('里程碑已删除');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="project-overview">
      <section className="overview-hero">
        <div className="overview-hero-main">
          <span className="overview-icon" style={{ background: `${list.color}1a` }}>{list.icon || '📋'}</span>
          <div>
            <span className="eyebrow-plain">PROJECT OVERVIEW</span>
            <h2>{list.name}</h2>
            <p>{list.description || '为这个项目补充一句简介，让团队快速理解它要解决什么问题。'}</p>
          </div>
        </div>
        <div className="overview-hero-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSaveAsTemplate}>
            <LayoutTemplate size={15} /> 另存为模板
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openMilestone()}>
            <Plus size={15} /> 新增里程碑
          </button>
        </div>
      </section>

      <section className="overview-stats">
        <div className="overview-stat">
          <div className="overview-stat-top"><Target size={16} /><span>任务完成度</span></div>
          <strong>{stats.completion}%</strong>
          <ProgressBar value={stats.done} total={stats.total} color={list.color} height={5} />
          <span>{stats.done}/{stats.total} 个任务已完成</span>
        </div>
        <div className="overview-stat">
          <div className="overview-stat-top"><Flag size={16} /><span>里程碑</span></div>
          <strong>{stats.milestonesDone}/{stats.milestoneTotal}</strong>
          <ProgressBar value={stats.milestonesDone} total={stats.milestoneTotal || 1} color="#2EA44F" height={5} />
          <span>{stats.nextMilestone ? `下一个：${stats.nextMilestone.name}` : '暂无待完成里程碑'}</span>
        </div>
        <div className="overview-stat">
          <div className="overview-stat-top"><CheckCircle2 size={16} /><span>进行中</span></div>
          <strong>{stats.open}</strong>
          <span className="overview-stat-foot">还有 {stats.open} 个任务待推进</span>
        </div>
        <div className="overview-stat">
          <div className="overview-stat-top"><CalendarDays size={16} /><span>已逾期</span></div>
          <strong className={stats.overdue ? 'is-danger' : ''}>{stats.overdue}</strong>
          <span className="overview-stat-foot">{stats.overdue ? '建议优先清理逾期任务' : '当前没有逾期任务'}</span>
        </div>
      </section>

      <section className="overview-card overview-timeline-card overview-timeline-full">
        <div className="overview-card-head">
          <div>
            <h3>里程碑时间轴</h3>
            <p>横向查看项目的关键节点，左右滑动浏览更多</p>
          </div>
          <button type="button" className="section-action" onClick={() => openMilestone()}>
            <Plus size={13} /> 新增
          </button>
        </div>

        {sortedMilestones.length ? (
          <div className="milestone-hscroll">
            <div className="milestone-hrow">
              {sortedMilestones.map((milestone) => {
                const days = differenceInDays(milestone.due_date);
                const overdue = !milestone.completed && days < 0;
                const soon = !milestone.completed && days >= 0 && days <= 7;
                return (
                  <div
                    className={`milestone-hitem ${milestone.completed ? 'is-completed' : ''} ${overdue ? 'is-overdue' : ''}`}
                    key={milestone.id}
                  >
                    <div className="milestone-hcard">
                      <div className="milestone-hcard-top">
                        {milestone.completed ? (
                          <span className="milestone-badge is-done">已完成</span>
                        ) : overdue ? (
                          <span className="milestone-badge is-overdue">逾期 {Math.abs(days)} 天</span>
                        ) : soon ? (
                          <span className="milestone-badge is-soon">{days === 0 ? '今天' : `${days} 天后`}</span>
                        ) : (
                          <span className="milestone-badge">{days} 天后</span>
                        )}
                        <div className="milestone-actions">
                          <button type="button" onClick={() => openMilestone(milestone)}><Pencil size={12} /> 编辑</button>
                          <button type="button" className="is-danger" onClick={() => setDeleteTarget(milestone)}><Trash2 size={12} /> 删除</button>
                        </div>
                      </div>
                      <h4>{milestone.name}</h4>
                      {milestone.description && <p className="milestone-desc">{milestone.description}</p>}
                    </div>
                    <span className="milestone-hstem" />
                    <button
                      type="button"
                      className={`milestone-check ${milestone.completed ? 'is-checked' : ''}`}
                      onClick={() => toggleMilestone(milestone)}
                      title={milestone.completed ? '标记为未完成' : '标记为完成'}
                    >
                      {milestone.completed ? <Check size={11} /> : null}
                    </button>
                    <div className="milestone-hlabel">
                      <strong>{formatDateSmart(milestone.due_date)}</strong>
                      <span>{format(parseDateValue(milestone.due_date), 'EEEEEE', { locale: zhCN })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="milestone-empty milestone-empty-horizontal">
            <div className="milestone-empty-icon"><Flag size={24} /></div>
            <h4>还没有里程碑</h4>
            <p>把项目拆成几个关键节点，横向时间轴会让你更清楚下一步。</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openMilestone()}>
              <Plus size={14} /> 添加第一个里程碑
            </button>
          </div>
        )}
      </section>

      <div className="overview-grid">
        <section className="overview-card overview-purpose-card">
          <div className="overview-card-head">
            <div>
              <h3>项目背景与目的</h3>
              <p>说明为什么要做这个项目、希望达成什么结果。</p>
            </div>
            {!editingPurpose && (
              <button type="button" className="section-action" onClick={() => setEditingPurpose(true)}>
                <Pencil size={13} /> 编辑
              </button>
            )}
          </div>
          {editingPurpose ? (
            <div className="purpose-editor">
              <textarea
                className="description-textarea"
                autoFocus
                rows={6}
                value={purposeDraft}
                onChange={(event) => setPurposeDraft(event.target.value)}
                placeholder="例如：本项目的目标是……，希望解决……，成功标准是……"
              />
              <div className="description-editor-foot">
                <span>会展示在项目概览和模板中</span>
                <div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingPurpose(false); setPurposeDraft(list.purpose || ''); }}>
                    取消
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={savePurpose} disabled={savingPurpose}>
                    {savingPurpose && <Spinner size={13} />} 保存
                  </button>
                </div>
              </div>
            </div>
          ) : list.purpose ? (
            <div className="purpose-content" onClick={() => setEditingPurpose(true)}>{list.purpose}</div>
          ) : (
            <button type="button" className="purpose-empty" onClick={() => setEditingPurpose(true)}>
              <Sparkles size={17} />
              <span>添加项目背景与目的，让团队知道为什么做这件事。</span>
              <span className="purpose-empty-action">开始填写 <ArrowUpRight size={13} /></span>
            </button>
          )}
        </section>

        <section className="overview-card">
          <div className="overview-card-head">
            <div>
              <h3>近期任务</h3>
              <p>按截止日期排序的未完成任务</p>
            </div>
            <span className="overview-mini-count">{upcomingTasks.length}</span>
          </div>
          <div className="overview-task-list">
            {upcomingTasks.map((task) => (
              <button type="button" key={task.id} className="overview-task-row" onClick={() => onOpenTask(task.id)}>
                <span className={`overview-task-dot ${dueTone(task.due_date, task.status?.type)}`} />
                <span className="overview-task-name">{task.name}</span>
                <span className={`overview-task-date ${dueTone(task.due_date, task.status?.type)}`}>
                  {task.due_date ? formatDateSmart(task.due_date) : '无日期'}
                </span>
              </button>
            ))}
            {!upcomingTasks.length && <p className="overview-empty-text">没有待完成任务。</p>}
          </div>
        </section>
      </div>

      <Modal
        open={Boolean(milestoneForm)}
        onClose={() => setMilestoneForm(null)}
        title={milestoneForm?.id ? '编辑里程碑' : '新增里程碑'}
        subtitle="设置一个可交付、可验收的关键节点"
        width={480}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setMilestoneForm(null)}>取消</button>
            <button type="submit" form="milestone-form" className="btn btn-primary" disabled={savingMilestone || !milestoneForm?.name?.trim()}>
              {savingMilestone ? <Spinner size={15} /> : <Flag size={15} />} 保存里程碑
            </button>
          </>
        }
      >
        {milestoneForm && (
          <form id="milestone-form" className="stack" onSubmit={saveMilestone}>
            <label className="field">
              <span className="field-label">里程碑名称</span>
              <input
                className="input"
                autoFocus
                value={milestoneForm.name}
                onChange={(event) => setMilestoneForm({ ...milestoneForm, name: event.target.value })}
                placeholder="例如：Beta 版本发布"
              />
            </label>
            <label className="field">
              <span className="field-label">目标日期</span>
              <input
                className="input"
                type="date"
                value={milestoneForm.due_date}
                onChange={(event) => setMilestoneForm({ ...milestoneForm, due_date: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">说明（可选）</span>
              <textarea
                className="input textarea"
                rows={3}
                value={milestoneForm.description}
                onChange={(event) => setMilestoneForm({ ...milestoneForm, description: event.target.value })}
                placeholder="这个节点需要交付什么？如何判断完成？"
              />
            </label>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除里程碑"
        message={`确定删除「${deleteTarget?.name || ''}」吗？此操作无法撤销。`}
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeMilestone}
      />
    </div>
  );
}

function differenceInDays(dateValue) {
  const date = parseDateValue(dateValue);
  if (!date) return 0;
  const today = parseDateValue(todayKey());
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}
