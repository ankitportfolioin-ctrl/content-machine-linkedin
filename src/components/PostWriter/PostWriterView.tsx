import React, { useState, useEffect } from 'react';
import { HOOK_FORMULAS } from '../../data/hookFormulas';
import { FOUNDER_ANGLES } from '../../data/founderAngles';
import { HookFormula, FounderAngle } from '../../types/skills';
import { api } from '../../services/api';
import { 
  Sparkles, 
  Copy, 
  Check, 
  AlertTriangle, 
  CheckCircle, 
  Eye, 
  Smartphone,
  ThumbsUp, 
  MessageSquare, 
  Repeat, 
  Send,
  Zap,
  Target,
  BookOpen,
  Sliders,
  Loader2,
  CheckCircle2
} from 'lucide-react';

interface PostWriterViewProps {
  currentPost: string;
  setCurrentPost: (post: string) => void;
  onSendToHumanizer: (text: string) => void;
  onSendToDetectors: (text: string) => void;
  onSendToAutomation: (text: string) => void;
  profileVersion?: number;
}

export const PostWriterView: React.FC<PostWriterViewProps> = ({
  currentPost,
  setCurrentPost,
  onSendToHumanizer,
  onSendToDetectors,
  onSendToAutomation,
  profileVersion,
}) => {
  const [activeCategory, setActiveCategory] = useState<'formulas' | 'founder'>('formulas');
  const [selectedGoal, setSelectedGoal] = useState<string>('all');
  const [selectedFormula, setSelectedFormula] = useState<HookFormula>(HOOK_FORMULAS[6]); // F7 default
  const [selectedAngle, setSelectedAngle] = useState<FounderAngle>(FOUNDER_ANGLES[0]);
  const [copied, setCopied] = useState(false);

  // Voice Profile & Preferences State
  const [voiceProfile, setVoiceProfile] = useState<any>(null);
  const [selectedPillar, setSelectedPillar] = useState<string>('');

  // AI Ghostwriter Drawer State
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiReceipts, setAiReceipts] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);

  // Author details (derived from voice profile)
  const authorName = voiceProfile?.authorName || voiceProfile?.userName || (voiceProfile?.role ? voiceProfile.role.split('&')[0].trim() : 'Your Name');
  const authorHeadline = voiceProfile?.role || 'Operator & Founder';

  // Load Voice Profile
  const loadProfile = async () => {
    try {
      const profile = await api.getVoiceProfile();
      setVoiceProfile(profile);
      if (profile.contentPillars && profile.contentPillars.length > 0) {
        setSelectedPillar(prev => prev || profile.contentPillars[0]);
        setAiTopic(prev => (!prev ? profile.contentPillars[0] : prev));
      }
      if (profile.keyReceipts && profile.keyReceipts.length > 0) {
        setAiReceipts(prev => (!prev ? profile.keyReceipts.slice(0, 2).join('; ') : prev));
      }
    } catch (err) {
      console.warn('Failed to load profile in writer:', err);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [profileVersion]);

  const charCount = currentPost.length;
  const wordCount = currentPost.trim().split(/\s+/).filter(Boolean).length;
  const firstLine = currentPost.trim().split('\n')[0] || '';

  // Algorithm heuristics
  const hasOpeningQuestion = /^\s*[^.?!]*\?\s*$/.test(firstLine);
  const hasNumberFirst = /^\s*(\$?\d+[\d,.]*%?|\d+)/.test(firstLine);
  const hasPs = /\bP\.S\.\b/i.test(currentPost);
  const isCutoffExceeded = firstLine.length > 210;
  const isPlaceholderDefault = currentPost.includes('[Exact Amount]') || currentPost.length === 0;

  const filteredFormulas = HOOK_FORMULAS.filter(f => {
    if (selectedGoal === 'all') return true;
    return f.goal === selectedGoal;
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(currentPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLoadFormula = (formula: HookFormula) => {
    setSelectedFormula(formula);
    setCurrentPost(formula.defaultTemplate);
  };

  const handleLoadAngle = (angle: FounderAngle) => {
    setSelectedAngle(angle);
    setCurrentPost(angle.template);
  };

  // 1-Click generation for a specific pillar or active preferences
  const handleGenerateForPillar = async (pillarToUse?: string) => {
    const pillar = pillarToUse || selectedPillar || (voiceProfile?.contentPillars?.[0]) || 'Software Development & Practical AI';
    setIsGenerating(true);
    setGenerationNotice(null);
    try {
      const res = await api.generateAiPost({
        topic: pillar,
        formulaCode: selectedFormula.code,
        formulaName: selectedFormula.name,
        angleCode: selectedAngle.code,
        angleName: selectedAngle.name,
        receipts: aiReceipts || (voiceProfile?.keyReceipts?.slice(0, 2).join('; ')),
        voiceProfile,
      });
      setCurrentPost(res.post);
      setGenerationNotice(`Draft generated for "${pillar}" using ${res.modelUsed}! De-slop & algorithm rules applied.`);
    } catch (err: any) {
      setGenerationNotice(`Generation note: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAiGhostwrite = async () => {
    setIsGenerating(true);
    setGenerationNotice(null);
    try {
      const res = await api.generateAiPost({
        topic: aiTopic || selectedPillar,
        formulaCode: selectedFormula.code,
        formulaName: selectedFormula.name,
        angleCode: selectedAngle.code,
        angleName: selectedAngle.name,
        receipts: aiReceipts,
        voiceProfile,
      });
      setCurrentPost(res.post);
      setGenerationNotice(`Draft generated with ${res.modelUsed}! De-slop rules applied.`);
      setShowAiDrawer(false);
    } catch (err: any) {
      setGenerationNotice(`Generation note: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* ACTIVE CONTENT PREFERENCES & PILLARS BAR */}
      {voiceProfile && (
        <div className="bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 border border-blue-800/50 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Persona & Target */}
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="p-1 rounded-lg bg-blue-500/20 text-blue-400">
                  <Target className="w-4 h-4" />
                </span>
                <span className="text-xs uppercase tracking-wider font-bold text-blue-400">
                  Active Content Preferences
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/80 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Synced
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                {voiceProfile.role || 'Tech Creator & Educator'}
              </h3>
              <p className="text-xs text-slate-300 line-clamp-1">
                <span className="text-slate-400 font-medium">ICP:</span> {voiceProfile.audience || 'Developers, engineers, AI builders, and tech founders'}
              </p>
            </div>

            {/* Quick 1-Click Draft Button */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                id="generate-from-preferences-btn"
                onClick={() => handleGenerateForPillar()}
                disabled={isGenerating}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/25 transition cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Post with Gemini...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-blue-200" />
                    <span>Generate Post for Selected Pillar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Interactive Content Pillars Selector */}
          {voiceProfile.contentPillars && voiceProfile.contentPillars.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                  Select Your Topic Pillar:
                </span>
                <span className="text-[11px] text-slate-400">
                  Click a pillar to draft authentic content
                </span>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {voiceProfile.contentPillars.map((pillar: string, idx: number) => {
                  const isSelected = (selectedPillar || voiceProfile.contentPillars[0]) === pillar;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedPillar(pillar);
                        setAiTopic(pillar);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30 border border-blue-400'
                          : 'bg-slate-950/80 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800'
                      }`}
                    >
                      <span>{pillar}</span>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subtle Callout if Editor Still Has Initial Placeholder */}
          {isPlaceholderDefault && (
            <div className="mt-3 p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-200/90 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  The editor currently has the initial placeholder template. Click <strong>Generate Post for Selected Pillar</strong> above to load a draft created specifically for your Tech Creator preferences.
                </span>
              </div>
              <button
                onClick={() => handleGenerateForPillar()}
                disabled={isGenerating}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs shrink-0 transition cursor-pointer"
              >
                Generate Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* Top Banner / Goal Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>2026 Hook Formula Engine</span>
            <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono">
              20 Formulas Verified
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Craft high-performing thought leadership posts with proven engagement multipliers and algorithm compliance.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
            <button
              id="switch-formulas"
              onClick={() => setActiveCategory('formulas')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition ${
                activeCategory === 'formulas' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              20 Hook Formulas
            </button>
            <button
              id="switch-founder"
              onClick={() => setActiveCategory('founder')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition ${
                activeCategory === 'founder' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Founder Angles (A1-A10)
            </button>
          </div>

          {activeCategory === 'formulas' && (
            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-400 font-medium mr-1">Goal:</span>
              {(['all', 'comments', 'reposts', 'likes', 'saves'] as const).map(goal => (
                <button
                  key={goal}
                  id={`goal-filter-${goal}`}
                  onClick={() => setSelectedGoal(goal)}
                  className={`text-[11px] px-2 py-0.5 rounded capitalize cursor-pointer transition ${
                    selectedGoal === goal
                      ? 'bg-slate-800 text-blue-400 font-semibold border border-slate-700'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {goal}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Form Selector on Left, Editor in Middle, Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Formula Cards Selector (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
            <span>{activeCategory === 'formulas' ? 'Select Hook Formula' : 'Select Founder Angle'}</span>
            <span>{activeCategory === 'formulas' ? `${filteredFormulas.length} formulas` : '10 Angles'}</span>
          </div>

          <div className="max-h-[750px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {activeCategory === 'formulas' ? (
              filteredFormulas.map(formula => {
                const isSelected = selectedFormula.id === formula.id;
                return (
                  <div
                    key={formula.id}
                    id={`formula-card-${formula.code.toLowerCase()}`}
                    onClick={() => handleLoadFormula(formula)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-950/50'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 border border-blue-500/30">
                          {formula.code}
                        </span>
                        <h4 className="text-sm font-semibold text-white leading-tight">{formula.name}</h4>
                      </div>
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60 whitespace-nowrap">
                        {formula.referenceEng}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mt-2 line-clamp-2">
                      {formula.bestFor}
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 capitalize flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        Goal: <strong className="text-slate-300">{formula.goal}</strong>
                      </span>
                      <span className="text-blue-400 font-medium">Use Template &rarr;</span>
                    </div>
                  </div>
                );
              })
            ) : (
              FOUNDER_ANGLES.map(angle => {
                const isSelected = selectedAngle.id === angle.id;
                return (
                  <div
                    key={angle.id}
                    id={`founder-angle-${angle.code.toLowerCase()}`}
                    onClick={() => handleLoadAngle(angle)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-purple-950/40 border-purple-500 shadow-md shadow-purple-950/50'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-400 border border-purple-500/30">
                          {angle.code}
                        </span>
                        <h4 className="text-sm font-semibold text-white">{angle.name}</h4>
                      </div>
                      <span className="text-[11px] font-medium text-slate-400 capitalize">
                        {angle.goal}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-2 line-clamp-2">{angle.tension}</p>
                    <div className="mt-2 text-[11px] text-purple-400 font-medium">Insert Founder Angle &rarr;</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Center & Right: Editor and LinkedIn Live Preview (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* Active Formula Info Box */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-600/30 text-blue-400 border border-blue-500/40">
                    {activeCategory === 'formulas' ? selectedFormula.code : selectedAngle.code}
                  </span>
                  <h3 className="font-bold text-white text-base">
                    {activeCategory === 'formulas' ? selectedFormula.name : selectedAngle.name}
                  </h3>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  {activeCategory === 'formulas' ? selectedFormula.whyItWorks : selectedAngle.tension}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="toggle-ai-drawer-btn"
                  onClick={() => setShowAiDrawer(!showAiDrawer)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-md shadow-indigo-600/20"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Ghostwrite with AI
                </button>
                <button
                  id="reset-template-btn"
                  onClick={() => {
                    if (activeCategory === 'formulas') {
                      setCurrentPost(selectedFormula.defaultTemplate);
                    } else {
                      setCurrentPost(selectedAngle.template);
                    }
                  }}
                  className="text-xs px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer whitespace-nowrap transition"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* AI Ghostwriter Drawer */}
            {showAiDrawer && (
              <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-indigo-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Gemini 3.1 Flash-Lite Ghostwriter (Tuned to Your Voice Profile)
                  </span>
                  <span className="text-[10px] text-indigo-400 font-mono">Formula: {selectedFormula.code}</span>
                </div>

                {/* Quick-Pick Pillars */}
                {voiceProfile?.contentPillars && voiceProfile.contentPillars.length > 0 && (
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Quick-Insert From Your Content Pillars:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceProfile.contentPillars.map((p: string, i: number) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setAiTopic(p)}
                          className="px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-300 border border-slate-750 transition"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Topic or Operational Premise:</label>
                    <input
                      type="text"
                      value={aiTopic}
                      onChange={e => setAiTopic(e.target.value)}
                      placeholder="e.g. Practical AI workflows for developers"
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Receipts / Concrete Odd-Precision Numbers:</label>
                    <input
                      type="text"
                      value={aiReceipts}
                      onChange={e => setAiReceipts(e.target.value)}
                      placeholder="e.g. 60% of code drafted by AI, 90-sec deploy"
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Quick-Pick Receipts */}
                {voiceProfile?.keyReceipts && voiceProfile.keyReceipts.length > 0 && (
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Insert Key Receipt:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceProfile.keyReceipts.map((rcpt: string, i: number) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setAiReceipts(rcpt)}
                          className="px-2 py-0.5 rounded-md bg-emerald-950/60 hover:bg-emerald-900/60 text-[11px] text-emerald-300 border border-emerald-800/60 transition"
                        >
                          {rcpt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-400">
                    Bans reveal bridges, enforces line 1 metric, 0 emojis, and includes P.S. note.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAiDrawer(false)}
                      className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      id="generate-post-btn"
                      onClick={handleAiGhostwrite}
                      disabled={isGenerating}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {isGenerating ? 'Generating...' : 'Generate Authentic Post'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {generationNotice && (
              <div className="mt-2 text-xs text-indigo-300 bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-800/40 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{generationNotice}</span>
              </div>
            )}
          </div>

          {/* Post Textarea Editor */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium text-slate-300">Post Draft Editor</span>
              <div className="flex items-center gap-3 font-mono">
                <span>{wordCount} words</span>
                <span className={`${charCount > 2800 ? 'text-red-400 font-bold' : charCount >= 900 && charCount <= 1900 ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {charCount} / 3,000 chars
                </span>
              </div>
            </div>

            <textarea
              id="post-editor-textarea"
              value={currentPost}
              onChange={e => setCurrentPost(e.target.value)}
              placeholder="Draft your LinkedIn post here or select a hook formula from the left..."
              rows={12}
              className="w-full bg-slate-950 text-slate-100 text-sm font-sans p-3.5 rounded-lg border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none leading-relaxed resize-y"
            />

            {/* Quick Algorithm Heuristics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-[11px]">
              <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
                hasNumberFirst ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}>
                {hasNumberFirst ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />}
                <span>Number-First (+34%)</span>
              </div>

              <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
                !hasOpeningQuestion ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
              }`}>
                {!hasOpeningQuestion ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                <span>{hasOpeningQuestion ? 'Question Hook (-34%)' : 'No Question Hook'}</span>
              </div>

              <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
                !isCutoffExceeded ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
              }`}>
                {!isCutoffExceeded ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                <span>Hook &le; 210 chars</span>
              </div>

              <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
                hasPs ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}>
                {hasPs ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />}
                <span>P.S. Note (+7.5%)</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  id="copy-post-btn"
                  onClick={handleCopy}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  id="send-detectors-btn"
                  onClick={() => onSendToDetectors(currentPost)}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  Detectors
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="send-humanizer-btn"
                  onClick={() => onSendToHumanizer(currentPost)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition border border-slate-700"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  Audit in Humanizer
                </button>

                <button
                  id="send-automation-btn"
                  onClick={() => onSendToAutomation(currentPost)}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-lg shadow-blue-600/20"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Schedule to LinkedIn &rarr;
                </button>
              </div>
            </div>
          </div>

          {/* Live Mobile LinkedIn Feed Preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Smartphone className="w-4 h-4 text-blue-400" />
                <span>Live Feed Preview (Mobile Frame with 210-char fold)</span>
              </div>
              <span className="text-[11px] text-slate-400">
                Visible before &ldquo;... see more&rdquo; on mobile
              </span>
            </div>

            {/* LinkedIn Simulated Post Card */}
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 max-w-xl mx-auto shadow-xl">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-700 to-indigo-500 flex items-center justify-center text-white font-bold text-base shadow shrink-0">
                  {authorName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm truncate">{authorName}</span>
                    <span className="text-slate-400 text-xs">1d • 🌐</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{authorHeadline}</p>
                </div>
              </div>

              {/* Post Body with 210-Char "See More" Ruler */}
              <div className="mt-3.5 text-slate-200 text-sm whitespace-pre-wrap leading-relaxed font-sans">
                {currentPost.length > 210 ? (
                  <div>
                    <span>{currentPost.slice(0, 210)}</span>
                    <span className="text-blue-400 font-semibold cursor-pointer"> … see more</span>
                    <div className="my-2 border-t border-dashed border-blue-500/40 relative">
                      <span className="absolute -top-2.5 right-2 bg-blue-950 text-blue-300 text-[10px] font-mono px-1.5 py-0.5 rounded border border-blue-800">
                        210-char Mobile Fold
                      </span>
                    </div>
                    <span className="text-slate-400 opacity-80">{currentPost.slice(210)}</span>
                  </div>
                ) : (
                  <span>{currentPost || 'Write or load a post to see live preview...'}</span>
                )}
              </div>

              {/* Reaction Counter Bar */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="flex -space-x-1">
                    <span className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-[10px] text-white">👍</span>
                    <span className="w-4 h-4 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] text-white">💡</span>
                    <span className="w-4 h-4 rounded-full bg-rose-600 flex items-center justify-center text-[10px] text-white">❤️</span>
                  </span>
                  <span>142</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>38 comments</span>
                  <span>12 reposts</span>
                </div>
              </div>

              {/* Interactive Reaction Buttons */}
              <div className="mt-2 pt-2 border-t border-slate-800/80 grid grid-cols-4 gap-1 text-slate-400 text-xs font-medium">
                <button className="flex items-center justify-center gap-1 py-1.5 rounded hover:bg-slate-900 cursor-pointer">
                  <ThumbsUp className="w-3.5 h-3.5" /> Like
                </button>
                <button className="flex items-center justify-center gap-1 py-1.5 rounded hover:bg-slate-900 cursor-pointer">
                  <MessageSquare className="w-3.5 h-3.5" /> Comment
                </button>
                <button className="flex items-center justify-center gap-1 py-1.5 rounded hover:bg-slate-900 cursor-pointer">
                  <Repeat className="w-3.5 h-3.5" /> Repost
                </button>
                <button className="flex items-center justify-center gap-1 py-1.5 rounded hover:bg-slate-900 cursor-pointer">
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
