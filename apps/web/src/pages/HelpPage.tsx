import { Link } from 'react-router-dom';
import { PageHead, SectionCard } from '../components/ui';
import { LEGACY_LINKS, NAV_SECTIONS } from '../components/navConfig';

/* Help — what goes where? A 2-minute tour with real links.
   Every item opens a real screen. No dead links. */

const JOURNEY: Array<{ step: string; where: string; to: string; what: string }> = [
  { step: '1. Tell us about your business', where: 'Get set up / Settings', to: '/onboarding', what: 'Business, audience, topics, voice. 6 quick steps — progress saves automatically.' },
  { step: '2. Connect and choose sources', where: 'Connections + Research Sources', to: '/connections', what: 'Connect LinkedIn officially, then enable 1–2 public research sources.' },
  { step: '3. Find things worth talking about', where: 'Research', to: '/observatory', what: 'Real items with “Why it matters”. Save one or turn it into content.' },
  { step: '4. Start something new', where: 'Create → Content', to: '/create', what: 'Pick Post or Idea. Write with AI help — evidence stays attached.' },
  { step: '5. Review before anything happens', where: 'Needs your decision', to: '/approvals', what: 'Approve, edit, or reject. Approval never means it already happened.' },
  { step: '6. See real results and learn', where: 'Analytics → Learning', to: '/analytics', what: 'Recorded results only. Accept insights with evidence to improve recommendations.' },
];

export function HelpPage() {
  return (
    <div className="stack">
      <PageHead
        kicker="What goes where?"
        title="Help"
        sub="The whole workflow in 2 minutes, with real links to each step."
        nextStep="Follow Business → Research → Create → Content → Review → Learning."
        helpHref="/help"
      />

      <SectionCard title="Follow one helpful path">
        <ol className="plain-list">
          {JOURNEY.map((j) => (
            <li key={j.step} className="card-row">
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700, margin: 0 }}>{j.step}</p>
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    Where: {j.where} — {j.what}
                  </p>
                </div>
                <Link to={j.to} className="btn btn-secondary btn-sm">Open</Link>
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard title="Every tab, in plain words">
        <div className="help-grid">
          {NAV_SECTIONS.flatMap((s) => s.entries).map((e) => (
            <div key={e.to} className="card-row">
              <p style={{ fontWeight: 700, margin: 0 }}>
                <Link to={e.to}>{e.label}</Link>
                <span className="tiny" style={{ marginLeft: '0.5rem' }}>{e.section}</span>
              </p>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>{e.description}.</p>
              <p className="tiny" style={{ margin: '0.25rem 0 0' }}>Do this: {e.whatToDo}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Older views (still work)">
        <p className="muted" style={{ marginTop: 0 }}>
          We renamed tabs to plain language. Old links keep working and point to their new home.
        </p>
        <ul className="plain-list">
          {LEGACY_LINKS.map((l) => (
            <li key={l.to} className="card-row">
              <div className="row-between">
                <div>
                  <p style={{ fontWeight: 600, margin: 0 }}>{l.label}</p>
                  <p className="tiny" style={{ margin: '0.2rem 0 0' }}>{l.to} → {l.parent}</p>
                </div>
                <div className="actions">
                  <Link to={l.to} className="btn btn-secondary btn-sm">Open old view</Link>
                  <Link to={l.parent} className="btn btn-ghost btn-sm">New home</Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="card safety-banner" id="get-started">
        <p className="muted" style={{ margin: 0 }}>
          New here? Nothing publishes without your review, and missing data is always labelled honestly
          (“Not enough data yet”, “Not available from the connected sources”).
        </p>
        <div className="actions">
          <Link to="/onboarding" className="btn btn-primary btn-sm">Get set up</Link>
          <Link to="/" className="btn btn-secondary btn-sm">Go to Home</Link>
        </div>
      </div>
    </div>
  );
}
