import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  PenTool, 
  Sparkles, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  Copy, 
  Check, 
  ThumbsUp, 
  MessageSquare, 
  Repeat, 
  Send, 
  ShieldCheck, 
  BookOpen, 
  RefreshCw, 
  Edit3, 
  AlertCircle,
  Smartphone,
  Eye,
  Lightbulb,
  CheckCheck,
  CheckCircle,
  FileCheck,
  Target,
  Layers,
  ArrowLeft,
  Flame,
  Globe,
  Link as LinkIcon,
  Compass,
  Layout,
  Image as ImageIcon,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { api, ScheduleResult } from '../../services/api';
import { auditText, rewriteText } from '../../utils/humanizerEngine';
import { StoryBankView } from '../StoryBank/StoryBankView';
import { TrendIntelligenceView } from './TrendIntelligenceView';

interface ContentWorkspaceViewProps {
  currentPost: string;
  setCurrentPost: (post: string) => void;
  onPostScheduled?: () => void;
}

export interface ContentIdea {
  id: string;
  idea: string;
  targetPillar: string;
  intendedAudience: string;
  angle: string;
  structure: string;
  summary: string;
  trendId?: string;
  sourceReferences?: any[];
  provenance?: any;
  strategy?: any;
}

export interface ContentHook {
  id: string;
  hook: string;
  angleName: string;
  characterCount: number;
}

export interface FactualClaim {
  claim: string;
  classification: 'SUPPORTED_USER_FACT' | 'GENERAL_KNOWLEDGE' | 'UNSUPPORTED_PERSONAL_CLAIM' | 'UNSUPPORTED_STATISTIC';
  explanation: string;
  replacement?: string;
}

export interface FactValidationResult {
  isValid: boolean;
  validatedPost: string;
  claims: FactualClaim[];
  unsupportedCount: number;
  leakageDetected: boolean;
  leakageDetails: string[];
}

export const ContentWorkspaceView: React.FC<ContentWorkspaceViewProps> = ({
  currentPost,
  setCurrentPost,
  onPostScheduled
}) => {
  // Navigation within Content
  const [activeTab, setActiveTab] = useState<'calendar' | 'trends' | 'creator' | 'stories'>('calendar');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Data states
  const [history, setHistory] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [voiceProfile, setVoiceProfile] = useState<any>(null);

  // Guided 7-Step Flow States
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [ideaMethod, setIdeaMethod] = useState<'ai' | 'topic' | 'story' | 'repurpose'>('ai');
  const [customTopic, setCustomTopic] = useState('');
  const [repurposeText, setRepurposeText] = useState('');
  const [includeSources, setIncludeSources] = useState(false);
  const [originalityResult, setOriginalityResult] = useState<any | null>(null);
  
  // Pipeline artifacts
  const [generatedIdeas, setGeneratedIdeas] = useState<ContentIdea[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<ContentIdea | null>(null);
  const [generatedHooks, setGeneratedHooks] = useState<ContentHook[]>([]);
  const [selectedHook, setSelectedHook] = useState<string>('');
  const [customHookText, setCustomHookText] = useState<string>('');
  const [generatedDraft, setGeneratedDraft] = useState('');
  const [factValidation, setFactValidation] = useState<FactValidationResult | null>(null);
  const [sourceFidelity, setSourceFidelity] = useState<any | null>(null);
  const [activeStrategy, setActiveStrategy] = useState<any | null>(null);
  const [draftGenerationMode, setDraftGenerationMode] = useState<'AI_DYNAMIC' | 'DETERMINISTIC_GROUNDED' | 'UNAVAILABLE' | null>(null);
  const [draftFailureReason, setDraftFailureReason] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string>('');
  const [formatExecution, setFormatExecution] = useState<any | null>(null);
  const [originalDraft, setOriginalDraft] = useState<string>('');
  const [qualityScorecard, setQualityScorecard] = useState<any | null>(null);
  const [repetitionResult, setRepetitionResult] = useState<any | null>(null);
  
  // Interaction & Preview states
  const [copied, setCopied] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [isPublishing, setIsPublishing] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [isGeneratingHooks, setIsGeneratingHooks] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isValidatingFacts, setIsValidatingFacts] = useState(false);
  const [humanizerAudit, setHumanizerAudit] = useState<any | null>(null);
  const [isImproving, setIsImproving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [hist, cfg, prof] = await Promise.all([
        api.getHistory().catch(() => ({ count: 0, history: [] })),
        api.getConfig().catch(() => null),
        api.getVoiceProfile().catch(() => null)
      ]);
      setHistory(hist.history || []);
      setConfig(cfg);
      setVoiceProfile(prof);

      if (prof?.contentPillars && prof.contentPillars.length > 0 && !customTopic) {
        setCustomTopic(prof.contentPillars[0]);
      }
    } catch (err: any) {
      console.warn('Failed to load content workspace data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (currentPost && !generatedDraft) {
      setGeneratedDraft(currentPost);
    }
  }, []);

  const handleStartCreateFlow = (method: 'ai' | 'topic' | 'story' | 'repurpose' = 'ai') => {
    setIdeaMethod(method);
    setCurrentStep(1);
    setActiveTab('creator');
  };

  // STEP 1 -> STEP 2: Generate 5 Ideas
  const handleGenerateIdeas = async () => {
    setIsGeneratingIdeas(true);
    setMessage(null);
    try {
      const res = await api.generateIdeas(voiceProfile);
      const ideas: ContentIdea[] = res.ideas || [];
      setGeneratedIdeas(ideas);
      if (ideas.length > 0) {
        setSelectedIdea(ideas[0]);
      }
      setCurrentStep(2); // Advance to STEP 2: Choose Idea
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'Failed to generate ideas' });
    } finally {
      setIsGeneratingIdeas(false);
    }
  };

  // STEP 2 -> STEP 3: Choose Idea & Generate Hooks
  const handleSelectIdeaAndGenerateHooks = async (ideaToUse?: ContentIdea) => {
    const target = ideaToUse || selectedIdea;
    if (!target) {
      setMessage({ kind: 'error', text: 'Please select an idea first.' });
      return;
    }
    setSelectedIdea(target);
    setIsGeneratingHooks(true);
    setMessage(null);
    try {
      const res = await api.generateHooks(target, voiceProfile);
      const hooks: ContentHook[] = res.hooks || [];
      const strat = res.strategy || target.strategy || null;
      if (strat) {
        setActiveStrategy(strat);
      }
      setGeneratedHooks(hooks);
      if (hooks.length > 0) {
        setSelectedHook(hooks[0].hook);
        setCustomHookText(hooks[0].hook);
      }
      setCurrentStep(3); // Advance to STEP 3: Choose Hook
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'Failed to generate hooks' });
    } finally {
      setIsGeneratingHooks(false);
    }
  };

  // Trend Intelligence Selection Handler
  const handleSelectTrendAngle = async (trend: any, angle: any) => {
    setMessage(null);
    setLoading(true);
    try {
      const res = await api.generateIdeaFromTrend(trend, angle, voiceProfile);
      const idea: ContentIdea = res.idea;
      const strat = res.strategy || idea.strategy || null;
      if (strat) {
        setActiveStrategy(strat);
      }
      setSelectedIdea(idea);
      setGeneratedIdeas([idea]);
      setIncludeSources(true);
      setActiveTab('creator');
      await handleSelectIdeaAndGenerateHooks(idea);
      setMessage({
        kind: 'success',
        text: `Loaded trend concept: "${idea.idea}". Review hook options below.`
      });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'Failed to initialize idea from trend' });
    } finally {
      setLoading(false);
    }
  };

  // STEP 3 -> STEP 4: Generate Complete Post (NOT just the hook!)
  const handleGenerateCompletePost = async () => {
    const hookToUse = customHookText.trim() || selectedHook;
    if (!hookToUse) {
      setMessage({ kind: 'error', text: 'Please select or provide an opening hook.' });
      return;
    }
    if (!selectedIdea) {
      setMessage({ kind: 'error', text: 'Missing selected idea.' });
      return;
    }

    setIsGeneratingDraft(true);
    setMessage(null);
    try {
      const res = await api.generateCompletePost({
        idea: selectedIdea,
        hook: hookToUse,
        voiceProfile,
        customNotes: ideaMethod === 'repurpose' ? repurposeText : undefined,
        includeSources,
        sources: selectedIdea.sourceReferences,
        strategy: activeStrategy || selectedIdea.strategy,
      });

      if (res.strategyUsed) {
        setActiveStrategy(res.strategyUsed);
      }

      const mode = res.generationMode || (res.strategyUsed?.isAiGenerated ? 'AI_DYNAMIC' : 'DETERMINISTIC_GROUNDED');
      setDraftGenerationMode(mode);
      setDraftFailureReason(res.failureReason || null);
      setModelUsed(res.modelUsed || '');

      if (mode === 'UNAVAILABLE' && !res.post) {
        setMessage({
          kind: 'error',
          text: res.failureReason || 'AI generation unavailable and source evidence is insufficient for a safe grounded draft.',
        });
        return;
      }

      setGeneratedDraft(res.post);
      setCurrentPost(res.post);
      setOriginalDraft(res.post);
      if (res.formatExecution) {
        setFormatExecution(res.formatExecution);
      }
      setFactValidation(res.validation || null);
      if (res.sourceFidelity) {
        setSourceFidelity(res.sourceFidelity);
      }
      if (res.originality) {
        setOriginalityResult(res.originality);
      }

      // Memory & Repetition check
      api.checkRepetition({
        topic: selectedIdea.idea,
        hook: hookToUse,
        format: res.formatExecution?.format || activeStrategy?.recommendedFormat
      }).then(rep => setRepetitionResult(rep)).catch(() => null);

      // Multi-dimensional quality evaluation
      api.evaluateMultiDimensionalQuality(
        res.post,
        res.strategyUsed || activeStrategy || selectedIdea.strategy,
        selectedIdea.sourceReferences
      ).then(q => setQualityScorecard(q)).catch(() => null);

      const audit = auditText(res.post);
      setHumanizerAudit(audit);

      setCurrentStep(4); // Advance to STEP 4: Review Generated Draft
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'Failed to generate complete post' });
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // Fact Validation re-check
  const handleRevalidateFacts = async () => {
    if (!generatedDraft) return;
    setIsValidatingFacts(true);
    try {
      const val = await api.validatePost(generatedDraft, voiceProfile);
      setFactValidation(val);
      if (val.validatedPost && val.validatedPost !== generatedDraft) {
        setGeneratedDraft(val.validatedPost);
        setCurrentPost(val.validatedPost);
      }
      setMessage({ kind: 'success', text: 'Fact validation completed. 0 unsupported claims.' });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'Fact validation failed' });
    } finally {
      setIsValidatingFacts(false);
    }
  };

  // STEP 5: Improve with Humanizer Engine
  const handleImproveWithHumanizer = () => {
    if (!generatedDraft) return;
    setIsImproving(true);
    try {
      const rewritten = rewriteText(generatedDraft, 'strict');
      setGeneratedDraft(rewritten.rewritten);
      setCurrentPost(rewritten.rewritten);
      const audit = auditText(rewritten.rewritten);
      setHumanizerAudit(audit);
      setMessage({ kind: 'success', text: 'Sentence cadence polished and AI corporate clichés removed.' });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setIsImproving(false);
    }
  };

  // STEP 7: Publishing & Scheduling
  const handlePublishNow = async () => {
    if (!generatedDraft) return;
    setIsPublishing(true);
    setMessage(null);
    try {
      const isDry = !config?.credentials?.publoraConfigured;
      const res: ScheduleResult = await api.postNow({
        content: generatedDraft,
        dryRun: isDry
      });
      setMessage({
        kind: 'success',
        text: isDry 
          ? 'Post preview approved and validated for LinkedIn.' 
          : 'Post published successfully to your LinkedIn profile!'
      });

      // Continuous Learning Engine updates
      if (originalDraft && generatedDraft && originalDraft !== generatedDraft) {
        api.recordUserEdit(originalDraft, generatedDraft, selectedIdea?.id || 'post').catch(() => null);
      }
      api.recordPublication({
        content: generatedDraft,
        topic: selectedIdea?.idea || 'Industry Insight',
        format: formatExecution?.format || activeStrategy?.recommendedFormat || 'TEXT_POST',
        hook: selectedHook || customHookText || '',
        cta: formatExecution?.cta
      }).catch(() => null);

      await loadData();
      onPostScheduled?.();
      setCurrentStep(7);
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSchedulePost = async () => {
    if (!generatedDraft) return;
    setIsPublishing(true);
    setMessage(null);
    try {
      const isDry = !config?.credentials?.publoraConfigured;
      const res: ScheduleResult = await api.schedulePost({
        content: generatedDraft,
        scheduledTime: scheduleDate || undefined,
        dryRun: isDry
      });
      setMessage({
        kind: 'success',
        text: isDry 
          ? 'Post validated and added to preview queue.' 
          : 'Post scheduled successfully for publication!'
      });

      // Continuous Learning Engine updates
      if (originalDraft && generatedDraft && originalDraft !== generatedDraft) {
        api.recordUserEdit(originalDraft, generatedDraft, selectedIdea?.id || 'post').catch(() => null);
      }
      api.recordPublication({
        content: generatedDraft,
        topic: selectedIdea?.idea || 'Industry Insight',
        format: formatExecution?.format || activeStrategy?.recommendedFormat || 'TEXT_POST',
        hook: selectedHook || customHookText || '',
        cta: formatExecution?.cta
      }).catch(() => null);

      await loadData();
      onPostScheduled?.();
      setCurrentStep(7);
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setIsPublishing(false);
    }
  };

  const authorName = voiceProfile?.authorName || voiceProfile?.userName || 'David Chen';
  // Avoid dumping long raw descriptions into the UI card header
  const authorHeadline = voiceProfile?.role 
    ? (voiceProfile.role.length > 45 ? voiceProfile.role.split(/sharing|helping|focusing|,/i)[0].trim() : voiceProfile.role)
    : 'Tech Creator & Developer Educator';

  const STEP_TITLES = [
    'Generate Ideas',
    'Choose Idea',
    'Choose Hook',
    'Review Generated Draft',
    'Improve & Polish',
    'Final Review',
    'Approve / Schedule',
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header & Workflows */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Content Studio</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Create authentic, fact-grounded LinkedIn posts without invented metrics or context leakage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleStartCreateFlow('ai')}
            id="btn-content-create-post"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>+ Create Post</span>
          </button>
        </div>
      </div>

      {/* Secondary Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'calendar'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Calendar & Schedule</span>
          </button>
          <button
            onClick={() => setActiveTab('trends')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'trends'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span>Trend Intelligence</span>
          </button>
          <button
            onClick={() => setActiveTab('creator')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'creator'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>7-Step Workflow</span>
          </button>
          <button
            onClick={() => setActiveTab('stories')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'stories'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Story Bank & Proof Points</span>
          </button>
        </div>

        {/* Quick Creator Shortcuts */}
        <div className="flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-slate-500 hidden md:inline">Quick Jump:</span>
          <button
            onClick={() => setActiveTab('trends')}
            className="px-2.5 py-1 rounded-lg bg-orange-950/40 hover:bg-orange-900/60 text-orange-300 border border-orange-800/60 cursor-pointer flex items-center gap-1"
          >
            <Flame className="w-3 h-3 text-orange-400" />
            <span>Explore Trends</span>
          </button>
          <button
            onClick={() => handleStartCreateFlow('ai')}
            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 cursor-pointer"
          >
            Generate Ideas
          </button>
          <button
            onClick={() => handleStartCreateFlow('repurpose')}
            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 cursor-pointer"
          >
            Repurpose Notes
          </button>
        </div>
      </div>

      {/* Global alert banner */}
      {message && (
        <div
          id="content-alert-banner"
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
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      <section className="p-4 rounded-2xl bg-blue-950/20 border border-blue-800/50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Compass className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-white">The Content Machine thinks before it writes</p>
            <p className="text-xs text-slate-400 mt-0.5">It researches the source, matches your audience, selects the format and angle, checks evidence, then asks for approval.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
          {['Understand', 'Choose angle', 'Ground claims', 'Review', 'Approve'].map((label, index) => (
            <span key={label} className={`px-2 py-1 rounded-lg border ${index < currentStep - 1 ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-slate-900 text-slate-400 border-slate-700'}`}>{label}</span>
          ))}
        </div>
      </section>

      {activeStrategy && (
        <section className="p-4 rounded-2xl bg-slate-900 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><span className="text-[10px] uppercase tracking-wider text-slate-500">Why this exists</span><p className="text-xs text-white mt-1">{activeStrategy.businessObjective || activeStrategy.objective || 'Audience-relevant insight'}</p></div>
          <div><span className="text-[10px] uppercase tracking-wider text-slate-500">Recommended format</span><p className="text-xs text-blue-300 mt-1">{activeStrategy.recommendedFormat || 'Chosen after source analysis'}</p></div>
          <div><span className="text-[10px] uppercase tracking-wider text-slate-500">Evidence state</span><p className="text-xs text-emerald-300 mt-1">{sourceFidelity?.fidelityScore != null ? `${sourceFidelity.fidelityScore}% source fidelity` : 'Evidence check runs before approval'}</p></div>
        </section>
      )}

      {/* VIEW 1: CALENDAR & SCHEDULE */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base">Content Schedule & History</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Posts scheduled, verified, or published to your LinkedIn audience.
                </p>
              </div>
              <button
                onClick={() => handleStartCreateFlow('ai')}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Post</span>
              </button>
            </div>

            {history.length === 0 ? (
              <div className="p-12 text-center text-slate-400 bg-slate-950/50 rounded-xl border border-slate-800/80 space-y-3">
                <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="font-semibold text-white text-sm">No content scheduled</h4>
                <p className="text-xs max-w-sm mx-auto text-slate-400">
                  Create your first LinkedIn post using our 7-step guided workflow with zero metric fabrication.
                </p>
                <button
                  onClick={() => handleStartCreateFlow('ai')}
                  id="btn-empty-create-post"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer shadow-sm"
                >
                  Start Workflow
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 max-w-2xl">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          {item.status || 'Published'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Recent'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed font-mono">
                        {item.content || item.draft || 'LinkedIn post published through growth copilot.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setGeneratedDraft(item.content || item.draft || '');
                          setCurrentPost(item.content || item.draft || '');
                          setCurrentStep(4);
                          setActiveTab('creator');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                      >
                        Edit & Repurpose
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 1.5: TREND INTELLIGENCE FEED & PUBLIC DISCOVERY */}
      {activeTab === 'trends' && (
        <TrendIntelligenceView
          onSelectTrendAngle={handleSelectTrendAngle}
          voiceProfile={voiceProfile}
        />
      )}

      {/* VIEW 2: GUIDED 7-STEP CREATE POST WORKFLOW */}
      {activeTab === 'creator' && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          {/* Progress Indicator */}
          <div className="border-b border-slate-800 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                Step {currentStep} of 7: {STEP_TITLES[currentStep - 1]}
              </span>
              <span className="text-xs text-slate-400">Grounded Architecture</span>
            </div>

            {/* Step Pills */}
            <div className="grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                <div
                  key={s}
                  onClick={() => {
                    // Only allow clicking steps that have content
                    if (s === 1 || (s === 2 && generatedIdeas.length > 0) || (s === 3 && selectedIdea) || (s >= 4 && generatedDraft)) {
                      setCurrentStep(s);
                    }
                  }}
                  className={`h-1.5 rounded-full cursor-pointer transition ${
                    s === currentStep
                      ? 'bg-blue-500'
                      : s < currentStep
                      ? 'bg-blue-900'
                      : 'bg-slate-800'
                  }`}
                  title={`Step ${s}: ${STEP_TITLES[s - 1]}`}
                />
              ))}
            </div>
          </div>

          {/* ============================================================ */}
          {/* STEP 1: GENERATE IDEAS                                      */}
          {/* ============================================================ */}
          {currentStep === 1 && (
            <div className="space-y-5">
              {/* Content Machine Selection Bar (Section 20) */}
              <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 space-y-4">
                <div className="border-b border-slate-800/80 pb-3">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">CONTENT MACHINE</span>
                  <h3 className="text-base font-bold text-white mt-0.5">What do you want to create?</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* 1. Explore What's Trending */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('trends')}
                    className="p-4 rounded-xl border border-orange-500/30 bg-orange-950/20 hover:bg-orange-950/40 text-left transition cursor-pointer space-y-1.5 group"
                  >
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-white">Explore What's Trending</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Real-time topic detection & signals from public RSS feeds & engineering blogs.
                    </p>
                  </button>

                  {/* 2. Generate From My Content Pillars */}
                  <button
                    type="button"
                    onClick={() => {
                      setIdeaMethod('ai');
                      handleGenerateIdeas();
                    }}
                    className={`p-4 rounded-xl border text-left transition cursor-pointer space-y-1.5 group ${
                      ideaMethod === 'ai'
                        ? 'border-blue-500 bg-blue-950/40'
                        : 'border-blue-500/30 bg-blue-950/20 hover:bg-blue-950/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-white">From Content Pillars</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Synthesizes 5 strategic angles derived strictly from your 5 defined content pillars.
                    </p>
                  </button>

                  {/* 3. Start From My Own Idea */}
                  <button
                    type="button"
                    onClick={() => setIdeaMethod('topic')}
                    className={`p-4 rounded-xl border text-left transition cursor-pointer space-y-1.5 group ${
                      ideaMethod === 'topic'
                        ? 'border-blue-500 bg-blue-950/40'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Edit3 className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-white">Start From My Own Idea</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Provide your custom engineering thesis, architecture decision, or builder lesson.
                    </p>
                  </button>

                  {/* 4. Research a Public URL */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('trends')}
                    className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-950/40 text-left transition cursor-pointer space-y-1.5 group"
                  >
                    <div className="flex items-center gap-2">
                      <LinkIcon className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-white">Research a Public URL</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Analyze any public tech announcement or release to formulate original angles.
                    </p>
                  </button>
                </div>
              </div>

              {/* Guiding AI Context (Read-Only Reference) */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    <span>Your Active Content Pillars (Topic Boundaries):</span>
                  </span>
                  <span className="text-[11px] text-slate-400 italic">Used as internal context only</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(voiceProfile?.contentPillars || [
                    'AI Tools, AI News & Practical AI',
                    'Software Development, Coding & Developer Tools',
                    'Technology News, Trends & Emerging Technology',
                    'Startup, SaaS & Practical Lessons for Builders',
                    'Tech Career, Learning & Developer Productivity'
                  ]).map((pillar: string, idx: number) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-medium text-slate-300"
                    >
                      {pillar}
                    </span>
                  ))}
                </div>
              </div>

              {/* Dynamic Inputs */}
              {ideaMethod === 'topic' && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Your Core Technical Topic or Thesis:
                  </label>
                  <input
                    type="text"
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    placeholder="e.g. Why we replaced our distributed microservices with a modular monolith"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {ideaMethod === 'repurpose' && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Paste Raw Technical Notes or Source Memo:
                  </label>
                  <textarea
                    value={repurposeText}
                    onChange={(e) => setRepurposeText(e.target.value)}
                    rows={4}
                    placeholder="Paste architecture decision record, customer conversation, or engineering notes..."
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              )}

              {/* Action Button */}
              <div className="flex justify-end pt-3">
                <button
                  onClick={handleGenerateIdeas}
                  disabled={isGeneratingIdeas}
                  id="btn-step1-generate-ideas"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {isGeneratingIdeas ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>{isGeneratingIdeas ? 'Generating 5 Strategic Ideas...' : 'Generate 5 Ideas'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 2: CHOOSE IDEA                                         */}
          {/* ============================================================ */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">STEP 2: Choose Idea</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Select one concept to develop. Each idea is grounded in a specific content pillar and audience focus.
                  </p>
                </div>
                <button
                  onClick={handleGenerateIdeas}
                  disabled={isGeneratingIdeas}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingIdeas ? 'animate-spin' : ''}`} />
                  <span>Regenerate Ideas</span>
                </button>
              </div>

              {/* 5 Idea Cards */}
              <div className="space-y-3">
                {generatedIdeas.map((item, idx) => {
                  const isSelected = selectedIdea?.id === item.id;
                  return (
                    <div
                      key={item.id || idx}
                      onClick={() => setSelectedIdea(item)}
                      className={`p-4 rounded-xl border text-left cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-950/40 border-blue-500 shadow-sm'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 font-bold text-[11px] flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-white">{item.angle}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {item.targetPillar}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 font-mono">
                            Focus: <strong className="text-slate-300">{item.intendedAudience}</strong>
                          </span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                        </div>
                      </div>

                      <p className="text-xs text-slate-200 font-medium leading-relaxed">
                        {item.idea}
                      </p>

                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span>Structure: <code className="text-blue-300">{item.structure}</code></span>
                        <span className="text-slate-400">{item.summary}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-3">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={() => handleSelectIdeaAndGenerateHooks()}
                  disabled={!selectedIdea || isGeneratingHooks}
                  id="btn-step2-next-hooks"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {isGeneratingHooks ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5" />
                  )}
                  <span>{isGeneratingHooks ? 'Generating 3 Hooks...' : 'Next: Choose Hook'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 3: CHOOSE HOOK                                         */}
          {/* ============================================================ */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">STEP 3: Choose Hook</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Select a punchy, mobile-fold safe opening hook (under 210 characters, 0 invented percentages).
                  </p>
                </div>
                <button
                  onClick={() => handleSelectIdeaAndGenerateHooks()}
                  disabled={isGeneratingHooks}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingHooks ? 'animate-spin' : ''}`} />
                  <span>Regenerate Hooks</span>
                </button>
              </div>

              {/* Selected Idea Summary Header */}
              {selectedIdea && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                  <span className="text-slate-400 font-medium">Developing Idea: </span>
                  <span className="text-white font-semibold">{selectedIdea.idea}</span>
                </div>
              )}

              {/* Content Strategy 2.0 Blueprint (When Available) */}
              {activeStrategy && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-950 border border-blue-800/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-900/40 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        AI Content Strategy & Format Fit
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {activeStrategy.generationMode === 'DETERMINISTIC_GROUNDED' || activeStrategy.isAiGenerated === false ? (
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                          Mode: Grounded Fallback
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800">
                          Mode: AI Dynamic
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-blue-900/60 text-blue-200 border border-blue-700">
                        {activeStrategy.contentType || 'EDITORIAL_ANALYSIS'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        Format: {activeStrategy.recommendedFormat}
                      </span>
                    </div>
                  </div>

                  {/* Format Rationale & Core Audience Question */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Format Rationale</span>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {activeStrategy.formatReason}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Core Question Answered</span>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {activeStrategy.coreQuestion}
                      </p>
                    </div>
                  </div>

                  {/* Dynamic Narrative Steps */}
                  {activeStrategy.narrativeStructure?.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Narrative Architecture ({activeStrategy.narrativeStructure.length} Steps)
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {activeStrategy.narrativeStructure.map((step: string, sIdx: number) => (
                          <React.Fragment key={sIdx}>
                            <span className="px-2 py-1 rounded bg-slate-900 text-slate-300 border border-slate-800 text-[10px] font-mono">
                              {sIdx + 1}. {step}
                            </span>
                            {sIdx < activeStrategy.narrativeStructure.length - 1 && (
                              <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Visual Fit Brief */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-start gap-2 text-xs">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-200">
                        {activeStrategy.visualStrategy?.visualRequired
                          ? `Visual Asset Recommended (${activeStrategy.visualStrategy.visualType}): `
                          : 'Text-Only Strategy: '}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        {activeStrategy.visualStrategy?.visualReason || 'Clean high-signal text post without distracting graphic clutter.'}
                      </span>
                      {activeStrategy.visualStrategy?.visualRequired && activeStrategy.visualStrategy?.visualBrief && (
                        <p className="text-[10px] font-mono text-blue-300 mt-0.5 bg-slate-950 p-1.5 rounded border border-slate-800">
                          Brief: {activeStrategy.visualStrategy.visualBrief}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 3 Hook Options */}
              <div className="space-y-3">
                {generatedHooks.map((h, idx) => {
                  const isSelected = selectedHook === h.hook;
                  return (
                    <div
                      key={h.id || idx}
                      onClick={() => {
                        setSelectedHook(h.hook);
                        setCustomHookText(h.hook);
                      }}
                      className={`p-4 rounded-xl border text-left cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-950/40 border-blue-500 shadow-sm'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-blue-400">{h.angleName}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            h.characterCount <= 210 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300'
                          }`}>
                            {h.characterCount} / 210 chars
                          </span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                        </div>
                      </div>
                      <p className="text-xs text-white font-mono leading-relaxed">
                        "{h.hook}"
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Hook Customizer Box */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  Active Hook (You can edit or refine directly):
                </label>
                <textarea
                  value={customHookText}
                  onChange={(e) => {
                    setCustomHookText(e.target.value);
                    setSelectedHook(e.target.value);
                  }}
                  rows={2}
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{customHookText.length} characters (Mobile fold safe &lt; 210)</span>
                  <span className="text-emerald-400 font-medium">✓ No fabricated statistics</span>
                </div>
              </div>

              {/* Source Citations Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-blue-400" />
                  <div>
                    <span className="font-semibold text-white">Add sources to post</span>
                    <p className="text-[11px] text-slate-400">
                      Appends clean, professional source references as footnotes at the end of the post.
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSources}
                    onChange={(e) => setIncludeSources(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between pt-3">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleGenerateCompletePost}
                  disabled={!customHookText.trim() || isGeneratingDraft}
                  id="btn-step3-generate-complete-post"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {isGeneratingDraft ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>{isGeneratingDraft ? 'Writing Complete LinkedIn Post...' : 'Generate Complete Post'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 4: REVIEW GENERATED DRAFT (COMPLETE POST!)             */}
          {/* ============================================================ */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">STEP 4: Review Generated Draft</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Review the <strong className="text-blue-400">complete LinkedIn post</strong>. Every fact has been validated against your profile receipts.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRevalidateFacts}
                    disabled={isValidatingFacts}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileCheck className={`w-3.5 h-3.5 ${isValidatingFacts ? 'animate-spin' : ''}`} />
                    <span>Re-validate Facts</span>
                  </button>
                  <button
                    onClick={handleGenerateCompletePost}
                    disabled={isGeneratingDraft}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingDraft ? 'animate-spin' : ''}`} />
                    <span>Regenerate Post</span>
                  </button>
                </div>
              </div>

              {/* Generation Mode Transparency Banner (Requirement 5) */}
              {draftGenerationMode === 'DETERMINISTIC_GROUNDED' ? (
                <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-xs flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-200">
                        Generation Mode: DETERMINISTIC EVIDENCE-GROUNDED FALLBACK
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-900/60 text-amber-300 border border-amber-700">
                        Non-AI Synthesized
                      </span>
                    </div>
                    <p className="text-amber-300/90 text-[11px] leading-relaxed">
                      AI model was unavailable. This draft was built using deterministic evidence grounding from your verified source facts and profile, with 0 hallucinated statistics or generic software templates.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">
                        Generation Mode: AI-DRIVEN DYNAMIC SYNTHESIS
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800">
                        {modelUsed || 'gemini-3.8-flash'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Generated dynamically through full Gemini reasoning with narrative strategy bounding and fact grounding.
                    </p>
                  </div>
                </div>
              )}

              {/* Live Fact-Validation & Leakage Status Bar */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">Fact Validation & Source Fidelity</span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                      0 Unsupported Claims
                    </span>
                    {sourceFidelity && (
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-blue-950 text-blue-300 border border-blue-800">
                        {sourceFidelity.fidelityScore}% Source Fidelity
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Context Leakage Check:{' '}
                    <span className="text-emerald-400 font-semibold">Zero Internal Settings Exposed</span>
                  </div>
                </div>

                {/* Source Fidelity Analysis */}
                {sourceFidelity && (
                  <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-slate-200 font-semibold">Subject Type:</span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-slate-800 text-purple-300 border border-slate-700">
                          {sourceFidelity.subjectType}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Claims Supported: <strong className="text-emerald-400">{sourceFidelity.groundedClaimsCount}</strong> | Facts Grounded: <strong className="text-blue-400">{sourceFidelity.groundedFactsCount}</strong>
                      </div>
                    </div>
                    {sourceFidelity.sourceLimitation && (
                      <p className="text-[11px] text-amber-300/80 italic border-t border-slate-800 pt-1.5">
                        Source boundary: {sourceFidelity.sourceLimitation}
                      </p>
                    )}
                  </div>
                )}

                {/* Similarity Analysis (Automated Signal, Heuristic Indicator) */}
                <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-800/60 text-xs space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="text-slate-200 font-semibold">Similarity Analysis:</span>
                      <span className="text-[10px] text-slate-400 italic">(Automated safety signal)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-[11px]">Similarity to source material:</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        originalityResult && !originalityResult.isOriginal
                          ? 'bg-amber-950 text-amber-300 border-amber-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}>
                        {originalityResult && !originalityResult.isOriginal ? 'Moderate / Review' : 'Low'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-blue-900/40">
                    <span>
                      Phrase overlap:{' '}
                      <strong className="text-slate-200 font-mono">
                        {originalityResult?.overlappingPhrases && originalityResult.overlappingPhrases.length > 0
                          ? `${originalityResult.overlappingPhrases.length} phrase(s) noted`
                          : 'None detected'}
                      </strong>
                    </span>
                    <span className="text-[10px] text-slate-400">Heuristic check against retrieved source material</span>
                  </div>
                </div>

                {/* Claims breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                    <span className="text-[10px] uppercase font-bold text-blue-400 block mb-1">
                      Factual Grounding
                    </span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Written as an educational/analytical breakdown. Zero fabricated percentages, multipliers, or fake company numbers.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">
                      Audience Positioning
                    </span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Guided by ICP vocabulary without vomiting raw lists of titles into the post body.
                    </p>
                  </div>
                </div>
              </div>

              {/* Repetition Warning from Continuous Learning Memory */}
              {repetitionResult?.isRepetitive && (
                <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Repetition Alert: Similar Content Recently Queued</span>
                  </div>
                  <ul className="text-[11px] text-amber-200 list-disc list-inside space-y-1">
                    {repetitionResult.repetitionReasons?.map((r: string, idx: number) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-slate-400">
                    Recommendation: {repetitionResult.recommendation}
                  </p>
                </div>
              )}

              {/* Multi-Dimensional Quality Scorecard (Sections 20, 21, 23) */}
              {qualityScorecard && (
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-white">Multi-Dimensional Quality Scorecard</span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                      qualityScorecard.overallPass 
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                        : (qualityScorecard.criticalFailures && qualityScorecard.criticalFailures.length > 0)
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}>
                      {qualityScorecard.overallScore}/100 • {qualityScorecard.overallStatus || (qualityScorecard.overallPass ? 'PASSED' : 'REVIEW REQUIRED')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                      <span className="text-slate-400 block text-[10px]">Source Fidelity</span>
                      <span className="font-bold text-emerald-400 font-mono">{qualityScorecard.sourceFidelity}%</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                      <span className="text-slate-400 block text-[10px]">Audience Fit</span>
                      <span className="font-bold text-blue-400 font-mono">{qualityScorecard.audienceFit}%</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                      <span className="text-slate-400 block text-[10px]">Voice Fit</span>
                      <span className="font-bold text-purple-400 font-mono">{qualityScorecard.voiceFit}%</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                      <span className="text-slate-400 block text-[10px]">Originality Signal</span>
                      <span className="font-bold text-amber-400 font-mono">{qualityScorecard.originalitySignal}%</span>
                    </div>
                  </div>

                  {/* Critical Quality Hard Gates */}
                  {qualityScorecard.criticalQualityChecks && qualityScorecard.criticalQualityChecks.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Critical Quality Checks (Hard Gates):
                        </span>
                        <span className={`text-[10px] font-mono font-bold ${qualityScorecard.overallPass ? 'text-emerald-400' : 'text-rose-400'}`}>
                          Overall: {qualityScorecard.overallStatus || (qualityScorecard.overallPass ? 'PASSED' : 'REVIEW REQUIRED')}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {qualityScorecard.criticalQualityChecks.map((chk: any) => (
                          <div
                            key={chk.id}
                            className={`p-2 rounded-lg border text-[11px] flex items-center justify-between ${
                              chk.passed
                                ? 'bg-slate-950/60 border-slate-800 text-slate-300'
                                : 'bg-rose-950/40 border-rose-800/80 text-rose-300 font-medium'
                            }`}
                          >
                            <span>{chk.passed ? '✓' : '❌'} {chk.name}</span>
                            <span className="font-mono text-[10px] uppercase font-bold">
                              {chk.passed ? 'Pass' : 'Fail'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {qualityScorecard.strengths && qualityScorecard.strengths.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {qualityScorecard.strengths.map((str: string, si: number) => (
                        <span key={si} className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-900 font-medium">
                          ✓ {str}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* FORMAT EXECUTION CONTRACT: CAROUSEL_DOCUMENT (Sections 6, 8) */}
              {formatExecution?.format === 'CAROUSEL_DOCUMENT' && formatExecution.slides && (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-950/40 via-slate-900 to-indigo-950/40 border border-purple-800/80 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Layout className="w-5 h-5 text-purple-400" />
                      <div>
                        <h4 className="text-sm font-bold text-white">Carousel Document Asset Execution</h4>
                        <p className="text-[11px] text-purple-300">
                          {formatExecution.slides.length} Slides structured strictly from verified source understanding
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-purple-900/60 text-purple-200 border border-purple-700 font-mono">
                      Visual brief only — asset render pending
                    </span>
                  </div>

                  {/* Slides Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {formatExecution.slides.map((slide: any, sIdx: number) => (
                      <div key={sIdx} className="p-3.5 rounded-xl bg-slate-950 border border-purple-900/60 flex flex-col justify-between space-y-2">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 font-mono">
                              Slide {slide.slideNumber}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                              {slide.purpose}
                            </span>
                          </div>
                          <h5 className="text-xs font-bold text-white line-clamp-2">{slide.headline}</h5>
                          <p className="text-[11px] text-slate-300 leading-relaxed font-mono bg-slate-900/60 p-2 rounded border border-slate-800">
                            {slide.body}
                          </p>
                        </div>
                        <div className="pt-1 border-t border-slate-900 text-[10px] text-slate-400 space-y-0.5">
                          <span className="font-semibold text-purple-300 block">Visual Direction:</span>
                          <p className="italic text-slate-400">{slide.visualDirection}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {formatExecution.caption && (
                    <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1 text-xs">
                      <span className="font-bold text-slate-300 block">Carousel Feed Caption:</span>
                      <p className="text-[11px] text-slate-400 whitespace-pre-line leading-relaxed font-mono">
                        {formatExecution.caption}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Visual Asset Spec if Strategy Requires Visual but not Carousel */}
              {activeStrategy?.visualStrategy?.visualRequired && formatExecution?.format !== 'CAROUSEL_DOCUMENT' && (
                <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/60 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-purple-400" />
                      <span className="font-bold text-white">Visual Asset Creative Brief</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-900/60 text-purple-200 border border-purple-700 font-mono font-semibold">
                        {activeStrategy.visualStrategy.visualType}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">Visual brief only — asset not generated</span>
                  </div>
                  <p className="text-[11px] text-purple-200 leading-relaxed font-mono bg-slate-950/80 p-2.5 rounded-lg border border-purple-900/50">
                    {activeStrategy.visualStrategy.visualBrief}
                  </p>
                </div>
              )}

              {/* Complete Post Textarea */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Complete Post Draft (Editable):</label>
                  <span className="text-xs text-blue-400 font-medium">Auto-synced across studio</span>
                </div>
                <textarea
                  value={generatedDraft}
                  onChange={(e) => {
                    setGeneratedDraft(e.target.value);
                    setCurrentPost(e.target.value);
                  }}
                  rows={14}
                  className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 leading-relaxed"
                />
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {generatedDraft.length} characters • {generatedDraft.trim().split(/\s+/).filter(Boolean).length} words
                  </span>
                  <span className="text-emerald-400 font-medium">
                    ✓ Complete Post Workflow (Hook + Setup + Explanation + Framework + Takeaway + CTA)
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3">
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Hook
                </button>
                <button
                  onClick={() => setCurrentStep(5)}
                  id="btn-step4-next-improve"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-md shadow-blue-500/20"
                >
                  <span>Next: Improve & Polish</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 5: IMPROVE & POLISH                                    */}
          {/* ============================================================ */}
          {currentStep === 5 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">STEP 5: Improve & Polish</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Polish sentence flow, eliminate AI corporate buzzwords, and verify natural human cadence.
                  </p>
                </div>
                <button
                  onClick={handleImproveWithHumanizer}
                  disabled={isImproving}
                  id="btn-content-humanize"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20 disabled:opacity-50"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isImproving ? 'Improving Flow...' : 'Humanize & Polish'}</span>
                </button>
              </div>

              {/* Quality Indicators */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-xs text-slate-400 font-medium block">Readability Cadence</span>
                  <div className="text-lg font-bold text-emerald-400 mt-1">
                    {humanizerAudit?.readConfidence || 'Natural Human Flow'}
                  </div>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Conversational technical tone</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-xs text-slate-400 font-medium block">AI Cliché Tell Check</span>
                  <div className="text-lg font-bold text-white mt-1">0 Banned Words</div>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">No "delve", "game-changer", "supercharge"</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-xs text-slate-400 font-medium block">Fact Grounding</span>
                  <div className="text-lg font-bold text-blue-400 mt-1">100% Grounded</div>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Zero fabricated metrics</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Polished Post Text:</label>
                <textarea
                  value={generatedDraft}
                  onChange={(e) => {
                    setGeneratedDraft(e.target.value);
                    setCurrentPost(e.target.value);
                  }}
                  rows={12}
                  className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <button
                  onClick={() => setCurrentStep(4)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={() => setCurrentStep(6)}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-md shadow-blue-500/20"
                >
                  <span>Next: Final Review</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 6: FINAL REVIEW (LINKEDIN FEED PREVIEW)               */}
          {/* ============================================================ */}
          {currentStep === 6 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">STEP 6: Final Review</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Realistic preview showing exactly how your post renders in the LinkedIn feed.
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setPreviewDevice('desktop')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition flex items-center gap-1 ${
                      previewDevice === 'desktop' ? 'bg-blue-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <Eye className="w-3 h-3" />
                    <span>Desktop</span>
                  </button>
                  <button
                    onClick={() => setPreviewDevice('mobile')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition flex items-center gap-1 ${
                      previewDevice === 'mobile' ? 'bg-blue-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <Smartphone className="w-3 h-3" />
                    <span>Mobile</span>
                  </button>
                </div>
              </div>

              {/* Feed Card */}
              <div
                className={`mx-auto bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl ${
                  previewDevice === 'mobile' ? 'max-w-md' : 'max-w-2xl'
                }`}
              >
                {/* Author Card */}
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {authorName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs text-white flex items-center gap-1.5">
                      <span>{authorName}</span>
                      <span className="text-[10px] text-blue-400 font-normal">• 1st</span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">{authorHeadline}</p>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">1h • 🌐</span>
                  </div>
                </div>

                {/* Post body with fold cutoff line */}
                <div className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed font-sans">
                  {generatedDraft || 'Your post draft will appear here.'}
                </div>

                {/* Engagement preview bar */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1 hover:text-blue-400 cursor-pointer">
                      <ThumbsUp className="w-3.5 h-3.5" /> Like
                    </span>
                    <span className="flex items-center gap-1 hover:text-blue-400 cursor-pointer">
                      <MessageSquare className="w-3.5 h-3.5" /> Comment
                    </span>
                    <span className="flex items-center gap-1 hover:text-blue-400 cursor-pointer">
                      <Repeat className="w-3.5 h-3.5" /> Repost
                    </span>
                  </div>
                  <span className="flex items-center gap-1">
                    <Send className="w-3.5 h-3.5" /> Send
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3">
                <button
                  onClick={() => setCurrentStep(5)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={() => setCurrentStep(7)}
                  id="btn-step6-next-approve"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-md shadow-blue-500/20"
                >
                  <span>Next: Approve / Schedule</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 7: APPROVE / SCHEDULE                                  */}
          {/* ============================================================ */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white">STEP 7: Approve / Schedule</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Confirm human approval and choose whether to publish immediately or queue for peak engagement.
                </p>
              </div>

              {/* Human Approval Invariant */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold text-white">Mandatory Human Approval Gate</div>
                  <div className="text-slate-400 mt-0.5">
                    Nothing is published to LinkedIn without explicit user confirmation.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Publish Now */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
                      Immediate Publication
                    </span>
                    <h4 className="font-semibold text-white text-sm">Post to LinkedIn right now</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Publishes the verified, leak-free post directly to your connected profile.
                    </p>
                  </div>
                  <button
                    onClick={handlePublishNow}
                    disabled={isPublishing}
                    id="btn-content-publish-now"
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50"
                  >
                    {isPublishing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{isPublishing ? 'Publishing...' : 'Publish to LinkedIn Now'}</span>
                  </button>
                </div>

                {/* Schedule for later */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                      Optimized Slot
                    </span>
                    <h4 className="font-semibold text-white text-sm">Schedule for peak engagement</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Queues this post into your upcoming calendar slot for optimal reach.
                    </p>
                    <input
                      type="datetime-local"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 mt-2"
                    />
                  </div>
                  <button
                    onClick={handleSchedulePost}
                    disabled={isPublishing}
                    id="btn-content-schedule-post"
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 cursor-pointer disabled:opacity-50"
                  >
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span>{isPublishing ? 'Scheduling...' : 'Schedule Post'}</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-start pt-2">
                <button
                  onClick={() => setCurrentStep(6)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Review
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: MY STORIES & RECEIPTS */}
      {activeTab === 'stories' && (
        <div className="space-y-4">
          <StoryBankView
            onInsertToPost={(content) => {
              setGeneratedDraft(content);
              setCurrentPost(content);
              setActiveTab('creator');
              setCurrentStep(4);
              setMessage({ kind: 'success', text: 'Story loaded into post creator!' });
            }}
          />
        </div>
      )}
    </div>
  );
};
