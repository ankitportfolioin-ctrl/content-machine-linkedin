import { Outlet, NavLink } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
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
        <Outlet />
      </main>
    </div>
  );
}