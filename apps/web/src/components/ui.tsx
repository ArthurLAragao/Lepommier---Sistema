import {
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Inbox,
  LoaderCircle,
  Search as SearchIcon,
  X,
} from 'lucide-react';
import { formatDateTime, formatMoney } from '@pommier/shared';

export function Button({
  variant = 'primary',
  busy = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`button button-${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy}
    >
      {busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <span className={`badge badge-${tone}`}>
      <span className="badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Field({
  label,
  hint,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input
        {...props}
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${fieldId}-help` : undefined}
      />
      {(error || hint) && (
        <span id={`${fieldId}-help`} className={error ? 'field-error' : 'field-hint'}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

export function Search({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className="search">
      <SearchIcon size={17} aria-hidden="true" />
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input {...props} id={id} type="search" />
    </div>
  );
}

export function Filter({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className="filter">
      <label htmlFor={id}>{label}</label>
      <select {...props} id={id}>
        {children}
      </select>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        {icon ?? <Inbox size={25} strokeWidth={1.5} />}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="error-state">
      <AlertCircle size={21} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
        {action}
      </div>
    </div>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <span role="status" className="loading">
      <LoaderCircle className="spin" size={18} aria-hidden="true" />
      {label}
    </span>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}
export function Table<T>({
  caption,
  columns,
  rows,
  rowKey,
}: {
  caption: string;
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
}) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Paginação">
      <span>
        Página {page} de {Math.max(1, pageCount)}
      </span>
      <Button
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Página anterior"
      >
        <ArrowLeft size={15} />
      </Button>
      <Button
        variant="secondary"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        aria-label="Próxima página"
      >
        <ArrowRight size={15} />
      </Button>
    </nav>
  );
}

export function Dialog({
  triggerLabel,
  triggerIcon,
  title,
  description,
  children,
}: {
  triggerLabel: string;
  triggerIcon?: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        {triggerIcon ?? triggerLabel}
      </button>
      <dialog
        ref={dialog}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="dialog-content"
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            dialog.current?.close();
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {children}
        <Button
          className="dialog-close"
          variant="ghost"
          aria-label="Fechar janela"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </Button>
        <Button variant="primary" onClick={() => dialog.current?.close()}>
          Entendi
        </Button>
      </dialog>
    </>
  );
}

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="status" className="toast">
      <Check size={17} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" aria-label="Fechar aviso" onClick={onDismiss}>
        <X size={16} />
      </button>
    </div>
  );
}

export function Currency({ cents }: { cents: number }) {
  return <span className="numeric">{formatMoney(cents)}</span>;
}
export function DateTime({ value }: { value: string }) {
  return <time dateTime={value}>{formatDateTime(value)}</time>;
}

/** Presentation helper only. The API must independently authorize the same action. */
export function PermissionAction({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  return allowed ? <>{children}</> : null;
}
