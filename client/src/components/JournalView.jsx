import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  CalendarDays,
  Download,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { format, formatDateTime, parseDateValue, zhCN } from '../lib/date.js';
import { renderMarkdownWithTasks, taskReferenceText } from '../lib/markdown.js';
import { Avatar, ConfirmDialog, EmptyState, Modal, Spinner } from './ui.jsx';
import MarkdownEditor from './MarkdownEditor.jsx';

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'note', label: '项目记录' },
  { value: 'progress', label: '任务进展' },
  { value: 'activity', label: '任务动态' },
  { value: 'meeting', label: '会议' },
];

function noteMarkdown(item, tasks) {
  return renderMarkdownWithTasks(item.body || '', tasks);
}

function downloadJournal(list, items, tasks) {
  const lines = [`# ${list.name} · 项目记录`, ''];
  for (const item of items) {
    lines.push(`## ${formatDateTime(item.created_at)} · ${item.kind === 'note' ? item.title : item.kind}`);
    if (item.title && item.kind !== 'note') lines.push(`**${item.title}**`);
    lines.push('', taskReferenceText(item.body || '', tasks), '');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${list.name}-项目记录.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function JournalView({ list, tasks, onOpenTask, onChanged }) {
  const { dataVersion, toast } = useApp();
  const [journal, setJournal] = useState({ items: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [noteDraft, setNoteDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function loadJournal() {
    try {
      const data = await api.get(`/lists/${list.id}/journal`);
      setJournal(data);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadJournal();
  }, [list.id, dataVersion]);

  const filtered = useMemo(
    () => (filter === 'all' ? journal.items : journal.items.filter((item) => item.kind === filter)),
    [journal.items, filter]
  );
  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of filtered) {
      const date = String(item.created_at || '').slice(0, 10);
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(item);
    }
    return [...map.entries()];
  }, [filtered]);

  function openNewNote() {
    setNoteDraft({ id: null, title: '', body: '' });
  }

  function openEditNote(item) {
    setNoteDraft({ id: item.source_id, title: item.title, body: item.body || '' });
  }

  async function saveNote(event) {
    event.preventDefault();
    if (!noteDraft?.title?.trim()) return;
    setSaving(true);
    try {
      if (noteDraft.id) await api.patch(`/journal/${noteDraft.id}`, noteDraft);
      else await api.post(`/lists/${list.id}/journal`, noteDraft);
      setNoteDraft(null);
      await loadJournal();
      onChanged?.();
      toast('项目记录已保存');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeNote() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/journal/${deleteTarget.source_id}`);
      setDeleteTarget(null);
      await loadJournal();
      onChanged?.();
      toast('项目记录已删除');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="journal-view">
      <div className="journal-head">
        <div>
          <h2><BookOpen size={18} /> 项目记录</h2>
          <p>把任务进展、系统动态、会议和项目决策沉淀到同一个时间轴。</p>
        </div>
        <div className="journal-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadJournal(list, filtered, tasks)} disabled={!filtered.length}>
            <Download size={14} /> 导出记录
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={openNewNote}>
            <Plus size={14} /> 写项目记录
          </button>
        </div>
      </div>

      <div className="journal-filters">
        {FILTERS.map((item) => (
          <button
            type="button"
            key={item.value}
            className={filter === item.value ? 'is-active' : ''}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
            <span>{item.value === 'all' ? journal.items.length : journal.counts?.[item.value] || 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="journal-loading"><Spinner size={18} /> 正在整理项目记录…</div>
      ) : grouped.length ? (
        <div className="journal-timeline">
          {grouped.map(([date, items]) => (
            <section className="journal-day" key={date}>
              <div className="journal-date">
                <strong>{format(parseDateValue(date), 'M月d日')}</strong>
                <span>{format(parseDateValue(date), 'EEEE', { locale: zhCN })}</span>
              </div>
              <div className="journal-day-items">
                {items.map((item) => {
                  if (item.kind === 'note') {
                    return (
                      <article className="journal-note" key={item.id}>
                        <div className="journal-note-head">
                          <div>
                            <strong>{item.title}</strong>
                            <span>{item.user_name || '项目成员'} · {formatDateTime(item.created_at)}</span>
                          </div>
                          <div className="journal-note-actions">
                            <button type="button" className="icon-btn" onClick={() => openEditNote(item)} title="编辑项目记录"><Pencil size={13} /></button>
                            <button type="button" className="icon-btn icon-btn-danger" onClick={() => setDeleteTarget(item)} title="删除项目记录"><Trash2 size={13} /></button>
                          </div>
                        </div>
                        {item.body && <div className="journal-note-body markdown-body" dangerouslySetInnerHTML={{ __html: noteMarkdown(item, tasks) }} />}
                      </article>
                    );
                  }
                  if (item.kind === 'progress') {
                    return (
                      <div className="journal-progress" key={item.id}>
                        <Avatar user={{ name: item.user_name, color: item.user_color }} size={25} />
                        <div className="journal-progress-main">
                          <div className="journal-item-meta">
                            <strong>{item.user_name || '成员'}</strong>
                            <span>记录了进展</span>
                            <button type="button" onClick={() => onOpenTask(item.task_id)}>{item.task_name}</button>
                          </div>
                          <div className="journal-progress-body markdown-body" dangerouslySetInnerHTML={{ __html: noteMarkdown(item, tasks) }} />
                          <span className="journal-time">{formatDateTime(item.created_at)}</span>
                        </div>
                      </div>
                    );
                  }
                  if (item.kind === 'meeting') {
                    return (
                      <div className="journal-meeting" key={item.id}>
                        <CalendarDays size={15} />
                        <div>
                          <strong>{item.title}</strong>
                          <span>{formatDateTime(item.created_at)}</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="journal-activity" key={item.id}>
                      <Activity size={14} />
                      <div>
                        <span><strong>{item.user_name || '系统'}</strong> {item.body}</span>
                        {item.task_id && <button type="button" onClick={() => onOpenTask(item.task_id)}>{item.task_name}</button>}
                        <em>{formatDateTime(item.created_at)}</em>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<BookOpen size={24} />}
          title="还没有项目记录"
          description="写一条项目决策、会议结论，或让任务进展自动沉淀到这里。"
          action={<button type="button" className="btn btn-primary" onClick={openNewNote}><Plus size={14} /> 写项目记录</button>}
        />
      )}

      <Modal
        open={Boolean(noteDraft)}
        onClose={() => setNoteDraft(null)}
        title={noteDraft?.id ? '编辑项目记录' : '写项目记录'}
        subtitle="记录项目决策、背景、复盘结论或阶段总结"
        width={760}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setNoteDraft(null)}>取消</button>
            <button type="submit" form="journal-note-form" className="btn btn-primary" disabled={saving || !noteDraft?.title?.trim()}>
              {saving ? <Spinner size={14} /> : null} 保存记录
            </button>
          </>
        }
      >
        {noteDraft && (
          <form id="journal-note-form" className="stack" onSubmit={saveNote}>
            <label className="field">
              <span className="field-label">记录标题</span>
              <input
                className="input"
                autoFocus
                value={noteDraft.title}
                onChange={(event) => setNoteDraft({ ...noteDraft, title: event.target.value })}
                placeholder="例如：本周发布决策"
              />
            </label>
            <div className="field">
              <span className="field-label">内容</span>
              <MarkdownEditor
                value={noteDraft.body}
                onChange={(body) => setNoteDraft({ ...noteDraft, body })}
                tasks={tasks}
                onOpenTask={onOpenTask}
                rows={8}
                placeholder="记录背景、决策、结论或下一步…"
              />
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除项目记录"
        message={`确定删除「${deleteTarget?.title || ''}」吗？任务进展和系统动态不会受影响。`}
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeNote}
      />
    </div>
  );
}
