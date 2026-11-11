import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Flag, List as ListIcon, Plus, UserRound } from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { flattenLists } from '../lib/tree.js';
import { Avatar, Modal, Spinner } from './ui.jsx';

export default function CreateTaskModal({ defaults, onClose }) {
  const { bootstrap, refresh, navigate, openTask, toast, user } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [listId, setListId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('0');
  const [statuses, setStatuses] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const open = Boolean(defaults);
  const lists = useMemo(() => flattenLists(bootstrap?.spaces || []), [bootstrap]);
  const members = bootstrap?.assignees || bootstrap?.members || [];

  useEffect(() => {
    if (!open) return;
    const fallback = defaults?.list_id || lists[0]?.list.id || '';
    setListId(fallback);
    setStatusId(defaults?.status_id || '');
    setName('');
    setDescription('');
    setDueDate(defaults?.due_date || '');
    setPriority('0');
    setAssigneeId(defaults?.assignee_id || '');
    setShowMore(Boolean(defaults?.due_date));
    setStatuses([]);
  }, [open, defaults, lists]);

  useEffect(() => {
    if (!open || !listId) return undefined;
    let cancelled = false;
    api
      .get(`/lists/${listId}`)
      .then((data) => {
        if (cancelled) return;
        setStatuses(data.statuses || []);
        setStatusId((current) => {
          if (current && data.statuses?.some((status) => status.id === current)) return current;
          if (defaults?.status_id && data.statuses?.some((status) => status.id === defaults.status_id)) return defaults.status_id;
          return data.statuses?.[0]?.id || '';
        });
      })
      .catch(() => {
        if (!cancelled) setStatuses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, listId, defaults?.status_id]);

  const selectedList = lists.find((entry) => entry.list.id === listId);
  const selectedStatus = statuses.find((status) => status.id === statusId);

  async function submit(event) {
    event?.preventDefault();
    if (!name.trim() || !listId) return;
    setBusy(true);
    try {
      const created = await api.post('/tasks', {
        list_id: listId,
        status_id: statusId || statuses[0]?.id,
        name: name.trim(),
        description,
        assignee_id: assigneeId || null,
        due_date: dueDate || null,
        priority: Number(priority),
      });
      toast('任务已创建');
      await refresh();
      navigate(`/list/${listId}`);
      openTask(created.id);
      onClose();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建任务"
      subtitle={selectedList ? `${selectedList.space.name}${selectedList.folder ? ` / ${selectedList.folder.name}` : ''} / ${selectedList.list.name}` : '选择一个列表开始'}
      width={620}
      footer={
        <>
          <span className="create-task-hint">按 <kbd>⌘</kbd> + <kbd>Enter</kbd> 快速创建</span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !name.trim() || !listId}>
            {busy ? <Spinner size={15} /> : <Plus size={15} />} 创建任务
          </button>
        </>
      }
    >
      <form className="create-task-form" onSubmit={submit}>
        {!lists.length ? (
          <div className="create-no-list">
            <p>还没有可用的列表，请先在左侧创建一个空间和列表。</p>
          </div>
        ) : (
          <>
            <textarea
              className="create-task-name"
              autoFocus
              rows={2}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit(event);
              }}
              placeholder="任务名称，例如：完成 v2.4 版本发布检查"
            />
            <div className="create-props">
              <label className="create-prop">
                <span><ListIcon size={14} /> 列表</span>
                <select value={listId} onChange={(event) => setListId(event.target.value)}>
                  {lists.map(({ list, space, folder }) => (
                    <option key={list.id} value={list.id}>
                      {space.name}{folder ? ` / ${folder.name}` : ''} / {list.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
              <label className="create-prop">
                <span><span className="status-dot" style={{ background: selectedStatus?.color || '#87909e' }} /> 状态</span>
                <select value={statusId} onChange={(event) => setStatusId(event.target.value)}>
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>{status.name}</option>
                  ))}
                  {!statuses.length && <option value="">加载中…</option>}
                </select>
                <ChevronDown size={13} />
              </label>
              <label className="create-prop">
                <span>{assigneeId ? <Avatar user={members.find((member) => member.id === assigneeId)} size={15} /> : <UserRound size={14} />} 负责人</span>
                <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                  <option value="">未指派</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}{member.is_external ? '（外部）' : ''}</option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
              <label className="create-prop">
                <span><CalendarDays size={14} /> 截止日期</span>
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
              <label className="create-prop">
                <span><Flag size={14} /> 优先级</span>
                <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                  <option value="0">无优先级</option>
                  <option value="1">紧急</option>
                  <option value="2">高</option>
                  <option value="3">普通</option>
                  <option value="4">低</option>
                </select>
                <ChevronDown size={13} />
              </label>
            </div>

            {showMore ? (
              <div className="create-more">
                <label className="field">
                  <span className="field-label">描述</span>
                  <textarea
                    className="input textarea"
                    rows={4}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="添加背景、验收标准或备注（支持 Markdown）…"
                  />
                </label>
              </div>
            ) : (
              <button type="button" className="create-more-toggle" onClick={() => setShowMore(true)}>
                <Plus size={14} /> 添加描述
              </button>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
