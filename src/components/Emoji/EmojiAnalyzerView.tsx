import React, { useState } from 'react';
import { AI_TELL_EMOJIS, HUMAN_PATTERN_EMOJIS } from '../../data/emojiPatterns';
import { Smile, AlertTriangle, CheckCircle2, ArrowRight, Zap, RefreshCw } from 'lucide-react';

interface EmojiAnalyzerViewProps {
  currentPost: string;
  setCurrentPost: (post: string) => void;
}

const SAMPLE_EMOJI_SLOP = `🚀 Big announcement! We are transforming the future of work! ✨

Here are the key takeaways from our journey:
🎯 Target 1: Double ARR in 6 months 📈
💡 Insight 2: Build scalable architecture with zero downtime 🔑
🔥 Take 3: Work harder than anyone else in the room 💪

Are you ready to level up? Drop a comment below! 👇`;

export const EmojiAnalyzerView: React.FC<EmojiAnalyzerViewProps> = ({ currentPost, setCurrentPost }) => {
  const [postText, setPostText] = useState(currentPost || SAMPLE_EMOJI_SLOP);

  const words = postText.trim().split(/\s+/).filter(Boolean);
  const wordCount = Math.max(1, words.length);

  // Scan for AI tell emojis
  const detectedAiEmojis: { emoji: string; name: string; count: number; freq: string; alt: string }[] = [];
  let totalAiEmojiCount = 0;

  for (const item of AI_TELL_EMOJIS) {
    const matches = postText.match(new RegExp(item.emoji, 'gu'));
    if (matches && matches.length > 0) {
      detectedAiEmojis.push({
        emoji: item.emoji,
        name: item.name,
        count: matches.length,
        freq: item.aiFrequency,
        alt: item.humanAlternative
      });
      totalAiEmojiCount += matches.length;
    }
  }

  // Density calculation
  const aiEmojiDensityPercent = Math.round((totalAiEmojiCount / wordCount) * 100 * 10) / 10;

  // Position rule checks
  const lines = postText.split('\n').filter(Boolean);
  const firstLine = lines[0] || '';
  const lastLine = lines[lines.length - 1] || '';

  const hookHasEmoji = /[🚀✨💡🔥]/.test(firstLine);
  const ctaHasEmoji = /[👇🚀🔥💪]/.test(lastLine);
  const bulletsHaveEmojis = lines.some(l => /^\s*[-*•]?\s*[🎯💡🔑📈]/.test(l));

  const positionViolations: string[] = [];
  if (hookHasEmoji) positionViolations.push('AI-pattern emoji placed at end of opening hook line (rocket, sparkles, lightbulb).');
  if (bulletsHaveEmojis) positionViolations.push('AI-pattern emoji placed at start of bullet list items (target, key, chart).');
  if (ctaHasEmoji) positionViolations.push('AI-pattern emoji placed at closing CTA line (down finger, rocket, fire).');

  let verdict: 'Clean' | 'Borderline' | 'AI Slop Signature' = 'Clean';
  if (totalAiEmojiCount >= 3 || positionViolations.length >= 2 || aiEmojiDensityPercent > 3.0) {
    verdict = 'AI Slop Signature';
  } else if (totalAiEmojiCount >= 1 || positionViolations.length === 1) {
    verdict = 'Borderline';
  }

  // Cleanse function
  const handleCleanse = () => {
    let cleaned = postText;
    cleaned = cleaned.replace(/🚀/g, '📦');
    cleaned = cleaned.replace(/✨/g, '');
    cleaned = cleaned.replace(/💡/g, '—');
    cleaned = cleaned.replace(/🎯/g, '—');
    cleaned = cleaned.replace(/📈/g, '');
    cleaned = cleaned.replace(/🔑/g, '');
    cleaned = cleaned.replace(/💪/g, '');
    cleaned = cleaned.replace(/👇/g, '');
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').trim();
    setPostText(cleaned);
    setCurrentPost(cleaned);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Smile className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">Emoji Pattern & Density Scorer</h2>
            <span className="text-xs bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-full font-mono">
              MagicPost 2026 Analysis
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Detects high-frequency AI emoji signatures (🚀 💡 ✨ 🎯 📈) and position clusters.
          </p>
        </div>

        <button
          id="cleanse-emojis-btn"
          onClick={handleCleanse}
          className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition shadow-md shadow-amber-600/20"
        >
          <Zap className="w-3.5 h-3.5 fill-current" />
          Cleanse AI-Pattern Emojis
        </button>
      </div>

      {/* Editor & Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Post Draft with Emojis</span>
            <span className="font-mono">{totalAiEmojiCount} AI Emojis Detected</span>
          </div>

          <textarea
            value={postText}
            onChange={e => {
              setPostText(e.target.value);
              setCurrentPost(e.target.value);
            }}
            rows={14}
            className="w-full bg-slate-950 text-slate-100 text-sm font-sans p-3.5 rounded-xl border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none leading-relaxed resize-y"
          />

          <div className="flex justify-between items-center text-xs">
            <button
              onClick={() => {
                setPostText(SAMPLE_EMOJI_SLOP);
                setCurrentPost(SAMPLE_EMOJI_SLOP);
              }}
              className="text-amber-400 hover:underline cursor-pointer"
            >
              Load Extreme Emoji Slop Sample
            </button>
          </div>
        </div>

        {/* Right Column: Scorecard & Patterns (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Verdict and Density Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
              verdict === 'Clean'
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                : verdict === 'Borderline'
                ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
            }`}>
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">Emoji Verdict</span>
              <div className="text-base font-bold mt-1 flex items-center gap-1.5">
                {verdict === 'Clean' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4" />}
                {verdict}
              </div>
              <span className="text-[10px] opacity-75 mt-1">Based on frequency & position</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">AI Emoji Density</span>
              <div className="text-xl font-bold font-mono text-white mt-1">
                {aiEmojiDensityPercent}%
              </div>
              <span className="text-[10px] text-slate-400 mt-1">&lt;1.0% = normal human rate</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">AI Tells Found</span>
              <div className="text-xl font-bold font-mono text-white mt-1">
                {totalAiEmojiCount}
              </div>
              <span className="text-[10px] text-slate-400 mt-1">3+ triggers filter flag</span>
            </div>
          </div>

          {/* Position Warnings */}
          {positionViolations.length > 0 && (
            <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-800/60 text-rose-200 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>AI Emoji Position Cluster Violations:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-rose-200">
                {positionViolations.map((v, idx) => (
                  <li key={idx}>{v}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Detected Emojis Breakdown */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Detected High-Correlation AI Emojis
            </h3>

            {detectedAiEmojis.length > 0 ? (
              <div className="space-y-2">
                {detectedAiEmojis.map((e, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{e.emoji}</span>
                      <div>
                        <div className="font-bold text-white">:{e.name}: ({e.count}x)</div>
                        <div className="text-[11px] text-slate-400">AI Frequency in Corpus: {e.freq}</div>
                      </div>
                    </div>
                    <div className="text-right text-[11px]">
                      <span className="text-slate-400 block">Human Alternative:</span>
                      <span className="text-emerald-400 font-medium">{e.alt}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-emerald-400 bg-emerald-950/20 rounded-lg border border-emerald-800/40">
                Clean! No AI-correlated emojis detected in this post.
              </div>
            )}
          </div>

          {/* Authentic Human Alternatives Reference */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5">
            <div className="text-xs font-semibold text-slate-300 mb-2">
              Authentic Human-Pattern Emojis (&lt;1% AI correlation):
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {HUMAN_PATTERN_EMOJIS.map((item, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 flex items-center gap-1.5"
                >
                  <span className="text-base">{item.emoji}</span>
                  <span className="text-[11px]">{item.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
