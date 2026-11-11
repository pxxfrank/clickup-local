import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, FileText, List as ListIcon, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { useDebouncedValue } from '../lib/hooks.js';
import { formatDateSmart, dueTone } from '../lib/date.js';
import { flattenLists } from '../lib/tree.js';
import { Avatar, Spinner, StatusDot } from './ui.jsx';

export default function SearchModal({ open, onClose }) {
  const { bootstrap, openTask, navigate } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const debounced = useDebouncedValue(query, 180);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults(null);
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    const term = debounced.trim();
    if (!open) return undefined;
    if (!term) {
      setResults(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get('/search', { q: term, workspaceId: bootstrap?.workspace?.id })
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults({ tasks: [], lists: [], docs: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open, bootstrap?.workspace?.id]);

  const suggestions = useMemo(() => {
    const lists = flattenLists(bootstrap?.spaces || []).slice(0, 5);
    return {
      lists,
      docs: (bootstrap?.docs || []).slice(0, 4),
    };
  }, [bootstrap]);

  const flat = useMemo(() => {
    if (!results) return [];
    const items = [];
    for (const task of results.tasks) items.push({ type: 'task', id: task.id, data: task });
    for (const list of results.lists) items.push({ type: 'list', id: list.id, data: list });
    for (const doc of results.docs) items.push({ type: 'doc', id: doc.id, data: doc });
    return items;
  }, [results]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  function openItem(item) {
    if (!item) return;
    onClose();
    if (item.type === 'task') openTask(item.data.id);
    else if (item.type === 'list') navigate(`/list/${item.data.id}`);
    else navigate(`/doc/${item.data.id}`);
  }

  function onKeyDown(event) {
    if (!flat.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + flat.length) % flat.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openItem(flat[activeIndex]);
    }
  }

  if (!open) return null;
  const hasQuery = query.trim().length > 0;

  return createPortal(
    <div className="search-layer">
      <div className="search-backdrop" onClick={onClose} />
      <div className="search-modal" onKeyDown={onKeyDown}>
        <div className="search-input-row">
          <Search size={19} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索任务、列表或文档…"
            aria-label="搜索"
          />
          {loading && <Spinner size={16} />}
          {query && !loading && (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="清除">
              <X size={14} />
            </button>
          )}
          <kbd>Esc</kbd>
        </div>

        <div className="search-body">
          {!hasQuery ? (
            <div className="search-suggestions">
              <div className="search-section">
                <div className="search-section-label">快速跳转</div>
                {suggestions.lists.map(({ list, space, folder }) => (
                  <button type="button" key={list.id} className="search-row" onClick={() => { onClose(); navigate(`/list/${list.id}`); }}>
                    <span className="search-row-icon list"><span>{list.icon || '📋'}</span></span>
                    <div className="search-row-main">
                      <strong>{list.name}</strong>
                      <span>{space.name}{folder ? ` / ${folder.name}` : ''}</span>
                    </div>
                    <span className="search-row-meta">{list.task_count || 0} 个任务</span>
                    <ArrowRight size={14} className="search-row-arrow" />
                  </button>
                ))}
              </div>
              {suggestions.docs.length > 0 && (
                <div className="search-section">
                  <div className="search-section-label">文档</div>
                  {suggestions.docs.map((doc) => (
                    <button type="button" key={doc.id} className="search-row" onClick={() => { onClose(); navigate(`/doc/${doc.id}`); }}>
                      <span className="search-row-icon doc"><FileText size={15} /></span>
                      <div className="search-row-main">
                        <strong>{doc.title}</strong>
                        <span>{doc.author_name} · {formatDateSmart(doc.updated_at)}</span>
                      </div>
                      <ArrowRight size={14} className="search-row-arrow" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : loading && !results ? (
            <div className="search-loading"><Spinner size={18} /> 正在搜索…</div>
          ) : (
            <>
              {results?.tasks?.length > 0 && (
                <div className="search-section">
                  <div className="search-section-label">任务 <span>{results.tasks.length}</span></div>
                  {results.tasks.map((task) => {
                    const index = flat.findIndex((entry) => entry.type === 'task' && entry.id === task.id);
                    return (
                    <button
                      type="button"
                      key={task.id}
                      className={`search-row ${activeIndex === index ? 'is-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => openItem({ type: 'task', data: task })}
                    >
                      <span className="search-row-icon task">
                        <StatusDot color={task.status?.color} size={9} />
                      </span>
                      <div className="search-row-main">
                        <strong>{task.name}</strong>
                        <span>{task.space_name}{task.folder_name ? ` / ${task.folder_name}` : ''} / {task.list_name}</span>
                      </div>
                      <span className="search-row-status" style={{ color: task.status?.color }}>{task.status?.name}</span>
                      {task.assignee && <Avatar user={task.assignee} size={22} />}
                      {task.due_date && <span className={`search-row-due ${dueTone(task.due_date, task.status?.type)}`}>{formatDateSmart(task.due_date)}</span>}
                    </button>
                    );
                  })}
                </div>
              )}
              {results?.lists?.length > 0 && (
                <div className="search-section">
                  <div className="search-section-label">列表 <span>{results.lists.length}</span></div>
                  {results.lists.map((list) => {
                    const index = flat.findIndex((entry) => entry.type === 'list' && entry.id === list.id);
                    return (
                    <button
                      type="button"
                      key={list.id}
                      className={`search-row ${activeIndex === index ? 'is-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => { onClose(); navigate(`/list/${list.id}`); }}
                    >
                      <span className="search-row-icon list"><span>{list.icon || '📋'}</span></span>
                      <div className="search-row-main">
                        <strong>{list.name}</strong>
                        <span>{list.space_name}{list.folder_name ? ` / ${list.folder_name}` : ''}</span>
                      </div>
                      <ListIcon size={14} />
                    </button>
                    );
                  })}
                </div>
              )}
              {results?.docs?.length > 0 && (
                <div className="search-section">
                  <div className="search-section-label">文档 <span>{results.docs.length}</span></div>
                  {results.docs.map((doc) => {
                    const index = flat.findIndex((entry) => entry.type === 'doc' && entry.id === doc.id);
                    return (
                    <button
                      type="button"
                      key={doc.id}
                      className={`search-row ${activeIndex === index ? 'is-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => { onClose(); navigate(`/doc/${doc.id}`); }}
                    >
                      <span className="search-row-icon doc"><FileText size={15} /></span>
                      <div className="search-row-main">
                        <strong>{doc.title}</strong>
                        <span>{formatDateSmart(doc.updated_at)}</span>
                      </div>
                      <ArrowRight size={14} className="search-row-arrow" />
                    </button>
                    );
                  })}
                </div>
              )}
              {!flat.length && (
                <div className="search-empty">
                  <Search size={22} />
                  <p>没有找到与「{query}」相关的内容</p>
                  <span>试试搜索任务名称、列表名称或文档标题。</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="search-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 浏览</span>
          <span><kbd>Enter</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
          <span className="search-foot-brand">ClickUp 本地版</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
