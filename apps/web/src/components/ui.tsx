import React from 'react';
import { Link } from 'react-router-dom';

/* Shared command-center primitives. All values render from props —
   nothing here invents data. */

export function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="kicker">{children}</div>;
}

export function PageHead({
  kicker,
  title,
  sub,
  actions,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      {kicker ? <Kicker>{kicker}</Kicker> : null}
      <div className="row-between">
        <div>
          <h1 className="display-title">{title}</h1>
          {sub ? <p className="display-sub">{sub}</p> : null}
        </div>
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function StatusDot({ tone, label }: { tone: 'ok' | 'warn' | 'bad' | 'live' | 'idle'; label: string }) {
  const color =
    tone === 'ok' ? 'var(--color-success)'
    : tone === 'warn' ? 'var(--color-warning)'
    : tone === 'bad' ? 'var(--color-error)'
    : tone === 'live' ? 'var(--color-live)'
    : 'var(--color-text-muted)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 9999, background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
      {label}
    </span>
  );
}

export function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tone = pct >= 75 ? 'good' : pct >= 45 ? 'warn' : 'bad';
  return (
    <span className="score-bar" role="img" aria-label={`Score ${Math.round(value)} of ${max}`}>
      <span className={`score-bar-fill ${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Sparkline({ points, width = 96, height = 28 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => `${(i * step).toFixed(1)},${(height - 3 - ((p - min) / span) * (height - 6)).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={coords} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({
  title,
  what,
  why,
  action,
}: {
  title: string;
  what: string;
  why: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">{title}</h2>
        <p className="empty-state-description">{what}</p>
        <p className="empty-state-description" style={{ marginTop: '0.35rem' }}>{why}</p>
        {action ? <div style={{ marginTop: '1rem' }}>{action}</div> : null}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">Something went wrong</h2>
        <p className="empty-state-description">{message}</p>
        <div style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onRetry}>Retry</button>
        </div>
      </div>
    </div>
  );
}

export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card" aria-label="Loading">
      <div className="stack-sm">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '0.9rem', width: `${92 - i * 14}%` }} />
        ))}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card" aria-label={title}>
      <div className="row-between" style={{ marginBottom: '0.85rem' }}>
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TimeAgo({ value }: { value?: string | null }) {
  if (!value) return <span className="tiny">Unknown</span>;
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms) || ms < 0) return <span className="tiny">Unknown</span>;
  const mins = Math.floor(ms / 60000);
  const label = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
  return <span className="tiny">{label}</span>;
}

export function ViewLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="btn btn-ghost btn-sm">
      {children}
    </Link>
  );
}
