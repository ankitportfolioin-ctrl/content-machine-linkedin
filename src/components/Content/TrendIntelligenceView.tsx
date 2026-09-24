import React, { useState, useEffect } from 'react';
import {
  Flame,
  Globe,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  HelpCircle,
  TrendingUp,
  Share2,
  ShieldCheck,
  BookOpen,
  ArrowRight,
  Info,
  Link as LinkIcon
} from 'lucide-react';
import { api } from '../../services/api';

interface TrendIntelligenceViewProps {
  onSelectTrendAngle: (trend: any, angle: any) => void;
  voiceProfile: any;
}

export const TrendIntelligenceView: React.FC<TrendIntelligenceViewProps> = ({
  onSelectTrendAngle,
  voiceProfile
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'trends' | 'questions' | 'url_research' | 'sources'>('trends');
  const [trends, setTrends] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [selectedPillar, setSelectedPillar] = useState<string>('all');
  const [selectedFreshness, setSelectedFreshness] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Sources Modal
  const [activeSourceTrend, setActiveSourceTrend] = useState<any | null>(null);

  // URL Research
  const [inputUrl, setInputUrl] = useState('');
  const [urlResearchResult, setUrlResearchResult] = useState<any | null>(null);
  const [isResearchingUrl, setIsResearchingUrl] = useState(false);

  // Source Registry
  const [sources, setSources] = useState<any[]>([]);
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceName, setNewSourceName] = useState('');

  const loadTrends = async () => {
    setLoading(true);
    try {
      const data = await api.getTrends();
      setTrends(data.trends || []);
      setStatus(data.status || null);
    } catch (err: any) {
      console.warn('Failed to load trends:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSources = async () => {
    try {
      const data = await api.getContentSources();
      setSources(data.sources || []);
    } catch {}
  };

  useEffect(() => {
    loadTrends();
    loadSources();
  }, []);

  const handleRunResearch = async (mode: 'MY_NICHE' | 'SPECIFIC_TOPIC' = 'MY_NICHE', topic?: string) => {
    setIsResearching(true);
    setMessage(null);
    try {
      const result = await api.runResearch({ mode, topic, maxSources: 6 });
      setTrends(result.trends || []);
      setStatus(result.status || null);
      setMessage({
        kind: 'success',
        text: `Scanned ${result.status?.sourcesScanned || 0} public sources. Found ${result.trends?.length || 0} grounded trend clusters.`
      });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'Research failed' });
    } finally {
      setIsResearching(false);
    }
  };

  const handleResearchUrl = async () => {
    if (!inputUrl.trim()) return;
    setIsResearchingUrl(true);
    setMessage(null);
    try {
      const result = await api.researchUrl(inputUrl.trim());
      setUrlResearchResult(result);
      if (result.trends && result.trends.length > 0) {
        setMessage({
          kind: 'success',
          text: `Successfully extracted and analyzed public article: "${result.trends[0].title}"`
        });
      }
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'URL research failed. Ensure the page is publicly accessible.' });
    } finally {
      setIsResearchingUrl(false);
    }
  };

  const handleAddSource = async () => {
    if (!newSourceUrl.trim()) return;
    try {
      await api.saveContentSource({
        name: newSourceName.trim() || 'Custom Feed',
        feedUrl: newSourceUrl.trim(),
        domain: new URL(newSourceUrl.trim()).hostname,
        sourceType: 'RSS',
        crawlMethod: 'FEED',
        quality: 'HIGH',
        tags: ['custom', 'rss'],
      });
      setNewSourceUrl('');
      setNewSourceName('');
      loadSources();
      setMessage({ kind: 'success', text: 'Custom web source saved to registry.' });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'Failed to save source' });
    }
  };

  // Filter trends
  const filteredTrends = trends.filter((t) => {
    if (selectedPillar !== 'all' && t.matchedPillar !== selectedPillar) return false;
    if (selectedFreshness !== 'all' && t.freshness !== selectedFreshness) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const text = `${t.title} ${t.summary} ${t.keywords.join(' ')}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const availablePillars = Array.from(new Set(trends.map((t) => t.matchedPillar).filter(Boolean)));

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/40 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>Public Web Intelligence</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium">
                No Paid API Required
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mt-2">Web Trend Intelligence</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Discovers emerging topics, industry questions, and pain points across public RSS feeds and engineering blogs. 
              Transforms real-world facts into original perspectives without copying.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRunResearch('MY_NICHE')}
              disabled={isResearching}
              id="btn-research-niche"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResearching ? 'animate-spin' : ''}`} />
              <span>{isResearching ? 'Researching Niche...' : 'Research My Niche'}</span>
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {status?.lastRunAt
                  ? `Updated ${new Date(status.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Never scanned'}
              </span>
            </span>
            <span>•</span>
            <span>
              <strong className="text-slate-200">{trends.length}</strong> Trend Clusters
            </span>
            <span>•</span>
            <span>
              <strong className="text-slate-200">{status?.sourcesScanned || 0}</strong> Public Sources Scanned
            </span>
          </div>

          <div className="text-[11px] text-slate-500 italic">
            Grounded in: {voiceProfile?.role || 'Your Profile & Content Pillars'}
          </div>
        </div>
      </div>

      {/* Alert Banner */}
      {message && (
        <div
          className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
            message.kind === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-200'
              : 'bg-red-950/60 border-red-800/80 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Partial Coverage Notice */}
      {status && status.sourcesUnavailable > 0 && (
        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Research completed with partial source coverage: <strong>{status.sourcesSuccessful} succeeded</strong>,{' '}
              <span className="text-amber-300">{status.sourcesUnavailable} unavailable / timed out</span>.
            </span>
          </div>
          <span className="text-[10px] text-amber-400/80 font-mono">Tolerant fallback active</span>
        </div>
      )}

      {/* Navigation Sub-tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('trends')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'trends'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span>Trending Topics ({filteredTrends.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('questions')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'questions'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
            <span>Questions People Are Asking</span>
          </button>
          <button
            onClick={() => setActiveSubTab('url_research')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'url_research'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>Research a Public URL</span>
          </button>
          <button
            onClick={() => setActiveSubTab('sources')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'sources'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>Source Registry</span>
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SUB-TAB 1: TRENDING TOPICS                                       */}
      {/* ================================================================ */}
      {activeSubTab === 'trends' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter by keyword or topic..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none text-white placeholder-slate-500 focus:outline-none text-xs"
              />
            </div>

            <div className="flex items-center gap-3">
              {availablePillars.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Pillar:</span>
                  <select
                    value={selectedPillar}
                    onChange={(e) => setSelectedPillar(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-300 text-xs focus:outline-none"
                  >
                    <option value="all">All Content Pillars</option>
                    {availablePillars.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Freshness:</span>
                <select
                  value={selectedFreshness}
                  onChange={(e) => setSelectedFreshness(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-300 text-xs focus:outline-none"
                >
                  <option value="all">All Timelines</option>
                  <option value="BREAKING">Breaking (&lt; 6h)</option>
                  <option value="TODAY">Today (&lt; 24h)</option>
                  <option value="THIS WEEK">This Week</option>
                  <option value="RECENT">Recent</option>
                  <option value="EVERGREEN">Evergreen</option>
                </select>
              </div>
            </div>
          </div>

          {/* Empty State */}
          {filteredTrends.length === 0 && !loading && (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <Globe className="w-10 h-10 text-slate-500 mx-auto" />
              <div>
                <h3 className="font-bold text-white text-base">No fresh source data was retrieved</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  External public sources were scanned, but returned no matching new items for this filter or timeline.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => handleRunResearch('MY_NICHE')}
                  disabled={isResearching}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer transition shadow-sm"
                >
                  {isResearching ? 'Scanning Sources...' : 'Retry Research'}
                </button>
                <button
                  onClick={() => {
                    onSelectTrendAngle(
                      {
                        id: `pillar_${Date.now()}`,
                        title: 'Strategic Content Execution',
                        summary: 'Grounded in active content pillars and user profile receipts.',
                        matchedPillar: voiceProfile?.contentPillars?.[0] || 'Core Strategy',
                        sources: [],
                      } as any,
                      {
                        type: 'Framework',
                        hookConcept: 'Direct synthesis from Content Pillars',
                        angleDescription: 'Pillar-driven content creation',
                        proposedThesis: 'Scaling execution through foundational pillars',
                      }
                    );
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer transition border border-slate-700"
                >
                  Generate From My Content Pillars
                </button>
              </div>
            </div>
          )}

          {/* Trends List */}
          <div className="space-y-4">
            {filteredTrends.map((trend) => (
              <div
                key={trend.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition space-y-4"
              >
                {/* Header row */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Five-tier classification */}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        trend.classification === 'TRENDING'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          : trend.classification === 'EMERGING'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : trend.classification === 'RELEVANT'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          : trend.classification === 'EVERGREEN'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : trend.classification === 'UNRELATED'
                          ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                          : 'bg-slate-700/60 text-slate-300 border border-slate-600/40'
                      }`}>
                        {trend.classification || 'RELEVANT'}
                      </span>

                      {/* Freshness */}
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300">
                        {trend.freshness === 'UNKNOWN' ? 'Date unverified' : `Freshness: ${trend.freshness}`}
                      </span>

                      {/* Automated Relevance Heuristic Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          trend.relevance === 0 || trend.relevanceLevel === 'NONE'
                            ? 'bg-rose-950/40 text-rose-400 border border-rose-800/40'
                            : trend.relevanceLevel === 'HIGH' || trend.relevance >= 70
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                            : trend.relevanceLevel === 'MEDIUM' || trend.relevance >= 35
                            ? 'bg-blue-950 text-blue-300 border border-blue-800/60'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                        title="Automated heuristic derived from keyword and entity overlap between source text and your configured profile (Pillars & ICP). It is not an objective endorsement."
                      >
                        Relevance: {trend.relevance === 0 ? 'None (0%)' : `${trend.relevanceLevel || 'Score'} (${trend.relevance}%)`}
                      </span>

                      {/* Confidence */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                          trend.confidence === 'HIGH'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80'
                            : trend.confidence === 'MODERATE'
                            ? 'bg-blue-950 text-blue-300 border border-blue-800/80'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}
                        title={trend.confidenceReason}
                      >
                        <span>{trend.confidence ? `${trend.confidence} Confidence` : 'Verified Signal'}</span>
                      </span>

                      {/* Matched Content Pillar */}
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                        Pillar: {trend.scores?.pillarRelevanceScore === 0 ? 'No direct match (0%)' : `${trend.matchedPillar} (${trend.scores?.pillarRelevanceScore ?? 0}%)`}
                      </span>
                    </div>

                    <h3 className="font-bold text-white text-base hover:text-blue-300 transition">
                      {trend.title}
                    </h3>

                    {/* Publisher, Date, and Provenance line */}
                    <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2.5 pt-0.5">
                      <span>
                        <strong className="text-slate-300">Publisher:</strong>{' '}
                        {trend.primaryPublisher || trend.sources?.[0]?.sourceName || 'Web Source'}
                        {trend.sources?.[0]?.domain && (
                          <span className="text-slate-500 ml-1 font-mono text-[10px]">
                            ({trend.sources[0].domain})
                          </span>
                        )}
                      </span>
                      <span>•</span>
                      <span>
                        <strong className="text-slate-300">Published:</strong>{' '}
                        {trend.sources?.[0]?.publishedAt
                          ? new Date(trend.sources[0].publishedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'Date unavailable from feed'}
                      </span>
                      <span>•</span>
                      <span>
                        <strong className="text-slate-300">Coverage:</strong>{' '}
                        {trend.uniqueSourceCount || trend.sourceCount || 1}{' '}
                        {(trend.uniqueSourceCount || trend.sourceCount || 1) === 1
                          ? 'outlet (single-source)'
                          : 'independent outlets'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed pt-1">
                      {trend.summary}
                    </p>

                    {/* Transparent Engagement Disclosure */}
                    <div className="text-[10px] text-slate-500 italic pt-0.5">
                      {trend.engagementSignal || 'Engagement metrics unavailable from public RSS/Atom feeds (zero simulated stats).'}
                    </div>
                  </div>

                  {/* Explainable Trend Score */}
                  <div className="shrink-0 p-3 rounded-xl bg-slate-950 border border-slate-800 text-right space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-500">Trend Score</div>
                    <div className="text-xl font-black text-blue-400">{trend.trendScore}<span className="text-xs text-slate-500">/100</span></div>
                    <div className="text-[10px] text-slate-400">
                      Pillar: {trend.scores?.pillarRelevanceScore ?? 0}% • Audience: {trend.scores?.audienceRelevanceScore ?? 0}%
                    </div>
                    <div className="text-[9px] text-slate-500 italic max-w-[130px] leading-tight">
                      Automated text-overlap heuristic
                    </div>
                  </div>
                </div>

                {/* Audience Context */}
                {trend.relevance === 0 ? (
                  <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-xs flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-200">Relevance Notice: </strong>
                      <span className="text-amber-300/80">
                        No direct keyword overlap found with your active content pillars or audience ICP. Ranked at lower priority.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-200">Why this matters to your audience: </strong>
                      <span className="text-slate-400">
                        Your audience includes {trend.targetAudience}. This discussion touches core trade-offs in {trend.matchedPillar}.
                      </span>
                    </div>
                  </div>
                )}

                {/* Discussion Signals */}
                {trend.discussionSignals?.questions?.length > 0 && (
                  <div className="text-xs text-slate-400 space-y-1">
                    <span className="font-semibold text-slate-300">Public questions being debated: </span>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                      {trend.discussionSignals.questions.slice(0, 2).map((q: string, i: number) => (
                        <li key={i} className="italic text-slate-300">"{q}"</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Source References & Action */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => setActiveSourceTrend(trend)}
                    className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View {trend.sources.length} Grounded Sources & Citations</span>
                  </button>

                  <div className="text-xs text-slate-500">
                    Choose an original perspective to generate a draft:
                  </div>
                </div>

                {/* Original Angle Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {(trend.angles || []).slice(0, 4).map((angle: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-blue-500/60 transition space-y-2 flex flex-col justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
                            {angle.type} Angle
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-200">
                          "{angle.hookConcept}"
                        </p>
                        <p className="text-[11px] text-slate-400 leading-snug">
                          {angle.angleDescription}
                        </p>
                      </div>

                      <button
                        onClick={() => onSelectTrendAngle(trend, angle)}
                        className="mt-2 w-full py-1.5 px-3 rounded-lg bg-blue-600/90 hover:bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                        <span>Generate Idea From This Angle</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SUB-TAB 2: QUESTIONS PEOPLE ARE ASKING                           */}
      {/* ================================================================ */}
      {activeSubTab === 'questions' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <h3 className="text-sm font-bold text-white">Emerging Public Questions & Pain Points</h3>
            <p className="text-xs text-slate-400 mt-1">
              Extracted directly from technical communities, public forums, and comment discussions without scraping private groups.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trends.flatMap((t) => (t.discussionSignals?.questions || []).map((q: string) => ({ question: q, trend: t }))).slice(0, 8).map((item, idx) => {
              const primarySource = item.trend.sources?.[0];
              return (
                <div key={idx} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-purple-400 uppercase">Debated Question</span>
                      {primarySource?.sourceName && (
                        <span className="text-[10px] font-medium bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                          {primarySource.sourceName}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-white">"{item.question}"</h4>
                    <p className="text-xs text-slate-400">Context: {item.trend.title}</p>

                    {primarySource && (
                      <div className="pt-2 border-t border-slate-800/60 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Contributing Source:</span>
                          {primarySource.url && (
                            <a
                              href={primarySource.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline flex items-center gap-1 max-w-[180px] truncate"
                            >
                              <span className="truncate">{primarySource.title || primarySource.sourceName}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          )}
                        </div>
                        {primarySource.snippet && (
                          <p className="text-[10px] text-slate-400 italic line-clamp-2 bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
                            "{primarySource.snippet}"
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => onSelectTrendAngle(item.trend, item.trend.angles?.[0] || { type: 'Educational', proposedThesis: item.question, hookConcept: item.question })}
                    className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition mt-2"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Draft Answer Post</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SUB-TAB 3: RESEARCH A PUBLIC URL                                 */}
      {/* ================================================================ */}
      {activeSubTab === 'url_research' && (
        <div className="space-y-5">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div>
              <h3 className="text-base font-bold text-white">Public URL Research</h3>
              <p className="text-xs text-slate-400 mt-1">
                Paste any public tech announcement, article, or engineering blog post. 
                Our crawler extracts key findings and formulates original perspectives without rewriting or copying.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                placeholder="https://example.com/blog/announcement"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleResearchUrl}
                disabled={isResearchingUrl || !inputUrl.trim()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Search className={`w-3.5 h-3.5 ${isResearchingUrl ? 'animate-spin' : ''}`} />
                <span>{isResearchingUrl ? 'Crawling & Extracting...' : 'Analyze URL'}</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>SSRF protected • Respects robots.txt • Strips nav/ads/trackers</span>
            </div>
          </div>

          {/* URL Result */}
          {urlResearchResult?.trends?.length > 0 && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="space-y-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                  Extracted Public Article
                </span>
                <h4 className="text-base font-bold text-white mt-1">
                  {urlResearchResult.trends[0].title}
                </h4>
                <p className="text-xs text-slate-300">
                  {urlResearchResult.trends[0].summary}
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-300">
                  Select an original perspective to generate your post:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {urlResearchResult.trends[0].angles.map((angle: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 flex flex-col justify-between"
                    >
                      <div>
                        <span className="text-[10px] font-bold text-blue-400 uppercase">
                          {angle.type} Perspective
                        </span>
                        <p className="text-xs font-semibold text-white mt-1">
                          "{angle.hookConcept}"
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {angle.angleDescription}
                        </p>
                      </div>

                      <button
                        onClick={() => onSelectTrendAngle(urlResearchResult.trends[0], angle)}
                        className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Create Post Idea</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* SUB-TAB 4: SOURCE REGISTRY & HEALTH                              */}
      {/* ================================================================ */}
      {activeSubTab === 'sources' && (
        <div className="space-y-5">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Configured Public Sources</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Verified public RSS feeds, sitemaps, and company engineering blogs available for discovery.
                </p>
              </div>
            </div>

            {/* Add Source Input */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-slate-300">Add Public RSS or Web Feed:</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Source Name (e.g. My Tech Blog)"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none"
                />
                <input
                  type="url"
                  placeholder="https://example.com/feed.xml"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none sm:col-span-2"
                />
              </div>
              <button
                onClick={handleAddSource}
                disabled={!newSourceUrl.trim()}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                Save Source to Registry
              </button>
            </div>

            {/* Sources List */}
            <div className="space-y-2">
              {sources.map((src) => (
                <div
                  key={src.sourceId}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-white flex items-center gap-2">
                      <span>{src.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-mono">
                        {src.domain}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300">
                        {src.quality} QUALITY
                      </span>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      Type: {src.sourceType} • Interval: {src.crawlIntervalHours}h • Reliability: {src.reliability}%
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
                    Permitted
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SOURCES MODAL / DRAWER                                           */}
      {/* ================================================================ */}
      {activeSourceTrend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-xl p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold text-blue-400 uppercase">Research Provenance</span>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  Supporting Sources for: "{activeSourceTrend.title}"
                </h3>
              </div>
              <button
                onClick={() => setActiveSourceTrend(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              The following independent public articles and feeds informed this trend cluster:
            </p>

            <div className="space-y-2.5">
              {activeSourceTrend.sources.map((src: any, idx: number) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-300">{src.sourceName}</span>
                    <span className="text-[10px] text-slate-500">
                      {src.publishedAt ? new Date(src.publishedAt).toLocaleDateString() : 'Recent'}
                    </span>
                  </div>
                  <div className="text-slate-200 font-medium">{src.title}</div>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{src.snippet}</p>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1 inline-flex"
                  >
                    <span>Open Public Source</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setActiveSourceTrend(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
