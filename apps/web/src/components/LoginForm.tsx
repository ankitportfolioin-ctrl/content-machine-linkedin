import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { detailedErrorMessage } from '../services/api';

export function LoginForm() {
  const { login, register, loading, error: authError } = useAuth();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    
    const fieldErrors: string[] = [];
    if (!email.trim()) fieldErrors.push('Email is required');
    if (!password.trim()) fieldErrors.push('Password is required');
    if (mode === 'register' && !name.trim()) fieldErrors.push('Name is required');
    
    if (fieldErrors.length > 0) {
      setError(fieldErrors.join(', '));
      return;
    }
    
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await register(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(detailedErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="empty-state">
          <h2 className="empty-state-title">Loading...</h2>
          <p className="empty-state-description">Checking your session</p>
        </div>
      </div>
    );
  }

  const isRegister = mode === 'register';

  return (
    <div className="card" style={{ maxWidth: '420px' }}>
      <h2 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
        {isRegister ? 'Create account' : 'Sign in'}
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
        {isRegister
          ? 'Create a local account, then create a workspace to begin.'
          : 'Sign in to access your workspace content.'}
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {isRegister ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              style={inputStyle}
            />
          </label>
        ) : null}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            style={inputStyle}
          />
        </label>
        {authError && !error ? (
          <p role="alert" style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            {authError}
          </p>
        ) : null}
        {error ? (
          <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? (isRegister ? 'Creating...' : 'Signing in...') : isRegister ? 'Create account' : 'Sign in'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={submitting}
          onClick={() => {
            setError(null);
            setMode(isRegister ? 'signin' : 'register');
          }}
        >
          {isRegister ? 'Have an account? Sign in' : 'New here? Create an account'}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  color: 'var(--color-text)',
  padding: '0.625rem 0.75rem',
};
