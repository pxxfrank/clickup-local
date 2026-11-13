import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { addMonths, format, isSameDay, isSameMonth, isToday, monthMatrix, startOfMonth, subMonths } from '../lib/date.js';
import { StatusDot } from './ui.jsx';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export default function CalendarView({ tasks, statuses, onOpenTask, onAddTask, showAdd = true, maxUndated = 6 }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(null);

  const days = useMemo(() => monthMatrix(month), [month]);
  const tasksByDate = useMemo(() => {
    const map = new Map();
    for (const task of tasks) {
      if (!task.due_date) continue;
      if (!map.has(task.due_date)) map.set(task.due_date, []);
      map.get(task.due_date).push(task);
    }
    return map;
  }, [tasks]);

  const undated = tasks.filter((task) => !task.due_date);
  const selectedTasks = selectedDay ? tasksByDate.get(format(selectedDay, 'yyyy-MM-dd')) || [] : [];

  return (
    <div className="calendar-view">
      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button type="button" className="icon-btn" onClick={() => setMonth(subMonths(month, 1))} aria-label="上个月">
            <ChevronLeft size={17} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonth(startOfMonth(new Date()))}>今天</button>
          <button type="button" className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="下个月">
            <ChevronRight size={17} />
          </button>
          <h3>{format(month, 'yyyy年 M月')}</h3>
        </div>
        <div className="calendar-legend">
          <span><i style={{ background: '#7B68EE' }} /> 有截止日期的任务</span>
          <span className="calendar-count">{tasks.filter((task) => task.due_date).length} 个任务</span>
        </div>
      </div>

      <div className="calendar-grid-wrap">
        <div className="calendar-weekdays">
          {WEEKDAYS.map((day) => (
            <div key={day} className={day === '周六' || day === '周日' ? 'is-weekend' : ''}>{day}</div>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayTasks = tasksByDate.get(key) || [];
            const outside = !isSameMonth(day, month);
            return (
              <div
                key={key}
                className={`calendar-day ${outside ? 'is-outside' : ''} ${isToday(day) ? 'is-today' : ''} ${selectedDay && isSameDay(day, selectedDay) ? 'is-selected' : ''}`}
                onClick={() => setSelectedDay(day)}
              >
                <div className="calendar-day-head">
                  <span className="calendar-day-num">{format(day, 'd')}</span>
                  {showAdd && (
                    <button
                      type="button"
                      className="calendar-day-add"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAddTask?.(key);
                      }}
                      title="在这一天新建任务"
                    >
                      <Plus size={13} />
                    </button>
                  )}
                </div>
                <div className="calendar-day-tasks">
                  {dayTasks.slice(0, 3).map((task) => (
                    <button
                      type="button"
                      key={task.id}
                      className="calendar-task"
                      style={{ '--status-color': task.status?.color }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenTask(task.id);
                      }}
                      title={task.name}
                    >
                      <StatusDot color={task.status?.color} size={6} />
                      <span>{task.name}</span>
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <button
                      type="button"
                      className="calendar-more"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedDay(day);
                      }}
                    >
                      +{dayTasks.length - 3} 更多
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="calendar-bottom">
        <div className="calendar-selected">
          <h4>
            {selectedDay ? `${format(selectedDay, 'M月d日')} 的任务` : '选择日期查看任务'}
            {selectedDay && <span>{selectedTasks.length}</span>}
          </h4>
          {selectedDay ? (
            selectedTasks.length ? (
              <div className="calendar-selected-list">
                {selectedTasks.map((task) => (
                  <button type="button" key={task.id} className="calendar-selected-row" onClick={() => onOpenTask(task.id)}>
                    <StatusDot color={task.status?.color} />
                    <span>{task.name}</span>
                    <span className="calendar-selected-status">{task.status?.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="calendar-empty">这一天没有任务，点击右上角 + 新建。</p>
            )
          ) : (
            <p className="calendar-empty">点击日历中的任意日期，查看当天的任务安排。</p>
          )}
        </div>
        {undated.length > 0 && (
          <div className="calendar-undated">
            <h4>未设置日期 <span>{undated.length}</span></h4>
            <div className="calendar-undated-list">
              {undated.slice(0, maxUndated).map((task) => (
                <button type="button" key={task.id} onClick={() => onOpenTask(task.id)}>
                  <StatusDot color={task.status?.color} size={7} />
                  {task.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
