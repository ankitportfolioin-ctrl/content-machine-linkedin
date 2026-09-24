import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  Sparkles, 
  ArrowRight, 
  MapPin, 
  Briefcase, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  RefreshCw,
  Plus,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { api } from '../../services/api';
import { LeadDetailModal, getFriendlyStageLabel } from './LeadDetailModal';

export const LeadsWorkspaceView: React.FC = () => {
  const [prospects, setProspects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'high-fit' | 'ready-to-contact' | 'researched'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [voiceProfile, setVoiceProfile] = useState<any>(null);
  const [bannerMessage, setBannerMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Discovery Modal state
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [targetRole, setTargetRole] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [targetCount, setTargetCount] = useState(5);
  const [isDiscovering, setIsDiscovering] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pros, prof] = await Promise.all([
        api.listProspects().catch(() => []),
        api.getVoiceProfile().catch(() => null)
      ]);
      setProspects(pros);
      setVoiceProfile(prof);

      if (prof?.audience && !targetRole) {
        setTargetRole(prof.audience.split(',')[0]?.trim() || '');
      }
      if (prof?.industry && !targetIndustry) {
        setTargetIndustry(prof.industry || '');
      }
    } catch (err: any) {
      console.warn('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenLead = (lead: any) => {
    setSelectedLead(lead);
    setIsDetailOpen(true);
  };

  const handleRunDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDiscovering(true);
    setBannerMessage(null);
    try {
      const res = await api.discoverProspects({
        roles: [targetRole],
        industries: [targetIndustry],
        limit: targetCount
      });
      setBannerMessage({
        kind: 'success',
        text: `Identified ${res.length || targetCount} new target prospects matching your ICP.`
      });
      setShowDiscoveryModal(false);
      await loadData();
    } catch (err: any) {
      setBannerMessage({ kind: 'error', text: err.message });
    } finally {
      setIsDiscovering(false);
    }
  };

  // Filter leads
  const filteredProspects = prospects.filter(p => {
    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name?.toLowerCase().includes(q);
      const matchCompany = p.company?.toLowerCase().includes(q);
      const matchRole = p.job_title?.toLowerCase().includes(q);
      if (!matchName && !matchCompany && !matchRole) return false;
    }

    const fitScore = p.qualification?.score || 0;
    const stage = p.pipeline?.stage?.toUpperCase() || '';

    if (filter === 'high-fit') {
      return fitScore >= 70;
    }
    if (filter === 'ready-to-contact') {
      return fitScore >= 50 || stage === 'APPROVED' || stage === 'QUALIFIED' || stage === 'QUEUED_FOR_OUTREACH';
    }
    if (filter === 'researched') {
      return !!p.research?.summary || !!p.research?.profile_summary || (p.research?.personalization_points?.length > 0);
    }
    return true;
  });

  const highFitCount = prospects.filter(p => (p.qualification?.score || 0) >= 70).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Leads</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Find people who could become customers. AI identifies high-fit decision makers aligned with your offering.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDiscoveryModal(true)}
            id="btn-leads-find-prospects"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>+ Find prospects</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
            title="Refresh leads"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global alert banner */}
      {bannerMessage && (
        <div
          id="leads-alert-banner"
          className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
            bannerMessage.kind === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-200'
              : 'bg-red-950/60 border-red-800/80 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{bannerMessage.text}</span>
          </div>
          <button onClick={() => setBannerMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* ICP Summary Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Current ICP Criteria</span>
              <span className="text-[10px] text-emerald-400 font-semibold">• Active</span>
            </div>
            <div className="text-xs text-slate-300 mt-0.5">
              Targeting: <strong className="text-white">{voiceProfile?.audience || 'VP of Engineering, CTO, Tech Founders'}</strong> in <strong className="text-white">B2B SaaS & Cloud</strong>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowDiscoveryModal(true)}
          className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer self-start md:self-auto"
        >
          Adjust Criteria
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition ${
              filter === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            All leads ({prospects.length})
          </button>
          <button
            onClick={() => setFilter('high-fit')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition flex items-center gap-1.5 ${
              filter === 'high-fit'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <span>High-fit prospects</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-800">
              {highFitCount}
            </span>
          </button>
          <button
            onClick={() => setFilter('ready-to-contact')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition ${
              filter === 'ready-to-contact'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Ready to contact
          </button>
          <button
            onClick={() => setFilter('researched')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition ${
              filter === 'researched'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Recently researched
          </button>
        </div>

        {/* Search input */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, company, or role..."
            className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Leads Grid */}
      {filteredProspects.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-3">
          <Users className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="font-semibold text-white text-sm">No leads match your filter</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery ? 'Try adjusting your search query or clear the filter.' : 'Run prospect discovery to find target buyers for your business.'}
          </p>
          <button
            onClick={() => setShowDiscoveryModal(true)}
            id="btn-empty-find-prospects"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer shadow-sm"
          >
            Find prospects
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProspects.map(lead => {
            const fitScore = lead.qualification?.score || 0;
            const friendlyStage = getFriendlyStageLabel(lead.pipeline?.stage);

            return (
              <div
                key={lead.id}
                onClick={() => handleOpenLead(lead)}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition cursor-pointer flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-3">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {lead.name ? lead.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('') : 'L'}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-white group-hover:text-blue-400 transition">
                          {lead.name}
                        </h3>
                        <p className="text-xs text-slate-300 font-medium line-clamp-1">{lead.job_title}</p>
                        <p className="text-xs text-blue-400 font-semibold">{lead.company}</p>
                      </div>
                    </div>

                    {fitScore > 0 && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                        fitScore >= 75
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          : fitScore >= 50
                          ? 'bg-amber-950 text-amber-300 border-amber-800'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {fitScore}% Fit
                      </span>
                    )}
                  </div>

                  {/* Why they match */}
                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Why they match:
                    </span>
                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                      {lead.qualification?.reason || `Matches ${lead.job_title || 'target role'} at high-growth organization.`}
                    </p>
                  </div>

                  {/* Recent relevant signal */}
                  {lead.intent?.signals && lead.intent.signals.length > 0 && (
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                      <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="truncate">Signal: {lead.intent.signals[0]}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="px-2 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-900">Known: {lead.job_title || lead.company || 'profile data'}</span>
                    {lead.research?.summary && <span className="px-2 py-1 rounded-lg bg-blue-950/60 text-blue-300 border border-blue-900">Researched</span>}
                    {!lead.research?.summary && <span className="px-2 py-1 rounded-lg bg-amber-950/50 text-amber-300 border border-amber-900">Unknown: needs research</span>}
                  </div>
                </div>

                {/* Bottom row */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    {friendlyStage}
                  </span>

                  <span className="text-blue-400 group-hover:text-blue-300 font-medium flex items-center gap-1">
                    <span>View profile & draft</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Discovery Modal */}
      {showDiscoveryModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Find Target Prospects</h3>
                <p className="text-xs text-slate-400">Discover decision-makers matching your ideal customer profile.</p>
              </div>
              <button
                onClick={() => setShowDiscoveryModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRunDiscovery} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Target Job Title</label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. VP of Engineering, CTO, Head of Product"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Target Industry / Domain</label>
                <input
                  type="text"
                  value={targetIndustry}
                  onChange={(e) => setTargetIndustry(e.target.value)}
                  placeholder="e.g. B2B SaaS, Cloud Infrastructure, Healthcare Tech"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Number of Prospects</label>
                <select
                  value={targetCount}
                  onChange={(e) => setTargetCount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value={3}>3 prospects</option>
                  <option value={5}>5 prospects</option>
                  <option value={10}>10 prospects</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDiscoveryModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDiscovering}
                  id="btn-run-discovery-submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {isDiscovering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>{isDiscovering ? 'Searching...' : 'Run Discovery'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shared Lead Detail Modal */}
      <LeadDetailModal
        lead={selectedLead}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedLead(null);
        }}
        onLeadUpdated={loadData}
        onActionMessage={setBannerMessage}
      />
    </div>
  );
};
