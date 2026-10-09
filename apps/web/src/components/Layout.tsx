import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar, SidebarBody } from './Sidebar';
import { TopBar } from './TopBar';
import { useAuth } from '../context/AuthContext';

const COLLAPSED_STORAGE_KEY = 'go_sidebar_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function Layout() {
  const { workspaceId } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());
  const drawerRef = useRef<HTMLDivElement>(null);

  function setCollapsedPersisted(next: boolean | ((v: boolean) => boolean)) {
    setCollapsed((v) => {
      const value = typeof next === 'function' ? (next as (v: boolean) => boolean)(v) : next;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, value ? '1' : '0');
      } catch {
        // storage unavailable — collapse state simply won't persist
      }
      return value;
    });
  }

  useEffect(() => {
    if (!drawerOpen) return;
    drawerRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="layout">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsedPersisted((v) => !v)} />
      {drawerOpen ? (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} role="presentation">
          <div
            ref={drawerRef}
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
        <div className="main-body" id="main" tabIndex={-1}>
          {/* Remount routed pages on workspace switch so no section can keep
              showing the previous workspace's data (stale-list isolation bug). */}
          <Outlet key={workspaceId ?? 'no-workspace'} />
        </div>
      </main>
    </div>
  );
}
