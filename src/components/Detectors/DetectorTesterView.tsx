import React, { useState } from 'react';
import { DETECTOR_SPECS, simulateDetectorScores } from '../../data/detectorRules';
import { auditText } from '../../utils/humanizerEngine';
import { 
  Radio, 
  AlertCircle, 
  HelpCircle, 
  FileText, 
  BookOpen, 
  TrendingDown, 
  ShieldAlert,
  Scale
} from 'lucide-react';

interface DetectorTesterViewProps {
  currentPost: string;
}

export const DetectorTesterView: React.FC<DetectorTesterViewProps> = ({ currentPost }) => {
  const [testText, setTestText] = useState(currentPost);

  const wordCount = testText.trim().split(/\s+/).filter(Boolean).length;
  const audit = auditText(testText);
  const totalTells = audit.paragraphScores.reduce((acc, p) => acc + p.hits.length, 0);

  const detectorScores = simulateDetectorScores(testText, totalTells, wordCount);

  // Divergence analysis
  const maxScore = Math.max(...detectorScores.map(d => d.predictedAiPercent));
  const minScore = Math.min(...detectorScores.map(d => d.predictedAiPercent));
  const divergenceSpread = maxScore - minScore;

  let divergenceStatus = 'Consensus';
  if (divergenceSpread > 40) {
    divergenceStatus = 'Extreme Divergence (Unreliable)';
  } else if (divergenceSpread > 20) {
    divergenceStatus = 'Mixed / Inconclusive';
  }

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white">5-Detector Divergence Matrix</h2>
            <span className="text-xs bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded-full font-mono">
              Empirical Stylometry
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Demonstrates why AI detector scores on short LinkedIn posts (100-300 words) are statistical noise.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Divergence Spread:</span>
          <span className={`font-mono font-bold px-2 py-0.5 rounded border ${
            divergenceSpread > 35
              ? 'bg-rose-950 text-rose-300 border-rose-800'
              : 'bg-emerald-950 text-emerald-300 border-emerald-800'
          }`}>
            {divergenceSpread} Point Delta ({divergenceStatus})
          </span>
        </div>
      </div>

      {/* Editor & Testing Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input Textarea */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Text Being Tested</span>
            <span className="font-mono">{wordCount} words</span>
          </div>

          <textarea
            value={testText}
            onChange={e => setTestText(e.target.value)}
            rows={14}
            placeholder="Type or paste text to test across the 5 detectors..."
            className="w-full bg-slate-950 text-slate-100 text-sm font-sans p-3.5 rounded-xl border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none leading-relaxed resize-y"
          />

          {wordCount < 100 && (
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/50 text-amber-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Sample Size Warning:</strong> Detectors are statistically unreliable under 100 words. GPTZero does not evaluate under 250 characters.
              </span>
            </div>
          )}
        </div>

        {/* Right: Detector Scorecards */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Simulated Detector Performance</span>
            <span>Based on published benchmarks & CCC empirical tests</span>
          </div>

          <div className="space-y-3">
            {detectorScores.map((detector, i) => (
              <div
                key={i}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5 transition hover:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{detector.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {DETECTOR_SPECS[i].badge}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      detector.evaluation === 'Likely Human'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : detector.evaluation === 'Borderline / Mixed'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}>
                      {detector.evaluation}
                    </span>
                    <span className="font-mono font-bold text-lg text-white">
                      {detector.predictedAiPercent}%
                    </span>
                  </div>
                </div>

                {/* Progress Meter */}
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      detector.predictedAiPercent > 65
                        ? 'bg-rose-500'
                        : detector.predictedAiPercent > 35
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${detector.predictedAiPercent}%` }}
                  />
                </div>

                {/* Documented Flaw Box */}
                <div className="pt-2 border-t border-slate-800/80 text-xs space-y-1">
                  <div className="text-slate-300 flex items-start gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-200">Documented Bias:</strong> {detector.knownFailure}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 italic">
                    Citation: {detector.citation}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The Core Truth Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Scale className="w-4 h-4 text-blue-400" />
          <span>Why You Should Never Optimize for AI Detectors</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300 leading-relaxed">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <strong className="text-blue-300 block">1. 50-Point Divergence</strong>
            <p>
              In Sergey Bulaev’s 2026 CCC meeting test, a hand-written article scored 100% AI on Originality.ai, 82% on GPTZero, and 50% on ZeroGPT on identical text without a single character changed.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <strong className="text-blue-300 block">2. Severe ESL Bias</strong>
            <p>
              The Liang et al. (Stanford 2023) study proved detectors flag 61.3% of essays by non-native English writers as AI, penalizing clean, straightforward vocabulary.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <strong className="text-blue-300 block">3. Human Readers Are the Filter</strong>
            <p>
              LinkedIn readers report posts using LinkedIn&apos;s July 2026 &ldquo;AI Slop&rdquo; button, costing flagged posts 40% of their views. Human readers care about repetitive vocabulary (53%) and staged structure (36%).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
