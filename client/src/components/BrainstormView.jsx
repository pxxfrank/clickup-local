import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Lightbulb, ListTodo, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { Spinner } from './ui.jsx';

export default function BrainstormView({ listId, listName, statuses = [], onCommitted }) {
  const { toast } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const inputRef = useRef(null);
  const targetStatus = statuses.find((status) => status.type === 'open') || statuses[0];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/lists/${listId}/brainstorm`)
      .then((data) => {
        if (!cancelled) setItems(data.items || []);
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

  async function addIdea(event) {
    event?.preventDefault();
    const name = input.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const item = await api.post(`/lists/${listId}/brainstorm`, { name });
      setItems((current) => [...current, item]);
      setInput('');
      inputRef.current?.focus();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setAdding(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditDraft(item.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft('');
  }

  async function saveIdeaName(item) {
    const name = editDraft.trim();
    if (!name || name === item.name) {
      cancelEdit();
      return;
    }
    try {
      const updated = await api.patch(`/brainstorm/${item.id}`, { name });
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, ...updated } : entry)));
      cancelEdit();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function removeIdea(item) {
    try {
      await api.delete(`/brainstorm/${item.id}`);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function commitAll() {
    if (!items.length || committing) return;
    setCommitting(true);
    try {
      const result = await api.post(`/lists/${listId}/brainstorm/commit`, {});
      toast(`${result.created} 个想法已送入「${result.status?.name || '待处理'}」`);
      setItems([]);
      await onCommitted?.();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="brainstorm-page">
      <section className="brainstorm-hero">
        <div className="brainstorm-hero-icon"><Lightbulb size={25} /></div>
        <div className="brainstorm-hero-text">
          <span className="eyebrow-plain">BRAINSTORM</span>
          <h2>先把想法倒出来，再统一整理</h2>
          <p>想到什么就写什么，不用担心状态、负责人或截止时间。完成后一键送入「{targetStatus?.name || '待处理'}」。</p>
        </div>
        <div className="brainstorm-hero-target">
          <span>统一送入</span>
          <strong>
            <span className="status-dot" style={{ background: targetStatus?.color || '#87909e' }} />
            {targetStatus?.name || '待处理'}
          </strong>
        </div>
      </section>

      <div className="brainstorm-layout">
        <section className="brainstorm-capture panel">
          <div className="brainstorm-capture-head">
            <div>
              <h3>想法收集箱</h3>
              <p>{listName} · {items.length} 个想法待整理</p>
            </div>
            <Sparkles size={17} />
          </div>

          <form className="brainstorm-composer" onSubmit={addIdea}>
            <span className="brainstorm-plus"><Plus size={18} /></span>
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="想到什么？直接输入，按 Enter 添加…"
              maxLength={240}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!input.trim() || adding}>
              {adding ? <Spinner size={14} /> : <Plus size={14} />} 添加
            </button>
          </form>
          <p className="brainstorm-hint">可以连续添加多条，最后统一送到待处理，不会打断当前思路。</p>

          {loading ? (
            <div className="brainstorm-loading"><Spinner size={18} /> 正在读取想法…</div>
          ) : items.length ? (
            <div className="brainstorm-list">
              {items.map((item, index) => (
                <div className="brainstorm-item" key={item.id}>
                  <span className="brainstorm-index">{String(index + 1).padStart(2, '0')}</span>
                  {editingId === item.id ? (
                    <input
                      className="brainstorm-item-input"
                      autoFocus
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      onBlur={() => saveIdeaName(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          saveIdeaName(item);
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelEdit();
                        }
                      }}
                    />
                  ) : (
                    <span className="brainstorm-item-name" onDoubleClick={() => startEdit(item)} title="双击直接编辑">
                      {item.name}
                    </span>
                  )}
                  <button type="button" className="brainstorm-edit" onClick={() => startEdit(item)} title="直接编辑想法">
                    <Pencil size={12} />
                  </button>
                  <button type="button" className="brainstorm-delete" onClick={() => removeIdea(item)} title="删除想法">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="brainstorm-empty">
              <div className="brainstorm-empty-icon"><Lightbulb size={25} /></div>
              <h4>头脑风暴区是空的</h4>
              <p>把零散的想法先放在这里。等思路完整后，再统一变成可执行任务。</p>
            </div>
          )}
        </section>

        <aside className="brainstorm-side">
          <section className="brainstorm-summary">
            <span className="brainstorm-summary-label">待整理</span>
            <strong>{items.length}</strong>
            <span>个想法</span>
            <button
              type="button"
              className="btn btn-primary brainstorm-commit"
              onClick={commitAll}
              disabled={!items.length || committing}
            >
              {committing ? <Spinner size={16} /> : <ListTodo size={16} />}
              全部送到「{targetStatus?.name || '待处理'}」
              {!committing && <ArrowRight size={15} />}
            </button>
            <p>送入后会创建为普通任务，并保留在「{targetStatus?.name || '待处理'}」状态下。</p>
          </section>
          <section className="brainstorm-tips">
            <h4>使用建议</h4>
            <ol>
              <li>先记录，不评判，不急着拆分。</li>
              <li>一次专注一个主题，连续写完再整理。</li>
              <li>送入待处理后，再补充负责人和日期。</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
