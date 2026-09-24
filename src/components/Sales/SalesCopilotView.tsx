import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  CheckCircle,
  Clock,
  Send,
  MessageSquare,
  BarChart3,
  Briefcase,
  AlertCircle,
  RefreshCw,
  Plus,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  Edit3,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Inbox,
  Filter,
  DollarSign
} from 'lucide-react';
import { api } from '../../services/api';

type SalesSubTab = 'dashboard' | 'prospects' | 'approvals' | 'inbox' | 'crm' | 'analytics';

export const SalesCopilotView: React.FC = () => {
  const [subTab, setSubTab] = useState<SalesSubTab>('dashboard');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Data states
  const [dashboard, setDashboard] = useState<any>(null);
  const [briefing, setBriefing] = useState<string>('');
  const [prospects, setProspects] = useState<any[]>([]);
  const [selectedProspect, setSelectedProspect] = useState<any | null>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [inboxActions, setInboxActions] = useState<any[]>([]);
  const [crmRecords, setCrmRecords] = useState<any[]>([]);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editedDraft, setEditedDraft] = useState<string>('');
  const [newNote, setNewNote] = useState<string>('');

  // Prospect Discovery Form
  const [discRoles, setDiscRoles] = useState('');
  const [discIndustries, setDiscIndustries] = useState('');
  const [discOffer, setDiscOffer] = useState('');
  const [discBackend, setDiscBackend] = useState('manual');
  const [discLimit, setDiscLimit] = useState(5);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Inbound classifier testing
  const [inboundTestText, setInboundTestText] = useState('');
  const [classificationResult, setClassificationResult] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dash, brief, pros, apprs, inb, crm, profile, wsStatus] = await Promise.all([
        api.getSalesDashboard().catch(() => null),
        api.getDailyBriefing().catch(() => ({ briefing: '' })),
        api.listProspects().catch(() => []),
        api.listPendingApprovals().catch(() => []),
        api.listInboxActions().catch(() => []),
        api.listCrmPipeline().catch(() => []),
        api.getVoiceProfile().catch(() => null),
        api.getWorkspaceStatus().catch(() => null),
      ]);
      setDashboard(dash);
      setBriefing(brief.briefing);
      setProspects(pros);
      setApprovals(apprs);
      setInboxActions(inb);
      setCrmRecords(crm);
      if (wsStatus) {
        setIsDemoMode(wsStatus.isDemoMode);
        if (wsStatus.isDemoMode) {
          setDiscBackend('demo');
        }
      }
      if (profile) {
        setDiscRoles(prev => prev || profile.audience || '');
        setDiscIndustries(prev => prev || (profile as any).industry || profile.audience || '');
        setDiscOffer(prev => prev || profile.contentPillars?.[0] || profile.role || '');
      }
      if (pros.length > 0 && !selectedProspect) {
        setSelectedProspect(pros[0]);
      }
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDiscover = async () => {
    setActionLoading('discover');
    setMessage(null);
    try {
      const roles = discRoles.split(',').map(r => r.trim()).filter(Boolean);
      const industries = discIndustries.split(',').map(i => i.trim()).filter(Boolean);
      const discovered = await api.discoverProspects({
        roles,
        industries,
        offer: discOffer,
        backend: discBackend,
        limit: discLimit,
      });
      setMessage({ kind: 'success', text: `Discovered and deduplicated ${discovered.length} target prospects into pipeline.` });
      await loadData();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleQualify = async (prospectId: string) => {
    setActionLoading(`qualify-${prospectId}`);
    try {
      const result = await api.qualifyProspect(prospectId);
      setMessage({ kind: 'success', text: `Qualified prospect: ${result.overall_fit_score}/100 score.` });
      await loadData();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResearch = async (prospectId: string) => {
    setActionLoading(`research-${prospectId}`);
    try {
      await api.researchProspect(prospectId, discOffer);
      setMessage({ kind: 'success', text: `Gathered intelligence and personalization angles.` });
      await loadData();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDraftOutreach = async (prospectId: string, mode: string = 'value_first') => {
    setActionLoading(`draft-${prospectId}`);
    try {
      await api.draftOutreach({ prospect_id: prospectId, mode, offering: discOffer });
      setMessage({ kind: 'success', text: `Drafted personalized outreach and queued in Approval Manager.` });
      await loadData();
      setSubTab('approvals');
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveCard = async (cardId: string, text?: string) => {
    setActionLoading(`approve-${cardId}`);
    try {
      await api.approveOutreach(cardId, text);
      setMessage({ kind: 'success', text: `Action card approved. Ready for execution.` });
      setEditingCardId(null);
      await loadData();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectCard = async (cardId: string) => {
    setActionLoading(`reject-${cardId}`);
    try {
      await api.rejectOutreach(cardId);
      setMessage({ kind: 'success', text: `Action card rejected.` });
      await loadData();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecute = async (prospectId: string, cardId: string) => {
    setActionLoading(`exec-${cardId}`);
    try {
      const res = await api.executeOutreach({ prospect_id: prospectId, card_id: cardId, dry_run: true });
      setMessage({ kind: 'success', text: `Executed [${res.action_kind}] safely. Tracking in CRM.` });
      await loadData();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleClassifyInbound = async () => {
    if (!inboundTestText.trim()) return;
    setActionLoading('classify');
    try {
      const result = await api.classifyInboxResponse(inboundTestText);
      setClassificationResult(result);
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateCrmStage = async (prospectId: string, newStage: string) => {
    setActionLoading(`stage-${prospectId}`);
    try {
      await api.updateCrmStage(prospectId, newStage, 'Stage transitioned via pipeline board');
      setMessage({ kind: 'success', text: `Moved prospect to ${newStage}.` });
      await loadData();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddNote = async (prospectId: string) => {
    if (!newNote.trim()) return;
    setActionLoading(`note-${prospectId}`);
    try {
      await api.addCrmNote(prospectId, newNote.trim());
      setNewNote('');
      setMessage({ kind: 'success', text: 'CRM interaction note recorded.' });
      await loadData();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'dashboard', label: 'Executive Dashboard', icon: Briefcase },
            { id: 'prospects', label: 'AI Prospecting & Research', icon: Search, badge: prospects.length },
            { id: 'approvals', label: 'Approval Queue', icon: ShieldCheck, badge: approvals.length },
            { id: 'inbox', label: 'AI Inbox & Actions', icon: Inbox, badge: inboxActions.length },
            { id: 'crm', label: 'CRM Pipeline Board', icon: Users, badge: crmRecords.length },
            { id: 'analytics', label: 'Sales Conversion Funnel', icon: BarChart3 },
          ].map(tab => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`sales-tab-${tab.id}`}
                onClick={() => setSubTab(tab.id as SalesSubTab)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    active ? 'bg-blue-900 text-white' : 'bg-slate-700 text-blue-300'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 hover:text-white transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Global alert banner */}
      {message && (
        <div
          id="sales-alert-banner"
          className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium ${
            message.kind === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-200'
              : 'bg-red-950/60 border-red-800/80 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.kind === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Demo Mode Notice */}
      {isDemoMode && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Demo Mode Active:</strong> Pipeline currently loaded with demonstration prospects. Real outbound dispatches are gated. You can reset to a clean workspace in Settings.
            </span>
          </div>
        </div>
      )}

      {/* 1. DASHBOARD & BRIEFING */}
      {subTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Top Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Pipeline Leads</span>
              <div className="text-2xl font-bold text-white mt-1">{dashboard?.total_prospects || prospects.length}</div>
              <span className="text-[11px] text-blue-400 mt-1 block">Deduplicated against CRM</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Pending Approvals</span>
              <div className="text-2xl font-bold text-amber-400 mt-1">{dashboard?.pending_approvals_count || approvals.length}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">Zero unauthorized sends</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Active Deals in Progress</span>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{dashboard?.active_pipeline_count ?? 0}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">Stages from Intake to Deal</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Est. Opportunity Value</span>
              <div className="text-2xl font-bold text-white mt-1">${(dashboard?.pipeline_value || 0).toLocaleString()}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">Weighted pipeline ARR</span>
            </div>
          </div>

          {/* Daily Executive Briefing */}
          <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-white text-base">Executive Daily Sales Briefing</h3>
              </div>
              <span className="text-xs text-slate-400">Generated by Python Sales Copilot</span>
            </div>
            <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap bg-slate-950 p-4 rounded-xl border border-slate-800 max-h-96 overflow-y-auto leading-relaxed">
              {briefing || 'Loading executive briefing...'}
            </pre>
          </div>

          {/* Quick Actions & Recent Workflow Activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <h4 className="font-semibold text-white text-sm mb-3">High Priority Actions Requiring Your Review</h4>
              <div className="space-y-2.5">
                {dashboard?.priority_actions && dashboard.priority_actions.length > 0 ? (
                  dashboard.priority_actions.map((act: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-xs text-white">{act.prospect_name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                            {act.urgency}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{act.action_title}</p>
                      </div>
                      <button
                        onClick={() => setSubTab('approvals')}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
                      >
                        Review
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 py-3">No critical action items pending.</p>
                )}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <h4 className="font-semibold text-white text-sm mb-3">Recent Pipeline & Workflow Activity</h4>
              <div className="space-y-2">
                {dashboard?.recent_events && dashboard.recent_events.length > 0 ? (
                  dashboard.recent_events.map((ev: any, idx: number) => (
                    <div key={idx} className="text-xs text-slate-300 flex items-start gap-2 py-1.5 border-b border-slate-800/60 last:border-0">
                      <span className="text-blue-400 font-medium">[{ev.to_state || 'TRANSITION'}]</span>
                      <span className="text-slate-200">{ev.reason}</span>
                      <span className="text-slate-400 text-[10px] ml-auto whitespace-nowrap">
                        {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ''}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 py-3">Pipeline transitions will be logged here.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. PROSPECTING & RESEARCH */}
      {subTab === 'prospects' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Discovery Input Form */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-white text-sm">ICP Search & Discovery Pipeline</h3>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">Target Roles (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. Founder, Head of Customer Support, VP Operations"
                  value={discRoles}
                  onChange={(e) => setDiscRoles(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">Target Industries</label>
                <input
                  type="text"
                  placeholder="e.g. Indian D2C Brands, E-Commerce, Retail"
                  value={discIndustries}
                  onChange={(e) => setDiscIndustries(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">Your Offering / Value Proposition</label>
                <input
                  type="text"
                  placeholder="e.g. Customer support automation that cuts response time by 80%"
                  value={discOffer}
                  onChange={(e) => setDiscOffer(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Discovery Source</label>
                  <select
                    value={discBackend}
                    onChange={(e) => setDiscBackend(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="manual">Manual Research & Intake</option>
                    <option value="apify">Apify LinkedIn Search (if token set)</option>
                    {isDemoMode && <option value="demo">[Demo Mode] Mock Discovery Engine</option>}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Batch Limit</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={discLimit}
                    onChange={(e) => setDiscLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                id="btn-discover-prospects"
                onClick={handleDiscover}
                disabled={actionLoading === 'discover'}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {actionLoading === 'discover' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>Run Discovery Pipeline</span>
              </button>
            </div>

            {/* Prospects List */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-white text-xs uppercase tracking-wider">Identified Prospects ({prospects.length})</h4>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {prospects.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProspect(p)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      selectedProspect?.id === p.id
                        ? 'bg-blue-950/40 border-blue-500'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white">{p.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {p.pipeline?.stage || 'DISCOVERED'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{p.job_title} • {p.company}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-emerald-400 font-medium">
                        Fit Score: {p.qualification?.score || 0}%
                      </span>
                      <span className="text-[10px] text-slate-400">•</span>
                      <span className="text-[10px] text-slate-400 truncate">{p.industry}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Selected Prospect Details & Research View */}
          <div className="lg:col-span-7">
            {selectedProspect ? (
              <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-6">
                <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="font-bold text-lg text-white">{selectedProspect.name}</h3>
                    <p className="text-xs text-slate-300 mt-0.5">{selectedProspect.job_title} at <span className="font-semibold text-blue-400">{selectedProspect.company}</span></p>
                    <p className="text-[11px] text-slate-400 mt-1">{selectedProspect.location} • {selectedProspect.industry}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedProspect.linkedin_url && (
                      <a
                        href={selectedProspect.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Profile</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Fit and Intent Signals */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Qualification Fit Score</span>
                    <div className="text-xl font-bold text-emerald-400 mt-1">{selectedProspect.qualification?.score || 0} / 100</div>
                    <p className="text-[11px] text-slate-400 mt-1">{selectedProspect.qualification?.reason || 'Pending qualification review.'}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Pipeline Stage</span>
                    <div className="text-xl font-bold text-blue-400 mt-1">{selectedProspect.pipeline?.stage || 'DISCOVERED'}</div>
                    <p className="text-[11px] text-slate-400 mt-1">Source: {selectedProspect.source || 'Discovery'}</p>
                  </div>
                </div>

                {/* Company & Activity Intelligence */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-white text-xs uppercase tracking-wider">Research & Intent Signals</h4>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                    <div>
                      <span className="text-slate-400 font-semibold block">Company Background:</span>
                      <p className="text-slate-300 mt-0.5">{selectedProspect.research?.summary || 'Run research pipeline to extract priorities and background.'}</p>
                    </div>
                    {selectedProspect.intent?.signals && selectedProspect.intent.signals.length > 0 && (
                      <div>
                        <span className="text-slate-400 font-semibold block">Intent Signals:</span>
                        <ul className="list-disc pl-4 text-slate-300 mt-0.5 space-y-1">
                          {selectedProspect.intent.signals.map((sig: string, idx: number) => (
                            <li key={idx}>{sig}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Outreach Draft Preview */}
                {selectedProspect.outreach?.first_message && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-white text-xs uppercase tracking-wider">Personalized Message Draft</h4>
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap">
                      {selectedProspect.outreach.first_message}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => handleQualify(selectedProspect.id)}
                    disabled={actionLoading === `qualify-${selectedProspect.id}`}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Run Qualifier</span>
                  </button>

                  <button
                    onClick={() => handleResearch(selectedProspect.id)}
                    disabled={actionLoading === `research-${selectedProspect.id}`}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5 text-blue-400" />
                    <span>Deep Research</span>
                  </button>

                  <button
                    onClick={() => handleDraftOutreach(selectedProspect.id, 'value_first')}
                    disabled={actionLoading === `draft-${selectedProspect.id}`}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/20 ml-auto"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Draft Outreach & Queue</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800">
                Select a prospect from the left to view qualification, research, and outreach drafts.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. MULTI-ACTION APPROVAL QUEUE */}
      {subTab === 'approvals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-semibold text-white text-base">Human-in-the-Loop Approval Queue</h3>
              <p className="text-xs text-slate-400">Strict safety gate: zero automated actions are sent without your explicit approval.</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800">
              {approvals.length} Pending
            </span>
          </div>

          {approvals.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="font-semibold text-white">All action cards reviewed</p>
              <p className="text-xs mt-1">Generate new outreach drafts from AI Prospecting or daily routine.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {approvals.map(card => {
                const isEditing = editingCardId === card.id;
                return (
                  <div key={card.id} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          card.kind === 'connection_request'
                            ? 'bg-purple-950 text-purple-300 border border-purple-800'
                            : card.kind === 'direct_message'
                            ? 'bg-blue-950 text-blue-300 border border-blue-800'
                            : card.kind === 'comment'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}>
                          {card.kind}
                        </span>
                        <span className="font-semibold text-xs text-white">Target: {card.target}</span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{card.id}</span>
                    </div>

                    <p className="text-xs text-slate-300 font-medium">{card.why}</p>

                    {/* Draft preview / editor */}
                    {isEditing ? (
                      <textarea
                        value={editedDraft}
                        onChange={(e) => setEditedDraft(e.target.value)}
                        className="w-full h-32 p-3 rounded-xl bg-slate-950 border border-blue-500 font-mono text-xs text-white focus:outline-none leading-relaxed"
                      />
                    ) : (
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {card.edited_draft || card.draft}
                      </div>
                    )}

                    {card.risk_notes && (
                      <div className="flex items-center gap-2 text-[11px] text-amber-300 bg-amber-950/40 p-2.5 rounded-lg border border-amber-800/50">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{card.risk_notes}</span>
                      </div>
                    )}

                    {/* Controls */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <button
                        onClick={() => handleRejectCard(card.id)}
                        disabled={actionLoading === `reject-${card.id}`}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-red-950 hover:text-red-300 text-slate-400 border border-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>

                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => setEditingCardId(null)}
                              className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleApproveCard(card.id, editedDraft)}
                              disabled={actionLoading === `approve-${card.id}`}
                              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/20"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save & Approve</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingCardId(card.id);
                                setEditedDraft(card.edited_draft || card.draft);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit Draft</span>
                            </button>
                            <button
                              onClick={() => handleApproveCard(card.id)}
                              disabled={actionLoading === `approve-${card.id}`}
                              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. AI INBOX & NEXT ACTION ENGINE */}
      {subTab === 'inbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Inbound Classifier Interactive Tester */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span>AI Inbound Response Classifier</span>
              </h3>
              <p className="text-xs text-slate-400">Classifies incoming prospect replies by sentiment, objections, or meeting intent.</p>

              <textarea
                value={inboundTestText}
                onChange={(e) => setInboundTestText(e.target.value)}
                rows={3}
                placeholder="Paste inbound LinkedIn DM or comment..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-sans"
              />

              <button
                onClick={handleClassifyInbound}
                disabled={actionLoading === 'classify'}
                className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-500/20"
              >
                {actionLoading === 'classify' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Classify Intent & Recommend Action</span>
              </button>

              {classificationResult && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Intent Category:</span>
                    <span className="font-bold text-emerald-400">{classificationResult.intent}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Sentiment:</span>
                    <span className="font-medium text-white">{classificationResult.sentiment}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Recommended Next Step:</span>
                    <span className="font-medium text-blue-300">{classificationResult.recommended_action}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actionable Inbound Queue */}
          <div className="lg:col-span-7 space-y-3">
            <h3 className="font-semibold text-white text-sm">Next-Action Engine Recommendations</h3>
            <div className="space-y-3">
              {inboxActions.map((action, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs text-white">{action.prospect_name}</span>
                      <span className="text-slate-400 text-xs ml-2">({action.prospect_company})</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      action.urgency === 'HIGH' ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-blue-950 text-blue-300 border border-blue-800'
                    }`}>
                      {action.urgency}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 font-medium">{action.action_title}</p>
                  <p className="text-[11px] text-slate-400">{action.why}</p>

                  {action.suggested_draft && (
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
                      {action.suggested_draft}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. INTERACTIVE CRM PIPELINE KANBAN */}
      {subTab === 'crm' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-semibold text-white text-base">CRM Deal Pipeline</h3>
              <p className="text-xs text-slate-400">Integrated stage transitions, deal values, and prospect notes.</p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Total Deals: {crmRecords.length}
            </span>
          </div>

          {/* Pipeline Stage Columns */}
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3 overflow-x-auto pb-4">
            {[
              { id: 'DISCOVERED', label: 'Discovered', color: 'border-slate-700' },
              { id: 'QUALIFIED', label: 'Qualified', color: 'border-blue-700' },
              { id: 'READY_FOR_REVIEW', label: 'Review', color: 'border-amber-700' },
              { id: 'APPROVED', label: 'Approved', color: 'border-emerald-700' },
              { id: 'CONTACTED', label: 'Contacted', color: 'border-cyan-700' },
              { id: 'REPLIED', label: 'Replied', color: 'border-purple-700' },
              { id: 'WON', label: 'Won Deal', color: 'border-emerald-500' },
            ].map(col => {
              const recordsInStage = crmRecords.filter(r => r.stage?.toUpperCase() === col.id);
              return (
                <div key={col.id} className="min-w-[180px] p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-semibold text-slate-200">{col.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">
                      {recordsInStage.length}
                    </span>
                  </div>

                  <div className="space-y-2 flex-1 min-h-[220px]">
                    {recordsInStage.map(rec => (
                      <div key={rec.prospect_id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                        <div className="font-semibold text-xs text-white truncate">{rec.name}</div>
                        <div className="text-[11px] text-slate-400 truncate">{rec.company}</div>
                        {rec.opportunity_value > 0 && (
                          <div className="text-[11px] font-semibold text-emerald-400">
                            ${rec.opportunity_value.toLocaleString()}
                          </div>
                        )}

                        <div className="flex items-center gap-1 pt-1 border-t border-slate-800/80">
                          {col.id !== 'WON' && (
                            <button
                              onClick={() => {
                                const nextStages: Record<string, string> = {
                                  DISCOVERED: 'QUALIFIED',
                                  QUALIFIED: 'READY_FOR_REVIEW',
                                  READY_FOR_REVIEW: 'APPROVED',
                                  APPROVED: 'CONTACTED',
                                  CONTACTED: 'REPLIED',
                                  REPLIED: 'WON',
                                };
                                const target = nextStages[col.id] || 'WON';
                                handleUpdateCrmStage(rec.prospect_id, target);
                              }}
                              className="text-[10px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer"
                            >
                              <span>Advance</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* CRM Prospect Note Intake */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h4 className="font-semibold text-white text-xs uppercase tracking-wider">Add CRM Activity Note</h4>
            <div className="flex gap-3">
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Log call note, objection details, or next follow-up date..."
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => {
                  if (prospects.length > 0) {
                    handleAddNote(selectedProspect?.id || prospects[0].id);
                  }
                }}
                disabled={!newNote.trim() || prospects.length === 0}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. SALES CONVERSION FUNNEL & ANALYTICS */}
      {subTab === 'analytics' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="font-semibold text-white text-base">Pipeline Conversion Funnel</h3>
            <p className="text-xs text-slate-400">Real step-by-step conversion tracking calculated directly from your workspace records.</p>

            {prospects.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <BarChart3 className="w-8 h-8 text-slate-600 mx-auto" />
                <h4 className="text-sm font-semibold text-white">No Pipeline Data Yet</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Run a discovery search with your target roles or add prospects to view your live funnel conversion metrics.
                </p>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {(() => {
                  const total = Math.max(prospects.length, 1);
                  const qualified = prospects.filter(p => (p.qualification?.score || 0) >= 70).length;
                  const approved = approvals.filter(a => a.status === 'approved' || a.status === 'executed').length;
                  const engaged = crmRecords.filter(r => r.stage === 'REPLIED' || r.stage === 'CONTACTED').length;
                  const won = crmRecords.filter(r => r.stage === 'WON').length;

                  return [
                    { stage: 'Discovered Prospects', count: prospects.length, pct: 100, color: 'bg-blue-500' },
                    { stage: 'Qualified Leads (Fit >= 70%)', count: qualified, pct: Math.round((qualified / total) * 100), color: 'bg-indigo-500' },
                    { stage: 'Approved Outreach Touchpoints', count: approved, pct: Math.round((approved / total) * 100), color: 'bg-emerald-500' },
                    { stage: 'Direct Engagement & Inbound Replies', count: engaged, pct: Math.round((engaged / total) * 100), color: 'bg-purple-500' },
                    { stage: 'Deals Won', count: won, pct: Math.round((won / total) * 100), color: 'bg-emerald-400' },
                  ];
                })().map((row, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200">{row.stage}</span>
                      <span className="text-slate-400 font-mono">{row.count} leads ({row.pct}%)</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${row.color}`}
                        style={{ width: `${Math.max(row.pct, 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
