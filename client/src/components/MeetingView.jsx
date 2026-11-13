import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  FileText,
  Link2,
  ListTodo,
  Pencil,
  Plus,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { format } from '../lib/date.js';
import { taskReferenceText } from '../lib/markdown.js';
import { ConfirmDialog, EmptyState, IconButton, MenuItem, Popover, Spinner } from './ui.jsx';
import MarkdownEditor from './MarkdownEditor.jsx';

function formatMeetingTime(value) {
  if (!value) return '未设置时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'yyyy年M月d日 HH:mm');
}

function roundToQuarter() {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15);
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function timeInputValue(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(0, 16);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function sanitizeFilename(value) {
  return String(value || '会议记录').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function meetingMarkdown(meeting, tasks = []) {
  const text = (value) => taskReferenceText(value || '', tasks);
  const lines = [
    `# ${meeting.title || '未命名会议'}`,
    '',
    `- 会议时间：${formatMeetingTime(meeting.meeting_at)}`,
    `- 与会人：${meeting.participants || '未填写'}`,
    '',
    '## 会议目标',
    '',
    text(meeting.goals) || '未填写',
    '',
    '## 需要讲的内容',
    '',
    text(meeting.content) || '未填写',
    '',
    '## 需要解决的问题',
    '',
  ];
  if (!meeting.discuss_issues?.length) lines.push('无');
  else {
    meeting.discuss_issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${text(issue.content)}`);
      if (issue.task_name) lines.push(`   - 关联任务：${issue.task_name}`);
    });
  }
  lines.push('', '## 关联任务', '');
  if (!meeting.bound_tasks?.length) lines.push('无');
  else meeting.bound_tasks.forEach((task) => lines.push(`- ${task.name}`));
  lines.push('', '## 遗留问题', '');
  if (!meeting.followup_issues?.length) lines.push('无');
  else {
    meeting.followup_issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${text(issue.content)}`);
      if (issue.task_name) lines.push(`   - 已转为任务：${issue.task_name}`);
    });
  }
  return lines.join('\n');
}

function meetingWordHtml(meeting, tasks = []) {
  const richText = (value) => {
    const escaped = escapeHtml(value || '');
    return escaped
      .replace(/\[\[task:([^\]]+)\]\]/g, (match, taskId) => {
        const task = tasks.find((item) => item.id === taskId);
        return task ? `<span class="task-ref">▣ ${escapeHtml(task.name)}</span>` : match;
      })
      .replace(/\n/g, '<br>');
  };
  const list = (items) =>
    items?.length
      ? `<ol>${items
          .map(
            (issue) =>
              `<li>${richText(issue.content)}${
                issue.task_name ? `<span class="linked">关联任务：${escapeHtml(issue.task_name)}</span>` : ''
              }</li>`
          )
          .join('')}</ol>`
      : '<p class="empty">无</p>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(meeting.title)}</title>
  <style>
    body{font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif;color:#242331;line-height:1.7;font-size:12pt;margin:36pt;}
    h1{font-size:22pt;margin:0 0 8pt;} h2{font-size:14pt;margin:22pt 0 8pt;border-bottom:1px solid #ddd;padding-bottom:4pt;}
    .meta{color:#666;font-size:10pt;margin-bottom:18pt;} .meta span{margin-right:20px;}
    p{white-space:pre-wrap;} li{margin-bottom:6pt;} .linked{display:block;color:#6c5ce7;font-size:9.5pt;}
    .empty{color:#999;} ol{padding-left:22pt;} .task-ref{color:#2f6fd6;background:#eef5ff;padding:1px 5px;border-radius:3px;font-size:10pt;}
  </style></head><body>
  <h1>${escapeHtml(meeting.title || '未命名会议')}</h1>
  <div class="meta"><span>时间：${escapeHtml(formatMeetingTime(meeting.meeting_at))}</span><span>与会人：${escapeHtml(meeting.participants || '未填写')}</span></div>
  <h2>会议目标</h2><p>${richText(meeting.goals || '未填写')}</p>
  <h2>需要讲的内容</h2><p>${richText(meeting.content || '未填写')}</p>
  <h2>需要解决的问题</h2>${list(meeting.discuss_issues)}
  <h2>关联任务</h2>${meeting.bound_tasks?.length ? `<ul>${meeting.bound_tasks.map((task) => `<li>${escapeHtml(task.name)}</li>`).join('')}</ul>` : '<p class="empty">无</p>'}
  <h2>遗留问题</h2>${list(meeting.followup_issues)}
  </body></html>`;
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function MeetingView({ list, tasks, onOpenTask, onChanged }) {
  const { dataVersion, toast } = useApp();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function loadMeetings() {
    try {
      const data = await api.get(`/lists/${list.id}/meetings`);
      setMeetings(data.meetings || []);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadMeetings();
  }, [list.id, dataVersion]);

  useEffect(() => {
    if (!editing) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') setEditing(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing]);

  function newMeeting() {
    setEditing({
      id: null,
      list_id: list.id,
      title: '',
      meeting_at: roundToQuarter(),
      participants: '',
      goals: '',
      content: '',
      discuss_issues: [],
      followup_issues: [],
    });
  }

  async function openMeeting(id) {
    try {
      const meeting = await api.get(`/meetings/${id}`);
      setEditing(meeting);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function removeMeeting() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/meetings/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadMeetings();
      toast('会议已删除');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function exportMeeting(meeting, kind) {
    try {
      const detail = meeting.discuss_issues && meeting.followup_issues ? meeting : await api.get(`/meetings/${meeting.id}`);
      if (kind === 'markdown') {
        downloadText(`${sanitizeFilename(detail.title)}.md`, meetingMarkdown(detail, tasks), 'text/markdown;charset=utf-8');
      } else {
        downloadText(
          `${sanitizeFilename(detail.title)}.doc`,
          meetingWordHtml(detail, tasks),
          'application/msword;charset=utf-8'
        );
      }
      toast(`已导出 ${kind === 'markdown' ? 'Markdown' : 'Word'} 文档`);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  const sortedMeetings = useMemo(
    () =>
      [...meetings].sort((a, b) => {
        const aTime = a.meeting_at || a.created_at || '';
        const bTime = b.meeting_at || b.created_at || '';
        return bTime.localeCompare(aTime);
      }),
    [meetings]
  );

  return (
    <div className="meetings-view">
      <div className="meetings-head">
        <div>
          <h2>会议记录</h2>
          <p>记录每场会议的目标、内容、待解决问题和遗留事项，不发起线上会议。</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={newMeeting}>
          <Plus size={15} /> 新建会议
        </button>
      </div>

      {loading ? (
        <div className="meetings-loading"><Spinner size={20} /> 正在加载会议…</div>
      ) : sortedMeetings.length ? (
        <div className="meetings-grid">
          {sortedMeetings.map((meeting) => (
            <article className="meeting-card" key={meeting.id} onClick={() => openMeeting(meeting.id)}>
              <div className="meeting-card-top">
                <span className="meeting-card-icon"><CalendarDays size={16} /></span>
                <div className="meeting-card-title">
                  <h3>{meeting.title}</h3>
                  <span>{formatMeetingTime(meeting.meeting_at)}</span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  title="编辑会议"
                  onClick={(event) => {
                    event.stopPropagation();
                    openMeeting(meeting.id);
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  title="删除会议"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeleteTarget(meeting);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="meeting-card-meta">
                <span><Users size={12} /> {meeting.participants || '未填写与会人'}</span>
                <span><ListTodo size={12} /> {meeting.discuss_count + meeting.followup_count} 个议题</span>
                {meeting.bound_task_count > 0 && <span><Link2 size={12} /> {meeting.bound_task_count} 个关联任务</span>}
              </div>
              {meeting.goals && <p className="meeting-card-goals">{meeting.goals}</p>}
              <div className="meeting-card-foot">
                <span>{meeting.discuss_count} 个待解决 · {meeting.followup_count} 个遗留</span>
                <div className="meeting-card-actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => exportMeeting(meeting, 'markdown')} title="导出 Markdown">
                    <Download size={12} /> Markdown
                  </button>
                  <button type="button" onClick={() => exportMeeting(meeting, 'word')} title="导出 Word">
                    <FileText size={12} /> Word
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarDays size={24} />}
          title="还没有会议记录"
          description="为这个项目创建第一场会议，记录目标、内容和遗留问题。"
          action={<button type="button" className="btn btn-primary" onClick={newMeeting}><Plus size={15} /> 新建会议</button>}
        />
      )}

      {editing && (
        <div className="drawer-layer is-open meeting-drawer-layer">
          <div className="drawer-backdrop" onClick={() => setEditing(null)} />
          <aside className="task-drawer meeting-drawer">
            <div className="drawer-head">
              <div className="drawer-breadcrumb">
                <span className="drawer-list-icon">{list.name?.slice(0, 1)}</span>
                <span className="drawer-list-link">{list.name}</span>
                <span className="drawer-subtask-chip">会议</span>
              </div>
              <div className="drawer-head-actions">
                {editing.id && (
                  <>
                    <IconButton label="导出 Markdown" onClick={() => exportMeeting(editing, 'markdown')}>
                      <Download size={15} />
                    </IconButton>
                    <IconButton label="导出 Word" onClick={() => exportMeeting(editing, 'word')}>
                      <FileText size={15} />
                    </IconButton>
                  </>
                )}
                <IconButton label="关闭" onClick={() => setEditing(null)}>
                  <X size={16} />
                </IconButton>
              </div>
            </div>
            <MeetingEditor
              key={editing.id || 'new'}
              meeting={editing}
              tasks={tasks}
              onOpenTask={onOpenTask}
              onSaved={(saved) => {
                setEditing(saved);
                loadMeetings();
                onChanged?.();
              }}
              onChanged={() => {
                loadMeetings();
                onChanged?.();
              }}
              toast={toast}
            />
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除会议"
        message={`确定删除「${deleteTarget?.title || ''}」吗？会议记录和相关议题会一并删除，已生成的任务不会删除。`}
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeMeeting}
      />
    </div>
  );
}

function MeetingEditor({ meeting, tasks, onOpenTask, onSaved, onChanged, toast }) {
  const [draft, setDraft] = useState(() => ({
    ...meeting,
    meeting_at: timeInputValue(meeting.meeting_at),
    discuss_issues: (meeting.discuss_issues || []).map((issue) => ({ ...issue })),
    followup_issues: (meeting.followup_issues || []).map((issue) => ({ ...issue })),
  }));
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(null);
  const [boundTaskIds, setBoundTaskIds] = useState(
    () => new Set((meeting.bound_tasks || []).map((task) => task.id))
  );

  function updateIssue(kind, index, patch) {
    setDraft((current) => ({
      ...current,
      [kind]: current[kind].map((issue, issueIndex) => (issueIndex === index ? { ...issue, ...patch } : issue)),
    }));
  }

  function addIssue(kind) {
    setDraft((current) => ({
      ...current,
      [kind]: [...current[kind], { id: null, content: '', task_id: null }],
    }));
  }

  function removeIssue(kind, index) {
    setDraft((current) => ({ ...current, [kind]: current[kind].filter((_, issueIndex) => issueIndex !== index) }));
  }

  async function save(event) {
    event?.preventDefault();
    if (!draft.title.trim()) {
      toast('请填写会议标题', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        meeting_at: draft.meeting_at || null,
        participants: draft.participants || '',
        goals: draft.goals || '',
        content: draft.content || '',
        discuss_issues: draft.discuss_issues
          .filter((issue) => issue.content.trim())
          .map((issue) => ({ content: issue.content.trim(), task_id: issue.task_id || null })),
        followup_issues: draft.followup_issues
          .filter((issue) => issue.content.trim())
          .map((issue) => ({ content: issue.content.trim(), task_id: issue.task_id || null })),
        task_ids: [...boundTaskIds],
      };
      const saved = draft.id ? await api.patch(`/meetings/${draft.id}`, payload) : await api.post(`/lists/${meeting.list_id}/meetings`, payload);
      setDraft({
        ...saved,
        meeting_at: timeInputValue(saved.meeting_at),
        discuss_issues: (saved.discuss_issues || []).map((issue) => ({ ...issue })),
        followup_issues: (saved.followup_issues || []).map((issue) => ({ ...issue })),
      });
      setBoundTaskIds(new Set((saved.bound_tasks || []).map((task) => task.id)));
      onSaved(saved);
      toast('会议已保存');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function convertToTask(issue, index) {
    if (!issue.id) {
      toast('请先保存会议，再转为任务', 'error');
      return;
    }
    setConverting(issue.id);
    try {
      const result = await api.post(`/meeting-issues/${issue.id}/create-task`, {});
      setDraft((current) => ({
        ...current,
        followup_issues: result.meeting.followup_issues.map((item) => ({ ...item })),
        discuss_issues: result.meeting.discuss_issues.map((item) => ({ ...item })),
      }));
      setBoundTaskIds(new Set((result.meeting.bound_tasks || []).map((task) => task.id)));
      onChanged?.();
      toast('遗留问题已转为任务');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setConverting(null);
    }
  }

  const taskOptions = useMemo(
    () => [...(tasks || [])].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    [tasks]
  );
  const boundTasks = taskOptions.filter((task) => boundTaskIds.has(task.id));
  const availableTasks = taskOptions.filter((task) => !boundTaskIds.has(task.id));

  function addBoundTask(taskId) {
    setBoundTaskIds((current) => new Set([...current, taskId]));
  }

  function removeBoundTask(taskId) {
    setBoundTaskIds((current) => {
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
  }

  return (
    <form className="meeting-drawer-form" id="meeting-form" onSubmit={save}>
      <div className="drawer-scroll">
        <div className="drawer-title-block meeting-drawer-title-block">
          <textarea
            className="drawer-title meeting-drawer-title"
            rows={1}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder="会议标题"
            autoFocus
          />
          <div className="meeting-drawer-meta">
            <label className="meeting-meta-field">
              <CalendarDays size={13} />
              <span>时间</span>
              <input
                type="datetime-local"
                step={900}
                value={draft.meeting_at || ''}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) {
                    setDraft({ ...draft, meeting_at: value });
                    return;
                  }
                  const date = new Date(value);
                  if (Number.isNaN(date.getTime())) {
                    setDraft({ ...draft, meeting_at: value });
                    return;
                  }
                  date.setMinutes(Math.round(date.getMinutes() / 15) * 15, 0, 0);
                  setDraft({ ...draft, meeting_at: format(date, "yyyy-MM-dd'T'HH:mm") });
                }}
              />
            </label>
            <label className="meeting-meta-field meeting-meta-participants">
              <Users size={13} />
              <span>与会人</span>
              <input
                value={draft.participants || ''}
                onChange={(event) => setDraft({ ...draft, participants: event.target.value })}
                placeholder="用逗号分隔，例如：林晓、陈墨、苏晴"
              />
            </label>
          </div>
        </div>

        <div className="drawer-tabs">
          <button type="button" className="is-active">会议详情</button>
        </div>

        <div className="drawer-body">
          <section className="drawer-section">
            <div className="drawer-section-head">
              <h3><Target size={13} /> 会议目标</h3>
            </div>
            <textarea
              className="meeting-drawer-textarea"
              rows={3}
              value={draft.goals || ''}
              onChange={(event) => setDraft({ ...draft, goals: event.target.value })}
              placeholder="这场会议希望达成什么？"
            />
          </section>

          <section className="drawer-section">
            <div className="drawer-section-head">
              <h3><FileText size={13} /> 需要讲的内容</h3>
            </div>
            <MarkdownEditor
              value={draft.content || ''}
              onChange={(value) => setDraft({ ...draft, content: value })}
              tasks={tasks}
              onOpenTask={onOpenTask}
              placeholder="议程、汇报内容、演示要点…（支持 Markdown 和任务引用）"
              rows={7}
            />
          </section>

          <section className="drawer-section">
            <div className="drawer-section-head">
              <h3><Link2 size={13} /> 需要解决的问题 <span className="section-count">{draft.discuss_issues.length}</span></h3>
              <div className="meeting-issue-actions">
                <Popover
                  width={286}
                  align="right"
                  trigger={
                    <button type="button" className="section-action">
                      <Link2 size={12} /> 绑定现有任务
                    </button>
                  }
                >
                  <div className="menu-label">绑定当前项目中的任务</div>
                  {availableTasks.map((task) => (
                    <MenuItem
                      key={task.id}
                      icon={<span className="status-dot" style={{ background: task.status?.color || '#87909e' }} />}
                      onClick={() => addBoundTask(task.id)}
                    >
                      {task.name}
                    </MenuItem>
                  ))}
                  {!availableTasks.length && <p className="participant-hint">所有任务都已绑定。</p>}
                  <p className="participant-hint">可以绑定多个任务，保存会议后生效。</p>
                </Popover>
                <button type="button" className="section-action" onClick={() => addIssue('discuss_issues')}>
                  <Plus size={12} /> 添加
                </button>
              </div>
            </div>
            <div className="meeting-bound-tasks">
              {boundTasks.map((task) => (
                <div className="meeting-bound-task" key={task.id}>
                  <button type="button" className="meeting-bound-task-name" onClick={() => onOpenTask?.(task.id)}>
                    <span className="status-dot" style={{ background: task.status?.color || '#87909e' }} />
                    {task.name}
                  </button>
                  <button type="button" className="meeting-bound-delete" onClick={() => removeBoundTask(task.id)} title="删除已绑定的任务">
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              ))}
              {!boundTasks.length && <p className="meeting-issue-empty">还没有绑定任务。</p>}
            </div>
            <div className="meeting-drawer-issue-list">
              {draft.discuss_issues.map((issue, index) => (
                <div className="meeting-drawer-issue-row" key={issue.id || `discuss-${index}`}>
                  <span className="meeting-followup-index">{index + 1}</span>
                  <textarea
                    rows={2}
                    className="meeting-issue-input"
                    value={issue.content}
                    onChange={(event) => updateIssue('discuss_issues', index, { content: event.target.value })}
                    placeholder="需要解决的问题…"
                  />
                  <button type="button" className="meeting-delete-text" onClick={() => removeIssue('discuss_issues', index)}>
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              ))}
              {!draft.discuss_issues.length && <p className="meeting-issue-empty">还没有待解决问题。</p>}
            </div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-head">
              <h3><ListTodo size={13} /> 遗留问题 <span className="section-count">{draft.followup_issues.length}</span></h3>
              <button type="button" className="section-action" onClick={() => addIssue('followup_issues')}>
                <Plus size={12} /> 添加
              </button>
            </div>
            <div className="meeting-followup-list">
              {draft.followup_issues.map((issue, index) => (
                <div className="meeting-followup-row" key={issue.id || `followup-${index}`}>
                  <span className="meeting-followup-index">{index + 1}</span>
                  <input
                    className="meeting-list-input"
                    value={issue.content}
                    onChange={(event) => updateIssue('followup_issues', index, { content: event.target.value })}
                    placeholder="尚未解决、需要后续跟进的问题…"
                  />
                  <div className="meeting-followup-actions">
                    {issue.task_name ? (
                      <button type="button" className="meeting-followup-btn" onClick={() => onOpenTask?.(issue.task_id)}>
                        <Link2 size={11} /> 查看任务
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="meeting-followup-btn"
                        disabled={!issue.id || converting === issue.id}
                        onClick={() => convertToTask(issue, index)}
                        title={issue.id ? '将这个问题转为新任务' : '请先保存会议'}
                      >
                        {converting === issue.id ? <Spinner size={12} /> : <ListTodo size={12} />} 转换成任务
                      </button>
                    )}
                    <button type="button" className="meeting-followup-delete" onClick={() => removeIssue('followup_issues', index)}>
                      <Trash2 size={11} /> 删除
                    </button>
                  </div>
                </div>
              ))}
              {!draft.followup_issues.length && <p className="meeting-issue-empty">还没有遗留问题。</p>}
            </div>
          </section>
        </div>
      </div>

      <div className="meeting-drawer-footer">
        <span>保存后可在会议卡片中导出 Markdown 或 Word。</span>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <Spinner size={14} /> : null} 保存会议
        </button>
      </div>
    </form>
  );
}