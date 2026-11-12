import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  Circle,
  Clock,
  Copy,
  FileText,
  GitBranch,
  Link2,
  ListPlus,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Repeat,
  Send,
  Tag as TagIcon,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../lib/api.js';
import { formatDate, formatDateSmart, formatBytes, formatDateTime, parseDateValue } from '../lib/date.js';
import { renderMarkdown } from '../lib/markdown.js';
import DependencyGraphModal from './DependencyGraphModal.jsx';
import {
  Avatar,
  ConfirmDialog,
  IconButton,
  MenuDivider,
  MenuItem,
  Popover,
  PriorityFlag,
  ProgressBar,
  Spinner,
  TagChip,
} from './ui.jsx';
import { addDays, format } from 'date-fns';

const PRIORITY_LABELS = { 1: '紧急', 2: '高', 3: '普通', 4: '低', 0: '无优先级' };

function quickDate(offset) {
  return format(addDays(new Date(), offset), 'yyyy-MM-dd');
}

export default function TaskDrawer({ taskId, onClose, onOpenTask }) {
  const { bootstrap, refresh, toast, user } = useApp();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('detail');
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [progressSort, setProgressSort] = useState('desc');
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newChecklistOpen, setNewChecklistOpen] = useState(false);
  const [newChecklistName, setNewChecklistName] = useState('');
  const [itemDrafts, setItemDrafts] = useState({});
  const [editingChecklistId, setEditingChecklistId] = useState(null);
  const [checklistTitleDraft, setChecklistTitleDraft] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [checklistItemDraft, setChecklistItemDraft] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [contactDraft, setContactDraft] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [dependencyTasks, setDependencyTasks] = useState([]);
  const [dependencyGraphOpen, setDependencyGraphOpen] = useState(false);
  const fileInputRef = useRef(null);
  const titleRef = useRef(null);
  const commentsEndRef = useRef(null);
  const commentsListRef = useRef(null);

  const assignablePeople = bootstrap?.assignees || bootstrap?.members || [];
  const workspaceTags = bootstrap?.tags || [];
  useEffect(() => {
    if (!detail?.list?.id) {
      setDependencyTasks([]);
      return undefined;
    }
    let cancelled = false;
    api
      .get(`/lists/${detail.list.id}`)
      .then((data) => {
        if (!cancelled) setDependencyTasks((data.tasks || []).filter((task) => task.id !== detail.id));
      })
      .catch(() => {
        if (!cancelled) setDependencyTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.list?.id, detail?.id]);

  const progressEntries = useMemo(
    () =>
      [...(detail?.comments || [])].sort((a, b) =>
        progressSort === 'asc'
          ? String(a.created_at).localeCompare(String(b.created_at))
          : String(b.created_at).localeCompare(String(a.created_at))
      ),
    [detail?.comments, progressSort]
  );

  useEffect(() => {
    if (!taskId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setLoading(true);
    setError('');
    setTab('detail');
    setEditingDescription(false);
    setContactDraft('');
    api
      .get(`/tasks/${taskId}`)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setTitleDraft(data.name);
        setDescriptionDraft(data.description || '');
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !deleteOpen) onClose();
    }
    if (taskId) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [taskId, onClose, deleteOpen]);

  useEffect(() => {
    if (!taskId) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [taskId]);

  useEffect(() => {
    if (tab === 'activity') return;
    const timer = requestAnimationFrame(() => {
      const node = titleRef.current;
      if (!node) return;
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
    });
    return () => cancelAnimationFrame(timer);
  }, [titleDraft, detail?.id, tab]);

  const renderedDescription = useMemo(() => renderMarkdown(detail?.description || ''), [detail?.description]);

  async function patchTask(patch, options = {}) {
    if (!detail) return null;
    try {
      const updated = await api.patch(`/tasks/${detail.id}`, patch);
      setDetail(updated);
      setTitleDraft(updated.name);
      if (!options.keepDescription) setDescriptionDraft(updated.description || '');
      await refresh();
      return updated;
    } catch (requestError) {
      toast(requestError.message, 'error');
      return null;
    }
  }

  async function reload() {
    if (!detail) return;
    try {
      const updated = await api.get(`/tasks/${detail.id}`);
      setDetail(updated);
      setTitleDraft(updated.name);
    } catch {
      // Ignore transient reload failures.
    }
  }

  async function saveTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(detail.name);
      return;
    }
    if (trimmed !== detail.name) await patchTask({ name: trimmed });
  }

  async function saveDescription() {
    const updated = await patchTask({ description: descriptionDraft }, { keepDescription: true });
    if (updated) {
      setEditingDescription(false);
      toast('描述已保存');
    }
  }

  async function addSubtask(event) {
    event?.preventDefault();
    const name = subtaskDraft.trim();
    if (!name) return;
    try {
      await api.post('/tasks', {
        list_id: detail.list_id,
        parent_id: detail.id,
        name,
        status_id: detail.statuses?.[0]?.id,
        assignee_id: detail.assignee_id,
      });
      setSubtaskDraft('');
      setAddingSubtask(false);
      await reload();
      await refresh();
      toast('子任务已创建');
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  async function toggleSubtask(subtask) {
    const completed = subtask.status?.type === 'done' || subtask.status?.type === 'closed';
    const statuses = detail.statuses || [];
    const next = completed
      ? statuses.find((status) => status.type === 'open') || statuses.find((status) => status.type === 'active')
      : statuses.find((status) => status.type === 'done');
    if (!next) {
      toast('当前列表缺少可用的完成状态', 'error');
      return;
    }
    try {
      await api.patch(`/tasks/${subtask.id}`, { status_id: next.id });
      await reload();
      await refresh();
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  async function addComment(event) {
    event?.preventDefault();
    const body = commentDraft.trim();
    if (!body || sendingComment) return;
    setSendingComment(true);
    try {
      const comment = await api.post(`/tasks/${detail.id}/comments`, { body });
      setDetail((current) => ({ ...current, comments: [...(current.comments || []), comment] }));
      setCommentDraft('');
      await refresh();
      setTimeout(() => {
        if (progressSort === 'desc' && commentsListRef.current) commentsListRef.current.scrollTop = 0;
        else commentsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 40);
    } catch (requestError) {
      toast(requestError.message, 'error');
    } finally {
      setSendingComment(false);
    }
  }

  async function removeComment(comment) {
    try {
      await api.delete(`/comments/${comment.id}`);
      setDetail((current) => ({ ...current, comments: current.comments.filter((item) => item.id !== comment.id) }));
      await refresh();
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  async function addChecklist(event) {
    event.preventDefault();
    const name = newChecklistName.trim();
    if (!name) return;
    try {
      await api.post(`/tasks/${detail.id}/checklists`, { name });
      setNewChecklistName('');
      setNewChecklistOpen(false);
      await reload();
      await refresh();
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  function beginChecklistRename(checklist) {
    setEditingChecklistId(checklist.id);
    setChecklistTitleDraft(checklist.name);
  }

  async function saveChecklistRename(checklist) {
    const name = checklistTitleDraft.trim();
    setEditingChecklistId(null);
    if (!name || name === checklist.name) return;
    try {
      await api.patch(`/checklists/${checklist.id}`, { name });
      await reload();
      toast('清单名称已更新');
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  function beginChecklistItemEdit(item) {
    setEditingItemId(item.id);
    setChecklistItemDraft(item.name);
  }

  async function saveChecklistItemName(item) {
    const name = checklistItemDraft.trim();
    setEditingItemId(null);
    if (!name || name === item.name) return;
    try {
      await api.patch(`/checklist-items/${item.id}`, { name });
      await reload();
      toast('检查项已更新');
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  async function addChecklistItem(checklist) {
    const name = (itemDrafts[checklist.id] || '').trim();
    if (!name) return;
    try {
      await api.post(`/checklists/${checklist.id}/items`, { name });
      setItemDrafts((current) => ({ ...current, [checklist.id]: '' }));
      await reload();
      await refresh();
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  async function toggleChecklistItem(checklistId, item) {
    try {
      await api.patch(`/checklist-items/${item.id}`, { done: !item.done });
      await reload();
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  async function removeChecklistItem(checklistId, item) {
    try {
      await api.delete(`/checklist-items/${item.id}`);
      await reload();
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  async function removeChecklist(checklist) {
    try {
      await api.delete(`/checklists/${checklist.id}`);
      await reload();
      await refresh();
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !detail) return;
    if (file.size > 20 * 1024 * 1024) {
      toast('附件不能超过 20MB', 'error');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(',')[1];
      await api.post(`/tasks/${detail.id}/attachments`, {
        name: file.name,
        mime: file.type || 'application/octet-stream',
        data: base64,
      });
      await reload();
      await refresh();
      toast('附件已上传');
    } catch (requestError) {
      toast(requestError.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachment) {
    try {
      await api.delete(`/attachments/${attachment.id}`);
      setDetail((current) => ({
        ...current,
        attachments: current.attachments.filter((item) => item.id !== attachment.id),
      }));
      toast('附件已删除');
    } catch (requestError) {
      toast(requestError.message, 'error');
    }
  }

  async function deleteTask() {
    setBusy(true);
    try {
      await api.delete(`/tasks/${detail.id}`);
      toast('任务已删除');
      setDeleteOpen(false);
      onClose();
      await refresh();
    } catch (requestError) {
      toast(requestError.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggleParticipant(personId) {
    if (!detail) return;
    const current = new Set((detail.participants || []).map((participant) => participant.id));
    if (current.has(personId)) current.delete(personId);
    else current.add(personId);
    await patchTask({ participant_ids: [...current] });
  }

  async function toggleDependency(dependencyId) {
    if (!detail) return null;
    const current = new Set((detail.dependencies || []).map((dependency) => dependency.id));
    if (current.has(dependencyId)) current.delete(dependencyId);
    else current.add(dependencyId);
    return patchTask({ dependency_ids: [...current] });
  }

  async function addExternalAssignee(name, close) {
    const trimmed = String(name || '').trim();
    if (!trimmed || !detail) return;
    setAddingContact(true);
    try {
      const contact = await api.post(`/workspaces/${detail.list.workspace_id}/contacts`, { name: trimmed });
      const updated = await api.patch(`/tasks/${detail.id}`, { assignee_id: contact.id });
      setDetail(updated);
      setContactDraft('');
      await refresh();
      toast(`已指派给外部责任人「${contact.name}」`);
      close?.();
    } catch (requestError) {
      toast(requestError.message, 'error');
    } finally {
      setAddingContact(false);
    }
  }

  async function copyTaskLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/#/list/${detail.list_id}?task=${detail.id}`);
      toast('任务链接已复制');
    } catch {
      toast('复制失败', 'error');
    }
  }

  function toggleTag(tag) {
    const active = detail.tags?.some((item) => item.id === tag.id);
    const nextIds = active
      ? detail.tags.filter((item) => item.id !== tag.id).map((item) => item.id)
      : [...(detail.tags || []).map((item) => item.id), tag.id];
    patchTask({ tag_ids: nextIds });
  }

  const subtaskDone = detail?.subtasks?.filter((sub) => ['done', 'closed'].includes(sub.status?.type)).length || 0;
  const allChecklistItems = detail?.checklists?.flatMap((checklist) => checklist.items) || [];
  const checklistDone = allChecklistItems.filter((item) => item.done).length;

  if (!taskId) return null;

  return (
    <>
      <div className={`drawer-layer ${taskId ? 'is-open' : ''}`}>
        <div className="drawer-backdrop" onClick={onClose} />
        <aside className="task-drawer">
          {loading && !detail ? (
            <div className="drawer-loading">
              <Spinner size={22} />
              <span>正在加载任务…</span>
            </div>
          ) : error ? (
            <div className="drawer-loading">
              <p>{error}</p>
              <button type="button" className="btn btn-ghost" onClick={onClose}>关闭</button>
            </div>
          ) : detail ? (
            <>
              <div className="drawer-head">
                <div className="drawer-breadcrumb">
                  {detail.parent && (
                    <button type="button" className="drawer-parent" onClick={() => onOpenTask(detail.parent.id)}>
                      <ArrowLeft size={13} /> 父任务
                    </button>
                  )}
                  <button type="button" className="drawer-list-link" onClick={() => { onClose(); window.location.hash = `/list/${detail.list_id}`; }}>
                    <span className="drawer-list-icon">{detail.list?.name?.slice(0, 1)}</span>
                    {detail.list?.name}
                  </button>
                  {detail.parent && <span className="drawer-subtask-chip">子任务</span>}
                </div>
                <div className="drawer-head-actions">
                  <IconButton label="复制链接" onClick={copyTaskLink}><Link2 size={16} /></IconButton>
                  <Popover
                    width={220}
                    align="right"
                    trigger={
                      <button type="button" className="icon-btn" aria-label="更多操作">
                        <MoreHorizontal size={17} />
                      </button>
                    }
                  >
                    {({ close }) => (
                      <>
                        <MenuItem icon={<ListPlus size={15} />} onClick={() => { close(); setAddingSubtask(true); }}>
                          添加子任务
                        </MenuItem>
                        <MenuItem icon={<Copy size={15} />} onClick={() => { close(); copyTaskLink(); }}>
                          复制任务链接
                        </MenuItem>
                        <MenuDivider />
                        <MenuItem danger icon={<Trash2 size={15} />} onClick={() => { close(); setDeleteOpen(true); }}>
                          删除任务
                        </MenuItem>
                      </>
                    )}
                  </Popover>
                  <IconButton label="关闭" onClick={onClose}><X size={18} /></IconButton>
                </div>
              </div>

              <div className="drawer-scroll">
                <div className="drawer-title-block">
                  <textarea
                    ref={titleRef}
                    className="drawer-title"
                    rows={1}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.target.blur();
                      }
                      if (event.key === 'Escape') {
                        setTitleDraft(detail.name);
                        event.target.blur();
                      }
                    }}
                  />
                  <div className="drawer-quick-props">
                    <Popover
                      width={210}
                      trigger={
                        <button type="button" className="quick-pill quick-status" style={{ '--status-color': detail.status?.color }}>
                          <span className="status-dot" style={{ background: detail.status?.color }} />
                          {detail.status?.name}
                          <ChevronDown size={13} />
                        </button>
                      }
                    >
                      {({ close }) => (
                        <>
                          <div className="menu-label">状态</div>
                          {(detail.statuses || []).map((status) => (
                            <MenuItem
                              key={status.id}
                              active={status.id === detail.status_id}
                              icon={<span className="status-dot" style={{ background: status.color }} />}
                              onClick={() => { patchTask({ status_id: status.id }); close(); }}
                            >
                              {status.name}
                            </MenuItem>
                          ))}
                        </>
                      )}
                    </Popover>

                    <Popover
                      width={250}
                      trigger={
                        <button type="button" className={`quick-pill ${detail.assignee ? '' : 'is-empty'}`}>
                          {detail.assignee ? <Avatar user={detail.assignee} size={19} /> : <UserRound size={15} />}
                          {detail.assignee?.name || '负责人'}
                          <ChevronDown size={13} />
                        </button>
                      }
                    >
                      {({ close }) => (
                        <>
                          <div className="menu-label">负责人</div>
                          <MenuItem
                            active={!detail.assignee_id}
                            onClick={() => { patchTask({ assignee_id: null }); close(); }}
                          >
                            未指派
                          </MenuItem>
                          {assignablePeople.map((member) => (
                            <MenuItem
                              key={member.id}
                              active={member.id === detail.assignee_id}
                              icon={<Avatar user={member} size={22} />}
                              onClick={() => { patchTask({ assignee_id: member.id }); close(); }}
                            >
                              <span className="person-menu-label">
                                {member.name}
                                {member.is_external && <em className="external-badge">外部</em>}
                              </span>
                            </MenuItem>
                          ))}
                          <MenuDivider />
                          <form
                            className="assignee-add-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              addExternalAssignee(contactDraft, close);
                            }}
                          >
                            <UserPlus size={14} />
                            <input
                              value={contactDraft}
                              onChange={(event) => setContactDraft(event.target.value)}
                              placeholder="输入姓名，添加外部责任人"
                              disabled={addingContact}
                            />
                            <button type="submit" className="btn btn-primary btn-xs" disabled={addingContact || !contactDraft.trim()}>
                              {addingContact ? <Spinner size={12} /> : '添加'}
                            </button>
                          </form>
                          <p className="assignee-add-hint">外部责任人无需加入工作空间，添加后会保留在指派列表中。</p>
                        </>
                      )}
                    </Popover>

                    <Popover
                      width={268}
                      trigger={
                        <button type="button" className={`quick-pill ${detail.participants?.length ? '' : 'is-empty'}`}>
                          {detail.participants?.length ? (
                            <span className="participant-mini-stack">
                              {detail.participants.slice(0, 3).map((participant) => (
                                <Avatar key={participant.id} user={participant} size={18} />
                              ))}
                            </span>
                          ) : (
                            <UsersRound size={15} />
                          )}
                          {detail.participants?.length ? `${detail.participants.length} 位参与人` : '参与人'}
                          <ChevronDown size={13} />
                        </button>
                      }
                    >
                      <div className="menu-label">参与人（可多选）</div>
                      {assignablePeople.map((person) => {
                        const active = detail.participants?.some((participant) => participant.id === person.id);
                        return (
                          <MenuItem
                            key={person.id}
                            active={active}
                            icon={<Avatar user={person} size={22} />}
                            onClick={() => toggleParticipant(person.id)}
                          >
                            <span className="person-menu-label">
                              {person.name}
                              {person.is_external && <em className="external-badge">外部</em>}
                            </span>
                          </MenuItem>
                        );
                      })}
                      {detail.participants?.length > 0 && (
                        <>
                          <MenuDivider />
                          <MenuItem onClick={() => patchTask({ participant_ids: [] })}>清除参与人</MenuItem>
                        </>
                      )}
                      <p className="participant-hint">参与人会收到任务上下文，但负责人仍然只有一位。</p>
                    </Popover>

                    <button
                      type="button"
                      className={`quick-pill ${detail.dependencies?.length ? '' : 'is-empty'}`}
                      onClick={() => setDependencyGraphOpen(true)}
                    >
                      <GitBranch size={15} />
                      {detail.dependencies?.length ? `依赖关系 ${detail.dependencies.length}` : '依赖关系'}
                      <ChevronDown size={13} />
                    </button>

                    <Popover
                      width={260}
                      trigger={
                        <button type="button" className={`quick-pill ${detail.recurrence_frequency && detail.recurrence_frequency !== 'none' ? '' : 'is-empty'}`}>
                          <Repeat size={15} />
                          {detail.recurrence_frequency === 'daily'
                            ? '每天重复'
                            : detail.recurrence_frequency === 'weekly'
                              ? '每周重复'
                              : detail.recurrence_frequency === 'monthly'
                                ? '每月重复'
                                : '重复'}
                          <ChevronDown size={13} />
                        </button>
                      }
                    >
                      <div className="menu-label">重复任务</div>
                      {[
                        { value: 'none', label: '不重复' },
                        { value: 'daily', label: '每天' },
                        { value: 'weekly', label: '每周' },
                        { value: 'monthly', label: '每月' },
                      ].map((option) => (
                        <MenuItem
                          key={option.value}
                          active={(detail.recurrence_frequency || 'none') === option.value}
                          onClick={() =>
                            patchTask({
                              recurrence_frequency: option.value,
                              recurrence_interval: 1,
                              recurrence_until: option.value === 'none' ? null : detail.recurrence_until || null,
                            })
                          }
                        >
                          {option.label}
                        </MenuItem>
                      ))}
                      {detail.recurrence_frequency && detail.recurrence_frequency !== 'none' && (
                        <>
                          <MenuDivider />
                          <label className="date-field recurrence-until">
                            <span>结束日期（可选）</span>
                            <input
                              type="date"
                              value={detail.recurrence_until || ''}
                              onChange={(event) =>
                                patchTask({
                                  recurrence_frequency: detail.recurrence_frequency,
                                  recurrence_interval: detail.recurrence_interval || 1,
                                  recurrence_until: event.target.value || null,
                                })
                              }
                            />
                          </label>
                        </>
                      )}
                      <p className="participant-hint">完成当前任务后，会自动生成下一次任务；已完成的这次记录会保留。</p>
                    </Popover>

                    <Popover
                      width={290}
                      trigger={
                        <button type="button" className={`quick-pill ${detail.due_date ? '' : 'is-empty'}`}>
                          <CalendarDays size={15} />
                          {detail.due_date
                            ? detail.start_date
                              ? `${formatDate(detail.start_date, 'M/d')} → ${formatDateSmart(detail.due_date)}`
                              : formatDateSmart(detail.due_date)
                            : '日期'}
                          <ChevronDown size={13} />
                        </button>
                      }
                    >
                      {({ close }) => (
                        <div className="date-panel">
                          <div className="date-quick">
                            <button type="button" onClick={() => { patchTask({ due_date: quickDate(0) }); close(); }}>今天</button>
                            <button type="button" onClick={() => { patchTask({ due_date: quickDate(1) }); close(); }}>明天</button>
                            <button type="button" onClick={() => { patchTask({ due_date: quickDate(7) }); close(); }}>下周</button>
                          </div>
                          <label className="date-field">
                            <span>开始日期</span>
                            <input
                              type="date"
                              value={detail.start_date || ''}
                              onChange={(event) => patchTask({ start_date: event.target.value || null })}
                            />
                          </label>
                          <label className="date-field">
                            <span>截止日期</span>
                            <input
                              type="date"
                              value={detail.due_date || ''}
                              onChange={(event) => patchTask({ due_date: event.target.value || null })}
                            />
                          </label>
                          <MenuDivider />
                          <button type="button" className="date-clear" onClick={() => { patchTask({ start_date: null, due_date: null }); close(); }}>
                            清除日期
                          </button>
                        </div>
                      )}
                    </Popover>

                    <Popover
                      width={180}
                      trigger={
                        <button type="button" className={`quick-pill ${detail.priority ? '' : 'is-empty'}`}>
                          <PriorityFlag priority={detail.priority} />
                          {PRIORITY_LABELS[detail.priority] || '优先级'}
                          <ChevronDown size={13} />
                        </button>
                      }
                    >
                      {({ close }) => (
                        <>
                          <div className="menu-label">优先级</div>
                          {[1, 2, 3, 4, 0].map((priority) => (
                            <MenuItem
                              key={priority}
                              active={detail.priority === priority}
                              icon={<PriorityFlag priority={priority} />}
                              onClick={() => { patchTask({ priority }); close(); }}
                            >
                              {PRIORITY_LABELS[priority]}
                            </MenuItem>
                          ))}
                        </>
                      )}
                    </Popover>

                    <Popover
                      width={230}
                      trigger={
                        <button type="button" className={`quick-pill ${detail.tags?.length ? '' : 'is-empty'}`}>
                          <TagIcon size={14} />
                          {detail.tags?.length ? `${detail.tags.length} 个标签` : '标签'}
                          <ChevronDown size={13} />
                        </button>
                      }
                    >
                      <div className="tag-menu-head">标签</div>
                      <div className="tag-menu-list">
                        {workspaceTags.map((tag) => {
                          const active = detail.tags?.some((item) => item.id === tag.id);
                          return (
                            <button
                              type="button"
                              key={tag.id}
                              className={`tag-menu-item ${active ? 'is-active' : ''}`}
                              onClick={() => toggleTag(tag)}
                            >
                              <span className="tag-color" style={{ background: tag.color }} />
                              {tag.name}
                              {active && <Check size={13} />}
                            </button>
                          );
                        })}
                        {!workspaceTags.length && <p className="tag-menu-empty">还没有标签，可在工作空间设置中创建。</p>}
                      </div>
                    </Popover>
                  </div>

                  {detail.parent && (
                    <button type="button" className="parent-link" onClick={() => onOpenTask(detail.parent.id)}>
                      <ArrowLeft size={13} /> 属于父任务：{detail.parent.name}
                    </button>
                  )}
                </div>

                <div className="drawer-tabs">
                  <button type="button" className={tab === 'detail' ? 'is-active' : ''} onClick={() => setTab('detail')}>
                    详情
                  </button>
                  <button type="button" className={tab === 'activity' ? 'is-active' : ''} onClick={() => setTab('activity')}>
                    动态 <span className="tab-count">{detail.activity?.length || 0}</span>
                  </button>
                </div>

                {tab === 'detail' ? (
                  <div className="drawer-body">
                    <section className="drawer-section">
                      <div className="drawer-section-head">
                        <h3>描述</h3>
                        {!editingDescription && (
                          <button type="button" className="section-action" onClick={() => { setDescriptionDraft(detail.description || ''); setEditingDescription(true); }}>
                            <Pencil size={13} /> 编辑
                          </button>
                        )}
                      </div>
                      {editingDescription ? (
                        <div className="description-editor">
                          <textarea
                            className="description-textarea"
                            value={descriptionDraft}
                            onChange={(event) => setDescriptionDraft(event.target.value)}
                            placeholder="添加描述，支持 Markdown 格式…"
                            autoFocus
                            rows={6}
                          />
                          <div className="description-editor-foot">
                            <span>支持 Markdown · 自动渲染预览</span>
                            <div>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingDescription(false); setDescriptionDraft(detail.description || ''); }}>
                                取消
                              </button>
                              <button type="button" className="btn btn-primary btn-sm" onClick={saveDescription}>保存描述</button>
                            </div>
                          </div>
                        </div>
                      ) : detail.description ? (
                        <div className="description-rendered markdown-body" dangerouslySetInnerHTML={{ __html: renderedDescription }} onClick={() => setEditingDescription(true)} />
                      ) : (
                        <button type="button" className="description-empty" onClick={() => setEditingDescription(true)}>
                          <Pencil size={14} /> 添加任务描述，记录背景、验收标准或备注…
                        </button>
                      )}
                    </section>

                    {detail.fields?.length > 0 && (
                      <section className="drawer-section">
                        <div className="drawer-section-head">
                          <h3>自定义字段</h3>
                          <span className="section-count">{detail.fields.length}</span>
                        </div>
                        <div className="drawer-fields">
                          {detail.fields.map((field) => {
                            const value = detail.field_values?.[field.id] ?? '';
                            return (
                              <label className="drawer-field" key={field.id}>
                                <span className="drawer-field-label">{field.name}</span>
                                {field.type === 'select' ? (
                                  <select
                                    className="mini-select field-select"
                                    value={value}
                                    onChange={(event) => patchTask({ fields: { [field.id]: event.target.value } })}
                                  >
                                    <option value="">未设置</option>
                                    {field.options.map((option) => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                ) : field.type === 'date' ? (
                                  <input
                                    type="date"
                                    className="field-input"
                                    value={value}
                                    onChange={(event) => patchTask({ fields: { [field.id]: event.target.value } })}
                                  />
                                ) : field.type === 'checkbox' ? (
                                  <input
                                    type="checkbox"
                                    className="field-checkbox"
                                    checked={value === 'true' || value === '1'}
                                    onChange={(event) => patchTask({ fields: { [field.id]: event.target.checked ? 'true' : '' } })}
                                  />
                                ) : (
                                  <input
                                    key={`${field.id}-${value}`}
                                    className="field-input"
                                    type={field.type === 'number' ? 'number' : 'text'}
                                    defaultValue={value}
                                    placeholder="未设置"
                                    onBlur={(event) => {
                                      if (event.target.value !== String(value)) patchTask({ fields: { [field.id]: event.target.value } });
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') event.target.blur();
                                    }}
                                  />
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    <section className="drawer-section">
                      <div className="drawer-section-head">
                        <h3>子任务 <span className="section-count">{detail.subtasks?.length || 0}</span></h3>
                        <button type="button" className="section-action" onClick={() => setAddingSubtask(true)}>
                          <Plus size={13} /> 添加
                        </button>
                      </div>
                      {detail.subtasks?.length > 0 && (
                        <div className="subtask-progress">
                          <ProgressBar value={subtaskDone} total={detail.subtasks.length} color={detail.status?.color} />
                          <span>{subtaskDone}/{detail.subtasks.length} 已完成</span>
                        </div>
                      )}
                      <div className="subtask-list">
                        {detail.subtasks?.map((subtask) => {
                          const completed = ['done', 'closed'].includes(subtask.status?.type);
                          return (
                            <div className={`subtask-row ${completed ? 'is-done' : ''}`} key={subtask.id}>
                              <button type="button" className={`task-check ${completed ? 'is-checked' : ''}`} onClick={() => toggleSubtask(subtask)}>
                                {completed ? <Check size={10} /> : null}
                              </button>
                              <button type="button" className="subtask-main" onClick={() => onOpenTask(subtask.id)}>
                                <span className="subtask-name">{subtask.name}</span>
                                <span className="subtask-status" style={{ color: subtask.status?.color }}>
                                  <span className="status-dot" style={{ background: subtask.status?.color }} />
                                  {subtask.status?.name}
                                </span>
                              </button>
                              {subtask.due_date && <span className="subtask-due">{formatDateSmart(subtask.due_date)}</span>}
                              {subtask.assignee && <Avatar user={subtask.assignee} size={20} />}
                            </div>
                          );
                        })}
                        {addingSubtask ? (
                          <form className="subtask-add-form" onSubmit={addSubtask}>
                            <input
                              autoFocus
                              value={subtaskDraft}
                              onChange={(event) => setSubtaskDraft(event.target.value)}
                              placeholder="输入子任务名称，按 Enter 创建"
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                  setAddingSubtask(false);
                                  setSubtaskDraft('');
                                }
                              }}
                            />
                            <button type="submit" className="btn btn-primary btn-xs" disabled={!subtaskDraft.trim()}>添加</button>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setAddingSubtask(false)}>取消</button>
                          </form>
                        ) : (
                          <button type="button" className="subtask-add-trigger" onClick={() => setAddingSubtask(true)}>
                            <Plus size={14} /> 添加子任务
                          </button>
                        )}
                      </div>
                    </section>

                    <section className="drawer-section">
                      <div className="drawer-section-head">
                        <h3>检查清单 {detail.checklists?.length > 0 && <span className="section-count">{checklistDone}/{allChecklistItems.length}</span>}</h3>
                        <button type="button" className="section-action" onClick={() => setNewChecklistOpen(true)}>
                          <Plus size={13} /> 新建
                        </button>
                      </div>
                      {detail.checklists?.map((checklist) => {
                        const done = checklist.items.filter((item) => item.done).length;
                        return (
                          <div className="checklist-block" key={checklist.id}>
                            <div className="checklist-head">
                              {editingChecklistId === checklist.id ? (
                                <input
                                  className="checklist-title-input"
                                  autoFocus
                                  value={checklistTitleDraft}
                                  onChange={(event) => setChecklistTitleDraft(event.target.value)}
                                  onBlur={() => saveChecklistRename(checklist)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      saveChecklistRename(checklist);
                                    }
                                    if (event.key === 'Escape') {
                                      event.preventDefault();
                                      setChecklistTitleDraft(checklist.name);
                                      setEditingChecklistId(null);
                                    }
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="checklist-title checklist-title-button"
                                  onClick={() => beginChecklistRename(checklist)}
                                  title="点击编辑清单名称"
                                >
                                  {checklist.name}
                                </button>
                              )}
                              <span className="checklist-progress-text">{done}/{checklist.items.length}</span>
                              <button type="button" className="icon-btn checklist-edit" onClick={() => beginChecklistRename(checklist)} title="编辑清单名称">
                                <Pencil size={12} />
                              </button>
                              <button type="button" className="icon-btn icon-btn-danger checklist-delete" onClick={() => removeChecklist(checklist)} title="删除清单">
                                <Trash2 size={13} />
                              </button>
                            </div>
                            <ProgressBar value={done} total={checklist.items.length} color="#2ea44f" />
                            <div className="checklist-items">
                              {checklist.items.map((item) => (
                                <div className={`checklist-item ${item.done ? 'is-done' : ''}`} key={item.id}>
                                  <button type="button" className={`task-check ${item.done ? 'is-checked' : ''}`} onClick={() => toggleChecklistItem(checklist.id, item)}>
                                    {item.done ? <Check size={10} /> : null}
                                  </button>
                                  {editingItemId === item.id ? (
                                    <input
                                      className="checklist-item-input"
                                      autoFocus
                                      value={checklistItemDraft}
                                      onChange={(event) => setChecklistItemDraft(event.target.value)}
                                      onBlur={() => saveChecklistItemName(item)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          saveChecklistItemName(item);
                                        }
                                        if (event.key === 'Escape') {
                                          event.preventDefault();
                                          setChecklistItemDraft(item.name);
                                          setEditingItemId(null);
                                        }
                                      }}
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      className="checklist-item-name"
                                      onClick={() => beginChecklistItemEdit(item)}
                                      title="点击编辑检查项"
                                    >
                                      {item.name}
                                    </button>
                                  )}
                                  <button type="button" className="checklist-edit" onClick={() => beginChecklistItemEdit(item)} title="编辑检查项">
                                    <Pencil size={11} />
                                  </button>
                                  <button type="button" className="checklist-remove" onClick={() => removeChecklistItem(checklist.id, item)}>
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}
                              <form
                                className="checklist-add-item"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  addChecklistItem(checklist);
                                }}
                              >
                                <Plus size={13} />
                                <input
                                  value={itemDrafts[checklist.id] || ''}
                                  onChange={(event) => setItemDrafts((current) => ({ ...current, [checklist.id]: event.target.value }))}
                                  placeholder="添加检查项"
                                />
                              </form>
                            </div>
                          </div>
                        );
                      })}
                      {newChecklistOpen && (
                        <form className="new-checklist-form" onSubmit={addChecklist}>
                          <input
                            autoFocus
                            value={newChecklistName}
                            onChange={(event) => setNewChecklistName(event.target.value)}
                            placeholder="清单名称，例如：发布检查"
                          />
                          <button type="submit" className="btn btn-primary btn-xs">创建</button>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setNewChecklistOpen(false)}>取消</button>
                        </form>
                      )}
                      {!detail.checklists?.length && !newChecklistOpen && (
                        <button type="button" className="drawer-empty-action" onClick={() => setNewChecklistOpen(true)}>
                          <CheckSquare size={15} /> 添加检查清单，拆分可勾选的步骤
                        </button>
                      )}
                    </section>

                    <section className="drawer-section">
                      <div className="drawer-section-head">
                        <h3>附件 <span className="section-count">{detail.attachments?.length || 0}</span></h3>
                        <button type="button" className="section-action" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                          {uploading ? <Spinner size={13} /> : <Upload size={13} />} 上传
                        </button>
                        <input ref={fileInputRef} type="file" hidden onChange={uploadFile} />
                      </div>
                      <div className="attachment-list">
                        {detail.attachments?.map((attachment) => (
                          <div className="attachment-row" key={attachment.id}>
                            <span className="attachment-icon"><FileText size={16} /></span>
                            <a href={attachment.url} className="attachment-name" download onClick={(event) => event.stopPropagation()}>
                              {attachment.name}
                            </a>
                            <span className="attachment-size">{formatBytes(attachment.size)}</span>
                            <button type="button" className="icon-btn icon-btn-danger" onClick={() => removeAttachment(attachment)} title="删除附件">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                        {!detail.attachments?.length && (
                          <button type="button" className="drawer-empty-action" onClick={() => fileInputRef.current?.click()}>
                            <Paperclip size={15} /> 上传附件（最大 20MB）
                          </button>
                        )}
                      </div>
                    </section>

                    <section className="drawer-section comments-section">
                      <div className="drawer-section-head progress-section-head">
                        <h3>进展 <span className="section-count">{detail.comments?.length || 0}</span></h3>
                        <button
                          type="button"
                          className="progress-sort-btn"
                          onClick={() => setProgressSort((current) => (current === 'desc' ? 'asc' : 'desc'))}
                          title="切换进展日期排序"
                        >
                          <ArrowDownUp size={12} />
                          {progressSort === 'desc' ? '最新在前' : '最早在前'}
                        </button>
                      </div>
                      <div className="comment-list" ref={commentsListRef}>
                        {progressEntries.map((comment) => (
                          <div className="comment-row" key={comment.id}>
                            <Avatar user={{ name: comment.user_name, color: comment.user_color }} size={28} />
                            <div className="comment-main">
                              <div className="comment-head">
                                <strong>{comment.user_name}</strong>
                                <span className="progress-time" title={formatDateTime(comment.created_at, 'yyyy年M月d日 HH:mm')}>
                                  {formatDateTime(comment.created_at)}
                                </span>
                                {(comment.user_id === user?.id || bootstrap?.role === 'owner' || bootstrap?.role === 'admin') && (
                                  <button type="button" className="comment-delete" onClick={() => removeComment(comment)} title="删除进展">
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                              <p>{comment.body}</p>
                            </div>
                          </div>
                        ))}
                        {!progressEntries.length && <p className="comment-empty">还没有进展记录，写下当前项目进展吧。</p>}
                        <div ref={commentsEndRef} />
                      </div>
                      <form className="comment-composer" onSubmit={addComment}>
                        <Avatar user={user} size={28} />
                        <div className="comment-input-wrap">
                          <textarea
                            rows={2}
                            value={commentDraft}
                            onChange={(event) => setCommentDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') addComment(event);
                            }}
                            placeholder="记录当前进展…（Ctrl+Enter 记录）"
                          />
                          <div className="comment-composer-foot">
                            <span>支持 @ 提及团队成员</span>
                            <button type="submit" className="btn btn-primary btn-sm" disabled={!commentDraft.trim() || sendingComment}>
                              {sendingComment ? <Spinner size={13} /> : <Send size={13} />} 记录进展
                            </button>
                          </div>
                        </div>
                      </form>
                    </section>

                    <div className="drawer-footer-meta">
                      <span>创建于 {formatDate(detail.created_at, 'yyyy年M月d日 HH:mm')}</span>
                      <span>·</span>
                      <span>更新于 {formatDateTime(detail.updated_at)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="drawer-body">
                    <div className="activity-timeline">
                      {detail.activity?.map((item) => (
                        <div className="activity-item" key={item.id}>
                          <Avatar user={{ name: item.user_name, color: item.user_color }} size={26} />
                          <div className="activity-main">
                            <p><strong>{item.user_name}</strong> {item.message}</p>
                            <span>{formatDateTime(item.created_at)}</span>
                          </div>
                        </div>
                      ))}
                      {!detail.activity?.length && <p className="comment-empty">还没有动态记录。</p>}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </aside>
      </div>

      <DependencyGraphModal
        open={dependencyGraphOpen}
        onClose={() => setDependencyGraphOpen(false)}
        task={detail}
        tasks={dependencyTasks}
        onToggleDependency={toggleDependency}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="删除任务"
        message={`确定删除「${detail?.name || ''}」吗？${detail?.subtasks?.length ? '所有子任务也会一并删除。' : ''}此操作无法撤销。`}
        busy={busy}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteTask}
      />
    </>
  );
}
