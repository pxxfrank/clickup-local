import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function renderMarkdown(text) {
  if (!text) return '';
  const html = marked.parse(String(text));
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function taskReferenceName(taskId, tasks = []) {
  return tasks.find((task) => task.id === taskId)?.name || '未知任务';
}

export function renderMarkdownWithTasks(text, tasks = []) {
  const withReferences = String(text || '').replace(/\[\[task:([^\]]+)\]\]/g, (match, taskId) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return match;
    return `<span class="task-reference" data-task-id="${escapeHtml(task.id)}"><span class="task-reference-mark">▣</span>${escapeHtml(task.name)}</span>`;
  });
  return renderMarkdown(withReferences);
}

export function taskReferenceText(text, tasks = []) {
  return String(text || '').replace(/\[\[task:([^\]]+)\]\]/g, (match, taskId) => {
    const task = tasks.find((item) => item.id === taskId);
    return task ? `【任务：${task.name}】` : match;
  });
}

export function taskReferenceHtml(text, tasks = []) {
  return String(text || '').replace(/\[\[task:([^\]]+)\]\]/g, (match, taskId) => {
    const task = tasks.find((item) => item.id === taskId);
    return task ? `<span class="task-reference-inline">▣ ${escapeHtml(task.name)}</span>` : match;
  });
}
