import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Flag,
  Loader2,
  X,
} from 'lucide-react';
import { formatDateSmart, dueTone, initials } from '../lib/date.js';

export function LogoMark({ size = 30 }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.64} height={size * 0.64} aria-hidden="true">
        <path d="M4 14.5 10 9l4 3.5L20 6" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 19h16" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" opacity=".65" />
      </svg>
    </span>
  );
}

export function Logo({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <LogoMark />
      {!compact && (
        <div className="brand-text">
          <span className="brand-name">ClickUp</span>
          <span className="brand-badge">本地版</span>
        </div>
      )}
    </div>
  );
}

export function Avatar({ user, size = 26, className = '', title }) {
  const name = user?.name || '未指派';
  const color = user?.color || '#b8b8c7';
  return (
    <span
      className={`avatar ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.36)),
        background: `linear-gradient(135deg, ${color}, ${color}d0)`,
      }}
      title={title ?? name}
    >
      {initials(name)}
    </span>
  );
}

export function IconButton({ label, children, className = '', ...props }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function Popover({ trigger, children, align = 'left', width = 240, className = '', menuClassName = '' }) {
  const anchorRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const menuWidth = menu?.offsetWidth || width;
      const menuHeight = menu?.offsetHeight || 200;
      let left = align === 'right' ? rect.right - menuWidth : align === 'center' ? rect.left + rect.width / 2 - menuWidth / 2 : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      let top = rect.bottom + 6;
      if (top + menuHeight > window.innerHeight - 8 && rect.top - menuHeight - 6 > 8) {
        top = rect.top - menuHeight - 6;
      }
      setPosition({ top, left });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (anchorRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <div ref={anchorRef} className={`popover-anchor ${className}`} onClick={() => setOpen((value) => !value)}>
        {trigger}
      </div>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className={`popover-menu ${menuClassName}`}
            style={{ top: position.top, left: position.left, width }}
            onClick={(event) => event.stopPropagation()}
          >
            {typeof children === 'function' ? children({ close }) : children}
          </div>,
          document.body
        )}
    </>
  );
}

export function MenuItem({ icon, children, onClick, active = false, danger = false, hint, disabled = false }) {
  return (
    <button
      type="button"
      className={`menu-item ${active ? 'is-active' : ''} ${danger ? 'is-danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className="menu-item-icon">{icon}</span>}
      <span className="menu-item-label">{children}</span>
      {hint && <span className="menu-item-hint">{hint}</span>}
      {active && <Check size={14} className="menu-item-check" />}
    </button>
  );
}

export function MenuLabel({ children }) {
  return <div className="menu-label">{children}</div>;
}

export function MenuDivider() {
  return <div className="menu-divider" />;
}

export function Modal({ open, onClose, title, subtitle, children, footer, width = 560, className = '', hideClose = false }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-layer">
      <div className="modal-backdrop" onClick={onClose} />
      <div className={`modal ${className}`} style={{ width }} role="dialog" aria-modal="true">
        {(title || !hideClose) && (
          <div className="modal-head">
            <div>
              {title && <h3>{title}</h3>}
              {subtitle && <p>{subtitle}</p>}
            </div>
            {!hideClose && (
              <IconButton label="关闭" onClick={onClose}>
                <X size={18} />
              </IconButton>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ open, title = '确认操作', message, confirmLabel = '删除', danger = true, onConfirm, onClose, busy = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={420}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="spin" size={15} /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
    </Modal>
  );
}

export function StatusPill({ status, size = 'md' }) {
  if (!status) return null;
  return (
    <span className={`status-pill status-${size}`} style={{ '--status-color': status.color }}>
      <span className="status-pill-dot" />
      {status.name}
    </span>
  );
}

export function StatusDot({ color, size = 12, muted = false }) {
  return (
    <span
      className={`status-dot ${muted ? 'is-muted' : ''}`}
      style={{ width: size, height: size, backgroundColor: color }}
    />
  );
}

const PRIORITY = {
  1: { label: '紧急', color: '#e5484d' },
  2: { label: '高', color: '#f59e0b' },
  3: { label: '普通', color: '#4a9eff' },
  4: { label: '低', color: '#87909e' },
  0: { label: '无', color: '#b6b8c2' },
};

export function PriorityFlag({ priority, withLabel = false, size = 14 }) {
  const config = PRIORITY[priority] || PRIORITY[0];
  return (
    <span className={`priority ${priority ? '' : 'priority-none'}`} style={{ color: config.color }} title={`优先级：${config.label}`}>
      <Flag size={size} fill={priority ? config.color : 'none'} strokeWidth={2} />
      {withLabel && <span>{config.label}</span>}
    </span>
  );
}

export function PriorityMenu({ value, onChange }) {
  return (
    (([1, 2, 3, 4, 0]) || []).map((priority) => (
      <MenuItem key={priority} active={Number(value) === priority} onClick={() => onChange(priority)} icon={<PriorityFlag priority={priority} />}>
        {PRIORITY[priority].label}
      </MenuItem>
    ))
  );
}

export function DueBadge({ date, statusType, showIcon = true }) {
  if (!date) return <span className="due-empty">设置日期</span>;
  return (
    <span className={`due-badge ${dueTone(date, statusType)}`}>
      {showIcon && <span className="due-dot" />}
      {formatDateSmart(date)}
    </span>
  );
}

export function TagChip({ tag, onClick, small = false }) {
  return (
    <span
      className={`tag-chip ${small ? 'tag-small' : ''}`}
      style={{ '--tag-color': tag.color }}
      onClick={onClick}
      title={tag.name}
    >
      {tag.name}
    </span>
  );
}

export function Spinner({ size = 18 }) {
  return <Loader2 size={size} className="spin" />;
}

export function LoadingScreen({ label = '加载中…' }) {
  return (
    <div className="loading-screen">
      <LogoMark size={42} />
      <div className="loading-label">{label}</div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action, compact = false }) {
  return (
    <div className={`empty-state ${compact ? 'empty-compact' : ''}`}>
      {icon && <div className="empty-icon">{icon}</div>}
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function UserChip({ user, subtitle, size = 26 }) {
  if (!user) {
    return (
      <span className="user-chip">
        <Avatar size={size} />
        <span>未指派</span>
      </span>
    );
  }
  return (
    <span className="user-chip">
      <Avatar user={user} size={size} />
      <span className="user-chip-text">
        <span>{user.name}</span>
        {subtitle && <em>{subtitle}</em>}
      </span>
    </span>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="section-title">
      <span>{children}</span>
      {action}
    </div>
  );
}

export function ToastStack({ toasts, onDismiss }) {
  return createPortal(
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type || 'default'}`}>
          <span className="toast-icon">
            {toast.type === 'error' ? <AlertTriangle size={16} /> : <Check size={16} />}
          </span>
          <span className="toast-text">{toast.message}</span>
          <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="关闭提示">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}

export function SelectMenu({ value, options, onChange, trigger, width = 220, align = 'left' }) {
  return (
    <Popover
      width={width}
      align={align}
      trigger={
        trigger || (
          <button type="button" className="select-trigger">
            {options.find((option) => option.value === value)?.label || '请选择'}
            <ChevronDown size={14} />
          </button>
        )
      }
    >
      {({ close }) => (
        <div className="menu-scroll">
          {options.map((option) => (
            <MenuItem
              key={String(option.value)}
              active={option.value === value}
              onClick={() => {
                onChange(option.value);
                close();
              }}
            >
              {option.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function ProgressBar({ value, total, color = '#7B68EE', height = 5 }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="progress-bar" style={{ height }}>
      <span style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}
