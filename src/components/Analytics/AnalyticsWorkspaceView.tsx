import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  PenTool, 
  Users, 
  Target, 
  Sparkles, 
  RefreshCw, 
  TrendingUp, 
  Lightbulb, 
  CheckCircle, 
  AlertTriangle,
  FlaskConical,
  BookOpen,
  ArrowUpRight
} from 'lucide-react';
import { api, VoiceProfile } from '../../services/api';

export type AnalyticsSubTab = 'content' | 'audience' | 'leads' | 'sales' | 'learning';

export const AnalyticsWorkspaceView: React.FC = () => {
  const [subTab, setSubTab] = useState<AnalyticsSubTab>('content');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [prospects, setProspects] = useState<any[]>([]);
  const [inboxActions, setInboxActions] = useState<any[]>([]);
  const [crmRecords, setCrmRecords] = useState<any[]>([]);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [learningStore, setLearningStore] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [hist, pros, inb, crm, profile, learn] = await Promise.all([
        api.getHistory().catch(() => ({ count: 0, history: [] })),
        api.listProspects().catch(() => []),
        api.listInboxActions().catch(() => []),
        api.listCrmPipeline().catch(() => []),
        api.getVoiceProfile().catch(() => null),
        api.getLearningStore().catch(() => null),
      ]);

      setHistory(hist.history || []);
      setProspects(pros);
      setInboxActions(inb);
      setCrmRecords(crm);
      setVoiceProfile(profile);
      setLearningStore(learn);
    } catch (err: any) {
      console.warn('Failed to load analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalPosts = history.length;
  const discoveredLeads = prospects.length;
  const qualifiedLeads = prospects.filter(p => (p.qualification?.score || 0) >= 70).length;
  const contactedLeads = crmRecords.filter(r => 
    ['CONTACTED', 'REPLIED', 'MEETING_SCHEDULED', 'CALL_SCHEDULED', 'OPPORTUNITY', 'WON'].includes(r.stage?.toUpperCase())
  ).length;
  const repliedLeads = crmRecords.filter(r => 
    ['REPLIED', 'MEETING_SCHEDULED', 'CALL_SCHEDULED', 'OPPORTUNITY', 'WON'].includes(r.stage?.toUpperCase())
  ).length;

  const activeConversations = inboxActions.length;
  const meetingsBooked = crmRecords.filter(r => 
    ['MEETING_SCHEDULED', 'CALL_SCHEDULED', 'OPPORTUNITY', 'WON'].includes(r.stage?.toUpperCase())
  ).length;
  const closedDeals = crmRecords.filter(r => r.stage?.toUpperCase() === 'WON').length;
  const totalClosedValue = crmRecords
    .filter(r => r.stage?.toUpperCase() === 'WON')
    .reduce((acc, r) => acc + (r.opportunity_value || 0), 0);

  const pillars = voiceProfile?.contentPillars || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Subtabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Growth & Learning Analytics</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Verified performance, pipeline conversions, and accumulated intelligence across your workspace.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => setSubTab('content')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                subTab === 'content' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Content
            </button>
            <button
              onClick={() => setSubTab('audience')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                subTab === 'audience' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Audience
            </button>
            <button
              onClick={() => setSubTab('leads')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                subTab === 'leads' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Leads
            </button>
            <button
              onClick={() => setSubTab('sales')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                subTab === 'sales' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sales
            </button>
            <button
              onClick={() => setSubTab('learning')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                subTab === 'learning' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Learning</span>
            </button>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
            title="Refresh analytics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 1. CONTENT SUBTAB */}
      {subTab === 'content' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium block">Posts Published</span>
              <div className="text-2xl font-bold text-white mt-1">{totalPosts}</div>
              <span className="text-[11px] text-emerald-400 mt-1 block">Live in workspace</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-xs text-slate-400 font-medium block">Platform metrics</span>
                <div className="text-sm font-semibold text-slate-300 mt-2">
                  {totalPosts > 0 ? 'Connected tracking active' : 'Awaiting published posts'}
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Only verified LinkedIn data</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium block">Active Inbound Comments</span>
              <div className="text-2xl font-bold text-white mt-1">{activeConversations}</div>
              <span className="text-[11px] text-blue-400 mt-1 block">Discussion threads</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium block">Format Distribution</span>
              <div className="text-xs font-semibold text-purple-300 mt-2">
                {learningStore?.memory?.recentFormats?.length || 0} recent formats tracked
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Portfolio diversification</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] uppercase tracking-wider font-bold text-blue-400">Platform activity</span>
              <p className="text-sm font-semibold text-white mt-1">{totalPosts} published post{totalPosts === 1 ? '' : 's'} · {activeConversations} active thread{activeConversations === 1 ? '' : 's'}</p>
              <p className="text-xs text-slate-400 mt-1">Reach and engagement remain blank until connected platform metrics are available.</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-900/60">
              <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400">Business outcomes</span>
              <p className="text-sm font-semibold text-white mt-1">{meetingsBooked} meetings · {qualifiedLeads} qualified leads</p>
              <p className="text-xs text-slate-400 mt-1">CRM-derived outcomes are separate from platform performance and are never simulated.</p>
            </div>
          </div>

          {/* Attribution */}
          <section className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">Content Pillar Distribution</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Alignment of published material against your configured core pillars.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {pillars.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center">
                  <p className="text-xs text-slate-400">Configure content pillars in Settings to map thematic coverage.</p>
                </div>
              ) : (
                pillars.map((pillar, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">{pillar}</span>
                    <span className="text-xs text-emerald-400 font-mono">Active Theme</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* 2. AUDIENCE SUBTAB */}
      {subTab === 'audience' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-white">Target Audience Context Graph</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-400 block">Primary Audience</span>
                <p className="text-sm text-white font-medium">{voiceProfile?.audience || 'Not specified yet'}</p>
                <p className="text-xs text-slate-400">Calibrated to avoid raw internal terminology leakage in posts.</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-400 block">Author Role & Background</span>
                <p className="text-sm text-white font-medium">{voiceProfile?.role || 'Growth Operator'}</p>
                <p className="text-xs text-slate-400">Used for expertise overlap validation (Direct vs Analytical framing).</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. LEADS SUBTAB */}
      {subTab === 'leads' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium block">Discovered Leads</span>
              <div className="text-2xl font-bold text-white mt-1">{discoveredLeads}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">Sourced via ICP</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium block">Qualified (Score &ge; 70)</span>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{qualifiedLeads}</div>
              <span className="text-[11px] text-emerald-400 mt-1 block">Verified timing & intent</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium block">Outreach Initiated</span>
              <div className="text-2xl font-bold text-blue-400 mt-1">{contactedLeads}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">Human-vetted touches</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium block">Inbound Replies</span>
              <div className="text-2xl font-bold text-purple-400 mt-1">{repliedLeads}</div>
              <span className="text-[11px] text-purple-300 mt-1 block">Active sales dialogues</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. SALES SUBTAB */}
      {subTab === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 font-medium block">Active Inbound Threads</span>
              <div className="text-2xl font-bold text-white mt-1">{activeConversations}</div>
              <p className="text-xs text-slate-400 pt-1">Direct buyer discussions in inbox</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 font-medium block">Meetings Scheduled</span>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{meetingsBooked}</div>
              <p className="text-xs text-slate-400 pt-1">Discovery calls & solution demos</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 font-medium block">Closed Won Revenue</span>
              <div className="text-2xl font-bold text-emerald-300 mt-1">
                ${totalClosedValue.toLocaleString()}
              </div>
              <p className="text-xs text-slate-400 pt-1">{closedDeals} closed contracts</p>
            </div>
          </div>
        </div>
      )}

      {/* 5. LEARNING SUBTAB (Sections 34, 35, 36, 70) */}
      {subTab === 'learning' && (
        <div className="space-y-6">
          {/* What the system learned this week */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-slate-900 to-purple-950/40 border border-indigo-800/50 space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Sparkles className="w-5 h-5" />
              <h2 className="text-base font-bold text-white">What the System Learned Recently</h2>
            </div>
            <p className="text-xs text-slate-300">
              Accumulated observations from user edits, feedback ratings, and sales conversation outcomes.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-950 border border-emerald-900/50 space-y-2">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  Validated High-Leverage Principles
                </span>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {(learningStore?.memory?.successfulPatterns || []).map((pat: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-emerald-500 font-bold">•</span>
                      <span>{pat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-amber-900/50 space-y-2">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Patterns to Avoid
                </span>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {(learningStore?.memory?.weakPatterns || []).map((pat: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-amber-500 font-bold">•</span>
                      <span>{pat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Active Growth Experiments */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-purple-400" />
                <h2 className="text-base font-bold text-white">Continuous Growth Experiments</h2>
              </div>
              <span className="text-xs text-purple-300 font-semibold px-2.5 py-1 rounded-full bg-purple-950 border border-purple-800">
                {learningStore?.experiments?.length || 0} Experiments
              </span>
            </div>

            <div className="space-y-3 pt-2">
              {(learningStore?.experiments || []).map((exp: any) => (
                <div key={exp.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{exp.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      exp.status === 'RUNNING' ? 'bg-blue-900 text-blue-300 border border-blue-700' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {exp.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{exp.hypothesis}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {exp.variants?.map((v: any) => {
                      const isVerified = v.provenance === 'VERIFIED_PLATFORM_DATA' || v.provenance === 'VERIFIED_INTERNAL_DATA';
                      const provLabel = v.provenance || 'UNAVAILABLE';
                      return (
                        <div key={v.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200 block">{v.label}</span>
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              isVerified ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {provLabel}
                            </span>
                          </div>
                          {isVerified ? (
                            <div className="flex items-center gap-4 text-slate-400 text-[11px] pt-1">
                              <span>Reactions: {v.reactions || 0}</span>
                              <span>Comments: {v.comments || 0}</span>
                              <span>Qualified Leads: {v.qualifiedLeads || 0}</span>
                            </div>
                          ) : (
                            <div className="text-slate-500 text-[11px] pt-1 flex items-center justify-between">
                              <span>Platform analytics not connected</span>
                              <span className="text-[10px] text-slate-600 italic">No verified telemetry</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* User Edits & Stylistic Shifts */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-400" />
              Observed User Preferences from Edits
            </h2>
            <div className="space-y-2">
              {(learningStore?.edits || []).slice(0, 5).map((edit: any) => (
                <div key={edit.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{edit.differences?.detectedStyleShift || 'Refinement'}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Delta: {edit.differences?.lengthDeltaPercent}% length
                    </span>
                  </div>
                  <ul className="text-slate-400 space-y-1 list-disc list-inside">
                    {edit.observedPreferences?.map((pref: string, pi: number) => (
                      <li key={pi}>{pref}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {(!learningStore?.edits || learningStore.edits.length === 0) && (
                <p className="text-xs text-slate-500">
                  When you edit AI-drafted posts in the Content Studio, the system analyzes your phrasing and sentence rhythm to refine future generations.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
