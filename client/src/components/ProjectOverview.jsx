import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Flag,
  Layers,
  LayoutTemplate,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { addDays, addMonths, dueTone, format, formatDateSmart, parseDateValue, startOfMonth, todayKey, zhCN } from '../lib/date.js';
import { ConfirmDialog, Modal, ProgressBar, Spinner } from './ui.jsx';

const PHASE_COLORS = ['#7B68EE', '#4A9EFF', '#2EA44F', '#F59E0B', '#F06A6A', '#EC4899'];
const TIMELINE_CARD_WIDTH = 196;
const TIMELINE_CARD_HEIGHT = 116;
const TIMELINE_GUTTER = 112;
const TIMELINE_PHASE_LANE = 54;
const TIMELINE_MS_GAP = 14;

function emptyMilestoneForm(listColor) {
  return {
    id: null,
    name: '',
    due_date: format(addDays(new Date(), 14), 'yyyy-MM-dd'),
    description: '',
    color: listColor || '#7B68EE',
  };
}

function emptyPhaseForm(listColor) {
  return {
    id: null,
    name: '',
    start_date: todayKey(),
    end_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    color: listColor || PHASE_COLORS[0],
  };
}

function daysInclusive(start, end) {
  const startDate = parseDateValue(start);
  const endDate = parseDateValue(end);
  if (!startDate || !endDate) return 1;
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
}

function dayDistance(start, end) {
  const startDate = parseDateValue(start);
  const endDate = parseDateValue(end);
  if (!startDate || !endDate) return 0;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

export default function ProjectOverview({
  list,
  tasks,
  milestones,
  phases = [],
  onChanged,
  onOpenTask,
  onSaveAsTemplate,
}) {
  const { toast } = useApp();
  const [editingPurpose, setEditingPurpose] = useState(false);
  const [purposeDraft, setPurposeDraft] = useState(list.purpose || '');
  const [savingPurpose, setSavingPurpose] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState(null);
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [phaseForm, setPhaseForm] = useState(null);
  const [savingPhase, setSavingPhase] = useState(false);
  const [deletePhaseTarget, setDeletePhaseTarget] = useState(null);
  const [deletingPhase, setDeletingPhase] = useState(false);

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

  const sortedPhases = useMemo(
    () =>
      [...phases].sort((a, b) => {
        const byStart = (a.start_date || '').localeCompare(b.start_date || '');
        if (byStart !== 0) return byStart;
        return (a.order_index || 0) - (b.order_index || 0);
      }),
    [phases]
  );

  const upcomingTasks = useMemo(
    () =>
      tasks
        .filter((task) => !['done', 'closed'].includes(task.status?.type))
        .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
        .slice(0, 5),
    [tasks]
  );

  function phaseForMilestone(milestone) {
    return sortedPhases.find(
      (phase) => phase.start_date <= milestone.due_date && phase.end_date >= milestone.due_date
    );
  }

  const timeline = useMemo(() => {
    if (!sortedMilestones.length) return null;
    const today = todayKey();
    const dateKeys = [
      today,
      ...sortedPhases.flatMap((phase) => [phase.start_date, phase.end_date]),
      ...sortedMilestones.map((milestone) => milestone.due_date),
    ].filter(Boolean);
    const times = dateKeys.map((value) => parseDateValue(value)?.getTime()).filter((value) => value !== undefined);
    if (!times.length) return null;
    let start = addDays(new Date(Math.min(...times)), -5);
    let end = addDays(new Date(Math.max(...times)), 5);
    if (dayDistance(start, end) < 21) end = addDays(start, 21);
    const totalDays = dayDistance(start, end) + 1;

    const milestoneTimes = sortedMilestones
      .map((milestone) => parseDateValue(milestone.due_date)?.getTime())
      .filter((value) => value !== undefined)
      .sort((a, b) => a - b);
    let minGap = 14;
    for (let index = 1; index < milestoneTimes.length; index += 1) {
      const gap = Math.round((milestoneTimes[index] - milestoneTimes[index - 1]) / 86400000);
      if (gap > 0) minGap = Math.min(minGap, gap);
    }
    const pxPerDay = Math.max(16, Math.min(64, Math.ceil(200 / Math.max(1, minGap))));
    const xForDate = (value) => TIMELINE_GUTTER + dayDistance(start, value) * pxPerDay;
    const width = Math.max(820, totalDays * pxPerDay + TIMELINE_GUTTER * 2);

    const phaseLanes = [];
    const phaseBlocks = sortedPhases
      .map((phase) => {
        const left = xForDate(phase.start_date);
        const phaseWidth = Math.max(44, xForDate(phase.end_date) - left + pxPerDay);
        const right = left + phaseWidth;
        let lane = 0;
        while (
          phaseLanes[lane]?.some(
            (interval) => left < interval.right + 8 && right > interval.left - 8
          )
        ) {
          lane += 1;
        }
        if (!phaseLanes[lane]) phaseLanes[lane] = [];
        phaseLanes[lane].push({ left, right });
        return { ...phase, left, width: phaseWidth, lane, top: 6 + lane * TIMELINE_PHASE_LANE };
      })
      .filter((phase) => Number.isFinite(phase.left));

    const phaseHeight = phaseLanes.length ? phaseLanes.length * TIMELINE_PHASE_LANE + 6 : 0;
    const cardsTop = phaseHeight + 18;
    const milestoneLanes = [];
    const milestoneBlocks = sortedMilestones
      .map((milestone) => {
        const x = xForDate(milestone.due_date);
        const left = x - TIMELINE_CARD_WIDTH / 2;
        const right = x + TIMELINE_CARD_WIDTH / 2;
        let lane = 0;
        while (
          milestoneLanes[lane]?.some(
            (interval) => left < interval.right + 12 && right > interval.left - 12
          )
        ) {
          lane += 1;
        }
        if (!milestoneLanes[lane]) milestoneLanes[lane] = [];
        milestoneLanes[lane].push({ left, right });
        return {
          milestone,
          x,
          left,
          lane,
          top: cardsTop + lane * (TIMELINE_CARD_HEIGHT + TIMELINE_MS_GAP),
          phase: phaseForMilestone(milestone),
        };
      })
      .filter((block) => Number.isFinite(block.x));

    if (!milestoneBlocks.length) return null;
    const axisY = cardsTop + milestoneLanes.length * (TIMELINE_CARD_HEIGHT + TIMELINE_MS_GAP) + 4;
    const monthTicks = [];
    let cursor = startOfMonth(start);
    while (cursor <= end) {
      if (cursor >= start) {
        monthTicks.push({ x: xForDate(cursor), label: format(cursor, 'M月') });
      }
      cursor = addMonths(cursor, 1);
    }
    const todayDate = parseDateValue(today);
    const todayInRange = todayDate >= start && todayDate <= end;
    return {
      width,
      height: axisY + 62,
      axisY,
      cardsTop,
      phaseHeight,
      phaseBlocks,
      milestoneBlocks,
      monthTicks,
      todayX: todayInRange ? xForDate(today) : null,
    };
  }, [sortedMilestones, sortedPhases]);

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

  function openPhase(phase = null) {
    setPhaseForm(
      phase
        ? {
            id: phase.id,
            name: phase.name,
            start_date: phase.start_date,
            end_date: phase.end_date,
            color: phase.color || PHASE_COLORS[0],
          }
        : emptyPhaseForm(list.color)
    );
  }

  async function savePhase(event) {
    event.preventDefault();
    if (!phaseForm?.name?.trim() || !phaseForm.start_date || !phaseForm.end_date) return;
    if (phaseForm.end_date < phaseForm.start_date) {
      toast('阶段结束日期不能早于开始日期', 'error');
      return;
    }
    setSavingPhase(true);
    try {
      const payload = {
        name: phaseForm.name.trim(),
        start_date: phaseForm.start_date,
        end_date: phaseForm.end_date,
        color: phaseForm.color,
      };
      if (phaseForm.id) await api.patch(`/phases/${phaseForm.id}`, payload);
      else await api.post(`/lists/${list.id}/phases`, payload);
      setPhaseForm(null);
      await onChanged();
      toast(phaseForm.id ? '项目阶段已更新' : '项目阶段已添加');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSavingPhase(false);
    }
  }

  async function removePhase() {
    if (!deletePhaseTarget) return;
    setDeletingPhase(true);
    try {
      await api.delete(`/phases/${deletePhaseTarget.id}`);
      setDeletePhaseTarget(null);
      await onChanged();
      toast('项目阶段已删除');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setDeletingPhase(false);
    }
  }

  return (
    <div className="project-overview">
      <section className="overview-hero">
        <div className="overview-hero-main">
          <span
            className="overview-icon"
            style={{
              background: `${list.color}26`,
              border: `1px solid ${list.color}55`,
              boxShadow: `inset 0 -3px 0 ${list.color}`,
            }}
          >
            {list.icon || '📋'}
          </span>
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

        {timeline ? (
          <div className="project-timeline-scroll">
            <div className="project-timeline-canvas" style={{ width: timeline.width, height: timeline.height }}>
              {timeline.monthTicks.map((tick) => (
                <div className="timeline-month" key={`${tick.x}-${tick.label}`}>
                  <span className="timeline-month-line" style={{ left: tick.x, height: timeline.axisY }} />
                  <span className="timeline-month-label" style={{ left: tick.x, top: timeline.axisY + 35 }}>
                    {tick.label}
                  </span>
                </div>
              ))}
              {timeline.todayX !== null && (
                <div className="timeline-today" style={{ left: timeline.todayX, height: timeline.axisY }}>
                  <span>今天</span>
                </div>
              )}

              {timeline.phaseBlocks.map((phase) => (
                <div
                  className="timeline-phase-zone"
                  key={`zone-${phase.id}`}
                  style={{
                    left: phase.left,
                    top: phase.top + 44,
                    width: phase.width,
                    height: Math.max(0, timeline.axisY - phase.top - 44),
                    background: `${phase.color}0d`,
                    borderColor: `${phase.color}33`,
                  }}
                />
              ))}
              {timeline.phaseBlocks.map((phase) => (
                <div
                  className="timeline-phase-block"
                  key={phase.id}
                  style={{
                    left: phase.left,
                    top: phase.top,
                    width: phase.width,
                    background: `${phase.color}19`,
                    borderColor: `${phase.color}59`,
                  }}
                  title={`${phase.name}：${phase.start_date} — ${phase.end_date}`}
                >
                  <span className="timeline-phase-dot" style={{ background: phase.color }} />
                  <strong>{phase.name}</strong>
                  <em>{formatDateSmart(phase.start_date)} — {formatDateSmart(phase.end_date)}</em>
                </div>
              ))}

              <div className="timeline-axis" style={{ top: timeline.axisY }} />

              {timeline.milestoneBlocks.map(({ milestone, left, top, phase }) => {
                const days = differenceInDays(milestone.due_date);
                const overdue = !milestone.completed && days < 0;
                const soon = !milestone.completed && days >= 0 && days <= 7;
                return (
                  <div
                    className={`timeline-ms ${milestone.completed ? 'is-completed' : ''} ${overdue ? 'is-overdue' : ''}`}
                    key={milestone.id}
                    style={{ left, top, width: TIMELINE_CARD_WIDTH }}
                  >
                    <div
                      className="timeline-ms-card"
                      style={phase ? { borderTop: `3px solid ${phase.color}` } : undefined}
                    >
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
                    <span
                      className="timeline-ms-connector"
                      style={{ height: Math.max(8, timeline.axisY - top - TIMELINE_CARD_HEIGHT) }}
                    />
                    <button
                      type="button"
                      className={`milestone-check timeline-ms-node ${milestone.completed ? 'is-checked' : ''}`}
                      style={{
                        top: timeline.axisY - top - 9,
                        borderColor: phase && !milestone.completed ? phase.color : undefined,
                      }}
                      onClick={() => toggleMilestone(milestone)}
                      title={milestone.completed ? '标记为未完成' : '标记为完成'}
                    >
                      {milestone.completed ? <Check size={11} /> : null}
                    </button>
                    <div className="timeline-ms-date" style={{ top: timeline.axisY - top + 13 }}>
                      <strong>{formatDateSmart(milestone.due_date)}</strong>
                      <span>{format(parseDateValue(milestone.due_date), 'EEEEEE', { locale: zhCN })}</span>
                      {phase && <em style={{ color: phase.color }}>{phase.name}</em>}
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

          <div className="phase-panorama">
            <div className="phase-panorama-head">
              <div>
                <h4><Layers size={14} /> 项目全景</h4>
                <p>用日期阶段串联项目，里程碑会按日期自动归入阶段并着色。</p>
              </div>
              <button type="button" className="section-action" onClick={() => openPhase()}>
                <Plus size={13} /> 新增阶段
              </button>
            </div>
            {sortedPhases.length ? (
              <div className="phase-list">
                {sortedPhases.map((phase) => (
                  <div className="phase-row" key={phase.id}>
                    <span className="phase-row-bar" style={{ background: phase.color }} />
                    <div className="phase-row-main">
                      <strong>{phase.name}</strong>
                      <span>
                        {formatDateSmart(phase.start_date)} — {formatDateSmart(phase.end_date)}
                        <em>{daysInclusive(phase.start_date, phase.end_date)} 天</em>
                      </span>
                    </div>
                    <div className="phase-row-actions">
                      <button type="button" onClick={() => openPhase(phase)} title="编辑阶段"><Pencil size={12} /></button>
                      <button type="button" className="is-danger" onClick={() => setDeletePhaseTarget(phase)} title="删除阶段"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <button type="button" className="phase-empty" onClick={() => openPhase()}>
                <Layers size={15} />
                <span>还没有阶段划分，例如：11月1日—12月15日「需求与设计」</span>
                <span>添加阶段</span>
              </button>
            )}
          </div>
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
        open={Boolean(phaseForm)}
        onClose={() => setPhaseForm(null)}
        title={phaseForm?.id ? '编辑项目阶段' : '新增项目阶段'}
        subtitle="定义时间范围，里程碑会按日期自动归入对应阶段"
        width={480}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setPhaseForm(null)}>取消</button>
            <button
              type="submit"
              form="phase-form"
              className="btn btn-primary"
              disabled={
                savingPhase ||
                !phaseForm?.name?.trim() ||
                !phaseForm?.start_date ||
                !phaseForm?.end_date ||
                phaseForm.end_date < phaseForm.start_date
              }
            >
              {savingPhase ? <Spinner size={15} /> : <Layers size={15} />} 保存阶段
            </button>
          </>
        }
      >
        {phaseForm && (
          <form id="phase-form" className="stack" onSubmit={savePhase}>
            <label className="field">
              <span className="field-label">阶段名称</span>
              <input
                className="input"
                autoFocus
                value={phaseForm.name}
                onChange={(event) => setPhaseForm({ ...phaseForm, name: event.target.value })}
                placeholder="例如：需求与设计"
              />
            </label>
            <div className="form-grid-2">
              <label className="field">
                <span className="field-label">开始日期</span>
                <input
                  className="input"
                  type="date"
                  value={phaseForm.start_date}
                  onChange={(event) => setPhaseForm({ ...phaseForm, start_date: event.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">结束日期</span>
                <input
                  className="input"
                  type="date"
                  value={phaseForm.end_date}
                  onChange={(event) => setPhaseForm({ ...phaseForm, end_date: event.target.value })}
                  required
                />
              </label>
            </div>
            {phaseForm.end_date < phaseForm.start_date && (
              <p className="form-error">结束日期不能早于开始日期。</p>
            )}
            <div className="field">
              <span className="field-label">阶段颜色</span>
              <div className="phase-color-picker">
                {PHASE_COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={`phase-color-swatch ${phaseForm.color === color ? 'is-active' : ''}`}
                    style={{ background: color }}
                    onClick={() => setPhaseForm({ ...phaseForm, color })}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <p className="phase-form-hint">
              共 {daysInclusive(phaseForm.start_date, phaseForm.end_date)} 天。落在该日期范围内的里程碑会自动使用这个阶段的颜色。
            </p>
          </form>
        )}
      </Modal>

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

      <ConfirmDialog
        open={Boolean(deletePhaseTarget)}
        title="删除项目阶段"
        message={`确定删除阶段「${deletePhaseTarget?.name || ''}」吗？里程碑不会被删除，只会失去阶段颜色。`}
        busy={deletingPhase}
        onClose={() => setDeletePhaseTarget(null)}
        onConfirm={removePhase}
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
