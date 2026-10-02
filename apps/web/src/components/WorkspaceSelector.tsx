import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createWorkspace, friendlyErrorMessage } from '../services/api';

export function WorkspaceSelector() {
  const { workspaces, workspaceId, selectWorkspace, isAuthenticated, loading, refreshWorkspaces } = useAuth();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Loading workspaces...</p>;
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Please enter a workspace name.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await createWorkspace({ name: name.trim() });
      setName('');
      setShowCreate(false);
      await refreshWorkspaces();
      selectWorkspace(result.workspace.id);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  if (workspaces.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', margin: 0 }}>
          No workspaces yet. Create one to begin — all data stays scoped to it.
        </p>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            aria-label="Workspace name"
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              color: 'var(--color-text)',
              padding: '0.5rem 0.75rem',
              fontSize: '0.875rem',
            }}
          />
          <button type="submit" className="btn btn-secondary" disabled={creating}>
            {creating ? 'Creating...' : 'Create workspace'}
          </button>
        </form>
        {error ? (
          <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', margin: 0 }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
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
      {showCreate ? (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New workspace name"
            aria-label="New workspace name"
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              color: 'var(--color-text)',
              padding: '0.5rem 0.75rem',
              fontSize: '0.875rem',
            }}
          />
          <button type="submit" className="btn btn-secondary" disabled={creating}>
            {creating ? 'Creating...' : 'Create'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setShowCreate(false); setError(null); }}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(true)}>
          New workspace
        </button>
      )}
      {error ? (
        <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem', margin: 0, flexBasis: '100%' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
