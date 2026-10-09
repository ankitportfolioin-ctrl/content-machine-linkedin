import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connectSocial,
  createFeed,
  createSource,
  deleteFeed,
  disconnectSocial,
  friendlyErrorMessage,
  listConnectors,
  listFeeds,
  listSocialConnections,
  listSocialPosts,
  listSources,
  pauseSocial,
  refreshSocial,
  resumeSocial,
  saveSocialIdea,
  updateConnectorConfig,
  updateFeed,
  verifyConnector,
} from '../services/api';
import {
  FeedSource,
  IntegrationCapabilities,
  SocialCapabilityBlock,
  SocialConnection,
  SocialPost,
  SocialServerBlock,
  Source,
  WorkspaceConnectorEntry,
} from '../types';
import { TimeAgo } from './ui';

/* Freshness for a single feed row. Pure and honest: a missing timestamp
   renders as "never fetched", never as a fabricated date. */
export function FeedFreshnessLine({ lastFetchedAt }: { lastFetchedAt?: string | null }) {
  if (!lastFetchedAt) {
    return (
      <p className="tiny" style={{ margin: '0.25rem 0 0' }}>
        Never fetched yet — new items appear after the next research check.
      </p>
    );
  }
  return (
    <p className="tiny" style={{ margin: '0.25rem 0 0' }}>
      Last fetched <TimeAgo value={lastFetchedAt} />
    </p>
  );
}

/**
 * Brain → Sources, redesigned as a friendly "Connections & Sources" control
 * center.
 *
 * UX contract (frontend presentation only — backend truth is never invented):
 * - Section 1 "Connect your platforms": LinkedIn, YouTube, Instagram,
 *   Facebook, X as account-connection cards driven by GET /social/connections.
 *   TikTok renders as "Coming soon" because the backend has no account
 *   adapter for it. Quora never appears here (no account connection exists).
 * - Section 2 "Research sources": registry connectors (Reddit, Google Trends)
 *   driven by the connectors catalogue; Quora renders as Unavailable.
 * - Section 3 "Feeds & websites": feed-managed sources driven by /feeds,
 *   grouped into built-in vs yours from rows that actually exist, plus the
 *   saved-articles list driven by /intelligence/sources.
 *
 * Every primary button is actionable: Connect/Reconnect starts the existing
 * OAuth flow, Configure expands administrator setup requirements, and no
 * disabled dead-end buttons are rendered.
 */

const fieldStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  color: 'var(--color-text)',
  padding: '0.625rem 0.75rem',
  width: '100%',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
  gap: '0.75rem',
  listStyle: 'none',
  padding: 0,
  margin: 0,
};

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const avatarStyle: React.CSSProperties = {
  width: '2rem',
  height: '2rem',
  borderRadius: '9999px',
  backgroundColor: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: '0.875rem',
  flexShrink: 0,
};

// ---------------------------------------------------------------------------
// User-facing status model. Backend states stay precise internally; this maps
// each backend state to exactly one friendly label.
// ---------------------------------------------------------------------------

type PlatformViewStatus =
  | 'CONNECTED'
  | 'PAUSED'
  | 'NOT_CONNECTED'
  | 'SETUP_REQUIRED'
  | 'ATTENTION'
  | 'COMING_SOON';

function platformViewStatus(conn: SocialConnection): PlatformViewStatus {
  if (conn.status === 'CONNECTED') return 'CONNECTED';
  if (conn.status === 'PAUSED') return 'PAUSED';
  if (conn.status === 'NOT_CONFIGURED') return 'SETUP_REQUIRED';
  if (conn.status === 'ERROR' || conn.status === 'EXPIRED') return 'ATTENTION';
  return 'NOT_CONNECTED';
}

function platformBadgeClass(status: PlatformViewStatus): string {
  if (status === 'CONNECTED') return 'badge badge-success';
  if (status === 'PAUSED' || status === 'SETUP_REQUIRED') return 'badge badge-warning';
  if (status === 'ATTENTION') return 'badge badge-error';
  return 'badge badge-neutral';
}

function platformBadgeLabel(status: PlatformViewStatus): string {
  if (status === 'CONNECTED') return '✓ Connected';
  if (status === 'PAUSED') return 'Paused';
  if (status === 'SETUP_REQUIRED') return 'Setup required';
  if (status === 'ATTENTION') return 'Connection needs attention';
  if (status === 'COMING_SOON') return 'Coming soon';
  return 'Not connected';
}

// ---------------------------------------------------------------------------
// Capability model. A connected account never implies research, publishing,
// or analytics — each row renders only what the backend capability model
// actually reports for this workspace.
// ---------------------------------------------------------------------------

function researchCapability(
  research: SocialCapabilityBlock | undefined,
  catalogueEntry: WorkspaceConnectorEntry | undefined,
): { label: string; detail: string | null } {
  if (!research || !research.wired) {
    return { label: 'Not available', detail: research?.note ?? null };
  }
  if (catalogueEntry && !catalogueEntry.serverCredsPresent) {
    return {
      label: 'Not available',
      detail: 'Server credentials are missing — administrator setup is required before research can run.',
    };
  }
  return {
    label: 'Available',
    detail: 'Runs separately from account pulls; configure it under Research sources where applicable.',
  };
}

function publishingCapability(
  publishing: SocialCapabilityBlock | undefined,
): { label: string; detail: string | null } {
  if (publishing?.wired) {
    return { label: 'Available', detail: publishing.note ?? null };
  }
  return { label: 'Not available', detail: publishing?.note ?? null };
}

function analyticsCapability(
  capabilities: IntegrationCapabilities | undefined,
): { label: string; detail: null } {
  if (capabilities?.analytics) {
    return { label: 'Available', detail: null };
  }
  return { label: 'Not available', detail: null };
}

function CapabilityRow({ name, value, detail }: { name: string; value: string; detail?: string | null }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <dt style={{ color: 'var(--color-text-muted)', minWidth: '6.5rem', flexShrink: 0 }}>{name}</dt>
      <dd style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
        {value}
        {detail ? ` — ${detail}` : null}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function SectionLoading({ label }: { label: string }) {
  return <p style={{ fontSize: '0.875rem' }}>{label}</p>;
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{message}</p>
      <button className="btn btn-secondary" onClick={onRetry}>Retry</button>
    </div>
  );
}

/**
 * Administrator setup requirements for a platform whose server-side OAuth app
 * credentials are missing. Always actionable: explains who must act, what is
 * required, and links the official provider setup. No internal paths, no
 * secrets.
 */
function SetupRequirements({ server, displayName }: { server: SocialServerBlock | undefined; displayName: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!server?.redirectUri) return;
    try {
      await navigator.clipboard.writeText(server.redirectUri);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>
        {displayName} connection is not available yet — platform setup is required by the workspace
        administrator before any account can connect.
      </p>
      <details open>
        <summary style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          Setup requirements
        </summary>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <p style={{ margin: 0 }}>Required application credentials:</p>
          <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
            <li>Client ID</li>
            <li>Client Secret</li>
          </ul>
          {server?.redirectUri ? (
            <p style={{ margin: 0 }}>
              Redirect URI to allow-list in the provider app:{' '}
              <code style={{ wordBreak: 'break-all' }}>{server.redirectUri}</code>{' '}
              <button className="btn btn-secondary" onClick={() => void handleCopy()}>
                {copied ? 'Copied' : 'Copy redirect URI'}
              </button>
            </p>
          ) : null}
          <details>
            <summary style={{ cursor: 'pointer' }}>Developer details</summary>
            <ul style={{ paddingLeft: '1.25rem', margin: '0.25rem 0 0' }}>
              {(server?.requiredEnvVars ?? []).map((v) => (
                <li key={v}><code>{v}</code></li>
              ))}
              {server?.redirectUriSource ? <li>Redirect source: <code>{server.redirectUriSource}</code></li> : null}
            </ul>
          </details>
          {server?.docsUrl ? (
            <p style={{ margin: 0 }}>
              <a href={server.docsUrl} target="_blank" rel="noreferrer">Official setup instructions</a>
              {server.docsLabel ? ` — ${server.docsLabel}` : null}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Connect your platforms
// ---------------------------------------------------------------------------

const PLATFORM_ORDER = ['linkedin', 'youtube', 'instagram', 'facebook', 'x'];

const PLATFORM_BLURBS: Record<string, string> = {
  linkedin: 'Connect your LinkedIn account to link your professional identity with Growth Operator.',
  youtube: 'Pull uploads from your own YouTube channel. Research search is a separate server-side capability.',
  instagram: 'Read media from your Instagram business or creator account. Personal accounts are not readable via the API.',
  facebook: 'Read posts from Facebook Pages you administer. Personal timelines are not readable.',
  x: 'Read your own recent X posts. The free API tier is narrow; rate limits are reported honestly.',
};

function PlatformsSection() {
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [catalogue, setCatalogue] = useState<WorkspaceConnectorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load shows the skeleton; background refreshes update silently so
  // mounted cards (and their in-progress messages) are never unmounted.
  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    try {
      const [social, connectors] = await Promise.all([listSocialConnections(), listConnectors()]);
      setConnections(social.connections ?? []);
      setCatalogue(connectors.connectors ?? []);
      setError(null);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const refresh = useCallback(() => {
    void load(false);
  }, [load]);

  const ordered = PLATFORM_ORDER
    .map((platform) => connections.find((c) => c.platform === platform))
    .filter((c): c is SocialConnection => Boolean(c));
  const extras = connections.filter((c) => !PLATFORM_ORDER.includes(c.platform));
  const tiktok = catalogue.find((e) => e.sourceType === 'TIKTOK') ?? null;

  return (
    <section aria-label="Connect your platforms" className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.25rem' }}>Connect your platforms</h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        Connect the accounts you want Growth Operator to work with. You control which capabilities are
        enabled. Connecting an account never automatically enables research, publishing, or analytics.
      </p>
      {loading ? <SectionLoading label="Loading platforms..." /> : null}
      {!loading && error ? <SectionError message={error} onRetry={refresh} /> : null}
      {!loading && (!error || connections.length > 0) ? (
        <ul style={gridStyle}>
          {ordered.map((conn) => (
            <PlatformCard
              key={conn.platform}
              conn={conn}
              catalogueEntry={catalogue.find((e) => e.sourceType.toLowerCase() === conn.platform)}
              onChanged={refresh}
            />
          ))}
          {extras.map((conn) => (
            <PlatformCard
              key={conn.platform}
              conn={conn}
              catalogueEntry={catalogue.find((e) => e.sourceType.toLowerCase() === conn.platform)}
              onChanged={refresh}
            />
          ))}
          <TikTokCard entry={tiktok} />
        </ul>
      ) : null}
    </section>
  );
}

function PlatformCard({
  conn,
  catalogueEntry,
  onChanged,
}: {
  conn: SocialConnection;
  catalogueEntry: WorkspaceConnectorEntry | undefined;
  onChanged: () => void;
}) {
  const view = platformViewStatus(conn);
  const [showSetup, setShowSetup] = useState(false);
  const [managing, setManaging] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [postsOpen, setPostsOpen] = useState(false);
  const [savingIdea, setSavingIdea] = useState<string | null>(null);

  const research = researchCapability(conn.research, catalogueEntry);
  const publishing = publishingCapability(conn.publishing);
  const analytics = analyticsCapability(conn.capabilities);

  async function handleConnect() {
    setWorking('connect');
    setMessage(null);
    try {
      // Existing backend OAuth initiation — OIDC-minimal scopes, security untouched.
      const res = await connectSocial(conn.platform);
      window.location.href = res.authorizationUrl;
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
      setWorking(null);
    }
  }

  async function handleRefresh() {
    setWorking('refresh');
    setMessage(null);
    try {
      const res = await refreshSocial(conn.platform, 10);
      if (postsOpen) {
        const data = await listSocialPosts(conn.platform, 20);
        setPosts(data.posts ?? []);
      }
      setMessage(`Pulled ${res.fetched} item(s) from ${conn.displayName}, stored ${res.stored}.`);
      onChanged();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(null);
    }
  }

  async function handlePauseToggle() {
    setWorking('pause');
    setMessage(null);
    try {
      if (conn.active) {
        await pauseSocial(conn.platform);
        setMessage(`${conn.displayName} paused. Pulls are stopped.`);
      } else {
        await resumeSocial(conn.platform);
        setMessage(`${conn.displayName} resumed.`);
      }
      onChanged();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(null);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm(`Disconnect ${conn.displayName}? Stored access is removed. Previously pulled items stay as attributed inspiration.`)) return;
    setWorking('disconnect');
    setMessage(null);
    try {
      const res = await disconnectSocial(conn.platform);
      if (postsOpen) {
        const data = await listSocialPosts(conn.platform, 20);
        setPosts(data.posts ?? []);
      }
      setMessage(res.note);
      onChanged();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(null);
    }
  }

  async function handleTogglePosts() {
    if (postsOpen) {
      setPostsOpen(false);
      setPosts([]);
      return;
    }
    setWorking('posts');
    setMessage(null);
    try {
      const data = await listSocialPosts(conn.platform, 20);
      setPosts(data.posts ?? []);
      setPostsOpen(true);
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(null);
    }
  }

  async function handleSaveIdea(post: SocialPost) {
    setSavingIdea(String(post.id));
    setMessage(null);
    try {
      const res = await saveSocialIdea(String(post.id));
      setMessage(`Saved “${String(res.contentIdea.title).slice(0, 80)}” as a DRAFT idea. Open Content to work it — nothing was approved or published.`);
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSavingIdea(null);
    }
  }

  const connected = view === 'CONNECTED' || view === 'PAUSED';

  return (
    <li style={cardStyle} data-platform={conn.platform}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span aria-hidden="true" style={avatarStyle}>{conn.displayName.slice(0, 1).toUpperCase()}</span>
        <p style={{ fontWeight: 600, margin: 0 }}>{conn.displayName}</p>
        <span className={platformBadgeClass(view)}>{platformBadgeLabel(view)}</span>
      </div>
      {conn.accountLabel ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>{conn.accountLabel}</p>
      ) : null}
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
        {PLATFORM_BLURBS[conn.platform] ?? 'Connect this account to let Growth Operator work with it.'}
      </p>

      <dl style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', margin: 0, fontSize: '0.75rem' }}>
        <CapabilityRow
          name="Account"
          value={
            view === 'CONNECTED' ? 'Connected'
              : view === 'PAUSED' ? 'Connected — paused'
              : view === 'SETUP_REQUIRED' ? 'Setup required'
              : view === 'ATTENTION' ? 'Needs attention'
              : 'Not connected'
          }
        />
        <CapabilityRow name="Research" value={research.label} detail={research.detail} />
        <CapabilityRow name="Publishing" value={publishing.label} detail={publishing.detail} />
        <CapabilityRow name="Analytics" value={analytics.label} detail={analytics.detail} />
      </dl>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
        {view === 'NOT_CONNECTED' ? (
          <button className="btn btn-primary" disabled={working === 'connect'} onClick={() => void handleConnect()}>
            {working === 'connect' ? 'Opening provider…' : `Connect ${conn.displayName}`}
          </button>
        ) : null}
        {view === 'ATTENTION' ? (
          <button className="btn btn-primary" disabled={working === 'connect'} onClick={() => void handleConnect()}>
            {working === 'connect' ? 'Opening provider…' : 'Reconnect'}
          </button>
        ) : null}
        {view === 'SETUP_REQUIRED' ? (
          <button className="btn btn-secondary" onClick={() => setShowSetup((v) => !v)} aria-expanded={showSetup}>
            {showSetup ? 'Hide setup requirements' : `Configure ${conn.displayName}`}
          </button>
        ) : null}
        {connected ? (
          <>
            <span className="badge badge-success" style={{ alignSelf: 'center' }}>✓ {conn.displayName} Connected</span>
            <button className="btn btn-secondary" onClick={() => setManaging((v) => !v)} aria-expanded={managing}>
              {managing ? 'Hide connection' : 'Manage connection'}
            </button>
          </>
        ) : null}
      </div>

      {view === 'ATTENTION' && conn.lastError ? (
        <p role="alert" style={{ fontSize: '0.75rem', color: 'var(--color-error)', margin: 0 }}>{conn.lastError}</p>
      ) : null}
      {view === 'SETUP_REQUIRED' && showSetup ? (
        <SetupRequirements server={conn.server} displayName={conn.displayName} />
      ) : null}

      {managing && connected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" disabled={working === 'refresh'} onClick={() => void handleRefresh()}>
              Refresh
            </button>
            <button className="btn btn-secondary" disabled={working === 'pause'} onClick={() => void handlePauseToggle()}>
              {conn.active ? 'Pause' : 'Resume'}
            </button>
            <button className="btn btn-secondary" disabled={working === 'disconnect'} onClick={() => void handleDisconnect()}>
              Disconnect
            </button>
            <button className="btn btn-secondary" disabled={working === 'posts'} onClick={() => void handleTogglePosts()}>
              {postsOpen ? 'Hide items' : `Show pulled items (${conn.postCount})`}
            </button>
          </div>
          {conn.lastPulledAt ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>
              Last pull: {new Date(conn.lastPulledAt).toLocaleString()}
            </p>
          ) : null}
          {postsOpen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {posts.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                  No pulled items yet. Use Refresh to pull from {conn.displayName}.
                </p>
              ) : null}
              {posts.map((post) => (
                <div key={String(post.id)} style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>
                    {String(post.title ?? post.text?.split('\n')[0] ?? '(untitled)').slice(0, 120)}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0.125rem 0' }}>
                    {conn.displayName}
                    {post.author ? ` · ${String(post.author)}` : ''}
                    {post.publishedAt ? ` · ${String(post.publishedAt).slice(0, 10)}` : ''}
                    {post.url ? (
                      <>
                        {' · '}<a href={String(post.url)} target="_blank" rel="noreferrer">source</a>
                      </>
                    ) : null}
                    {!post.connectionId ? ' · from a disconnected connection (kept as inspiration)' : ''}
                  </p>
                  <button
                    className="btn btn-secondary"
                    disabled={savingIdea === String(post.id)}
                    onClick={() => void handleSaveIdea(post)}
                  >
                    {savingIdea === String(post.id) ? 'Saving...' : 'Save as content idea'}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p role={message.includes('failed') || message.includes('error') ? 'alert' : undefined} style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
          {message}
        </p>
      ) : null}

      <details>
        <summary style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          What this connection can read
        </summary>
        <ul style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', paddingLeft: '1.25rem', margin: '0.25rem 0' }}>
          {conn.provides.map((p, i) => (
            <li key={`p-${i}`}>Reads: {p}</li>
          ))}
          {conn.limitations.map((l, i) => (
            <li key={`l-${i}`}>Cannot: {l}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          Technical status
        </summary>
        <div className="tiny" style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', marginTop: '0.25rem' }}>
          <span>Backend status: <code>{conn.status}</code></span>
          <span>Server configured: <code>{conn.configured ? 'yes' : 'no'}</code></span>
          <span>Account active: <code>{conn.active ? 'yes' : 'no'}</code></span>
          <span>Pulled items: <code>{conn.postCount}</code></span>
          {conn.scopes.length > 0 ? <span>OAuth scopes: <code>{conn.scopes.join(', ')}</code></span> : null}
          {conn.server?.redirectUriSource ? <span>Redirect source: <code>{conn.server.redirectUriSource}</code></span> : null}
        </div>
      </details>
    </li>
  );
}

/**
 * TikTok has no account adapter and no server credential wiring in this
 * version, so it can never be connected. The card exists to say so honestly
 * instead of leaving users guessing.
 */
function TikTokCard({ entry }: { entry: WorkspaceConnectorEntry | null }) {
  return (
    <li style={cardStyle} data-platform="tiktok">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span aria-hidden="true" style={avatarStyle}>T</span>
        <p style={{ fontWeight: 600, margin: 0 }}>TikTok</p>
        <span className={platformBadgeClass('COMING_SOON')}>{platformBadgeLabel('COMING_SOON')}</span>
      </div>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
        Coming later. Connection is not available in this version.
      </p>
      <dl style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', margin: 0, fontSize: '0.75rem' }}>
        <CapabilityRow name="Account" value="Not available" />
        <CapabilityRow name="Research" value="Not available" />
        <CapabilityRow name="Publishing" value="Not available" />
        <CapabilityRow name="Analytics" value="Not available" />
      </dl>
      <details>
        <summary style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          Technical status
        </summary>
        <div className="tiny" style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', marginTop: '0.25rem' }}>
          <span>{entry?.notWiredReason ?? 'The server has no TikTok app-credential wiring and no account adapter, so neither account connection nor research can run.'}</span>
          {entry ? <span>Capability: <code>{entry.sourceOfTruth}</code></span> : null}
        </div>
      </details>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Research sources (registry connectors, workspace-configured)
// ---------------------------------------------------------------------------

function probeDisplay(status: string): string {
  if (status === 'NEVER_PROBED') return 'Not tested yet';
  if (status === 'VERIFIED') return 'Last test passed';
  if (status === 'FAILED') return 'Last test failed';
  return status.replace(/_/g, ' ');
}

function ResearchSection() {
  const [entries, setEntries] = useState<WorkspaceConnectorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load shows the skeleton; background refreshes update silently so
  // mounted cards (and their in-progress messages) are never unmounted.
  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    try {
      const data = await listConnectors();
      setEntries(data.connectors ?? []);
      setError(null);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const refresh = useCallback(() => {
    void load(false);
  }, [load]);

  const research = entries.filter((e) => e.group === 'RESEARCH');
  const unavailable = entries.filter((e) => e.group === 'UNAVAILABLE');

  return (
    <section aria-label="Research sources" className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.25rem' }}>Research sources</h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        Choose public sources Growth Operator can read to discover trends, topics, problems and
        opportunities. Only sources you enable here run — nothing is fetched silently. A passing test
        proves one probe request worked just now, never future data.
      </p>
      {loading ? <SectionLoading label="Loading research sources..." /> : null}
      {!loading && error ? <SectionError message={error} onRetry={refresh} /> : null}
      {!loading && (!error || entries.length > 0) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <ul style={gridStyle}>
            {research.map((entry) => (
              <ResearchSourceCard key={entry.sourceType} entry={entry} onChanged={refresh} />
            ))}
          </ul>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
            <p style={{ fontSize: '0.875rem', margin: 0 }}>
              <strong>RSS / Atom, Hacker News, GitHub releases, blogs, sites and saved URLs</strong> are
              managed as feed sources — <a href="#sources-feeds">see Feeds &amp; websites below</a>. They
              are not toggled here.
            </p>
          </div>
          {unavailable.length > 0 ? (
            <ul style={gridStyle}>
              {unavailable.map((entry) => (
                <li key={entry.sourceType} style={cardStyle} data-source-type={entry.sourceType}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <p style={{ fontWeight: 600, margin: 0 }}>{entry.displayName}</p>
                    <span className="badge badge-error">Unavailable</span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    {entry.description}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    {entry.userAction}
                  </p>
                  <details>
                    <summary style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                      Technical status
                    </summary>
                    <div className="tiny" style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', marginTop: '0.25rem' }}>
                      {entry.notWiredReason ? <span>{entry.notWiredReason}</span> : null}
                      <span>Capability: <code>{entry.sourceOfTruth}</code></span>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function ResearchSourceCard({ entry, onChanged }: { entry: WorkspaceConnectorEntry; onChanged: () => void }) {
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sortBy, setSortBy] = useState('hot');
  const [timeFilter, setTimeFilter] = useState('day');
  const [topics, setTopics] = useState('');
  const [geo, setGeo] = useState('US');
  const [timeRange, setTimeRange] = useState('now 7-d');
  const [category, setCategory] = useState('0');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    const cfg = (entry.config ?? {}) as Record<string, unknown>;
    if (entry.sourceType === 'REDDIT') {
      if (Array.isArray(cfg.subreddits)) setDraft((cfg.subreddits as unknown[]).map(String).join(', '));
      if (typeof cfg.sortBy === 'string') setSortBy(cfg.sortBy);
      if (typeof cfg.timeFilter === 'string') setTimeFilter(cfg.timeFilter);
    }
    if (entry.sourceType === 'GOOGLE_TRENDS') {
      if (Array.isArray(cfg.topics)) setTopics((cfg.topics as unknown[]).map(String).join(', '));
      if (typeof cfg.geo === 'string') setGeo(cfg.geo);
      if (typeof cfg.timeRange === 'string') setTimeRange(cfg.timeRange);
      if (typeof cfg.category !== 'undefined') setCategory(String(cfg.category));
    }
    setInitialized(true);
  }, [entry, initialized]);

  function report(msg: string, failed: boolean) {
    setMessage(msg);
    setIsError(failed);
  }

  async function handleToggle() {
    setWorking('toggle');
    report('', false);
    try {
      await updateConnectorConfig(entry.sourceType, { enabled: !entry.enabled, config: entry.config });
      onChanged();
    } catch (err) {
      report(friendlyErrorMessage(err), true);
    } finally {
      setWorking(null);
    }
  }

  async function handleTest() {
    setWorking('test');
    report('', false);
    try {
      const res = await verifyConnector(entry.sourceType);
      report(`${entry.displayName}: ${probeDisplay(res.probe.status)} — ${res.note ?? 'probe complete.'}`, false);
      onChanged();
    } catch (err) {
      report(friendlyErrorMessage(err), true);
      onChanged();
    } finally {
      setWorking(null);
    }
  }

  async function handleSave() {
    setWorking('save');
    report('', false);
    try {
      if (entry.sourceType === 'REDDIT') {
        const subreddits = draft.split(',').map((s) => s.trim()).filter(Boolean);
        await updateConnectorConfig('REDDIT', { enabled: entry.enabled, config: { subreddits, sortBy, timeFilter } });
      } else if (entry.sourceType === 'GOOGLE_TRENDS') {
        const topicList = topics.split(',').map((s) => s.trim()).filter(Boolean);
        await updateConnectorConfig('GOOGLE_TRENDS', {
          enabled: entry.enabled,
          config: { topics: topicList, geo: geo.trim() || 'US', timeRange: timeRange.trim() || 'now 7-d', category: Number.parseInt(category, 10) || 0 },
        });
      } else {
        await updateConnectorConfig(entry.sourceType, { enabled: entry.enabled, config: entry.config });
      }
      onChanged();
    } catch (err) {
      report(friendlyErrorMessage(err), true);
    } finally {
      setWorking(null);
    }
  }

  return (
    <li style={cardStyle} data-source-type={entry.sourceType}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <p style={{ fontWeight: 600, margin: 0 }}>{entry.displayName}</p>
        {entry.enabled ? (
          <span className="badge badge-success">✓ Enabled</span>
        ) : (
          <span className="badge badge-neutral">Disabled</span>
        )}
        <span className="badge badge-neutral" title="Result of the last manual test, if any">
          {probeDisplay(entry.probe.status)}
        </span>
      </div>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>{entry.description}</p>

      {entry.enabled && (entry.sourceType === 'REDDIT' || entry.sourceType === 'GOOGLE_TRENDS') ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {entry.sourceType === 'REDDIT' ? (
            <>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Subreddits, comma-separated (e.g. programming, artificial)"
                aria-label="Subreddits"
                style={{ ...fieldStyle, flex: '2 1 220px' }}
              />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort" style={fieldStyle}>
                <option value="hot">hot</option>
                <option value="new">new</option>
                <option value="top">top</option>
                <option value="rising">rising</option>
                <option value="controversial">controversial</option>
              </select>
              <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} aria-label="Time window" style={fieldStyle}>
                <option value="hour">hour</option>
                <option value="day">day</option>
                <option value="week">week</option>
                <option value="month">month</option>
                <option value="year">year</option>
                <option value="all">all</option>
              </select>
            </>
          ) : (
            <>
              <input
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder="Topics, comma-separated (e.g. AI, vibe coding)"
                aria-label="Topics"
                style={{ ...fieldStyle, flex: '2 1 220px' }}
              />
              <input value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="US" aria-label="Region" style={{ ...fieldStyle, flex: '0 1 90px' }} />
              <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} aria-label="Time range" style={fieldStyle}>
                <option value="now 1-d">now 1-d</option>
                <option value="now 7-d">now 7-d</option>
                <option value="today 1-m">today 1-m</option>
                <option value="today 3-m">today 3-m</option>
                <option value="today 12-m">today 12-m</option>
              </select>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="0" inputMode="numeric" aria-label="Category (0 = all)" style={{ ...fieldStyle, flex: '0 1 90px' }} />
            </>
          )}
          <button className="btn btn-secondary" disabled={working === 'save'} onClick={() => void handleSave()}>
            {working === 'save' ? 'Saving...' : 'Save'}
          </button>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {entry.enabled ? (
          <button className="btn btn-secondary" disabled={working === 'toggle'} onClick={() => void handleToggle()}>
            Disable
          </button>
        ) : (
          <button className="btn btn-primary" disabled={working === 'toggle'} onClick={() => void handleToggle()}>
            {working === 'toggle' ? 'Enabling...' : 'Enable source'}
          </button>
        )}
        <button className="btn btn-secondary" disabled={working === 'test'} onClick={() => void handleTest()}>
          {working === 'test' ? 'Testing...' : 'Test source'}
        </button>
      </div>

      {message ? (
        <p role={isError ? 'alert' : undefined} style={{ fontSize: '0.875rem', color: isError ? 'var(--color-error)' : 'var(--color-text-secondary)', margin: 0 }}>
          {message}
        </p>
      ) : null}

      <details>
        <summary style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          Technical status
        </summary>
        <div className="tiny" style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', marginTop: '0.25rem' }}>
          <span>Probe: <code>{entry.probe.status}</code>{entry.probe.checkedAt ? ` at ${entry.probe.checkedAt}` : ''}</span>
          {entry.probe.error ? <span>Probe error: {entry.probe.error}</span> : null}
          <span>Runs when enabled: <code>{entry.workerWillRun ? 'yes' : 'no'}</code></span>
          <span>Auth: <code>{entry.authKind === 'NONE' ? 'Public / no OAuth' : entry.authKind}</code></span>
          <span>Configuration: <code>{entry.configState}</code></span>
          <span>Capability: <code>{entry.sourceOfTruth}</code></span>
        </div>
      </details>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Feeds & websites (feed-managed sources) + saved articles
// ---------------------------------------------------------------------------

const FEED_TYPE_OPTIONS = [
  { value: 'rss', label: 'RSS' },
  { value: 'atom', label: 'Atom' },
  { value: 'hackernews', label: 'Hacker News' },
  { value: 'github_releases', label: 'GitHub releases' },
  { value: 'blog', label: 'Blog' },
  { value: 'site', label: 'Site' },
];

/** Feed kinds shipped as system defaults (see seed data). Only rendered when rows actually exist. */
const BUILT_IN_FEED_TYPES = new Set(['HACKERNEWS', 'GITHUB_RELEASES']);

function feedTypeLabel(type: string): string {
  const found = FEED_TYPE_OPTIONS.find((o) => o.value === type.toLowerCase());
  return found?.label ?? type;
}

function FeedsSection() {
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [type, setType] = useState('rss');
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState(false);
  const [rowWorking, setRowWorking] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Initial load shows the skeleton; background refreshes update silently so
  // mounted rows are never unmounted mid-interaction.
  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    try {
      const data = await listFeeds();
      setFeeds(data.feeds ?? []);
      setError(null);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const refresh = useCallback(() => {
    void load(false);
  }, [load]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setSaving(true);
    setFormMessage(null);
    setFormError(false);
    try {
      await createFeed({ url: url.trim(), type });
      setUrl('');
      setFormMessage('Source added.');
      await load(false);
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
      setFormError(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(feed: FeedSource) {
    setRowWorking(`toggle:${String(feed.id)}`);
    setFormMessage(null);
    setFormError(false);
    try {
      await updateFeed(String(feed.id), { active: !feed.active });
      await load(false);
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
      setFormError(true);
    } finally {
      setRowWorking(null);
    }
  }

  async function handleRemove(feed: FeedSource) {
    setRowWorking(`remove:${String(feed.id)}`);
    setFormMessage(null);
    setFormError(false);
    try {
      await deleteFeed(String(feed.id));
      await load(false);
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
      setFormError(true);
    } finally {
      setRowWorking(null);
    }
  }

  const builtIn = feeds.filter((f) => BUILT_IN_FEED_TYPES.has(String(f.type).toUpperCase()));
  const custom = feeds.filter((f) => !BUILT_IN_FEED_TYPES.has(String(f.type).toUpperCase()));

  function feedRow(feed: FeedSource) {
    return (
      <li key={String(feed.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <p style={{ fontWeight: 600, margin: 0, fontSize: '0.875rem' }}>{String(feed.name ?? feed.url)}</p>
          <span className="badge badge-neutral">{feedTypeLabel(String(feed.type))}</span>
          <span className={feed.active ? 'badge badge-success' : 'badge badge-neutral'}>
            {feed.active ? 'Active' : 'Paused'}
          </span>
        </div>
        {feed.name ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', wordBreak: 'break-all', margin: '0.25rem 0 0' }}>
            {String(feed.url)}
          </p>
        ) : null}
        <FeedFreshnessLine lastFetchedAt={feed.lastFetchedAt} />
        {feed.lastError ? (
          <p role="alert" style={{ fontSize: '0.75rem', color: 'var(--color-error)', margin: '0.25rem 0 0' }}>
            Last error: {String(feed.lastError).slice(0, 200)}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <button
            className="btn btn-secondary"
            disabled={rowWorking === `toggle:${String(feed.id)}`}
            onClick={() => void handleToggle(feed)}
          >
            {feed.active ? 'Pause' : 'Activate'}
          </button>
          <button
            className="btn btn-ghost"
            disabled={rowWorking === `remove:${String(feed.id)}`}
            onClick={() => void handleRemove(feed)}
          >
            Remove
          </button>
        </div>
      </li>
    );
  }

  return (
    <section aria-label="Feeds and websites" id="sources-feeds" className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.25rem' }}>Feeds &amp; websites</h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        Add RSS feeds, blogs, websites and other public sources.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input
          ref={urlInputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a public article, blog, RSS feed or website URL"
          aria-label="Source URL"
          style={{ ...fieldStyle, flex: '2 1 260px' }}
        />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Source type" style={{ ...fieldStyle, flex: '0 1 160px' }}>
          {FEED_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={saving || !url.trim()}>
          {saving ? 'Adding...' : 'Add source'}
        </button>
      </form>
      {formMessage ? (
        <p role={formError ? 'alert' : undefined} style={{ fontSize: '0.875rem', color: formError ? 'var(--color-error)' : 'var(--color-text-secondary)', marginTop: 0 }}>
          {formMessage}
        </p>
      ) : null}

      {loading ? <SectionLoading label="Loading feed sources..." /> : null}
      {!loading && error ? <SectionError message={error} onRetry={refresh} /> : null}
      {!loading && (!error || feeds.length > 0) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {builtIn.length > 0 ? (
            <div>
              <p className="kicker">Built-in sources</p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0, margin: 0 }}>
                {builtIn.map(feedRow)}
              </ul>
            </div>
          ) : null}
          <div>
            <p className="kicker">Your sources</p>
            {custom.length === 0 ? (
              <div style={{ border: '1px dashed var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0 0 0.5rem' }}>
                  No custom sources yet.
                </p>
                <button className="btn btn-secondary" onClick={() => urlInputRef.current?.focus()}>
                  Add your first source
                </button>
              </div>
            ) : (
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0, margin: 0 }}>
                {custom.map(feedRow)}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <SavedArticlesBlock />
    </section>
  );
}

/**
 * Single saved articles/links (intelligence sources). Kept as the home for
 * one-off URLs so no existing backend surface loses its UI.
 */
function SavedArticlesBlock() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState(false);

  // Initial load shows the skeleton; background refreshes update silently.
  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    try {
      const data = await listSources();
      setSources(data.sources ?? []);
      setError(null);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const refresh = useCallback(() => {
    void load(false);
  }, [load]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setSaving(true);
    setFormMessage(null);
    setFormError(false);
    try {
      await createSource(url.trim());
      setUrl('');
      setFormMessage('Article saved.');
      await load(false);
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
      setFormError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
      <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.25rem' }}>Single articles &amp; links</h4>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
        Save an individual article or page for the Brain to read. For recurring feeds, blogs and sites,
        use the feed form above.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a single article or page URL to save it"
          aria-label="Article URL"
          style={{ ...fieldStyle, flex: '2 1 260px' }}
        />
        <button type="submit" className="btn btn-secondary" disabled={saving || !url.trim()}>
          {saving ? 'Saving...' : 'Save article'}
        </button>
      </form>
      {formMessage ? (
        <p role={formError ? 'alert' : undefined} style={{ fontSize: '0.75rem', color: formError ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
          {formMessage}
        </p>
      ) : null}
      {loading ? <SectionLoading label="Loading saved articles..." /> : null}
      {!loading && error ? <SectionError message={error} onRetry={refresh} /> : null}
      {!loading && !error && sources.length === 0 ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>No saved articles yet.</p>
      ) : null}
      {!loading && sources.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
          {sources.map((source) => (
            <li key={String(source.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.875rem', margin: 0 }}>{String(source.title ?? source.url ?? source.id)}</p>
              {source.url ? (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', wordBreak: 'break-all', margin: '0.125rem 0 0' }}>
                  {String(source.url)}
                </p>
              ) : null}
              {source.status ? <span className="badge badge-neutral" style={{ marginTop: '0.25rem' }}>{String(source.status)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab root
// ---------------------------------------------------------------------------

export function SourcesTabSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h2 className="health-card-title" style={{ marginBottom: '0.25rem' }}>Sources &amp; Connections</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', margin: 0 }}>
          Connect your accounts and choose the information sources Growth Operator can use for research,
          content and authorized actions.
        </p>
      </div>
      <PlatformsSection />
      <ResearchSection />
      <FeedsSection />
    </div>
  );
}
