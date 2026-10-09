import { NavLink } from 'react-router-dom';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  description?: string;
  tooltip?: string;
}

export function NavItem({ to, icon, children, description, tooltip }: NavItemProps) {
  return (
    <NavLink
      to={to}
      title={tooltip ?? (typeof children === 'string' ? children : undefined)}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      <span className="nav-item-icon">{icon}</span>
      <span className="nav-item-text">
        <span className="nav-item-label">{children}</span>
        {description ? <span className="nav-item-desc">{description}</span> : null}
      </span>
    </NavLink>
  );
}