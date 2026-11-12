import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  GripVertical,
  ListTree,
  MessageSquare,
  Plus,
  UserRound,
  Users,
} from 'lucide-react';
import {
  Avatar,
  DueBadge,
  MenuDivider,
  MenuItem,
  Popover,
  PriorityFlag,
  ProgressBar,
  TagChip,
} from './ui.jsx';
import { formatDate } from '../lib/date.js';
import { addDays, format } from 'date-fns';

function dateValue(offset) {
  return format(addDays(new Date(), offset), 'yyyy-MM-dd');
}

function AssigneeControl({ task, members, onUpdate }) {
  return (
    <Popover
      width={220}
      align="right"
      trigger={
        <button type="button" className="row-icon-btn assignee-trigger" title={task.assignee?.name || '设置负责人'}>
          {task.assignee ? <Avatar user={task.assignee} size={24} /> : <span className="avatar-empty"><UserRound size={13} /></span>}
        </button>
      }
    >
      {({ close }) => (
        <>
          <div className="menu-label">负责人</div>
          <MenuItem
            active={!task.assignee_id}
            onClick={() => {
              onUpdate(task, { assignee_id: null });
              close();
            }}
          >
            未指派
          </MenuItem>
          {members.map((member) => (
            <MenuItem
              key={member.id}
              active={task.assignee_id === member.id}
              icon={<Avatar user={member} size={20} />}
              onClick={() => {
                onUpdate(task, { assignee_id: member.id });
                close();
              }}
            >
              <span className="person-menu-label">
                {member.name}
                {member.is_external && <em className="external-badge">外部</em>}
              </span>
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}

function DueControl({ task, onUpdate }) {
  const [start, setStart] = useState(task.start_date || '');
  const [due, setDue] = useState(task.due_date || '');
  return (
    <Popover
      width={272}
      align="right"
      trigger={
        <button type="button" className={`row-icon-btn due-trigger ${!task.due_date ? 'is-empty' : ''}`} title="设置日期">
          <DueBadge date={task.due_date} statusType={task.status?.type} />
        </button>
      }
    >
      {({ close }) => (
        <div className="date-panel">
          <div className="date-quick">
            <button type="button" onClick={() => { onUpdate(task, { due_date: dateValue(0) }); close(); }}>今天</button>
            <button type="button" onClick={() => { onUpdate(task, { due_date: dateValue(1) }); close(); }}>明天</button>
            <button type="button" onClick={() => { onUpdate(task, { due_date: dateValue(7) }); close(); }}>下周</button>
          </div>
          <label className="date-field">
            <span>开始日期</span>
            <input
              type="date"
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
                onUpdate(task, { start_date: event.target.value || null });
              }}
            />
          </label>
          <label className="date-field">
            <span>截止日期</span>
            <input
              type="date"
              value={due}
              onChange={(event) => {
                setDue(event.target.value);
                onUpdate(task, { due_date: event.target.value || null });
              }}
            />
          </label>
          <MenuDivider />
          <button
            type="button"
            className="date-clear"
            onClick={() => {
              setStart('');
              setDue('');
              onUpdate(task, { start_date: null, due_date: null });
              close();
            }}
          >
            清除日期
          </button>
        </div>
      )}
    </Popover>
  );
}

function PriorityControl({ task, onUpdate }) {
  return (
    <Popover
      width={180}
      align="right"
      trigger={
        <button type="button" className="row-icon-btn priority-trigger" title="设置优先级">
          <PriorityFlag priority={task.priority} />
        </button>
      }
    >
      {({ close }) => (
        <>
          <div className="menu-label">优先级</div>
          {[1, 2, 3, 4, 0].map((priority) => (
            <MenuItem
              key={priority}
              active={task.priority === priority}
              icon={<PriorityFlag priority={priority} />}
              onClick={() => {
                onUpdate(task, { priority });
                close();
              }}
            >
              {priority === 1 ? '紧急' : priority === 2 ? '高' : priority === 3 ? '普通' : priority === 4 ? '低' : '无'}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}

function StatusControl({ task, statuses, onUpdate }) {
  return (
    <Popover
      width={200}
      align="right"
      trigger={
        <button type="button" className="status-mini" style={{ '--status-color': task.status?.color }}>
          <span /> {task.status?.name}
        </button>
      }
    >
      {({ close }) => (
        <>
          <div className="menu-label">状态</div>
          {statuses.map((status) => (
            <MenuItem
              key={status.id}
              active={task.status_id === status.id}
              icon={<span className="status-dot" style={{ background: status.color }} />}
              onClick={() => {
                onUpdate(task, { status_id: status.id });
                close();
              }}
            >
              {status.name}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}

function TaskRow({
  task,
  statuses,
  members,
  onOpen,
  onComplete,
  onUpdate,
  showStatus,
  draggable,
  dragging,
  dropBefore,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) {
  const completed = task.status?.type === 'done' || task.status?.type === 'closed';
  return (
    <div
      className={`task-row ${completed ? 'is-completed' : ''} ${dragging ? 'is-dragging' : ''} ${dropBefore ? 'is-drop-before' : ''}`}
      onClick={() => onOpen(task.id)}
      role="button"
      tabIndex={0}
      draggable={Boolean(draggable)}
      onDragStart={(event) => {
        if (!draggable) return;
        const target = event.target;
        if (target.closest?.('button, input, textarea, select, a')) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData('text/plain', task.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart?.(task);
      }}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(event) => {
        if (!draggable) return;
        onDragOver?.(event, task);
      }}
      onDrop={(event) => {
        if (!draggable) return;
        onDrop?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(task.id);
      }}
    >
      {draggable && (
        <span
          className="task-drag-handle"
          title="拖拽调整状态和顺序"
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical size={13} />
        </span>
      )}
      <button
        type="button"
        className={`task-check ${completed ? 'is-checked' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          onComplete(task);
        }}
        aria-label={completed ? '标记为未完成' : '标记为完成'}
      >
        {completed ? <Check size={11} /> : null}
      </button>

      <div className="task-main">
        <div className="task-name-line">
          {task.subtask_count > 0 && <ListTree size={13} className="task-subtask-icon" />}
          <span className="task-name">{task.name}</span>
          {task.tags?.map((tag) => (
            <TagChip key={tag.id} tag={tag} small />
          ))}
        </div>
        {(task.subtask_count > 0 || task.comment_count > 0 || task.checklist_total > 0 || task.participant_count > 0) && (
          <div className="task-subline">
            {task.subtask_count > 0 && (
              <span><ListTree size={12} /> {task.subtask_count} 个子任务</span>
            )}
            {task.participant_count > 0 && (
              <span><Users size={12} /> {task.participant_count} 位参与人</span>
            )}
            {task.comment_count > 0 && (
              <span title="进展"><MessageSquare size={12} /> {task.comment_count}</span>
            )}
            {task.checklist_total > 0 && (
              <span className="task-checklist-mini">
                <CircleDashed size={12} /> {task.checklist_done}/{task.checklist_total}
                <ProgressBar value={task.checklist_done} total={task.checklist_total} height={3} />
              </span>
            )}
          </div>
        )}
      </div>

      <div className="task-meta" onClick={(event) => event.stopPropagation()}>
        {showStatus && <StatusControl task={task} statuses={statuses} onUpdate={onUpdate} />}
        <div className="task-meta-field task-meta-priority">
          <PriorityControl task={task} onUpdate={onUpdate} />
        </div>
        <div className="task-meta-field">
          <DueControl task={task} onUpdate={onUpdate} />
        </div>
        <div className="task-meta-field">
          <AssigneeControl task={task} members={members} onUpdate={onUpdate} />
        </div>
      </div>
    </div>
  );
}

function InlineAdd({ placeholder = '添加任务', onAdd }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  function start() {
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 20);
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onAdd(trimmed);
      setName('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button type="button" className="inline-add-trigger" onClick={start}>
        <Plus size={14} />
        {placeholder}
      </button>
    );
  }

  return (
    <div className="inline-add-row">
      <span className="inline-add-plus"><Plus size={14} /></span>
      <input
        ref={inputRef}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') {
            setEditing(false);
            setName('');
          }
        }}
        onBlur={() => {
          if (!name.trim() && !busy) {
            setEditing(false);
          }
        }}
        placeholder={placeholder}
      />
      {name.trim() && (
        <div className="inline-add-actions">
          <button type="button" onClick={submit} disabled={busy} className="btn btn-primary btn-xs">添加</button>
          <button type="button" onClick={() => { setEditing(false); setName(''); }} className="btn btn-ghost btn-xs">取消</button>
        </div>
      )}
    </div>
  );
}

function GroupHeader({ group, collapsed, onToggle, onAdd }) {
  const isStatus = group.kind === 'status';
  const isAssignee = group.kind === 'assignee';
  const isPriority = group.kind === 'priority';
  return (
    <div className="group-head">
      <button type="button" className="group-toggle" onClick={onToggle} aria-label="折叠分组">
        {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
      </button>
      {isStatus && <span className="group-status-icon" style={{ borderColor: group.color, color: group.color }}><span style={{ background: group.color }} /></span>}
      {isAssignee && (group.user ? <Avatar user={group.user} size={20} /> : <span className="avatar-empty avatar-empty-sm"><UserRound size={12} /></span>)}
      {isPriority && <PriorityFlag priority={group.priority} size={15} />}
      <span className="group-name">{group.label}</span>
      <span className="group-count">{group.tasks.length}</span>
      <div className="group-actions">
        <button type="button" className="group-add" onClick={onAdd} title="添加任务">
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

export default function ListView({
  groups,
  statuses,
  members,
  onOpenTask,
  onComplete,
  onUpdateTask,
  onAddTask,
  onMoveTask,
  canReorder = false,
}) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    if (!dragId) return undefined;
    function resetDrag() {
      setDragId(null);
      setDropTarget(null);
    }
    document.addEventListener('dragend', resetDrag);
    return () => document.removeEventListener('dragend', resetDrag);
  }, [dragId]);

  function toggleGroup(key) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resetDrag() {
    setDragId(null);
    setDropTarget(null);
  }

  function handleDragStart(task) {
    if (!canReorder) return;
    setDragId(task.id);
    setDropTarget(null);
  }

  function handleRowDragOver(event, group, index) {
    if (!dragId || !group.status) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    setDropTarget({ statusId: group.status.id, index: index + (before ? 0 : 1) });
  }

  function handleGroupDragOver(event, group) {
    if (!dragId || !group.status) return;
    if (event.target.closest?.('.task-row')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget({ statusId: group.status.id, index: group.tasks.length });
  }

  function handleDrop(event, group) {
    if (!dragId || !group.status || !dropTarget || dropTarget.statusId !== group.status.id) {
      resetDrag();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const remaining = group.tasks.filter((task) => task.id !== dragId);
    let index = dropTarget.index;
    const sourceIndex = group.tasks.findIndex((task) => task.id === dragId);
    if (sourceIndex !== -1 && sourceIndex < index) index -= 1;
    index = Math.max(0, Math.min(index, remaining.length));
    const taskId = dragId;
    resetDrag();
    onMoveTask?.(taskId, group.status.id, index);
  }

  return (
    <div className="list-view">
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key);
        const dragOverGroup = dropTarget?.statusId === group.status?.id;
        const rowsDraggable = canReorder && group.kind === 'status';
        return (
          <section className={`task-group ${dragOverGroup ? 'is-drag-target' : ''}`} key={group.key}>
            <GroupHeader
              group={group}
              collapsed={isCollapsed}
              onToggle={() => toggleGroup(group.key)}
              onAdd={() => onAddTask(group.status?.id || statuses[0]?.id)}
            />
            {!isCollapsed && (
              <div
                className="task-group-body"
                onDragOver={(event) => handleGroupDragOver(event, group)}
                onDrop={(event) => handleDrop(event, group)}
              >
                {group.tasks.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    statuses={statuses}
                    members={members}
                    onOpen={onOpenTask}
                    onComplete={onComplete}
                    onUpdate={onUpdateTask}
                    showStatus={group.kind !== 'status'}
                    draggable={rowsDraggable}
                    dragging={dragId === task.id}
                    dropBefore={dragOverGroup && dropTarget.index === index}
                    onDragStart={handleDragStart}
                    onDragEnd={resetDrag}
                    onDragOver={(event) => handleRowDragOver(event, group, index)}
                    onDrop={(event) => handleDrop(event, group)}
                  />
                ))}
                {dragOverGroup && dropTarget.index >= group.tasks.length && (
                  <div className="task-drop-line" aria-hidden="true" />
                )}
                <InlineAdd
                  onAdd={(name) =>
                    onAddTask(group.status?.id || statuses[0]?.id, name)
                  }
                />
              </div>
            )}
          </section>
        );
      })}
      {!groups.length && (
        <div className="list-empty">
          <CalendarDays size={22} />
          <p>没有符合条件的任务</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAddTask(statuses[0]?.id)}>
            新建任务
          </button>
        </div>
      )}
    </div>
  );
}
