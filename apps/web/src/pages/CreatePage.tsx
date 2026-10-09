import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, GuideCard, SectionCard } from '../components/ui';

/* Create — the simplest possible starting point.
   Title: “What would you like to create?”
   Only offers formats the app can actually create/manage.
   Unsupported formats are labelled “Not available yet” and not clickable. */

export function CreatePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="stack">
        <PageHead title="Create" sub="Loading…" />
        <div className="card"><p className="muted" style={{ margin: 0 }}>Checking your session…</p></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead
          title="Create"
          sub="Sign in to start writing. Your ideas and drafts save per workspace."
        />
        <LoginForm />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead
        kicker="Create"
        title="What would you like to create?"
        sub="Start from your idea or let AI find one — you always stay in control."
        nextStep="Pick a format below, then continue writing in Content."
        helpHref="/help#create"
      />

      <GuideCard
        whereAmI="Create — the starting point for anything new."
        whatIsThis="Six simple choices: Post, Idea, Reply, Comment, plus AI help. Only what the app can actually make is clickable."
        whyItMatters="Every post starts from an idea. Starting in the right place keeps evidence attached and review honest."
        whatYouCanDo="Start writing, use your idea, use a saved idea, or ask AI to find an opportunity. Cancel returns safely."
        whatNext="After you pick, continue in Content → write → submit for review."
        action={<Link to="/content" className="btn btn-secondary btn-sm">Open Content library</Link>}
      />

      <SectionCard title="Start writing">
        <div className="help-grid">
          <div className="card-row">
            <p style={{ fontWeight: 700, margin: 0 }}>Post</p>
            <p className="muted" style={{ margin: '0.25rem 0 0.75rem' }}>A LinkedIn post draft with AI help, evidence, and review.</p>
            <Link to="/content" className="btn btn-primary btn-sm">Start writing</Link>
          </div>
          <div className="card-row">
            <p style={{ fontWeight: 700, margin: 0 }}>Idea</p>
            <p className="muted" style={{ margin: '0.25rem 0 0.75rem' }}>Just a title and a note. Ideas become plans, then drafts.</p>
            <Link to="/content" className="btn btn-secondary btn-sm">Use my idea</Link>
          </div>
          <div className="card-row">
            <p style={{ fontWeight: 700, margin: 0 }}>Reply / Comment</p>
            <p className="muted" style={{ margin: '0.25rem 0 0.75rem' }}>Prepare a thoughtful response. Suggestions stay drafts until you approve.</p>
            <Link to="/inbox" className="btn btn-secondary btn-sm">Prepare in Engage</Link>
          </div>
        </div>
        <div className="help-grid" style={{ marginTop: '0.75rem' }}>
          <div className="card-row" aria-disabled="true">
            <p style={{ fontWeight: 700, margin: 0 }}>Carousel <span className="badge badge-neutral">Not available yet</span></p>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>Planned. Not clickable until the backend supports it.</p>
          </div>
          <div className="card-row" aria-disabled="true">
            <p style={{ fontWeight: 700, margin: 0 }}>Article <span className="badge badge-neutral">Not available yet</span></p>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>Planned. Not clickable until the backend supports it.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Let AI find an idea for you"
        action={<Link to="/observatory" className="btn btn-ghost btn-sm">Find an opportunity</Link>}
      >
        <p className="muted" style={{ margin: 0 }}>
          Research reads only sources you enabled. Open an item, read “Why it matters”,
          then choose “Create content” to start a draft linked to that evidence.
        </p>
        <div className="actions" style={{ marginTop: '0.75rem' }}>
          <Link to="/observatory" className="btn btn-primary btn-sm">Find an opportunity</Link>
          <Link to="/content" className="btn btn-secondary btn-sm">Use a saved idea</Link>
        </div>
      </SectionCard>
    </div>
  );
}
