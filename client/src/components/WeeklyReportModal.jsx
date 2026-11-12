import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, ExternalLink, Printer } from 'lucide-react';
import { addDays, endOfWeek, format, startOfWeek } from '../lib/date.js';
import { Modal } from './ui.jsx';

export default function WeeklyReportModal({ open, onClose, list }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (open) setWeekOffset(0);
  }, [open]);

  const weeks = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 13 }, (_, index) => {
      const offset = index - 8;
      const start = addDays(base, offset * 7);
      const end = endOfWeek(start, { weekStartsOn: 1 });
      return {
        offset,
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd'),
        label: `${format(start, 'M月d日')} — ${format(end, 'M月d日')}`,
      };
    });
  }, []);

  const current = weeks.find((week) => week.offset === weekOffset) || weeks[8];
  const reportUrl = list
    ? `/api/lists/${list.id}/weekly-report?start=${encodeURIComponent(current.start)}&end=${encodeURIComponent(current.end)}`
    : '';

  function printReport() {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="项目周报"
      subtitle="按自然周生成 A4 结构化周报，可直接打印或另存为 PDF"
      width={1160}
      className="weekly-report-modal"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>关闭</button>
          <button type="button" className="btn btn-ghost" onClick={() => window.open(reportUrl, '_blank', 'noopener')}>
            <ExternalLink size={14} /> 新标签页打开
          </button>
          <button type="button" className="btn btn-primary" onClick={printReport}>
            <Printer size={15} /> 打印 / 另存为 PDF
          </button>
        </>
      }
    >
      <div className="weekly-report-controls">
        <div className="weekly-week-picker">
          <CalendarRange size={15} />
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setWeekOffset((value) => Math.max(-8, value - 1))} disabled={weekOffset <= -8}>
            上一周
          </button>
          <select className="mini-select" value={weekOffset} onChange={(event) => setWeekOffset(Number(event.target.value))}>
            {weeks.map((week) => (
              <option key={week.offset} value={week.offset}>
                {week.offset === 0 ? `本周 · ${week.label}` : week.offset === -1 ? `上周 · ${week.label}` : week.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setWeekOffset((value) => Math.min(4, value + 1))} disabled={weekOffset >= 4}>
            下一周
          </button>
          {weekOffset !== 0 && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setWeekOffset(0)}>回到本周</button>
          )}
        </div>
        <span className="weekly-report-hint">
          预览使用 A4 版式。打印时在系统对话框中选择“另存为 PDF”即可导出。
        </span>
      </div>
      <div className="weekly-report-frame-wrap">
        <iframe
          ref={frameRef}
          key={reportUrl}
          title={`${list?.name || ''} 周报`}
          src={reportUrl}
          className="weekly-report-frame"
        />
      </div>
    </Modal>
  );
}
