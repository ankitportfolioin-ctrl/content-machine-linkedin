import { useHealth } from '../hooks/useHealth';
import { HealthResponse } from '../types';
import { NavLink } from 'react-router-dom';

interface StatusBadgeProps {
  status: HealthResponse['status'];
  label: string;
}

function StatusBadge({ status, label }: StatusBadgeProps) {
  const statusClass = status === 'healthy' || status === 'ready'
    ? 'status-healthy'
    : status === 'not ready'
    ? 'status-unhealthy'
    : 'status-checking';

  return (
    <span className={`status-indicator ${statusClass}`}>
      <span className="status-dot" aria-hidden="true"></span>
      {label}: {status}
    </span>
  );
}

export function HomePage() {
  const { health, ready, loading, error, refetch } = useHealth();

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <h2 className="empty-state-title">Checking connection...</h2>
        <p className="empty-state-description">Verifying API connectivity</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className="empty-state-title">Connection Failed</h2>
          <p className="empty-state-description">{error}</p>
          <button className="btn btn-primary" onClick={refetch} style={{ marginTop: '1rem' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="health-grid">
        <div className="health-card">
          <div className="health-card-header">
            <h2 className="health-card-title">API Health</h2>
            <StatusBadge status={health?.status ?? 'unknown'} label="Status" />
          </div>
          <div className="health-card-details">
            <div className="health-card-detail">
              <span className="health-card-detail-label">Service</span>
              <span className="health-card-detail-value">{health?.service ?? 'Unknown'}</span>
            </div>
            <div className="health-card-detail">
              <span className="health-card-detail-label">Version</span>
              <span className="health-card-detail-value">{health?.version ?? 'Unknown'}</span>
            </div>
            <div className="health-card-detail">
              <span className="health-card-detail-label">Timestamp</span>
              <span className="health-card-detail-value">{health?.timestamp ?? 'Unknown'}</span>
            </div>
          </div>
        </div>

        <div className="health-card">
          <div className="health-card-header">
            <h2 className="health-card-title">API Readiness</h2>
            <StatusBadge status={ready?.status ?? 'unknown'} label="Status" />
          </div>
          <div className="health-card-details">
            <div className="health-card-detail">
              <span className="health-card-detail-label">Database</span>
              <span className="health-card-detail-value">
                {ready?.dependencies?.database ?? 'Unknown'}
              </span>
            </div>
            <div className="health-card-detail">
              <span className="health-card-detail-label">Timestamp</span>
              <span className="health-card-detail-value">{ready?.timestamp ?? 'Unknown'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 className="health-card-title" style={{ marginBottom: '1rem' }}>Navigation</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          Use the sidebar to navigate between sections. All pages are currently empty shells
          that will be implemented in future phases.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <NavLink to="/content" className="btn btn-secondary">Content</NavLink>
          <NavLink to="/brain" className="btn btn-secondary">Brain / Intelligence</NavLink>
          <NavLink to="/leads" className="btn btn-secondary">Leads</NavLink>
          <NavLink to="/inbox" className="btn btn-secondary">Inbox</NavLink>
          <NavLink to="/pipeline" className="btn btn-secondary">Pipeline</NavLink>
          <NavLink to="/analytics" className="btn btn-secondary">Analytics</NavLink>
          <NavLink to="/settings" className="btn btn-secondary">Settings</NavLink>
        </div>
      </div>
    </div>
  );
}