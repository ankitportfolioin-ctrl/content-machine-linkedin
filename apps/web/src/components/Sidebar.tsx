import { NavItem } from './NavItem';
import { useAuth } from '../context/AuthContext';
import { NAV_SECTIONS } from './navConfig';
import { useHealth } from '../hooks/useHealth';

function SidebarIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    command: <path d="M4 4h16v16H4z M9 9h6v6H9z" />,
    radar: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <line x1="12" y1="12" x2="17" y2="7" />
      </>
    ),
    observe: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      </>
    ),
    audience: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    trends: (
      <>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
      </>
    ),
    studio: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
    approve: (
      <>
        <polyline points="20 6 9 17 4 12" />
      </>
    ),
    performance: (
      <>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </>
    ),
    flask: (
      <>
        <path d="M9 3h6" />
        <path d="M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3" />
      </>
    ),
    insights: (
      <>
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" />
      </>
    ),
    plugs: (
      <>
        <path d="M9 7V2M15 7V2" />
        <path d="M6 7h12v5a6 6 0 0 1-12 0z" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

export function SidebarBody({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { user, isAuthenticated, logout } = useAuth();
  const { health } = useHealth();
  const healthy = !health || health.status === 'healthy';

  return (
    <>
      <header className="sidebar-header">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </span>
          {collapsed ? null : (
            <span>
              Growth Operator
              <span className="sidebar-brand-sub">One helpful AI operator</span>
            </span>
          )}
        </div>
        {collapsed ? null : (
          <p className="sidebar-tagline">Business → Research → Content → Review → Learning</p>
        )}
      </header>
      <nav className="sidebar-nav" aria-label="Primary" onClick={onNavigate}>
        {NAV_SECTIONS.map((section) => (
          <div className="nav-section" key={section.title}>
            {collapsed ? null : <div className="nav-section-title">{section.title}</div>}
            {section.entries.map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                icon={<SidebarIcon name={item.icon} />}
                description={collapsed ? undefined : item.description}
                tooltip={`${item.label} — ${item.description}. Why: ${item.why} What to do: ${item.whatToDo}`}
              >
                {item.label}
              </NavItem>
            ))}
          </div>
        ))}
      </nav>
      <footer className="sidebar-footer">
        <div className="system-health" role="status" aria-label={healthy ? 'System healthy' : 'System status unknown'}>
          <span className={`health-dot${healthy ? '' : ' degraded'}`} aria-hidden="true" />
          {collapsed ? null : healthy ? 'System healthy' : 'System checking'}
        </div>
        {isAuthenticated ? (
          <>
            {user?.email && !collapsed ? (
              <p className="tiny sidebar-user" title={user.email}>
                {user?.name ? `${user.name} · ` : ''}{user.email}
              </p>
            ) : null}
            {collapsed ? null : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={logout}>
                Sign out
              </button>
            )}
          </>
        ) : null}
      </footer>
    </>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  return (
    <aside className={`sidebar sidebar-desktop${collapsed ? ' sidebar-collapsed' : ''}`} role="navigation" aria-label="Main navigation">
      <SidebarBody collapsed={collapsed} />
      {onToggle ? (
        <button type="button" className="btn btn-ghost btn-sm sidebar-collapse" onClick={onToggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
          {collapsed ? '→' : '← Hide labels'}
        </button>
      ) : null}
    </aside>
  );
}
