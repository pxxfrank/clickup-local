import { CalendarDays, X } from 'lucide-react';
import { format } from '../lib/date.js';

function displayValue(value, type) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return format(date, type === 'datetime-local' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
}

export default function DateField({
  value = '',
  onChange,
  type = 'date',
  className = 'input',
  placeholder = '选择日期',
  clearable = true,
  min,
  max,
  disabled = false,
  ariaLabel = '',
}) {
  const shown = displayValue(value, type);
  return (
    <span className={`ui-date ${className} ${disabled ? 'is-disabled' : ''}`}>
      <CalendarDays size={14} className="ui-date-icon" />
      <span className={`ui-date-value ${shown ? '' : 'is-placeholder'}`}>{shown || placeholder}</span>
      {clearable && value && !disabled && (
        <button
          type="button"
          className="ui-date-clear"
          aria-label="清除日期"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onChange?.('');
          }}
        >
          <X size={12} />
        </button>
      )}
      <input
        type={type}
        value={value || ''}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel || placeholder}
        onChange={(event) => onChange?.(event.target.value)}
        onClick={(event) => {
          if (typeof event.currentTarget.showPicker === 'function') {
            try {
              event.currentTarget.showPicker();
            } catch {
              // Some browsers only allow showPicker from a direct gesture; focus still works.
            }
          }
        }}
      />
    </span>
  );
}
