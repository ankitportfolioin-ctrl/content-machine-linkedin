import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar, SidebarBody } from './Sidebar';
import { TopBar } from './TopBar';
import { useAuth } from '../context/AuthContext';

export function Layout() {
  const { workspaceId } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="layout">
      <Sidebar />
      {drawerOpen ? (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} role="presentation">
          <div
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarBody onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}
      <main className="main-content" role="main">
        <TopBar onMenu={() => setDrawerOpen(true)} />
        <div className="main-body">
          {/* Remount routed pages on workspace switch so no section can keep
              showing the previous workspace's data (stale-list isolation bug). */}
          <Outlet key={workspaceId ?? 'no-workspace'} />
        </div>
      </main>
    </div>
  );
}
