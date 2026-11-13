import { useMemo, useRef } from 'react';
import { Link2 } from 'lucide-react';
import { renderMarkdownWithTasks } from '../lib/markdown.js';
import { MenuItem, Popover } from './ui.jsx';

export default function MarkdownEditor({
  value,
  onChange,
  tasks = [],
  onOpenTask,
  placeholder = '支持 Markdown，输入时实时预览…',
  rows = 6,
  className = '',
  showTaskReferences = true,
}) {
  const textareaRef = useRef(null);
  const rendered = useMemo(() => renderMarkdownWithTasks(value, tasks), [value, tasks]);

  function insertTaskReference(task) {
    const textarea = textareaRef.current;
    const token = `[[task:${task.id}]]`;
    if (!textarea) {
      onChange(`${value || ''}${token}`);
      return;
    }
    const start = textarea.selectionStart ?? (value || '').length;
    const end = textarea.selectionEnd ?? start;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function handlePreviewClick(event) {
    const reference = event.target.closest?.('.task-reference');
    if (reference?.dataset.taskId) onOpenTask?.(reference.dataset.taskId);
  }

  return (
    <div className={`markdown-editor ${className}`}>
      <div className="markdown-editor-input">
        <div className="markdown-editor-toolbar">
          <span>Markdown · 输入即预览</span>
          {showTaskReferences && (
            <Popover
              width={280}
              align="right"
              trigger={
                <button type="button" className="markdown-reference-btn">
                  <Link2 size={12} /> 引用任务
                </button>
              }
            >
              <div className="menu-label">在内容中引用任务</div>
              {tasks.map((task) => (
                <MenuItem key={task.id} onClick={() => insertTaskReference(task)}>
                  <span className="dependency-option">
                    <span className="status-dot" style={{ background: task.status?.color || '#87909e' }} />
                    {task.name}
                  </span>
                </MenuItem>
              ))}
              {!tasks.length && <p className="participant-hint">当前项目还没有可引用的任务。</p>}
              <p className="participant-hint">插入后会显示为蓝色任务标记，点击可打开任务。</p>
            </Popover>
          )}
        </div>
        <textarea
          ref={textareaRef}
          className="markdown-editor-textarea"
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          spellCheck={false}
        />
      </div>
      <div className="markdown-editor-preview">
        <div className="markdown-editor-preview-head">
          <span>预览</span>
        </div>
        <div
          className="markdown-body markdown-editor-rendered"
          dangerouslySetInnerHTML={{
            __html: rendered || '<p class="markdown-empty">输入内容后在这里实时显示。</p>',
          }}
          onClick={handlePreviewClick}
        />
      </div>
    </div>
  );
}
