import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const inputCls =
  'rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:border-sky-500 disabled:opacity-50';

export function Button({ variant = 'default', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' }) {
  const tone = {
    default: 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700',
    primary: 'border-sky-600 bg-sky-600 text-white hover:bg-sky-500',
    danger: 'border-red-800 bg-red-950 text-red-200 hover:bg-red-900',
  }[variant];
  return (
    <button
      {...p}
      className={`rounded border px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${tone} ${className}`}
    />
  );
}

export function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
        {aside}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Alert({ tone, children }: { tone: 'error' | 'info' | 'warn'; children: ReactNode }) {
  const cls = {
    error: 'border-red-800 bg-red-950/60 text-red-200',
    info: 'border-sky-800 bg-sky-950/60 text-sky-200',
    warn: 'border-amber-800 bg-amber-950/60 text-amber-200',
  }[tone];
  return <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded border px-3 py-2 text-sm ${cls}`}>{children}</p>;
}
