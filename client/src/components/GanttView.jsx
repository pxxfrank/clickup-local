import { useMemo } from 'react';
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, isToday, isWeekend, parseDateValue, startOfDay } from '../lib/date.js';
import { StatusDot } from './ui.jsx';

const DAY_WIDTH = 34;

export default function GanttView({ tasks, onOpenTask }) {
  const dated = tasks.filter((task) => task.due_date);
  const undated = tasks.filter((task) => !task.due_date);

  const range = useMemo(() => {
    const today = startOfDay(new Date());
    let min = today;
    let max = addDays(today, 20);
    for (const task of dated) {
      const start = parseDateValue(task.start_date || task.due_date);
      const due = parseDateValue(task.due_date || task.start_date);
      if (start && start < min) min = start;
      if (due && due > max) max = due;
    }
    if (differenceInCalendarDays(min, today) > -3) min = addDays(today, -3);
    if (differenceInCalendarDays(max, today) < 14) max = addDays(today, 14);
    // Keep the chart a manageable size.
    if (differenceInCalendarDays(max, min) > 120) max = addDays(min, 120);
    return { start: min, end: max, days: eachDayOfInterval({ start: min, end: max }) };
  }, [tasks]);

  const months = useMemo(() => {
    const result = [];
    for (const day of range.days) {
      const key = format(day, 'yyyy年M月');
      const last = result[result.length - 1];
      if (last && last.key === key) last.count += 1;
      else result.push({ key, count: 1, label: format(day, 'M月') });
    }
    return result;
  }, [range]);

  const rows = useMemo(() => {
    return [...dated].sort((a, b) => {
      const aStart = a.start_date || a.due_date || '';
      const bStart = b.start_date || b.due_date || '';
      return aStart.localeCompare(bStart);
    });
  }, [dated]);

  const totalWidth = range.days.length * DAY_WIDTH;
  const todayOffset = differenceInCalendarDays(startOfDay(new Date()), range.start);
  const todayVisible = todayOffset >= 0 && todayOffset < range.days.length;

  function barGeometry(task) {
    const start = parseDateValue(task.start_date || task.due_date) || parseDateValue(task.due_date);
    const end = parseDateValue(task.due_date) || start;
    if (!start || !end) return null;
    const offset = Math.max(0, differenceInCalendarDays(start, range.start));
    const span = Math.max(1, differenceInCalendarDays(end, start) + 1);
    return {
      left: offset * DAY_WIDTH + 4,
      width: Math.min(span * DAY_WIDTH - 8, totalWidth - offset * DAY_WIDTH - 4),
      span,
    };
  }

  if (!rows.length) {
    return (
      <div className="gantt-empty">
        <p>还没有设置日期的任务，为任务添加截止日期后即可在甘特图中查看。</p>
        {undated.length > 0 && (
          <div className="gantt-undated-list">
            {undated.slice(0, 8).map((task) => (
              <button type="button" key={task.id} onClick={() => onOpenTask(task.id)}>
                {task.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="gantt-view">
      <div className="gantt-scroll">
        <div className="gantt" style={{ width: 300 + totalWidth }}>
          <div className="gantt-head-row">
            <div className="gantt-label-head">
              <span>任务</span>
              <span>{rows.length} 个排期</span>
            </div>
            <div className="gantt-timeline-head" style={{ width: totalWidth }}>
              <div className="gantt-month-row" style={{ width: totalWidth }}>
                {months.map((month) => (
                  <div key={month.key} className="gantt-month" style={{ width: month.count * DAY_WIDTH }}>
                    {month.label}
                  </div>
                ))}
              </div>
              <div className="gantt-day-row" style={{ width: totalWidth }}>
                {range.days.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={`gantt-day-head ${isToday(day) ? 'is-today' : ''} ${isWeekend(day) ? 'is-weekend' : ''}`}
                    style={{ width: DAY_WIDTH }}
                    title={format(day, 'yyyy年M月d日')}
                  >
                    <span>{format(day, 'd')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="gantt-body">
            {rows.map((task) => {
              const geometry = barGeometry(task);
              const start = task.start_date || task.due_date;
              return (
                <div className="gantt-row" key={task.id}>
                  <button type="button" className="gantt-label" onClick={() => onOpenTask(task.id)}>
                    <StatusDot color={task.status?.color} size={8} />
                    <span className="gantt-label-name">{task.name}</span>
                    <span className="gantt-label-date">{format(parseDateValue(start), 'M/d')}</span>
                  </button>
                  <div className="gantt-track" style={{ width: totalWidth }}>
                    {range.days.map((day) => (
                      <div
                        key={day.toISOString()}
                        className={`gantt-day-cell ${isWeekend(day) ? 'is-weekend' : ''} ${isToday(day) ? 'is-today' : ''}`}
                        style={{ width: DAY_WIDTH }}
                      />
                    ))}
                    {geometry && (
                      <button
                        type="button"
                        className={`gantt-bar ${geometry.span === 1 ? 'is-milestone' : ''}`}
                        style={{
                          left: geometry.left,
                          width: geometry.span === 1 ? 18 : geometry.width,
                          '--bar-color': task.status?.color || '#7B68EE',
                        }}
                        onClick={() => onOpenTask(task.id)}
                        title={`${task.name} · ${task.status?.name}`}
                      >
                        {geometry.span > 1 && (
                          <>
                            <span className="gantt-bar-progress" style={{ width: `${task.checklist_total ? (task.checklist_done / task.checklist_total) * 100 : 0}%` }} />
                            <span className="gantt-bar-label">{task.name}</span>
                            {task.assignee && <span className="gantt-bar-avatar" style={{ background: task.assignee.color }}>{task.assignee.name.slice(-1)}</span>}
                          </>
                        )}
                        {geometry.span === 1 && <span className="gantt-milestone-label">{task.name}</span>}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {todayVisible && (
              <div className="gantt-today-line" style={{ left: 300 + todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }} />
            )}
          </div>
        </div>
      </div>
      {undated.length > 0 && (
        <div className="gantt-unscheduled">
          <span>未设置日期</span>
          {undated.map((task) => (
            <button type="button" key={task.id} onClick={() => onOpenTask(task.id)}>{task.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
