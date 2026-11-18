import { Check, ChevronDown } from 'lucide-react';
import { Popover } from './ui.jsx';

export default function Select({
  value,
  onChange,
  options = [],
  placeholder = '请选择',
  className = '',
  menuWidth = 260,
  disabled = false,
  ariaLabel = '',
  align = 'left',
}) {
  const normalized = options.map((option) =>
    option && typeof option === 'object'
      ? option
      : { value: option, label: String(option) }
  );
  const selected = normalized.find((option) => String(option.value) === String(value)) || null;

  return (
    <Popover
      width={menuWidth}
      align={align}
      trigger={
        <button
          type="button"
          className={`ui-select ${className}`}
          disabled={disabled}
          aria-label={ariaLabel || placeholder}
          aria-haspopup="listbox"
        >
          {selected?.icon && <span className="ui-select-leading">{selected.icon}</span>}
          <span className={`ui-select-value ${selected ? '' : 'is-placeholder'}`}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown size={14} className="ui-select-chevron" />
        </button>
      }
    >
      {({ close }) => (
        <div className="ui-select-menu" role="listbox">
          {normalized.map((option) => {
            const active = String(option.value) === String(value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={`ui-select-option ${active ? 'is-active' : ''}`}
                key={String(option.value)}
                onClick={() => {
                  onChange?.(option.value);
                  close();
                }}
              >
                {option.icon && <span className="ui-select-option-icon">{option.icon}</span>}
                <span className="ui-select-option-label">{option.label}</span>
                {option.hint && <span className="ui-select-option-hint">{option.hint}</span>}
                {active && <Check size={14} className="ui-select-check" />}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
