import { useAuth } from '../context/AuthContext';

export function WorkspaceSelector() {
  const { workspaces, workspaceId, selectWorkspace, isAuthenticated, loading } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Loading workspaces...</p>;
  }

  if (workspaces.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
        No workspaces available yet.
      </p>
    );
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>Workspace</span>
      <select
        value={workspaceId ?? ''}
        onChange={(e) => selectWorkspace(e.target.value)}
        style={{
          backgroundColor: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          color: 'var(--color-text)',
          padding: '0.5rem 0.75rem',
        }}
      >
        <option value="" disabled>
          Select a workspace
        </option>
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
    </label>
  );
}
