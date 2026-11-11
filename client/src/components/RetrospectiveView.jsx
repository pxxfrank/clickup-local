import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  History,
  Plus,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { format, formatDateSmart, todayKey } from '../lib/date.js';
import { ConfirmDialog, Modal, Spinner } from './ui.jsx';

function defaultCreateForm(index) {
  return {
    title: `第 ${index} 次复盘`,
    content: '',
  };
}

function localDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return format(date, 'yyyy-MM-dd');
}

export default function RetrospectiveView({ listId, listName, onOpenTask, onCountChange }) {
  const { toast } = useApp();
  const [retrospectives, setRetrospectives] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [contentDraft, setContentDraft] = useState('');
  const [savingContent, setSavingContent] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(defaultCreateForm(1));
  const [creating, setCreating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/lists/${listId}/retrospectives`)
      .then((data) => {
        if (cancelled) return;
        const sessions = data.retrospectives || [];
        setRetrospectives(sessions);
        setSelectedId((current) => (sessions.some((session) => session.id === current) ? current : sessions[0]?.id || null));
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
  }, [listId, toast]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setContentDraft('');
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api
      .get(`/retrospectives/${selectedId}`)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setContentDraft(data.content || '');
      })
      .catch((error) => {
        if (!cancelled) toast(error.message, 'error');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, toast]);

  const tasks = useMemo(
    () =>
      [...(detail?.tasks || [])].sort((a, b) => {
        if (!a.event_date && b.event_date) return 1;
        if (a.event_date && !b.event_date) return -1;
        return (a.event_date || '').localeCompare(b.event_date || '');
      }),
    [detail]
  );

  const completedCount = tasks.filter((task) => task.kind === 'completed').length;
  const overdueCount = tasks.filter((task) => task.kind === 'overdue').length;
  const dirty = Boolean(detail) && contentDraft !== (detail.content || '');

  function openCreate() {
    setCreateForm(defaultCreateForm(retrospectives.length + 1));
    setCreateOpen(true);
  }

  async function reloadList(selectId = null) {
    const data = await api.get(`/lists/${listId}/retrospectives`);
    const sessions = data.retrospectives || [];
    setRetrospectives(sessions);
    setSelectedId(selectId && sessions.some((session) => session.id === selectId) ? selectId : sessions[0]?.id || null);
    return sessions;
  }

  async function createRetrospective(event) {
    event.preventDefault();
    if (!createForm.title.trim() || !createForm.content.trim()) return;
    setCreating(true);
    try {
      const created = await api.post(`/lists/${listId}/retrospectives`, {
        title: createForm.title.trim(),
        content: createForm.content.trim(),
      });
      setCreateOpen(false);
      await reloadList(created.id);
      await onCountChange?.();
      toast(`复盘已创建，收录 ${created.task_count ?? 0} 个任务`);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function saveContent() {
    if (!detail || !contentDraft.trim() || !dirty) return;
    setSavingContent(true);
    try {
      const updated = await api.patch(`/retrospectives/${detail.id}`, { content: contentDraft });
      setDetail((current) => ({ ...current, ...updated }));
      setRetrospectives((current) =>
        current.map((session) => (session.id === updated.id ? { ...session, ...updated } : session))
      );
      toast('复盘内容已保存');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSavingContent(false);
    }
  }

  async function deleteRetrospective() {
    if (!detail) return;
    setDeleting(true);
    try {
      await api.delete(`/retrospectives/${detail.id}`);
      setDeleteOpen(false);
      await reloadList();
      await onCountChange?.();
      toast('复盘已删除');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="retro-page">
      <section className="retro-hero">
        <div className="retro-hero-icon"><ClipboardCheck size={25} /></div>
        <div className="retro-hero-text">
          <span className="eyebrow-plain">PROJECT RETROSPECTIVE</span>
          <h2>复盘</h2>
          <p>把逾期和已完成的任务放进同一条时间轴，记录每一次复盘，让经验沉淀下来。</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus size={15} /> 新建复盘
        </button>
      </section>

      {loading ? (
        <div className="retro-loading"><Spinner size={18} /> 正在读取复盘…</div>
      ) : retrospectives.length === 0 ? (
        <section className="retro-empty panel">
          <div className="retro-empty-icon"><History size={26} /></div>
          <h3>还没有复盘记录</h3>
          <p>每一次复盘都是一次项目快照。创建后会收录当前所有逾期和已完成的任务，并生成独立的时间轴。</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={15} /> 创建第一次复盘
          </button>
        </section>
      ) : (
        <div className="retro-layout">
          <aside className="retro-sessions panel">
            <div className="retro-sessions-head">
              <div>
                <h3>历次复盘</h3>
                <p>{retrospectives.length} 次记录</p>
              </div>
              <button type="button" className="icon-btn" onClick={openCreate} title="新建复盘"><Plus size={15} /></button>
            </div>
            <div className="retro-session-list">
              {retrospectives.map((session) => (
                <button
                  type="button"
                  key={session.id}
                  className={`retro-session ${selectedId === session.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(session.id)}
                >
                  <span className="retro-session-main">
                    <strong>{session.title}</strong>
                    <span>{formatDateSmart(localDate(session.created_at))}</span>
                  </span>
                  <span className="retro-session-counts">
                    <em className="is-done">{session.completed_count || 0}</em>
                    <em className="is-overdue">{session.overdue_count || 0}</em>
                  </span>
                  <ChevronRight size={13} />
                </button>
              ))}
            </div>
            <a className="retro-session-new" href={`#/list/${listId}?view=retrospective`} onClick={(event) => { event.preventDefault(); openCreate(); }}>
              <Plus size={13} /> 再记录一次复盘
            </a>
          </aside>

          <main className="retro-main">
            {detailLoading || !detail ? (
              <div className="retro-detail-loading panel"><Spinner size={18} /> 正在打开复盘…</div>
            ) : (
              <>
                <section className="retro-detail-head panel">
                  <div className="retro-detail-head-main">
                    <span className="eyebrow-plain">RETROSPECTIVE</span>
                    <h3>{detail.title}</h3>
                    <p>{listName} · 创建于 {formatDateSmart(localDate(detail.created_at))} · 创建时任务快照</p>
                  </div>
                  <button type="button" className="icon-btn icon-btn-danger" onClick={() => setDeleteOpen(true)} title="删除本次复盘">
                    <Trash2 size={15} />
                  </button>
                </section>

                <section className="retro-summary-row">
                  <div className="retro-summary-card">
                    <span><CheckCircle2 size={14} /> 已完成</span>
                    <strong>{completedCount}</strong>
                  </div>
                  <div className="retro-summary-card is-overdue">
                    <span><Clock3 size={14} /> 逾期</span>
                    <strong>{overdueCount}</strong>
                  </div>
                  <div className="retro-summary-card">
                    <span><ClipboardCheck size={14} /> 收录任务</span>
                    <strong>{tasks.length}</strong>
                  </div>
                </section>

                <section className="retro-timeline-card panel">
                  <div className="retro-section-head">
                    <div>
                      <h3>任务时间轴</h3>
                      <p>逾期与已完成任务按事件日期排列，点击任务可查看详情</p>
                    </div>
                    <div className="retro-legend">
                      <span><i className="is-done" /> 已完成</span>
                      <span><i className="is-overdue" /> 逾期</span>
                    </div>
                  </div>
                  {tasks.length ? (
                    <div className="retro-timeline-scroll">
                      <div className="retro-timeline-row">
                        {tasks.map((task) => (
                          <div className={`retro-timeline-item is-${task.kind}`} key={task.id}>
                            <button
                              type="button"
                              className={`retro-task-card ${task.task_id ? '' : 'is-detached'}`}
                              onClick={() => task.task_id && onOpenTask(task.task_id)}
                              disabled={!task.task_id}
                            >
                              <div className="retro-task-top">
                                <span className={`retro-task-kind ${task.kind}`}>
                                  {task.kind === 'completed' ? '已完成' : '逾期'}
                                </span>
                                <span className="retro-task-date">{task.event_date ? formatDateSmart(task.event_date) : '无日期'}</span>
                              </div>
                              <strong>{task.name}</strong>
                              <div className="retro-task-meta">
                                {task.status_name && (
                                  <span><i style={{ background: task.status_color || '#87909e' }} />{task.status_name}</span>
                                )}
                                {task.assignee_name && <span>{task.assignee_name}</span>}
                              </div>
                            </button>
                            <span className="retro-timeline-stem" />
                            <span className="retro-timeline-dot" />
                            <span className="retro-timeline-label">{task.event_date ? formatDateSmart(task.event_date) : '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="retro-timeline-empty">
                      <Clock3 size={20} />
                      <p>本次复盘没有收录到逾期或已完成的任务。</p>
                    </div>
                  )}
                </section>

                <section className="retro-content-card panel">
                  <div className="retro-section-head">
                    <div>
                      <h3>复盘内容</h3>
                      <p>记录做得好的、遇到的问题和下一步行动</p>
                    </div>
                    <span className={`retro-save-state ${dirty ? 'is-dirty' : ''}`}>
                      {dirty ? '尚未保存' : '已保存'}
                    </span>
                  </div>
                  <textarea
                    className="retro-content-input"
                    rows={9}
                    value={contentDraft}
                    onChange={(event) => setContentDraft(event.target.value)}
                    placeholder={'可以从这些角度开始：\n1. 哪些事情做得不错？\n2. 哪些问题需要改进？\n3. 下一步准备怎么做？'}
                  />
                  <div className="retro-content-foot">
                    <span>每次复盘独立保存，不会覆盖历史记录。</span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={saveContent}
                      disabled={!dirty || !contentDraft.trim() || savingContent}
                    >
                      {savingContent ? <Spinner size={13} /> : null} 保存复盘内容
                    </button>
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建复盘"
        subtitle="创建时会固定当前逾期和已完成任务，形成本次复盘的时间轴"
        width={520}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>取消</button>
            <button
              type="submit"
              form="retro-create-form"
              className="btn btn-primary"
              disabled={creating || !createForm.title.trim() || !createForm.content.trim()}
            >
              {creating ? <Spinner size={15} /> : <ClipboardCheck size={15} />} 创建复盘
            </button>
          </>
        }
      >
        <form id="retro-create-form" className="stack" onSubmit={createRetrospective}>
          <label className="field">
            <span className="field-label">复盘标题</span>
            <input
              className="input"
              autoFocus
              value={createForm.title}
              onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })}
              placeholder="例如：第 1 次复盘 · 版本发布后"
            />
          </label>
          <label className="field">
            <span className="field-label">复盘内容</span>
            <textarea
              className="input textarea retro-create-content"
              rows={8}
              value={createForm.content}
              onChange={(event) => setCreateForm({ ...createForm, content: event.target.value })}
              placeholder={'可以从这些角度开始：\n1. 哪些事情做得不错？\n2. 哪些问题需要改进？\n3. 下一步准备怎么做？'}
            />
          </label>
          <div className="retro-create-hint">
            <ArrowRight size={13} />
            <span>当前日期：{todayKey()}。创建后可在任务时间轴中回看本次复盘的任务快照。</span>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="删除复盘"
        message={`确定删除「${detail?.title || ''}」吗？本次复盘内容和任务快照会一并删除。`}
        busy={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteRetrospective}
      />
    </div>
  );
}
