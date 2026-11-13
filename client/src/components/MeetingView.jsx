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
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { format } from '../lib/date.js';
import { ConfirmDialog, EmptyState, Modal, Spinner } from './ui.jsx';

function formatMeetingTime(value) {
  if (!value) return '未设置时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'yyyy年M月d日 HH:mm');
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

function meetingMarkdown(meeting) {
  const lines = [
    `# ${meeting.title || '未命名会议'}`,
    '',
    `- 会议时间：${formatMeetingTime(meeting.meeting_at)}`,
    `- 与会人：${meeting.participants || '未填写'}`,
    '',
    '## 会议目标',
    '',
    meeting.goals || '未填写',
    '',
    '## 需要讲的内容',
    '',
    meeting.content || '未填写',
    '',
    '## 需要解决的问题',
    '',
  ];
  if (!meeting.discuss_issues?.length) lines.push('无');
  else {
    meeting.discuss_issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue.content}`);
      if (issue.task_name) lines.push(`   - 关联任务：${issue.task_name}`);
    });
  }
  lines.push('', '## 遗留问题', '');
  if (!meeting.followup_issues?.length) lines.push('无');
  else {
    meeting.followup_issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue.content}`);
      if (issue.task_name) lines.push(`   - 已转为任务：${issue.task_name}`);
    });
  }
  return lines.join('\n');
}

function meetingWordHtml(meeting) {
  const list = (items) =>
    items?.length
      ? `<ol>${items
          .map(
            (issue) =>
              `<li>${escapeHtml(issue.content)}${
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
    .empty{color:#999;} ol{padding-left:22pt;}
  </style></head><body>
  <h1>${escapeHtml(meeting.title || '未命名会议')}</h1>
  <div class="meta"><span>时间：${escapeHtml(formatMeetingTime(meeting.meeting_at))}</span><span>与会人：${escapeHtml(meeting.participants || '未填写')}</span></div>
  <h2>会议目标</h2><p>${escapeHtml(meeting.goals || '未填写')}</p>
  <h2>需要讲的内容</h2><p>${escapeHtml(meeting.content || '未填写')}</p>
  <h2>需要解决的问题</h2>${list(meeting.discuss_issues)}
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

  function newMeeting() {
    setEditing({
      id: null,
      list_id: list.id,
      title: '',
      meeting_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
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
        downloadText(`${sanitizeFilename(detail.title)}.md`, meetingMarkdown(detail), 'text/markdown;charset=utf-8');
      } else {
        downloadText(
          `${sanitizeFilename(detail.title)}.doc`,
          meetingWordHtml(detail),
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

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? '编辑会议' : '新建会议'}
        subtitle={editing?.list?.name || list.name}
        width={950}
        className="meeting-editor-modal"
        footer={
          editing ? (
            <>
              {editing.id && (
                <>
                  <button type="button" className="btn btn-ghost" onClick={() => exportMeeting(editing, 'markdown')}>
                    <Download size={14} /> Markdown
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => exportMeeting(editing, 'word')}>
                    <FileText size={14} /> Word
                  </button>
                </>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>关闭</button>
            </>
          ) : null
        }
      >
        {editing && (
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
        )}
      </Modal>

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
      };
      const saved = draft.id ? await api.patch(`/meetings/${draft.id}`, payload) : await api.post(`/lists/${meeting.list_id}/meetings`, payload);
      setDraft({
        ...saved,
        meeting_at: timeInputValue(saved.meeting_at),
        discuss_issues: (saved.discuss_issues || []).map((issue) => ({ ...issue })),
        followup_issues: (saved.followup_issues || []).map((issue) => ({ ...issue })),
      });
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

  return (
    <form className="meeting-form" id="meeting-form" onSubmit={save}>
      <div className="meeting-form-top">
        <label className="field meeting-title-field">
          <span className="field-label">会议标题</span>
          <input
            className="input"
            autoFocus
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder="例如：11 月产品周会"
          />
        </label>
        <label className="field">
          <span className="field-label">会议时间</span>
          <input
            type="datetime-local"
            className="input"
            value={draft.meeting_at || ''}
            onChange={(event) => setDraft({ ...draft, meeting_at: event.target.value })}
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label"><Users size={12} /> 与会人</span>
        <input
          className="input"
          value={draft.participants || ''}
          onChange={(event) => setDraft({ ...draft, participants: event.target.value })}
          placeholder="用逗号分隔，例如：林晓、陈墨、苏晴"
        />
      </label>
      <div className="meeting-form-grid">
        <label className="field">
          <span className="field-label"><Target size={12} /> 会议目标</span>
          <textarea
            className="input meeting-textarea"
            rows={4}
            value={draft.goals || ''}
            onChange={(event) => setDraft({ ...draft, goals: event.target.value })}
            placeholder="这场会议希望达成什么？"
          />
        </label>
        <label className="field">
          <span className="field-label"><FileText size={12} /> 需要讲的内容</span>
          <textarea
            className="input meeting-textarea"
            rows={4}
            value={draft.content || ''}
            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            placeholder="议程、汇报内容、演示要点…"
          />
        </label>
      </div>

      <div className="meeting-issues-grid">
        <section className="meeting-issue-box">
          <div className="meeting-issue-head">
            <h3><Link2 size={13} /> 需要解决的问题 <span>{draft.discuss_issues.length}</span></h3>
            <button type="button" className="section-action" onClick={() => addIssue('discuss_issues')}>
              <Plus size={12} /> 添加
            </button>
          </div>
          <p className="meeting-issue-hint">每个问题可以绑定当前项目中的一个任务。</p>
          {draft.discuss_issues.map((issue, index) => (
            <div className="meeting-issue-row" key={issue.id || `discuss-${index}`}>
              <textarea
                rows={2}
                className="meeting-issue-input"
                value={issue.content}
                onChange={(event) => updateIssue('discuss_issues', index, { content: event.target.value })}
                placeholder="需要解决的问题…"
              />
              <div className="meeting-issue-controls">
                <select
                  className="mini-select meeting-task-select"
                  value={issue.task_id || ''}
                  onChange={(event) => updateIssue('discuss_issues', index, { task_id: event.target.value || null })}
                >
                  <option value="">不绑定任务</option>
                  {taskOptions.map((task) => (
                    <option key={task.id} value={task.id}>{task.name}</option>
                  ))}
                </select>
                {issue.task_name && (
                  <button type="button" className="meeting-linked-task" onClick={() => onOpenTask?.(issue.task_id)}>
                    {issue.task_name}
                  </button>
                )}
                <button type="button" className="icon-btn icon-btn-danger" onClick={() => removeIssue('discuss_issues', index)} title="删除问题">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {!draft.discuss_issues.length && <p className="meeting-issue-empty">还没有待解决问题。</p>}
        </section>

        <section className="meeting-issue-box">
          <div className="meeting-issue-head">
            <h3><ListTodo size={13} /> 遗留问题 <span>{draft.followup_issues.length}</span></h3>
            <button type="button" className="section-action" onClick={() => addIssue('followup_issues')}>
              <Plus size={12} /> 添加
            </button>
          </div>
          <p className="meeting-issue-hint">遗留问题可以一键转为当前项目的新任务。</p>
          {draft.followup_issues.map((issue, index) => (
            <div className="meeting-issue-row" key={issue.id || `followup-${index}`}>
              <textarea
                rows={2}
                className="meeting-issue-input"
                value={issue.content}
                onChange={(event) => updateIssue('followup_issues', index, { content: event.target.value })}
                placeholder="尚未解决、需要后续跟进的问题…"
              />
              <div className="meeting-issue-controls">
                {issue.task_name ? (
                  <button type="button" className="meeting-linked-task" onClick={() => onOpenTask?.(issue.task_id)}>
                    <Link2 size={11} /> {issue.task_name}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm meeting-convert-btn"
                    disabled={!issue.id || converting === issue.id}
                    onClick={() => convertToTask(issue, index)}
                    title={issue.id ? '将这个问题转为新任务' : '请先保存会议'}
                  >
                    {converting === issue.id ? <Spinner size={12} /> : <ListTodo size={12} />} 转为任务
                  </button>
                )}
                <button type="button" className="icon-btn icon-btn-danger" onClick={() => removeIssue('followup_issues', index)} title="删除问题">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {!draft.followup_issues.length && <p className="meeting-issue-empty">还没有遗留问题。</p>}
        </section>
      </div>

      <div className="meeting-form-foot">
        <span>保存后可在会议卡片中导出 Markdown 或 Word。</span>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <Spinner size={14} /> : null} 保存会议
        </button>
      </div>
    </form>
  );
}
