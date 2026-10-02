import { Outlet, NavLink } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../context/AuthContext';

export function Layout() {
  const { workspaceId } = useAuth();
  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content" role="main">
        <header className="page-header">
          <NavLink to="/" className="page-title-link" style={{ textDecoration: 'none' }}>
            <h1 className="page-title">Growth Operator</h1>
          </NavLink>
          <p className="page-description">Human-guided AI operating system for LinkedIn growth</p>
        </header>
        {/* Remount routed pages on workspace switch so no section can keep
            showing the previous workspace's data (stale-list isolation bug). */}
        <Outlet key={workspaceId ?? 'no-workspace'} />
      </main>
    </div>
  );
}