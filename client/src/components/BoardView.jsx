import { useEffect, useState } from 'react';
import { CalendarDays, ListTree, MessageSquare, Plus } from 'lucide-react';
import { Avatar, DueBadge, PriorityFlag, TagChip } from './ui.jsx';

function BoardCard({ task, onOpen, onDragStart }) {
  return (
    <article
      className="board-card"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', task.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart?.(task.id);
      }}
      onClick={() => onOpen(task.id)}
    >
      <div className="board-card-top">
        <div className="board-card-tags">
          {task.tags?.map((tag) => (
            <TagChip key={tag.id} tag={tag} small />
          ))}
        </div>
        <PriorityFlag priority={task.priority} />
      </div>
      <h4>{task.name}</h4>
      <div className="board-card-meta">
        <span className={`board-due ${task.status?.type === 'done' || task.status?.type === 'closed' ? 'is-done' : ''}`}>
          <DueBadge date={task.due_date} statusType={task.status?.type} />
        </span>
        <div className="board-card-right">
          {task.subtask_count > 0 && <span><ListTree size={12} />{task.subtask_count}</span>}
          {task.comment_count > 0 && <span><MessageSquare size={12} />{task.comment_count}</span>}
          {task.assignee ? <Avatar user={task.assignee} size={22} /> : <span className="avatar-empty avatar-empty-sm" />}
        </div>
      </div>
    </article>
  );
}

export default function BoardView({ tasks, statuses, onOpenTask, onMoveTask, onAddTask }) {
  const [dragId, setDragId] = useState(null);
  const [target, setTarget] = useState(null);

  useEffect(() => {
    if (!dragId) return undefined;
    function onDragEnd() {
      setDragId(null);
      setTarget(null);
    }
    document.addEventListener('dragend', onDragEnd);
    return () => document.removeEventListener('dragend', onDragEnd);
  }, [dragId]);

  function handledDrop(status) {
    if (!dragId || !target || target.statusId !== status.id) return;
    const columnTasks = tasks.filter((task) => task.status_id === status.id && task.id !== dragId);
    const index = Math.min(target.index, columnTasks.length);
    onMoveTask(dragId, status.id, index);
    setDragId(null);
    setTarget(null);
  }

  return (
    <div className="board-view">
      {statuses.map((status) => {
        const columnTasks = tasks.filter((task) => task.status_id === status.id);
        return (
          <section
            key={status.id}
            className={`board-column ${target?.statusId === status.id ? 'is-drag-over' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!dragId) return;
              setTarget({ statusId: status.id, index: columnTasks.filter((task) => task.id !== dragId).length });
            }}
            onDrop={(event) => {
              event.preventDefault();
              handledDrop(status);
            }}
          >
            <div className="board-column-head" style={{ '--status-color': status.color }}>
              <span className="board-status-dot" />
              <span className="board-status-name">{status.name}</span>
              <span className="board-status-count">{columnTasks.length}</span>
              <button type="button" className="board-add-btn" onClick={() => onAddTask(status.id)} title="新建任务">
                <Plus size={15} />
              </button>
            </div>
            <div className="board-column-body">
              {columnTasks.map((task, index) => (
                <div
                  className={`board-card-wrap ${dragId === task.id ? 'is-dragging' : ''} ${
                    target?.statusId === status.id && target?.index === index ? 'drop-before' : ''
                  }`}
                  key={task.id}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!dragId || task.id === dragId) return;
                    const filtered = columnTasks.filter((item) => item.id !== dragId);
                    const position = filtered.findIndex((item) => item.id === task.id);
                    setTarget({ statusId: status.id, index: Math.max(0, position) });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handledDrop(status);
                  }}
                >
                  <BoardCard task={task} onOpen={onOpenTask} onDragStart={setDragId} />
                </div>
              ))}
              {!columnTasks.length && (
                <div className="board-empty">
                  <span>将任务拖到这里</span>
                </div>
              )}
              <button type="button" className="board-column-add" onClick={() => onAddTask(status.id)}>
                <Plus size={14} /> 添加任务
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
