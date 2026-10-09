import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, GuideCard } from '../components/ui';
import { SourcesTabSection } from '../components/SourcesTabSection';

/* Research Sources — where ideas come from.
   Reuses the real SourcesTabSection (feeds, registry connectors,
   saved articles) so no backend surface loses its UI. */

export function SourcesPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="stack">
        <PageHead title="Research Sources" sub="Loading…" />
        <div className="card"><p className="muted" style={{ margin: 0 }}>Checking your session…</p></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead title="Research Sources" sub="Sign in to manage where ideas come from." />
        <LoginForm />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead
        kicker="Where ideas come from"
        title="Research Sources"
        sub="RSS, blogs, sites, Reddit and Google Trends — only what you enable runs."
        nextStep="Add a source → Test source → watch Research fill up."
        helpHref="/help#sources"
      />
      <GuideCard
        whereAmI="Research Sources — the taps that feed Research."
        whatIsThis="Public feeds you add, registry sources you enable, and single articles you save."
        whyItMatters="Research only reads what you enable here. A failed fetch is shown honestly — never as success."
        whatYouCanDo="Add source, test source, edit, pause, resume, check now, view documents, or remove (with confirmation)."
        whatNext="After enabling 1–2 sources, go to Research and run a scan from Home."
      />
      <SourcesTabSection />
    </div>
  );
}
