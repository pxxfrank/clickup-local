import { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { format, formatDateSmart, parseDateValue, zhCN } from '../lib/date.js';
import { Avatar, PriorityFlag, StatusDot } from './ui.jsx';

function taskDate(task) {
  return task.due_date || task.start_date || null;
}

export default function HomeTimeline({ tasks, onOpenTask }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const { groups, undated } = useMemo(() => {
    const dated = tasks
      .filter((task) => taskDate(task))
      .sort((a, b) => {
        const byDate = taskDate(a).localeCompare(taskDate(b));
        return byDate || (a.name || '').localeCompare(b.name || '', 'zh-CN');
      });
    const grouped = new Map();
    for (const task of dated) {
      const date = taskDate(task);
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date).push(task);
    }
    return {
      groups: [...grouped.entries()],
      undated: tasks.filter((task) => !taskDate(task)),
    };
  }, [tasks]);

  if (!tasks.length) {
    return <div className="home-timeline-empty">工作空间里还没有任务。</div>;
  }

  return (
    <div className="home-timeline">
      <div className="home-timeline-summary">
        <span>{tasks.length} 个任务</span>
        <span>{groups.length} 个日期</span>
        {undated.length > 0 && <span>{undated.length} 个未排期</span>}
      </div>
      <div className="home-timeline-scroll">
        {groups.map(([date, items]) => {
          const isToday = date === today;
          const isOverdue = date < today;
          return (
            <div className={`home-timeline-day ${isToday ? 'is-today' : ''} ${isOverdue ? 'is-overdue' : ''}`} key={date}>
              <div className="home-timeline-date">
                <strong>{format(parseDateValue(date), 'd')}</strong>
                <span>{format(parseDateValue(date), 'M月')}</span>
                <em>{format(parseDateValue(date), 'EEEE', { locale: zhCN })}</em>
                <i />
              </div>
              <div className="home-timeline-content">
                <div className="home-timeline-day-head">
                  <h4>
                    {isToday ? '今天' : isOverdue ? '已逾期' : formatDateSmart(date)}
                    <span>{items.length}</span>
                  </h4>
                  {isOverdue && <em>需要尽快处理</em>}
                </div>
                <div className="home-timeline-tasks">
                  {items.map((task) => {
                    const completed = ['done', 'closed'].includes(task.status?.type);
                    return (
                      <button
                        type="button"
                        className={`home-timeline-task ${completed ? 'is-completed' : ''}`}
                        key={task.id}
                        onClick={() => onOpenTask(task.id)}
                      >
                        <StatusDot color={task.status?.color} size={8} />
                        <span className="home-timeline-task-main">
                          <span className="home-timeline-task-name">{task.name}</span>
                          <span className="home-timeline-task-meta">
                            <span className="list-color-dot" style={{ background: task.list?.color }} />
                            {task.list?.name}
                            <span>·</span>
                            {task.start_date && task.due_date && task.start_date !== task.due_date
                              ? `${formatDateSmart(task.start_date)} - ${formatDateSmart(task.due_date)}`
                              : task.due_date
                                ? `截止 ${formatDateSmart(task.due_date)}`
                                : `开始 ${formatDateSmart(task.start_date)}`}
                          </span>
                        </span>
                        <span className="home-timeline-task-status">
                          {task.assignee ? <Avatar user={task.assignee} size={20} /> : null}
                          <PriorityFlag priority={task.priority} size={13} />
                          <span style={{ color: task.status?.color }}>{task.status?.name}</span>
                          {completed && <CheckCircle2 size={13} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {undated.length > 0 && (
        <div className="home-timeline-undated">
          <h4>未排期 <span>{undated.length}</span></h4>
          <div>
            {undated.map((task) => (
              <button type="button" key={task.id} onClick={() => onOpenTask(task.id)}>
                <StatusDot color={task.status?.color} size={7} />
                <span>{task.name}</span>
                <em>{task.list?.name}</em>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
