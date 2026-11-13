import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  Code2,
  Eye,
  FileText,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { relativeTime } from '../lib/date.js';
import { renderMarkdown } from '../lib/markdown.js';
import { Avatar, ConfirmDialog, EmptyState, Spinner } from './ui.jsx';

const TOOLBAR = [
  { icon: Bold, label: '加粗', prefix: '**', suffix: '**', placeholder: '加粗文本' },
  { icon: Italic, label: '斜体', prefix: '*', suffix: '*', placeholder: '斜体文本' },
  { icon: Heading2, label: '标题', prefix: '\n## ', suffix: '', placeholder: '标题' },
  { icon: List, label: '无序列表', prefix: '\n- ', suffix: '', placeholder: '列表项' },
  { icon: ListOrdered, label: '有序列表', prefix: '\n1. ', suffix: '', placeholder: '列表项' },
  { icon: Quote, label: '引用', prefix: '\n> ', suffix: '', placeholder: '引用内容' },
  { icon: Code2, label: '代码', prefix: '\n```\n', suffix: '\n```', placeholder: '代码' },
  { icon: Link2, label: '链接', prefix: '[', suffix: '](https://)', placeholder: '链接文本' },
];

export default function DocPage({ docId }) {
  const { navigate, refresh, toast, openSettings } = useApp();
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('idle');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef(null);
  const initializedRef = useRef(false);
  const docRef = useRef(null);
  docRef.current = doc;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/docs/${docId}`)
      .then((data) => {
        if (cancelled) return;
        setDoc(data);
        setTitle(data.title);
        setContent(data.content || '');
        initializedRef.current = false;
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
  }, [docId, toast]);

  const save = useCallback(
    async (overrides = {}) => {
      if (!docRef.current) return;
      const payload = {
        title: overrides.title ?? title,
        content: overrides.content ?? content,
      };
      setStatus('saving');
      try {
        const updated = await api.patch(`/docs/${docRef.current.id}`, payload);
        setDoc((current) => ({ ...current, ...updated }));
        setStatus('saved');
        await refresh({ withBootstrap: true });
      } catch (error) {
        setStatus('error');
        toast(error.message, 'error');
      }
    },
    [title, content, refresh, toast]
  );

  useEffect(() => {
    if (!docRef.current) return undefined;
    if (!initializedRef.current) {
      initializedRef.current = true;
      return undefined;
    }
    setStatus('unsaved');
    const timer = setTimeout(() => {
      save();
    }, 1100);
    return () => clearTimeout(timer);
  }, [title, content, save]);

  function insertSyntax(item) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end) || item.placeholder;
    const next = `${content.slice(0, start)}${item.prefix}${selected}${item.suffix}${content.slice(end)}`;
    setContent(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorStart = start + item.prefix.length;
      textarea.setSelectionRange(cursorStart, cursorStart + selected.length);
    });
  }

  async function removeDoc() {
    setBusy(true);
    try {
      await api.delete(`/docs/${docRef.current.id}`);
      toast('文档已删除');
      await refresh();
      navigate('/home');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  const wordCount = content.replace(/\s+/g, '').length;
  const body = useMemo(() => {
    const match = content.match(/^#\s+(.+)\n+/);
    if (match && match[1].trim() === title.trim()) return content.slice(match[0].length);
    return content;
  }, [content, title]);
  const rendered = renderMarkdown(body);

  if (loading) {
    return (
      <div className="doc-loading">
        <Spinner size={22} />
        <span>正在打开文档…</span>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="doc-loading">
        <EmptyState
          icon={<FileText size={24} />}
          title="文档不存在"
          description="它可能已经被删除，或你没有访问权限。"
          action={<button type="button" className="btn btn-primary" onClick={() => navigate('/home')}>返回主页</button>}
        />
      </div>
    );
  }

  return (
    <div className="doc-page">
      <div className="doc-toolbar-top">
        <div className="doc-breadcrumb">
          <span>文档</span>
          <span className="doc-breadcrumb-sep">/</span>
          <span className="doc-breadcrumb-current">{doc.title}</span>
        </div>
        <div className="doc-actions">
          <span className={`doc-save-status ${status}`}>
            {status === 'saving' ? '正在保存…' : status === 'saved' ? '已保存' : status === 'unsaved' ? '有未保存的更改' : status === 'error' ? '保存失败' : ''}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing((value) => !value)}>
            {editing ? <Eye size={15} /> : <Pencil size={15} />}
            {editing ? '预览' : '编辑'}
          </button>
          <button type="button" className="icon-btn icon-btn-danger" onClick={() => setDeleteOpen(true)} title="删除文档">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="doc-scroll">
        <article className="doc-canvas">
          <div className="doc-cover">
            <div className="doc-cover-pattern" />
            <span className="doc-cover-icon"><FileText size={22} /></span>
          </div>
          <div className="doc-inner">
            <div className="doc-meta">
              <Avatar user={{ name: doc.author_name, color: doc.author_color }} size={24} />
              <span>{doc.author_name}</span>
              <span className="doc-meta-dot" />
              <span>最近编辑于 {relativeTime(doc.updated_at)}</span>
              <span className="doc-meta-dot" />
              <span>{wordCount} 字</span>
            </div>
            <input
              className="doc-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="无标题文档"
              readOnly={!editing}
              onClick={() => !editing && setEditing(true)}
            />

            {editing ? (
              <div className="doc-editor-split">
                <div className="doc-editor-pane">
                  <div className="doc-editor-toolbar">
                    {TOOLBAR.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button type="button" key={item.label} className="doc-tool-btn" title={item.label} onClick={() => insertSyntax(item)}>
                          <Icon size={15} />
                        </button>
                      );
                    })}
                    <span className="doc-toolbar-hint">Markdown · 输入即预览</span>
                  </div>
                  <textarea
                    ref={textareaRef}
                    className="doc-editor"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="开始写点什么…"
                    spellCheck={false}
                  />
                </div>
                <div
                  className="doc-live-preview markdown-body"
                  dangerouslySetInnerHTML={{
                    __html: rendered || '<p class="doc-empty">输入内容后在这里实时显示。</p>',
                  }}
                />
              </div>
            ) : (
              <div
                className="doc-content markdown-body"
                dangerouslySetInnerHTML={{ __html: rendered || '<p class="doc-empty">这是一篇空白文档。点击上方「编辑」开始撰写。</p>' }}
              />
            )}

            <div className="doc-foot">
              <span>保存在本机 · 自动保存已开启</span>
              <button type="button" className="doc-save-now" onClick={() => save()}>立即保存</button>
            </div>
          </div>
        </article>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="删除文档"
        message={`确定删除「${doc.title}」吗？此操作无法撤销。`}
        busy={busy}
        onClose={() => setDeleteOpen(false)}
        onConfirm={removeDoc}
      />
    </div>
  );
}
