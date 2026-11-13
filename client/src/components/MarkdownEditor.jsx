import { useEffect, useRef } from 'react';
import TurndownService from 'turndown';
import { Bold, Heading2, Italic, Link2, List, ListOrdered } from 'lucide-react';
import { renderMarkdownWithTasks } from '../lib/markdown.js';
import { MenuItem, Popover } from './ui.jsx';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
});
turndown.addRule('taskReference', {
  filter: (node) => node.nodeType === 1 && node.classList?.contains('task-reference'),
  replacement: (content, node) => `[[task:${node.getAttribute('data-task-id')}]]`,
});

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function MarkdownEditor({
  value,
  onChange,
  tasks = [],
  onOpenTask,
  placeholder = '开始输入，内容会直接呈现…',
  rows = 6,
  className = '',
  showTaskReferences = true,
}) {
  const editorRef = useRef(null);
  const lastValueRef = useRef(value || '');
  const savedRangeRef = useRef(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement === editor) return;
    const html = renderMarkdownWithTasks(value || '', tasks);
    if (editor.innerHTML !== html) editor.innerHTML = html;
    lastValueRef.current = value || '';
  }, [value, tasks]);

  function serialize() {
    if (!editorRef.current) return;
    const markdown = turndown.turndown(editorRef.current.innerHTML || '').trim();
    if (markdown !== lastValueRef.current) {
      lastValueRef.current = markdown;
      onChange(markdown);
    }
  }

  function handleInput() {
    serialize();
  }

  function format(command, argument) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (savedRangeRef.current) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    document.execCommand(command, false, argument);
    savedRangeRef.current = null;
    serialize();
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
  }

  function insertTaskReference(task) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    const range = savedRangeRef.current || (selection.rangeCount ? selection.getRangeAt(0) : null);
    if (range && editor.contains(range.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      const fallback = document.createRange();
      fallback.selectNodeContents(editor);
      fallback.collapse(false);
      selection.removeAllRanges();
      selection.addRange(fallback);
    }
    const span = document.createElement('span');
    span.className = 'task-reference';
    span.contentEditable = 'false';
    span.dataset.taskId = task.id;
    span.innerHTML = `<span class="task-reference-mark">▣</span>${escapeHtml(task.name)}`;
    const activeRange = selection.getRangeAt(0);
    activeRange.deleteContents();
    activeRange.insertNode(span);
    const space = document.createTextNode('\u00a0');
    span.after(space);
    activeRange.setStartAfter(space);
    activeRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(activeRange);
    savedRangeRef.current = null;
    serialize();
  }

  function handleClick(event) {
    const reference = event.target.closest?.('.task-reference');
    if (reference?.dataset.taskId) {
      event.preventDefault();
      onOpenTask?.(reference.dataset.taskId);
    }
  }

  return (
    <div className={`markdown-editor ${className}`}>
      <div className="markdown-editor-toolbar">
        <span>Markdown · 所见即所得</span>
        <div className="markdown-editor-tools">
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => format('bold')} title="加粗">
            <Bold size={13} />
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => format('italic')} title="斜体">
            <Italic size={13} />
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => format('formatBlock', 'h2')} title="标题">
            <Heading2 size={13} />
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => format('insertUnorderedList')} title="无序列表">
            <List size={13} />
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => format('insertOrderedList')} title="有序列表">
            <ListOrdered size={13} />
          </button>
          {showTaskReferences && (
            <Popover
              width={280}
              align="right"
              trigger={
                <button type="button" className="markdown-reference-btn" onMouseDown={rememberSelection}>
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
              <p className="participant-hint">引用会显示为蓝色任务标记，点击可打开任务。</p>
            </Popover>
          )}
        </div>
      </div>
      <div
        ref={editorRef}
        className="markdown-wysiwyg markdown-body"
        style={{ minHeight: Math.max(90, rows * 22) }}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={handleInput}
        onBlur={serialize}
        onClick={handleClick}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
      />
    </div>
  );
}
