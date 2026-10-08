import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { WorkspaceSelector } from './WorkspaceSelector';
import { CommandPalette } from './CommandPalette';
import { ROUTE_META } from './navConfig';

function shortcutLabel(): string {
  if (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)) return '⌘ K';
  return 'Ctrl K';
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const meta = ROUTE_META[location.pathname] ?? { title: 'Growth Operator', crumb: 'System' };

  return (
    <>
      <div className="topbar">
        <button
          type="button"
          className="icon-btn menu-btn"
          aria-label="Open navigation"
          onClick={onMenu}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
        <div style={{ minWidth: 0 }}>
          <div className="topbar-crumb">{meta.crumb}</div>
          <div className="topbar-title">{meta.title}</div>
        </div>
        <div className="topbar-spacer" />
        <div className="topbar-search-wrap">
          <button type="button" className="topbar-search" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
            <span>Search or command…</span>
            <span className="kbd">{shortcutLabel()}</span>
          </button>
        </div>
        {isAuthenticated ? (
          <>
            <div style={{ maxWidth: 220 }}>
              <WorkspaceSelector />
            </div>
            <span
              className="icon-btn"
              role="img"
              aria-label={user?.email ? `Signed in as ${user.email}` : 'Signed in'}
              title={user?.email ?? 'Signed in'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
            </span>
          </>
        ) : null}
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
