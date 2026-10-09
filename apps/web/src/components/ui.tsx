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
  nextStep,
  helpHref,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  nextStep?: string;
  helpHref?: string;
}) {
  return (
    <div className="page-header">
      {kicker ? <Kicker>{kicker}</Kicker> : null}
      <div className="row-between">
        <div style={{ minWidth: 0 }}>
          <h1 className="display-title">{title}</h1>
          {sub ? <p className="display-sub">{sub}</p> : null}
          {nextStep ? (
            <p className="guide-next" role="note">
              <span className="guide-next-label">What to do next: </span>
              {nextStep}{' '}
              {helpHref ? (
                <Link to={helpHref} className="guide-next-help">
                  Learn why
                </Link>
              ) : null}
            </p>
          ) : null}
        </div>
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/* Every screen must answer: Where am I? What am I looking at?
   Why does this matter? What can I do here? What happens on click?
   What should I do next? — in plain language a 16-year-old can follow. */
export function GuideCard({
  whereAmI,
  whatIsThis,
  whyItMatters,
  whatYouCanDo,
  whatNext,
  action,
}: {
  whereAmI: string;
  whatIsThis: string;
  whyItMatters: string;
  whatYouCanDo: string;
  whatNext: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="card guide-card" aria-label={`${whereAmI} guide`}>
      <p className="kicker">How this page works</p>
      <dl className="guide-list">
        <div className="guide-row">
          <dt>Where am I?</dt>
          <dd>{whereAmI}</dd>
        </div>
        <div className="guide-row">
          <dt>What am I looking at?</dt>
          <dd>{whatIsThis}</dd>
        </div>
        <div className="guide-row">
          <dt>Why does this matter?</dt>
          <dd>{whyItMatters}</dd>
        </div>
        <div className="guide-row">
          <dt>What can I do here?</dt>
          <dd>{whatYouCanDo}</dd>
        </div>
        <div className="guide-row">
          <dt>What should I do next?</dt>
          <dd>{whatNext}</dd>
        </div>
      </dl>
      {action ? <div className="actions" style={{ marginTop: '0.75rem' }}>{action}</div> : null}
    </section>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={label} className={`stepper-item stepper-${state}`} aria-current={i === current ? 'step' : undefined}>
            <span className="stepper-dot" aria-hidden="true">
              {i < current ? '✓' : i + 1}
            </span>
            <span className="stepper-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [armed, setArmed] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  async function handle() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setWorking(true);
    try {
      await onConfirm();
    } finally {
      setWorking(false);
      setArmed(false);
    }
  }
  return (
    <button
      type="button"
      className={armed ? 'btn btn-danger btn-sm' : 'btn btn-secondary btn-sm'}
      disabled={disabled || working}
      onClick={() => void handle()}
      onBlur={() => setArmed(false)}
    >
      {working ? 'Working…' : armed ? confirmLabel : label}
    </button>
  );
}

export function HonestValue({
  value,
  fallback = 'Not available from the connected sources.',
}: {
  value: string | number | null | undefined;
  fallback?: string;
}) {
  if (value === null || value === undefined || value === '') {
    return <span className="muted">{fallback}</span>;
  }
  return <span>{value}</span>;
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
  nextStep,
}: {
  title: string;
  what: string;
  why: string;
  action?: React.ReactNode;
  nextStep?: string;
}) {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">{title}</h2>
        <p className="empty-state-description">{what}</p>
        <p className="empty-state-description" style={{ marginTop: '0.35rem' }}>{why}</p>
        {nextStep ? (
          <p className="empty-state-description guide-next" style={{ marginTop: '0.5rem' }}>
            What to do next: {nextStep}
          </p>
        ) : null}
        {action ? <div style={{ marginTop: '1rem' }}>{action}</div> : null}
      </div>
    </div>
  );
}

export function AuthGate({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="stack">
      <PageHead title={title} sub={sub} />
      <div className="card">
        <h2 className="section-title">Sign in to continue</h2>
        <p className="muted" style={{ margin: '0.25rem 0 1rem' }}>
          {sub} Your work is saved per workspace after you sign in.
        </p>
        {children}
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

export function Badge({ tone = 'neutral', children }: { tone?: 'success' | 'warning' | 'error' | 'neutral' | 'info' | 'accent'; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="card" role="status" aria-live="polite" aria-label={label}>
      <div className="stack-sm">
        <div className="skeleton" style={{ height: '0.9rem', width: '60%' }} />
        <div className="skeleton" style={{ height: '0.9rem', width: '85%' }} />
        <div className="skeleton" style={{ height: '0.9rem', width: '70%' }} />
        <span className="tiny">{label}</span>
      </div>
    </div>
  );
}

export function PermissionState({
  title = 'Permission required',
  what = 'You are signed in, but this workspace item is not shared with you.',
  nextStep = 'Ask a workspace admin for access, or switch workspaces from the top bar.',
}: {
  title?: string;
  what?: string;
  nextStep?: string;
}) {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">{title}</h2>
        <p className="empty-state-description">{what}</p>
        <p className="empty-state-description guide-next" style={{ marginTop: '0.5rem' }}>
          What to do next: {nextStep}
        </p>
      </div>
    </div>
  );
}

export function FeatureUnavailable({
  title = 'Not available yet',
  what = 'This capability is not connected in your workspace.',
  nextStep,
  action,
}: {
  title?: string;
  what?: string;
  nextStep?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">{title}</h2>
        <p className="empty-state-description">{what}</p>
        {nextStep ? (
          <p className="empty-state-description guide-next" style={{ marginTop: '0.5rem' }}>
            What to do next: {nextStep}
          </p>
        ) : null}
        {action ? <div style={{ marginTop: '1rem' }}>{action}</div> : null}
      </div>
    </div>
  );
}

export function LabeledField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className="tiny form-hint">{hint}</p> : null}
      {error ? (
        <p className="alert-error form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Dialog({
  title,
  description,
  onClose,
  children,
  actions,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-overlay" onClick={onClose} role="presentation">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row-between" style={{ marginBottom: '0.5rem' }}>
          <h2 className="section-title">{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        {description ? <p className="muted" style={{ margin: '0 0 0.75rem' }}>{description}</p> : null}
        {children}
        {actions ? <div className="actions" style={{ marginTop: '1rem', justifyContent: 'flex-end' }}>{actions}</div> : null}
      </div>
    </div>
  );
}
