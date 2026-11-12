import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWeekend,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';

export {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWeekend,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  zhCN,
};

export function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dateKey(value) {
  const date = parseDateValue(value);
  return date ? format(date, 'yyyy-MM-dd') : '';
}

export function todayKey() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function formatDate(value, pattern = 'M月d日') {
  const date = parseDateValue(value);
  return date ? format(date, pattern, { locale: zhCN }) : '';
}

export function formatDateSmart(value) {
  const date = parseDateValue(value);
  if (!date) return '';
  const today = startOfDay(new Date());
  const diff = differenceInCalendarDays(date, today);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === 2) return '后天';
  if (diff === -1) return '昨天';
  if (date.getFullYear() === today.getFullYear()) return format(date, 'M月d日', { locale: zhCN });
  return format(date, 'yyyy年M月d日', { locale: zhCN });
}

export function dueTone(value, statusType) {
  if (!value) return '';
  if (statusType === 'done' || statusType === 'closed') return 'is-done';
  const date = parseDateValue(value);
  if (!date) return '';
  const diff = differenceInCalendarDays(date, startOfDay(new Date()));
  if (diff < 0) return 'is-overdue';
  if (diff === 0) return 'is-today';
  if (diff <= 3) return 'is-soon';
  return '';
}

export function relativeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (date.getFullYear() === new Date().getFullYear()) return format(date, 'M月d日', { locale: zhCN });
  return format(date, 'yyyy年M月d日', { locale: zhCN });
}

export function formatTime(value) {
  const date = new Date(value);
  return format(date, 'HH:mm');
}

export function formatDateTime(value, pattern = 'yyyy-MM-dd HH:mm') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, pattern, { locale: zhCN });
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function monthMatrix(monthDate) {
  const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export function lastNDays(n) {
  const today = startOfDay(new Date());
  return Array.from({ length: n }, (_, index) => addDays(today, index - (n - 1)));
}

export function initials(name = '') {
  const trimmed = String(name).trim();
  if (!trimmed) return '?';
  if (/^[a-zA-Z]/.test(trimmed)) {
    const parts = trimmed.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  return trimmed.slice(-2);
}
