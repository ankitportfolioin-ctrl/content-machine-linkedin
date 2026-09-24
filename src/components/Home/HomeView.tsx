import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  PenTool, 
  Users, 
  MessageSquare, 
  Clock, 
  ArrowRight, 
  CheckCircle, 
  TrendingUp, 
  BarChart3, 
  Zap, 
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Plus,
  BookOpen,
  Send,
  Target
} from 'lucide-react';
import { api, VoiceProfile } from '../../services/api';

interface HomeViewProps {
  onNavigate: (tab: 'home' | 'content' | 'leads' | 'inbox' | 'pipeline' | 'analytics' | 'settings') => void;
  currentPostText?: string;
  onOpenCreatePost?: () => void;
  onOpenLeadModal?: (lead: any) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigate,
  currentPostText,
  onOpenCreatePost,
}) => {
  const [loading, setLoading] = useState(true);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [prospects, setProspects] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [inboxActions, setInboxActions] = useState<any[]>([]);
  const [crmRecords, setCrmRecords] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [autopilotBriefing, setAutopilotBriefing] = useState<any>(null);
  const [learningStore, setLearningStore] = useState<any>(null);

  // Onboarding wizard states
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [obRole, setObRole] = useState('');
  const [obHelp, setObHelp] = useState('');
  const [obAudience, setObAudience] = useState('');
  const [obTone, setObTone] = useState('Clear, conversational, and direct');
  const [obTopics, setObTopics] = useState('');
  const [savingOnboarding, setSavingOnboarding] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [profile, pros, apprs, inb, crm, hist, briefing, learn] = await Promise.all([
        api.getVoiceProfile().catch(() => null),
        api.listProspects().catch(() => []),
        api.listPendingApprovals().catch(() => []),
        api.listInboxActions().catch(() => []),
        api.listCrmPipeline().catch(() => []),
        api.getHistory().catch(() => ({ count: 0, history: [] })),
        api.getAutopilotBriefing().catch(() => null),
        api.getLearningStore().catch(() => null),
      ]);

      setVoiceProfile(profile);
      setProspects(pros);
      setApprovals(apprs);
      setInboxActions(inb);
      setCrmRecords(crm);
      setHistory(hist.history || []);
      setAutopilotBriefing(briefing);
      setLearningStore(learn);

      // Trigger onboarding if no voice profile is set up
      if (!profile || !profile.role || !profile.filled) {
        setShowOnboarding(true);
      }
    } catch (err) {
      console.warn('Failed to load home view data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCompleteOnboarding = async () => {
    setSavingOnboarding(true);
    try {
      const pillars = obTopics.split(',').map(t => t.trim()).filter(Boolean);
      await api.saveVoiceProfile({
        filled: true,
        role: obRole || 'Growth Operator',
        audience: obAudience || 'Industry Peers & Decision Makers',
        contentPillars: pillars.length > 0 ? pillars : ['Industry Insights & Lessons', 'Practical Workflows', 'Case Studies'],
        sentenceRhythm: obTone || 'Clear, conversational, and direct',
        signatureOpeners: [],
        bannedWords: ['supercharge', 'delve', 'tapestry', 'synergy', 'game-changer'],
        alwaysRules: ['Provide concrete observations', 'Speak directly from practical experience'],
        customNotes: obHelp ? `Helps: ${obHelp}` : undefined,
      });
      setShowOnboarding(false);
      await loadData();
    } catch (err) {
      console.error('Failed to save onboarding:', err);
    } finally {
      setSavingOnboarding(false);
    }
  };

  // Operational metrics
  const newProspectsCount = prospects.length;
  const highFitProspects = prospects.filter(p => (p.qualification?.score || 0) >= 70);
  const inboxAttentionCount = inboxActions.length;
  const followUpsDueCount = approvals.length;

  const postsPublished = history.length;
  const qualifiedLeadsCount = highFitProspects.length;
  const activeConversations = inboxActions.length;
  const meetingsCount = crmRecords.filter(r => 
    ['MEETING_SCHEDULED', 'CALL_SCHEDULED', 'OPPORTUNITY', 'WON'].includes(r.stage?.toUpperCase())
  ).length;

  const profileSignals = [
    voiceProfile?.role && 'Your expertise',
    voiceProfile?.audience && 'Audience',
    voiceProfile?.contentPillars?.length && 'Content pillars',
    voiceProfile?.keyReceipts?.length && 'Verified proof',
  ].filter(Boolean) as string[];
  const priorityAction = inboxAttentionCount > 0
    ? { label: 'Reply to the conversations waiting for you', tab: 'inbox' as const, detail: `${inboxAttentionCount} buyer signal${inboxAttentionCount === 1 ? '' : 's'} needs a human decision.` }
    : approvals.length > 0
      ? { label: 'Review outreach before anything is sent', tab: 'pipeline' as const, detail: `${approvals.length} draft${approvals.length === 1 ? '' : 's'} is waiting for approval.` }
      : currentPostText
        ? { label: 'Review and approve your prepared post', tab: 'content' as const, detail: 'Your draft is ready for an evidence and voice check.' }
        : { label: "Prepare today's most useful post", tab: 'content' as const, detail: 'The system will research, choose an angle, and ground the draft before asking for approval.' };

  const authorName = voiceProfile?.role ? (voiceProfile.role.length > 30 ? 'there' : voiceProfile.role.split(' ')[0]) : 'there';

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Good morning, {authorName}
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Growth Autopilot Active
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1 font-medium">
            Here's your growth plan for today based on real pipeline and content signals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('content')}
            id="home-create-post-btn"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-md shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Create Post</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Onboarding Wizard Modal if profile unconfigured */}
      {showOnboarding && (
        <div id="onboarding-card" className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/50 via-slate-900 to-indigo-950/40 border border-blue-800/60 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-600 text-white">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Set up your LinkedIn Growth Engine</h2>
                <p className="text-xs text-slate-300">Calibrate your AI content voice and target audience boundaries.</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700">
              Step {onboardingStep} of 6
            </span>
          </div>

          <div className="pt-2">
            {onboardingStep === 1 && (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-200 block">1. What is your professional role and expertise?</label>
                <input
                  type="text"
                  value={obRole}
                  onChange={(e) => setObRole(e.target.value)}
                  placeholder="e.g. Founder & CEO, VP of Engineering, Head of Growth"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {onboardingStep === 2 && (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-200 block">2. Who do you help and what outcome do you deliver?</label>
                <input
                  type="text"
                  value={obHelp}
                  onChange={(e) => setObHelp(e.target.value)}
                  placeholder="e.g. Scaling B2B SaaS companies through verifiable technical authority"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {onboardingStep === 3 && (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-200 block">3. Who do you want to reach on LinkedIn? (Target Audience)</label>
                <input
                  type="text"
                  value={obAudience}
                  onChange={(e) => setObAudience(e.target.value)}
                  placeholder="e.g. Engineering Directors, VP Product, Technical Founders"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {onboardingStep === 4 && (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-200 block">4. What should your LinkedIn voice sound like?</label>
                <input
                  type="text"
                  value={obTone}
                  onChange={(e) => setObTone(e.target.value)}
                  placeholder="e.g. Direct, data-backed, conversational, pragmatic"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {onboardingStep === 5 && (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-200 block">5. What are your 3 core content pillars / topics?</label>
                <input
                  type="text"
                  value={obTopics}
                  onChange={(e) => setObTopics(e.target.value)}
                  placeholder="e.g. System Architecture, Execution Workflows, Operational Trade-offs"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {onboardingStep === 6 && (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-200 block">6. Publishing & Safe Automation</label>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-2">
                  <p>All posts and sales messages require your human review before anything is published or sent.</p>
                  <p className="text-emerald-400 font-medium flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    Zero unauthorized sends • Human-in-the-loop guarantee
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
            <button
              onClick={() => setOnboardingStep(s => Math.max(1, s - 1))}
              disabled={onboardingStep === 1}
              className="px-3.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
            >
              Back
            </button>

            {onboardingStep < 6 ? (
              <button
                onClick={() => setOnboardingStep(s => s + 1)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/20"
              >
                <span>Continue</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleCompleteOnboarding}
                disabled={savingOnboarding}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
              >
                <span>{savingOnboarding ? 'Calibrating...' : 'Generate My Growth Plan'}</span>
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* DAILY GROWTH AUTOPILOT BRIEFING (Section 41) */}
      {autopilotBriefing && (
        <section className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/30 via-slate-900 to-indigo-950/30 border border-blue-800/40 space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2 text-blue-400">
              <Zap className="w-5 h-5 text-amber-400 fill-amber-400/20" />
              <h2 className="text-base font-bold text-white tracking-tight">Daily Growth Autopilot Briefing</h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                Live Synthesis
              </span>
            </div>
            <span className="text-xs text-slate-400">Mode: <strong className="text-white">{autopilotBriefing.automationMode || 'Assisted Growth'}</strong></span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Publishing Recommendation */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5" />
                  Recommended Publishing Action
                </span>
                <span className="text-[10px] font-mono text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                  {autopilotBriefing.todayContentRecommendation?.recommendedFormat || 'CAROUSEL_DOCUMENT'}
                </span>
              </div>
              <h4 className="text-xs font-semibold text-white">
                {autopilotBriefing.todayContentRecommendation?.topic || 'Verified Industry Capabilities & Workflow Leverage'}
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {autopilotBriefing.todayContentRecommendation?.rationale}
              </p>
              <button
                onClick={() => onNavigate('content')}
                className="mt-1 text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              >
                <span>Draft this post in Content Studio</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Sales Recommendation */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Priority Outreach Action
                </span>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                  {autopilotBriefing.todaySalesFocus?.signalType || 'Signal Trigger'}
                </span>
              </div>
              {autopilotBriefing.todaySalesFocus ? (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-white">
                    {autopilotBriefing.todaySalesFocus.topProspectName} ({autopilotBriefing.todaySalesFocus.company})
                  </h4>
                  <p className="text-xs text-slate-400">
                    Why now: <span className="text-slate-300">{autopilotBriefing.todaySalesFocus.whyContactNow}</span>
                  </p>
                  <p className="text-xs text-emerald-400/90 font-medium">
                    Suggested: {autopilotBriefing.todaySalesFocus.suggestedAngle}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No pending sales follow-ups due right now.</p>
              )}
              <button
                onClick={() => onNavigate('leads')}
                className="mt-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
              >
                <span>View leads to reach out to</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* UNIFIED OPERATING SYSTEM CONTEXT */}
      <section className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <h2 className="text-base font-bold text-white">Your growth operating system</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">One source of truth</span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Content, audience, prospects, conversations, and learning are connected. The AI recommends the next useful move; you stay in control of every consequential action.
            </p>
          </div>
          <button
            onClick={() => onNavigate(priorityAction.tab)}
            className="shrink-0 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-md shadow-blue-500/20"
          >
            <span>Do next: {priorityAction.label}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Recommended priority</span>
            <p className="text-sm font-semibold text-white mt-1">{priorityAction.label}</p>
            <p className="text-xs text-slate-400 mt-1">{priorityAction.detail}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Context available to the AI</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {profileSignals.length > 0 ? profileSignals.map(signal => (
                <span key={signal} className="text-[10px] px-2 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-900">{signal}</span>
              )) : <span className="text-xs text-slate-500">Complete your profile to improve recommendations.</span>}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION: TODAY — 5 PRIMARY ACTION CARDS (Section 41) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Today's 5 Focus Areas</h2>
            <p className="text-xs text-slate-400">High-leverage actions to compound audience authority and move active deals.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Content */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5" />
                  1. Content
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                  currentPostText
                    ? 'bg-blue-950 text-blue-300 border-blue-800'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {currentPostText ? 'Draft queued' : 'Ready to draft'}
                </span>
              </div>
              <h3 className="font-semibold text-white text-xs">Today's Post Strategy</h3>
              <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed font-mono bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                {currentPostText 
                  ? currentPostText.slice(0, 120) + '...'
                  : 'Source document understanding ready. Generate carousel or text post grounded in verified evidence.'}
              </p>
            </div>
            <button
              onClick={() => onNavigate('content')}
              id="btn-home-review-post"
              className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition shadow-sm"
            >
              <span>{currentPostText ? 'Review Post' : 'Create Post'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 2: Sales */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  2. Sales
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800">
                  {highFitProspects.length} High-fit
                </span>
              </div>
              <h3 className="font-semibold text-white text-xs">Target ICP Discovery</h3>
              <p className="text-xs text-slate-300">
                <strong className="text-white font-semibold">{newProspectsCount} prospects</strong> tracked. {highFitProspects.length} show high intent signals.
              </p>
            </div>
            <button
              onClick={() => onNavigate('leads')}
              id="btn-home-review-leads"
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer transition"
            >
              <span>Review Leads</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 3: Inbox */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  3. Inbox
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                  inboxAttentionCount > 0 
                    ? 'bg-purple-950 text-purple-300 border-purple-800' 
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {inboxAttentionCount} Need Reply
                </span>
              </div>
              <h3 className="font-semibold text-white text-xs">Buyer Conversations</h3>
              <p className="text-xs text-slate-300">
                {inboxAttentionCount > 0
                  ? `${inboxAttentionCount} inbound dialogues awaiting your decision.`
                  : 'All inbound dialogues are currently answered.'}
              </p>
            </div>
            <button
              onClick={() => onNavigate('inbox')}
              id="btn-home-open-inbox"
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer transition"
            >
              <span>Open Inbox</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 4: Pipeline */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" />
                  4. Pipeline
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                  followUpsDueCount > 0 
                    ? 'bg-amber-950 text-amber-300 border-amber-800' 
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {followUpsDueCount} Approvals
                </span>
              </div>
              <h3 className="font-semibold text-white text-xs">Opportunity Velocity</h3>
              <p className="text-xs text-slate-300">
                {followUpsDueCount > 0
                  ? `${followUpsDueCount} outreach approvals awaiting human review.`
                  : `${meetingsCount} meetings scheduled in active stages.`}
              </p>
            </div>
            <button
              onClick={() => onNavigate('pipeline')}
              id="btn-home-review-followups"
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer transition"
            >
              <span>Review Pipeline</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 5: Learning (Section 41 & 34) */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  5. Learning
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 font-semibold border border-indigo-800">
                  {learningStore?.experiments?.length || 0} Exp.
                </span>
              </div>
              <h3 className="font-semibold text-white text-xs">Engine Intelligence</h3>
              <p className="text-xs text-slate-300">
                {learningStore?.memory?.successfulPatterns?.[0]
                  ? `Insight: ${learningStore.memory.successfulPatterns[0]}`
                  : 'Accumulating voice calibrations and experiment findings.'}
              </p>
            </div>
            <button
              onClick={() => onNavigate('analytics')}
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer transition"
            >
              <span>View Learning</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* SECTION: THIS WEEK — BUSINESS RESULTS (Section 38 - No fake multipliers) */}
      <section className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Verified Workspace Metrics</h2>
            <p className="text-xs text-slate-400">Strictly verified counts across active operations — zero simulated metrics.</p>
          </div>
          <button
            onClick={() => onNavigate('analytics')}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
          >
            <span>Full Analytics</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium block">Posts Published</span>
            <div className="text-xl font-bold text-white mt-1">{postsPublished}</div>
            <span className="text-[10px] text-slate-500">Live in workspace</span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium block">Target Leads</span>
            <div className="text-xl font-bold text-white mt-1">{newProspectsCount}</div>
            <span className="text-[10px] text-slate-500">Discovered</span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium block">Qualified (Fit &ge;70)</span>
            <div className="text-xl font-bold text-emerald-400 mt-1">{qualifiedLeadsCount}</div>
            <span className="text-[10px] text-slate-500">High intent</span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium block">Active Dialogues</span>
            <div className="text-xl font-bold text-purple-400 mt-1">{activeConversations}</div>
            <span className="text-[10px] text-slate-500">Inbound threads</span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium block">Meetings</span>
            <div className="text-xl font-bold text-emerald-400 mt-1">{meetingsCount}</div>
            <span className="text-[10px] text-slate-500">Scheduled / won</span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium block">Audience Reach</span>
            <div className="text-xs font-semibold text-slate-300 mt-2">
              {postsPublished > 0 ? 'Connected tracking' : 'Awaiting posts'}
            </div>
            <span className="text-[10px] text-slate-500">Verified analytics</span>
          </div>
        </div>
      </section>
    </div>
  );
};
