import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, Check, Download, ExternalLink, PencilLine, Printer } from 'lucide-react';
import { addDays, endOfWeek, format, startOfWeek } from '../lib/date.js';
import { Modal } from './ui.jsx';

export default function WeeklyReportModal({ open, onClose, list }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState(false);
  const frameRef = useRef(null);

  useEffect(() => {
    if (open) {
      setWeekOffset(0);
      setEditing(false);
    }
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

  function applyEditable(frame, value) {
    const report = frame?.contentDocument?.querySelector('.report');
    if (!report) return;
    report.setAttribute('contenteditable', value ? 'true' : 'false');
    report.classList.toggle('is-editing', value);
  }

  function toggleEditing() {
    const next = !editing;
    setEditing(next);
    applyEditable(frameRef.current, next);
  }

  function printReport() {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }

  function downloadWord() {
    const doc = frameRef.current?.contentDocument;
    const report = doc?.querySelector('.report');
    if (!report) return;
    const clone = report.cloneNode(true);
    clone.removeAttribute('contenteditable');
    clone.classList.remove('is-editing');
    const styles = doc.head?.querySelector('style')?.textContent || '';
    const html = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${list?.name || '项目'} 周报</title><style>${styles}
@page { size: A4; margin: 14mm; }
body { margin: 0; background: #fff; }
.report { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
.print-bar { display: none; }
</style></head><body>${clone.outerHTML}</body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${list?.name || '项目'}周报-${current.start}.doc`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          <button type="button" className="btn btn-ghost" onClick={toggleEditing}>
            {editing ? <Check size={14} /> : <PencilLine size={14} />}
            {editing ? '完成编辑' : '编辑周报'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={downloadWord}>
            <Download size={14} /> 下载 Word
          </button>
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
          {editing
            ? '编辑模式：可直接修改预览中的文字，修改仅影响本次打印/下载。'
            : '预览使用 A4 版式。可编辑后打印，或下载为可编辑 Word 文档。'}
        </span>
      </div>
      <div className="weekly-report-frame-wrap">
        <iframe
          ref={frameRef}
          key={reportUrl}
          title={`${list?.name || ''} 周报`}
          src={reportUrl}
          className="weekly-report-frame"
          onLoad={() => applyEditable(frameRef.current, editing)}
        />
      </div>
    </Modal>
  );
}
