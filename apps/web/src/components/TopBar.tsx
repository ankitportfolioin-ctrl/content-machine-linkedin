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

  const meta =
    ROUTE_META[location.pathname] ??
    ({ title: 'Growth Operator', crumb: 'System', subtitle: '', nextStep: '', helpHref: '/help' } as const);
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout } = useAuth();

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
            <span>Search pages, people, content…</span>
            <span className="kbd">{shortcutLabel()}</span>
          </button>
        </div>
        <a href="/help" className="icon-btn" aria-label="Help — what goes where?" title="Help — what goes where?">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1.9-1.1 1.8" />
            <circle cx="12" cy="17" r="0.5" fill="currentColor" />
          </svg>
        </a>
        {isAuthenticated ? (
          <>
            <div style={{ maxWidth: 220 }}>
              <WorkspaceSelector />
            </div>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="icon-btn"
                aria-label={user?.email ? `Account menu — signed in as ${user.email}` : 'Account menu'}
                title={user?.email ?? 'Signed in'}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" />
                </svg>
              </button>
              {menuOpen ? (
                <div className="user-menu" role="menu" aria-label="Account">
                  <p className="tiny user-menu-email" title={user?.email ?? ''}>{user?.email ?? 'Signed in'}</p>
                  <a href="/settings" role="menuitem" className="user-menu-item">Profile & settings</a>
                  <a href="/help" role="menuitem" className="user-menu-item">Help</a>
                  <button
                    type="button"
                    role="menuitem"
                    className="user-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
