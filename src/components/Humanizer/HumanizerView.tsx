import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { HumanizerMode, ScrubTier, AuditResult, ParagraphScore } from '../../types/skills';
import { auditText, rewriteText, RewriteDiff } from '../../utils/humanizerEngine';
import { 
  ShieldCheck, 
  Sparkles, 
  AlertOctagon, 
  AlertTriangle, 
  CheckCircle2, 
  Sliders, 
  FileText, 
  ArrowRight, 
  RefreshCw, 
  Copy, 
  Check, 
  Zap,
  Info
} from 'lucide-react';

interface HumanizerViewProps {
  currentPost: string;
  setCurrentPost: (post: string) => void;
}

const SAMPLE_AI_POST = `In today's fast-paced digital landscape, it is crucial for founders to leverage comprehensive insights to streamline their operations.

The result?
Significant growth that empowers your team to elevate customer experience and foster collaboration.

No excuses. No delays. Just execution.

We delved into the intricate tapestry of modern workflows—and realized that quietly doing the work is what matters most—especially when navigating multifaceted challenges.

What do you think? Tag someone who needs to hear this!`;

const SAMPLE_HUMAN_POST = `42 minutes.

That was our exact turnaround time for customer inquiries last quarter.

Two years ago, our team juggled four separate communication channels and spent hours triaging duplicate requests.

Last quarter, we simplified down to a single asynchronous workflow.
Our resolution turnaround fell from 4 hours to 42 minutes.

We spent years believing operational complexity equaled rigor.
It did not. It just burned focus and momentum.

What is a process or meeting you eliminated from your team this year?`;

export const HumanizerView: React.FC<HumanizerViewProps> = ({ currentPost, setCurrentPost }) => {
  const [text, setText] = useState(currentPost || '');
  const [mode, setMode] = useState<HumanizerMode>('audit');
  const [tier, setTier] = useState<ScrubTier>('strict');
  const [auditData, setAuditData] = useState<AuditResult | null>(null);
  const [rewriteData, setRewriteData] = useState<RewriteDiff | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    api.getWorkspaceStatus().then(st => {
      setIsDemoMode(st.isDemoMode);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (text && text.trim()) {
      const audited = auditText(text, tier);
      setAuditData(audited);
      const rewritten = rewriteText(text, tier);
      setRewriteData(rewritten);
    } else {
      setAuditData(null);
      setRewriteData(null);
    }
  }, [text, tier]);

  const handleApplyRewrite = () => {
    if (rewriteData) {
      setText(rewriteData.rewritten);
      setCurrentPost(rewriteData.rewritten);
    }
  };

  const handleCopy = (contentToCopy: string) => {
    navigator.clipboard.writeText(contentToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
              <span>LinkedIn Humanizer V3</span>
            </h2>
            <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
              Density-Scored (Not Word-Banned)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Removes the AI tells human readers and LinkedIn's AI-slop filter penalize (-40% reach penalty).
          </p>
        </div>

        {/* Tier & Mode Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode Switcher */}
          <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
            <button
              id="mode-audit-btn"
              onClick={() => setMode('audit')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition ${
                mode === 'audit' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Audit Mode (Pass/Fail)
            </button>
            <button
              id="mode-rewrite-btn"
              onClick={() => setMode('rewrite')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition ${
                mode === 'rewrite' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rewrite Mode (4-Pass)
            </button>
          </div>

          {/* Tier Selector */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs">
            <span className="text-slate-400 text-[11px] mr-1">Tier:</span>
            {(['forensic', 'strict', 'aesthetic'] as const).map(t => (
              <button
                key={t}
                id={`tier-btn-${t}`}
                onClick={() => setTier(t)}
                className={`text-[11px] px-2 py-0.5 rounded capitalize cursor-pointer transition ${
                  tier === t
                    ? 'bg-slate-800 text-blue-400 font-semibold border border-slate-700'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Sample Selector - Gated strictly behind Demo Mode */}
      {isDemoMode && (
        <div className="flex items-center justify-between text-xs text-slate-400 bg-amber-950/20 p-2.5 rounded-lg border border-amber-800/40">
          <span className="flex items-center gap-1.5 text-amber-300">
            <Info className="w-3.5 h-3.5 text-amber-400" />
            [Sandbox / Demo Mode Active] Test AI-slop detection against human baseline:
          </span>
          <div className="flex items-center gap-2">
            <button
              id="load-ai-sample-btn"
              onClick={() => {
                setText(SAMPLE_AI_POST);
                setCurrentPost(SAMPLE_AI_POST);
              }}
              className="px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-800/40 text-[11px] cursor-pointer"
            >
              Load AI-Tells Sample
            </button>
            <button
              id="load-human-sample-btn"
              onClick={() => {
                setText(SAMPLE_HUMAN_POST);
                setCurrentPost(SAMPLE_HUMAN_POST);
              }}
              className="px-2.5 py-1 rounded bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-300 border border-emerald-800/40 text-[11px] cursor-pointer"
            >
              Load Clean Human Sample
            </button>
          </div>
        </div>
      )}

      {/* Two Column Layout: Editor/Input on Left, Audit Scorecard / Rewrite Diff on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Input text (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
            <span>Input Draft to Humanize</span>
            <span className="font-mono">{text.trim().split(/\s+/).filter(Boolean).length} words</span>
          </div>

          <textarea
            id="humanizer-input-textarea"
            value={text}
            onChange={e => {
              setText(e.target.value);
              setCurrentPost(e.target.value);
            }}
            rows={18}
            placeholder="Paste your post or draft here to scrub AI tells..."
            className="w-full bg-slate-950 text-slate-100 text-sm font-sans p-3.5 rounded-xl border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none leading-relaxed resize-y"
          />

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Unit of judgement: Paragraph density (3+ markers = rewrite)</span>
            <button
              onClick={() => handleCopy(text)}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy Input'}
            </button>
          </div>
        </div>

        {/* Right Column: Audit or Rewrite Display (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Top Score Banner */}
          {auditData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Verdict */}
              <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                auditData.readConfidence === 'Reads Human'
                  ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                  : auditData.readConfidence === 'Mixed'
                  ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                  : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
              }`}>
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">Reader Verdict</span>
                <div className="text-base font-bold mt-1 flex items-center gap-1.5">
                  {auditData.readConfidence === 'Reads Human' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  {auditData.readConfidence}
                </div>
                <span className="text-[10px] opacity-75 mt-1">Based on expert reader stylometry</span>
              </div>

              {/* Tell Density */}
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tell Density</span>
                <div className="text-xl font-bold font-mono text-white mt-1">
                  {auditData.tellDensity}%
                </div>
                <span className="text-[10px] text-slate-400 mt-1">&lt;1.0% = human standard</span>
              </div>

              {/* Flesch Reading Score */}
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Reading Ease</span>
                <div className="text-xl font-bold font-mono text-white mt-1">
                  {auditData.fleschScore}
                </div>
                <span className="text-[10px] text-slate-400 mt-1">Target &gt; 55 (Plain English)</span>
              </div>

              {/* Paragraphs Flagged */}
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Flagged Paragraphs</span>
                <div className="text-xl font-bold font-mono text-white mt-1">
                  {auditData.paragraphScores.filter(p => p.status === 'flagged').length} / {auditData.paragraphScores.length}
                </div>
                <span className="text-[10px] text-slate-400 mt-1">3+ markers trigger rewrite</span>
              </div>
            </div>
          )}

          {/* Mode 1: Audit Mode View */}
          {mode === 'audit' && auditData && (
            <div className="space-y-4">
              
              {/* Blockers & Warnings */}
              {auditData.blockers.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-rose-300">
                    <AlertOctagon className="w-4 h-4 text-rose-400" />
                    <span>Fatal Model Blockers Detected ({auditData.blockers.length})</span>
                  </div>
                  <ul className="list-disc list-inside text-xs space-y-1 text-rose-200">
                    {auditData.blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {auditData.warnings.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-amber-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>2026 Feed Warnings & Heuristics ({auditData.warnings.length})</span>
                  </div>
                  <ul className="list-disc list-inside text-xs space-y-1 text-amber-200">
                    {auditData.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Per-Paragraph Density Map */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Paragraph Density Analysis (Unit of Judgement)
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    V3 Rule: clusters of 3+ trigger rewrite
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                  {auditData.paragraphScores.map((para, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border text-xs space-y-2 transition ${
                        para.status === 'flagged'
                          ? 'bg-rose-950/20 border-rose-800/60'
                          : para.status === 'borderline'
                          ? 'bg-amber-950/20 border-amber-800/60'
                          : 'bg-slate-950 border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-slate-400">Paragraph #{i + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                            para.status === 'flagged'
                              ? 'bg-rose-900/60 text-rose-300 border border-rose-700'
                              : para.status === 'borderline'
                              ? 'bg-amber-900/60 text-amber-300 border border-amber-700'
                              : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          }`}>
                            {para.count} {para.count === 1 ? 'tell' : 'tells'}
                          </span>
                          <span className="text-slate-400 uppercase font-mono text-[10px]">
                            Action: {para.suggestedAction}
                          </span>
                        </div>
                      </div>

                      <p className="text-slate-300 font-sans line-clamp-3 italic">
                        &ldquo;{para.text}&rdquo;
                      </p>

                      {para.hits.length > 0 && (
                        <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-1.5">
                          {para.hits.map((hit, hi) => (
                            <span
                              key={hi}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-200"
                            >
                              <strong className="text-rose-400">{hit.matchedText}</strong>
                              <span className="text-slate-400">({hit.reason})</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: Rewrite Mode View */}
          {mode === 'rewrite' && rewriteData && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <span>Humanized 4-Pass Output</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Scrubbed reveals, capped em-dashes, and normalized density.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="copy-rewritten-btn"
                    onClick={() => handleCopy(rewriteData.rewritten)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy Cleaned'}
                  </button>

                  <button
                    id="apply-rewrite-btn"
                    onClick={handleApplyRewrite}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-md shadow-emerald-600/20"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Accept Rewritten Draft
                  </button>
                </div>
              </div>

              {/* Rewritten Text Box */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm whitespace-pre-wrap leading-relaxed font-sans max-h-80 overflow-y-auto custom-scrollbar">
                {rewriteData.rewritten}
              </div>

              {/* List of Applied Changes */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">
                    Modifications Applied ({rewriteData.changesApplied.length})
                  </span>
                  <span>Pass 1-4 Complete</span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {rewriteData.changesApplied.length > 0 ? (
                    rewriteData.changesApplied.map((c, i) => (
                      <div
                        key={i}
                        className="p-2 rounded bg-slate-950 border border-slate-800/80 text-xs flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 shrink-0">
                            {c.rule}
                          </span>
                          <span className="text-rose-400 line-through truncate max-w-xs">{c.before}</span>
                          <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="text-emerald-400 font-medium truncate max-w-xs">
                            {c.after || '(deleted)'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 hidden sm:block">
                          {c.explanation}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-xs text-emerald-400 bg-emerald-950/20 rounded border border-emerald-800/40">
                      Draft is completely clean! No tell markers exceeded the density threshold.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
