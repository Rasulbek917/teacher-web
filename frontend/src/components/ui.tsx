import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Inbox,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Search,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { fileUrl } from '../lib/api';
import { Sparkline } from './charts';

export const cx = clsx;

// ================================================================ Button
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline' | 'subtle';
type BtnSize = 'sm' | 'md' | 'lg' | 'icon';

const btnBase =
  'touch-target relative inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 active:scale-[.98]';

const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-primary-600 text-white shadow-soft hover:bg-primary-700 hover:shadow-glow',
  secondary:
    'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  danger: 'bg-red-600 text-white shadow-soft hover:bg-red-700',
  success: 'bg-emerald-600 text-white shadow-soft hover:bg-emerald-700',
  ghost:
    'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  outline:
    'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  subtle:
    'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20',
};

const btnSizes: Record<BtnSize, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-10 w-10 rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  fullWidth,
  className,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      className={cx(btnBase, btnVariants[variant], btnSizes[size], fullWidth && 'w-full', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        'touch-target inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ================================================================ Form fields
export function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-slate-400">{hint}</span>}
      {error && (
        <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-500">
          <XCircle className="h-3.5 w-3.5" />
          {error}
        </span>
      )}
    </label>
  );
}

export const inputCls =
  'w-full touch-target rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-soft transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

export function Input({
  label,
  error,
  hint,
  required,
  className,
  leftIcon,
  rightIcon,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            {leftIcon}
          </span>
        )}
        <input
          className={cx(
            inputCls,
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            error && 'border-red-400 focus:border-red-500 focus:ring-red-500/10',
            className,
          )}
          {...rest}
        />
        {rightIcon && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
            {rightIcon}
          </span>
        )}
      </div>
    </Field>
  );
}

export function Select({
  label,
  error,
  hint,
  required,
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        <select
          className={cx(inputCls, 'cursor-pointer appearance-none pr-10', error && 'border-red-400', className)}
          {...rest}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </Field>
  );
}

export function Textarea({
  label,
  error,
  hint,
  required,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      <textarea
        className={cx(inputCls, 'min-h-[96px] py-2.5 leading-relaxed', error && 'border-red-400', className)}
        {...rest}
      />
    </Field>
  );
}

// ================================================================ Modal
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-2xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className={cx(
          'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-pop animate-slide-up dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl sm:animate-scale-in',
          widths[size],
        )}
        role="dialog"
        aria-modal="true"
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
            <IconButton onClick={onClose} className="-mr-2 h-9 w-9">
              <X className="h-5 w-5" />
            </IconButton>
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Tasdiqlash',
  cancelText = 'Bekor qilish',
  danger = true,
  confirmDisabled,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} size="sm">
      <div className="flex items-start gap-3.5">
        <div
          className={cx(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            danger
              ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
              : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
          )}
        >
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <div className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{message}</div>
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>
          {cancelText}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={confirmDisabled}
          loading={loading}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

// ================================================================ Badge / tags
type BadgeColor = 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'indigo' | 'violet' | 'cyan';
const badgeColors: Record<BadgeColor, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  red: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  blue: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  indigo: 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300',
  cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300',
  violet: 'bg-secondary-50 text-secondary-700 dark:bg-secondary-500/10 dark:text-secondary-300',
};

const dotColors: Record<BadgeColor, string> = {
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  blue: 'bg-sky-500',
  slate: 'bg-slate-400',
  indigo: 'bg-primary-500',
  cyan: 'bg-cyan-500',
  violet: 'bg-secondary-500',
};

export function Badge({
  color = 'slate',
  dot,
  children,
}: {
  color?: BadgeColor;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-transparent',
        badgeColors[color],
      )}
    >
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', dotColors[color])} />}
      {children}
    </span>
  );
}

export function statusColor(status?: string | null): BadgeColor {
  switch (status) {
    case 'PAID':
    case 'DONE':
    case 'PRESENT':
    case 'ACTIVE':
    case 'SUBMITTED':
    case 'COMPLETED':
      return 'green';
    case 'PARTIAL':
    case 'LATE':
    case 'PENDING':
    case 'WARNING':
      return 'amber';
    case 'UNPAID':
    case 'WRONG':
    case 'ABSENT':
    case 'BLOCKED':
    case 'FAILED':
      return 'red';
    case 'NEW':
    case 'INFO':
      return 'cyan';
    default:
      return 'slate';
  }
}

// ================================================================ Card
export function Card({
  className,
  children,
  hover,
  as: As = 'div',
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
  as?: React.ElementType;
}) {
  return (
    <As className={cx('card min-w-0', hover && 'card-hover', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  sub,
  action,
  icon,
  className,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-display text-[15px] font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ================================================================ States
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-slate-400">
      <Loader2 className="h-7 w-7 animate-spin text-primary-500" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx('space-y-2.5', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cx('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function EmptyState({
  message,
  title,
  icon,
  action,
}: {
  message?: string;
  title?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <div>
        {title && <div className="font-display text-sm font-bold text-slate-700 dark:text-slate-200">{title}</div>}
        {message && <div className="mt-1 max-w-xs text-sm text-slate-400">{message}</div>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-500/10">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <span className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{message}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Qayta urinish
        </Button>
      )}
    </div>
  );
}

// ================================================================ Alert
export function Alert({
  type = 'info',
  title,
  children,
  className,
}: {
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: 'bg-sky-50 text-sky-800 border-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:border-sky-500/20',
    success:
      'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/20',
    warning:
      'bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20',
    error: 'bg-red-50 text-red-800 border-red-100 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/20',
  };
  const icons = {
    info: <Info className="h-4 w-4" />,
    success: <CheckCircle2 className="h-4 w-4" />,
    warning: <AlertTriangle className="h-4 w-4" />,
    error: <XCircle className="h-4 w-4" />,
  };
  return (
    <div className={cx('flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm', styles[type], className)}>
      <span className="mt-0.5 shrink-0">{icons[type]}</span>
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}

// ================================================================ Tabs
export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: string; label: string; icon?: React.ReactNode; count?: number }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cx('no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1', className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cx(
              'inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
              active
                ? 'bg-primary-600 text-white shadow-soft'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cx(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-bold',
                  active ? 'bg-white/20' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ================================================================ Progress
export function ProgressBar({
  value,
  color = '#6366f1',
  className,
  showLabel,
}: {
  value: number;
  color?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {showLabel && <span className="w-9 text-right text-xs font-semibold text-slate-500">{Math.round(pct)}%</span>}
    </div>
  );
}

// ================================================================ Segmented
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'inline-flex items-center gap-0.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
            o.value === value
              ? 'bg-white text-slate-900 shadow-soft dark:bg-slate-700 dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ================================================================ Tooltip
export function Tooltip({
  content,
  children,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cx('group/tt relative inline-flex', className)}>
      {children}
      <span className="pointer-events-none absolute -top-2 left-1/2 z-50 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/tt:block group-hover/tt:opacity-100 dark:bg-slate-700">
        {content}
      </span>
    </span>
  );
}

// ================================================================ Dropdown
export function Dropdown({
  trigger,
  children,
  align = 'right',
  className,
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          className={cx(
            'absolute z-50 mt-2 min-w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-pop animate-scale-in dark:border-slate-700 dark:bg-slate-900',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
        danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ================================================================ Pagination
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).slice(
    Math.max(0, page - 2),
    Math.min(totalPages, page + 1),
  );
  const navBtn =
    'touch-target inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';
  return (
    <div className="mt-5 flex items-center justify-center gap-1.5">
      <button type="button" className={navBtn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="h-5 w-5" />
      </button>
      {page > 3 && (
        <>
          <button
            type="button"
            className="touch-target inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => onChange(1)}
          >
            1
          </button>
          <span className="px-1 text-slate-400">…</span>
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cx(
            'touch-target inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-sm font-semibold transition-colors',
            p === page
              ? 'bg-primary-600 text-white shadow-soft'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
          )}
        >
          {p}
        </button>
      ))}
      {page < totalPages - 2 && (
        <>
          <span className="px-1 text-slate-400">…</span>
          <button
            type="button"
            className="touch-target inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => onChange(totalPages)}
          >
            {totalPages}
          </button>
        </>
      )}
      <button type="button" className={navBtn} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

// ================================================================ StatCard
type Tone = 'primary' | 'green' | 'red' | 'amber' | 'cyan' | 'violet' | 'slate';
const toneStyles: Record<Tone, { chip: string; spark: string; text: string }> = {
  primary: { chip: 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300', spark: '#6366f1', text: 'text-primary-600 dark:text-primary-300' },
  green: { chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300', spark: '#22c55e', text: 'text-emerald-600 dark:text-emerald-300' },
  red: { chip: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300', spark: '#ef4444', text: 'text-red-600 dark:text-red-300' },
  amber: { chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300', spark: '#f59e0b', text: 'text-amber-600 dark:text-amber-300' },
  cyan: { chip: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300', spark: '#06b6d4', text: 'text-cyan-600 dark:text-cyan-300' },
  violet: { chip: 'bg-secondary-50 text-secondary-600 dark:bg-secondary-500/10 dark:text-secondary-300', spark: '#8b5cf6', text: 'text-secondary-600 dark:text-secondary-300' },
  slate: { chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', spark: '#94a3b8', text: 'text-slate-500 dark:text-slate-300' },
};

export function StatCard({
  icon,
  label,
  value,
  sub,
  tone = 'primary',
  trend,
  trendLabel,
  spark,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  trend?: number;
  trendLabel?: string;
  spark?: number[];
}) {
  const t = toneStyles[tone] ?? toneStyles.primary;
  const up = (trend ?? 0) >= 0;
  return (
    <div className="card card-hover relative min-w-0 overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', t.chip)}>{icon}</div>
        {trend !== undefined && (
          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
              up
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300',
            )}
          >
            {up ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <div className="font-display text-2xl font-extrabold leading-tight text-slate-900 dark:text-slate-100">{value}</div>
        <div className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
        {sub && <div className={cx('mt-1 truncate text-xs font-semibold', t.text)}>{sub}</div>}
        {trendLabel && !sub && <div className="mt-1 truncate text-xs text-slate-400">{trendLabel}</div>}
      </div>
      {spark && spark.length > 1 && (
        <div className="-mx-1 mt-2">
          <Sparkline data={spark} color={t.spark} height={34} />
        </div>
      )}
    </div>
  );
}

// ================================================================ PageHeader
export function PageHeader({
  title,
  action,
  sub,
  icon,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  sub?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('mb-5 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-extrabold text-slate-900 dark:text-slate-100 sm:text-2xl">
            {title}
          </h1>
          {sub && <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

// ================================================================ Avatar
export function Avatar({
  url,
  name,
  size = 'md',
  className,
  ring,
}: {
  url?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean;
}) {
  const sizes = {
    xs: 'h-7 w-7 text-[10px]',
    sm: 'h-9 w-9 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
    xl: 'h-20 w-20 text-2xl',
  };
  const initials = name
    ? name
        .split(' ')
        .filter(Boolean)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 font-semibold text-white',
        ring && 'ring-2 ring-white dark:ring-slate-900',
        sizes[size],
        className,
      )}
    >
      {url ? <img src={fileUrl(url)} alt={name ?? ''} className="h-full w-full object-cover" /> : <span>{initials}</span>}
    </div>
  );
}

// ================================================================ SearchBar
export function SearchBar({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? 'Qidiruv...'}
      leftIcon={<Search className="h-4 w-4" />}
      className={cx('sm:max-w-xs', className)}
    />
  );
}

export { DataTable } from './Table';
