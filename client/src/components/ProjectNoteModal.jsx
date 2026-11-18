import { useEffect, useMemo, useState } from 'react';
import { Pin } from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { format } from '../lib/date.js';
import { Modal, Spinner } from './ui.jsx';
import MarkdownEditor from './MarkdownEditor.jsx';
import Select from './Select.jsx';
import DateField from './DateField.jsx';

const KINDS = [
  { value: 'note', label: '记录' },
  { value: 'decision', label: '决策' },
  { value: 'risk', label: '风险' },
  { value: 'stage', label: '阶段总结' },
  { value: 'retro', label: '复盘' },
  { value: 'meeting', label: '会议结论' },
  { value: 'change', label: '变更' },
];

export default function ProjectNoteModal({ open, onClose, listId, tasks = [], defaultTask = null, onSaved }) {
  const { toast } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('note');
  const [occurredAt, setOccurredAt] = useState('');
  const [pinned, setPinned] = useState(false);
  const [taskIds, setTaskIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const taskOptions = useMemo(() => {
    const result = [...tasks];
    if (defaultTask && !result.some((task) => task.id === defaultTask.id)) result.unshift(defaultTask);
    return result;
  }, [tasks, defaultTask]);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTask ? `任务完成：${defaultTask.name}` : '');
    setBody(defaultTask?.description || '');
    setKind('note');
    setOccurredAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setPinned(false);
    setTaskIds(defaultTask ? [defaultTask.id] : []);
  }, [open, defaultTask?.id, defaultTask?.name, defaultTask?.description]);

  function toggleTask(taskId) {
    setTaskIds((current) => (
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    ));
  }

  async function save(event) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await api.post(`/lists/${listId}/journal`, {
        title: title.trim(),
        body,
        kind,
        occurred_at: occurredAt || undefined,
        pinned,
        task_ids: taskIds,
      });
      onSaved?.();
      onClose();
      toast('已沉淀到项目记录');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={defaultTask ? '沉淀任务记录' : '写项目记录'}
      subtitle={defaultTask ? `把「${defaultTask.name}」的完成情况沉淀到项目记录` : '记录项目决策、背景或复盘结论'}
      width={760}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" form="project-note-form" className="btn btn-primary" disabled={saving || !title.trim()}>
            {saving ? <Spinner size={14} /> : null} 保存记录
          </button>
        </>
      }
    >
      <form id="project-note-form" className="stack" onSubmit={save}>
        <div className="form-grid-2">
          <label className="field">
            <span className="field-label">记录标题</span>
            <input
              className="input"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：本周发布决策"
            />
          </label>
          <label className="field">
            <span className="field-label">记录类型</span>
            <Select className="input" value={kind} onChange={setKind} options={KINDS} menuWidth={220} />
          </label>
        </div>
        <div className="journal-note-meta-row">
          <label className="field">
            <span className="field-label">发生时间</span>
            <DateField
              className="input"
              type="datetime-local"
              value={occurredAt}
              onChange={setOccurredAt}
              placeholder="选择发生时间"
              ariaLabel="发生时间"
            />
          </label>
          <label className="journal-pin-toggle">
            <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
            <Pin size={12} /> 置顶这条记录
          </label>
        </div>
        <div className="field">
          <span className="field-label">关联任务（可选）</span>
          <div className="journal-task-picker">
            {taskOptions.map((task) => (
              <label className={`journal-task-option ${taskIds.includes(task.id) ? 'is-checked' : ''}`} key={task.id}>
                <input type="checkbox" checked={taskIds.includes(task.id)} onChange={() => toggleTask(task.id)} />
                <span className="status-dot" style={{ background: task.status?.color || '#87909e' }} />
                {task.name}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">记录内容</span>
          <MarkdownEditor value={body} onChange={setBody} tasks={taskOptions} rows={7} placeholder="记录本次完成情况、结论或遗留问题…" />
        </div>
      </form>
    </Modal>
  );
}
