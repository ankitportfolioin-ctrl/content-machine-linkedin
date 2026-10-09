import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SectionCard, EmptyState, ErrorState, SkeletonBlock, StatusDot, TimeAgo } from '../components/ui';
import { connectSocial, friendlyErrorMessage, listConnectors, listFeeds, listSocialConnections } from '../services/api';
import type { FeedSource, SocialConnection, WorkspaceConnectorEntry } from '../types';

export function ConnectionsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [social, setSocial] = useState<SocialConnection[]>([]);
  const [connectors, setConnectors] = useState<WorkspaceConnectorEntry[]>([]);
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectMsg, setConnectMsg] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c, f] = await Promise.all([
        listSocialConnections().catch(() => ({ connections: [] as SocialConnection[] })),
        listConnectors().catch(() => ({ connectors: [] as WorkspaceConnectorEntry[] })),
        listFeeds().catch(() => ({ feeds: [] as FeedSource[] })),
      ]);
      setSocial(s.connections ?? []);
      setConnectors(c.connectors ?? []);
      setFeeds(f.feeds ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void fetchAll();
    else setLoading(false);
  }, [isAuthenticated, fetchAll]);

  async function handleConnect(sourceType: string) {
    setConnecting(sourceType);
    setConnectMsg(null);
    try {
      // Existing backend OAuth initiation (same as Research Sources) — the
      // provider page opens only after the user explicitly clicks Connect.
      const res = await connectSocial(sourceType.toLowerCase());
      window.location.href = res.authorizationUrl;
    } catch (err) {
      setConnectMsg(friendlyErrorMessage(err));
      setConnecting(null);
    }
  }

  if (authLoading) return <SkeletonBlock lines={4} />;
  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead kicker="Settings" title="Connected accounts" sub="Sign in to manage integrations." />
        <LoginForm />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="stack">
        <PageHead kicker="Settings" title="Connected accounts" sub="Checking integration states…" />
        <SkeletonBlock lines={4} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="stack">
        <PageHead kicker="Settings" title="Connected accounts" sub="Accounts, sources, and research feeds." />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  const research = connectors.filter((c) => c.group === 'RESEARCH');
  const platforms = connectors.filter((c) => c.group !== 'RESEARCH');

  return (
    <div className="stack">
      <PageHead
        kicker="Connect an account"
        title="Connections"
        sub={`${social.filter((c) => c.connected).length} connected account${social.filter((c) => c.connected).length === 1 ? '' : 's'} · ${feeds.filter((f) => f.active).length} active feeds. Official connections only — status is verified, never assumed.`}
        nextStep="Connect LinkedIn first, then enable research sources."
        helpHref="/help#connections"
      />

      <SectionCard title={`Accounts (${social.length})`}>
        {social.length === 0 ? (
          <EmptyState
            title="No accounts connected yet"
            what="No platform accounts are connected to this workspace."
            why="Connect LinkedIn to begin observing performance and enable personalized learning."
            action={<Link to="/settings" className="btn btn-secondary btn-sm">Open settings</Link>}
          />
        ) : (
          <ul className="plain-list">
            {social.map((c, i) => (
              <li key={`${c.platform}-${i}`} className="card-row">
                <div className="row-between">
                  <div>
                    <p style={{ fontWeight: 650, fontSize: '0.9rem', textTransform: 'capitalize' }}>{c.displayName || c.platform}</p>
                    <p className="tiny">
                      <span>{c.accountLabel || 'Account'}</span>
                      {c.lastPulledAt ? (
                        <> · Last sync <TimeAgo value={c.lastPulledAt} /></>
                      ) : (
                        ' · Never synced'
                      )}
                    </p>
                    {c.lastError ? <p className="alert-error" style={{ marginTop: '0.25rem' }}>{c.lastError}</p> : null}
                  </div>
                  <StatusDot tone={c.connected ? 'ok' : 'idle'} label={c.connected ? 'Connected' : (c.status || 'Not connected')} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid-2">
        <SectionCard title={`Research sources (${research.length})`}>
          {research.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No research connectors reported.</p>
          ) : (
            <ul className="plain-list">
              {research.map((c) => (
                <li key={c.sourceType} className="card-row">
                  <div className="row-between">
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 650, fontSize: '0.87rem' }}>{c.displayName}</p>
                      <p className="tiny">{c.enabled ? 'Enabled' : 'Disabled'} · {c.probe.status}</p>
                    </div>
                    <StatusDot tone={c.workerWillRun ? 'live' : 'idle'} label={c.workerWillRun ? 'Will run' : 'Idle'} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={`Platforms (${platforms.length})`} action={<Link to="/brain" className="btn btn-ghost btn-sm">Workbench</Link>}>
          {connectMsg ? (
            <p role="alert" className="alert-error" style={{ marginTop: 0 }}>
              {connectMsg}
            </p>
          ) : null}
          {platforms.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No platform connectors reported.</p>
          ) : (
            <ul className="plain-list">
              {platforms.map((c) => (
                <li key={c.sourceType} className="card-row">
                  <div className="row-between">
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 650, fontSize: '0.87rem' }}>{c.displayName}</p>
                      <p className="tiny">{c.accountState === 'CONNECTED' ? 'Account connected' : 'Account not connected'}</p>
                    </div>
                    <StatusDot tone={c.accountState === 'CONNECTED' ? 'ok' : 'idle'} label={c.accountState === 'CONNECTED' ? 'Connected' : 'Disconnected'} />
                  </div>
                  {c.accountState !== 'CONNECTED' && c.accountConnectable ? (
                    <div className="actions" style={{ marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={connecting === c.sourceType}
                        onClick={() => void handleConnect(c.sourceType)}
                      >
                        {connecting === c.sourceType ? 'Opening provider…' : `Connect ${c.displayName}`}
                      </button>
                    </div>
                  ) : null}
                  {c.accountState !== 'CONNECTED' && !c.accountConnectable ? (
                    <p className="tiny" style={{ marginTop: '0.35rem' }}>
                      {c.notWiredReason ?? 'Connection is not available in this version.'}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title={`Research feeds (${feeds.length})`}>
        {feeds.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No feeds configured. Add RSS, Atom, or site feeds from onboarding to start discovery.
          </p>
        ) : (
          <ul className="plain-list">
            {feeds.slice(0, 10).map((f) => (
              <li key={f.id} className="card-row">
                <div className="row-between">
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 650, fontSize: '0.87rem' }}>{f.name || f.url}</p>
                    <p className="tiny mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.url}</p>
                  </div>
                  <StatusDot tone={f.active ? 'ok' : 'idle'} label={f.active ? 'Active' : 'Paused'} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
