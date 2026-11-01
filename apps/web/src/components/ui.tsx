import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

export const inputCls =
  'rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus:border-accent disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
const tone: Record<Variant, string> = {
  primary: 'border-accent bg-accent text-white hover:bg-accent-hover hover:border-accent-hover',
  secondary: 'border-line-strong bg-surface text-ink hover:bg-subtle',
  quiet: 'border-transparent bg-transparent text-accent hover:bg-accent-soft',
  danger: 'border-danger-line bg-surface text-danger hover:bg-danger-soft',
};

export function Button({ variant = 'secondary', size = 'md', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} ${tone[variant]} ${className}`}
    />
  );
}

/** White surface with a thin border. Flat: no shadow. */
export function Card({ children, className = '', as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'aside' } & Record<string, unknown>) {
  return <Tag {...rest} className={`rounded-lg border border-line bg-surface ${className}`}>{children}</Tag>;
}

export function Alert({ tone: t, children, className = '' }: { tone: 'error' | 'info' | 'warn' | 'ok'; children: ReactNode; className?: string }) {
  const cls = {
    error: 'border-danger-line bg-danger-soft text-danger',
    info: 'border-info-line bg-info-soft text-info-ink',
    warn: 'border-warn-line bg-warn-soft text-warn-ink',
    ok: 'border-line bg-ok-soft text-ok-ink',
  }[t];
  return <p role={t === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${cls} ${className}`}>{children}</p>;
}

export function Badge({ children, tone: t = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'info' }) {
  const cls = { neutral: 'bg-subtle text-ink-soft', accent: 'bg-accent-soft text-accent-ink', warn: 'bg-warn-soft text-warn-ink', info: 'bg-info-soft text-info-ink' }[t];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export interface TabItem<T extends string> { id: T; label: string }

/** Underlined tabs. Only the selected panel is rendered by the caller. */
export function Tabs<T extends string>({ items, value, onChange, label, className = '' }: { items: readonly TabItem<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 ${className}`}>
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${value === it.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Collapsible section built on <details>, so it is keyboard- and screen-reader-friendly by default. */
export function Disclosure({ title, hint, children, defaultOpen = false, className = '' }: { title: string; hint?: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  return (
    <details open={defaultOpen} className={`group rounded-md border border-line bg-surface ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-ink marker:hidden [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-xs text-muted transition-transform group-open:rotate-90">▶</span>
        <span>{title}</span>
        {hint && <span className="ml-auto text-xs font-normal text-muted">{hint}</span>}
      </summary>
      <div className="border-t border-line px-3 py-3 text-sm">{children}</div>
    </details>
  );
}

/** Button + popover panel. Closes on outside click and Escape; the panel is a labelled dialog. */
export function Menu({ label, children, align = 'right', width = 320, buttonVariant = 'secondary' }: { label: string; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; width?: number; buttonVariant?: Variant }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <Button variant={buttonVariant} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>
        {label} <span aria-hidden className="text-[10px]">▾</span>
      </Button>
      {open && (
        <div id={id} role="dialog" aria-label={label} style={{ width: `min(${width}px, calc(100vw - 24px))` }}
          className={`absolute z-30 mt-1.5 max-h-[80vh] overflow-auto rounded-lg border border-line-strong bg-surface p-3 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
