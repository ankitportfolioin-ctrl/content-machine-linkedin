import { AuditResult, ParagraphScore, RewriteDiff, RewriteChange, ScrubTier, TellHit } from '../types/skills';

export type { RewriteDiff };

const AI_TELL_WORDS: { word: string; replacement: string; reason: string; fatal?: boolean }[] = [
  { word: "in today's fast-paced world", replacement: "today", reason: "Standard AI opener cliché", fatal: true },
  { word: "fast-paced digital landscape", replacement: "software industry", reason: "AI landscape cliché", fatal: true },
  { word: "digital landscape", replacement: "industry", reason: "AI landscape cliché" },
  { word: "landscape", replacement: "market", reason: "Overused AI metaphor" },
  { word: "delve into", replacement: "study", reason: "AI dead giveaway verb", fatal: true },
  { word: "delved into", replacement: "tested", reason: "AI dead giveaway verb", fatal: true },
  { word: "delve", replacement: "explore", reason: "AI dead giveaway verb", fatal: true },
  { word: "tapestry", replacement: "system", reason: "Overused synthetic metaphor", fatal: true },
  { word: "intricate tapestry", replacement: "complexity", reason: "Synthetic cliché pair", fatal: true },
  { word: "testament to", replacement: "proof of", reason: "Stilted synthetic phrase" },
  { word: "game-changer", replacement: "breakthrough", reason: "Empty SaaS hype phrase" },
  { word: "game changer", replacement: "breakthrough", reason: "Empty SaaS hype phrase" },
  { word: "supercharge", replacement: "accelerate", reason: "SaaS marketing slop" },
  { word: "empowers your team", replacement: "helps your team", reason: "Corporate filler verb" },
  { word: "foster collaboration", replacement: "work together", reason: "Corporate filler verb" },
  { word: "foster", replacement: "encourage", reason: "Corporate filler verb" },
  { word: "streamline their operations", replacement: "cut manual work", reason: "Vague enterprise jargon" },
  { word: "streamline", replacement: "simplify", reason: "Overused synthetic verb" },
  { word: "crucial", replacement: "essential", reason: "AI urgency amplifier" },
  { word: "leverage", replacement: "use", reason: "Overused synthetic jargon" },
  { word: "multifaceted challenges", replacement: "hard trade-offs", reason: "Synthetic filler pair" },
  { word: "multifaceted", replacement: "complex", reason: "Synthetic jargon" },
  { word: "uncharted territory", replacement: "new territory", reason: "Cliché phrase" },
  { word: "navigate", replacement: "handle", reason: "AI navigation metaphor" },
  { word: "navigating", replacement: "solving", reason: "AI navigation metaphor" },
  { word: "robust", replacement: "resilient", reason: "AI favorite adjective" },
  { word: "seamless", replacement: "smooth", reason: "Marketing filler" },
  { word: "unlock", replacement: "reach", reason: "AI marketing verb" },
  { word: "harness", replacement: "use", reason: "AI marketing verb" }
];

const REVEAL_BRIDGES = [
  { phrase: "The result?", reason: "Synthetic reveal bridge (-34% engagement)", replacement: "" },
  { phrase: "Here's the kicker:", reason: "Formulaic synthetic pivot", replacement: "" },
  { phrase: "Here's the thing:", reason: "Overused conversational bridge", replacement: "" },
  { phrase: "Plot twist:", reason: "Artificial LinkedIn reveal bridge", replacement: "" },
  { phrase: "Here's why:", reason: "Autopilot bridge phrase", replacement: "" },
  { phrase: "Here's what changed:", reason: "Formulaic synthetic bridge", replacement: "" }
];

const STACCATO_TRIOS = [
  { pattern: /No excuses\.\s*No delays\.\s*Just execution\./i, reason: "Staccato 3-phrase synthetic buzz run" },
  { pattern: /Faster\.\s*Cheaper\.\s*Better\./i, reason: "Rule of three synthetic cadence" },
  { pattern: /Learn\.\s*Iterate\.\s*Scale\./i, reason: "LinkedIn triple buzzword run" }
];

function calculateFleschReadingEase(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 100;
  const sentences = text.split(/[.!?]+/).filter(Boolean);
  const sentenceCount = Math.max(1, sentences.length);
  const wordCount = words.length;

  let syllableCount = 0;
  for (const word of words) {
    const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleanWord.length <= 3) {
      syllableCount += 1;
      continue;
    }
    const matches = cleanWord.match(/[aeiouy]{1,2}/g);
    syllableCount += matches ? matches.length : 1;
    if (cleanWord.endsWith('e')) syllableCount = Math.max(1, syllableCount - 1);
  }

  const score = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function auditText(text: string, tier: ScrubTier = 'strict'): AuditResult {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = Math.max(1, words.length);

  const blockers: string[] = [];
  const warnings: string[] = [];
  const paragraphScores: ParagraphScore[] = [];

  let totalTellHits = 0;

  paragraphs.forEach((para, pIdx) => {
    const hits: TellHit[] = [];

    // Check words
    for (const item of AI_TELL_WORDS) {
      const regex = new RegExp(`\\b${item.word}\\b`, 'gi');
      if (regex.test(para)) {
        hits.push({
          matchedText: item.word,
          reason: item.reason
        });
        if (item.fatal && !blockers.includes(`Fatal AI tell: "${item.word}"`)) {
          blockers.push(`Fatal AI tell: "${item.word}"`);
        }
      }
    }

    // Check reveal bridges
    for (const bridge of REVEAL_BRIDGES) {
      if (para.toLowerCase().includes(bridge.phrase.toLowerCase())) {
        hits.push({
          matchedText: bridge.phrase,
          reason: bridge.reason
        });
        if (!warnings.includes(`Reveal bridge detected: "${bridge.phrase}"`)) {
          warnings.push(`Reveal bridge detected: "${bridge.phrase}"`);
        }
      }
    }

    // Check staccato trios
    for (const trio of STACCATO_TRIOS) {
      if (trio.pattern.test(para)) {
        hits.push({
          matchedText: "Staccato 3-sentence buzz run",
          reason: trio.reason
        });
        if (!warnings.includes("Staccato 3-phrase buzz run detected")) {
          warnings.push("Staccato 3-phrase buzz run detected (hurts algorithmic authenticity)");
        }
      }
    }

    // Check em dash density
    const emDashMatches = para.match(/—/g);
    if (emDashMatches && emDashMatches.length > 2) {
      hits.push({
        matchedText: `${emDashMatches.length} em-dashes`,
        reason: 'Excessive em-dash density (>1 per 100 words)'
      });
    }

    // Check engagement bait
    if (/tag someone who needs to hear this/i.test(para) || /drop a comment below/i.test(para)) {
      hits.push({
        matchedText: "Engagement bait CTA",
        reason: "Penalized by March 2026 authenticity algorithm"
      });
      if (!blockers.includes("Engagement-bait CTA detected")) {
        blockers.push("Engagement-bait CTA detected (triggers July 2026 AI slop filter)");
      }
    }

    totalTellHits += hits.length;

    let status: 'clean' | 'borderline' | 'flagged' = 'clean';
    let suggestedAction = 'Keep';

    if (hits.length >= 3) {
      status = 'flagged';
      suggestedAction = 'Rewrite Paragraph';
    } else if (hits.length >= 1) {
      status = 'borderline';
      suggestedAction = 'Trim markers';
    }

    paragraphScores.push({
      index: pIdx,
      text: para,
      count: hits.length,
      hits,
      status,
      suggestedAction
    });
  });

  // Structural checks
  const firstLine = text.trim().split('\n')[0] || '';
  if (firstLine.length > 210) {
    warnings.push(`Opening hook line is ${firstLine.length} chars (exceeds mobile cutoff of 210 chars)`);
  }
  if (firstLine.trim().endsWith('?')) {
    warnings.push('Opening with a question (-34% median reach penalty in 2026 feed)');
  }
  if (!/\bP\.S\.\b/i.test(text)) {
    warnings.push('No P.S. closing note (P.S. notes increase comment section click-through by 28%)');
  }

  const tellDensity = Math.min(100, parseFloat(((totalTellHits / wordCount) * 100).toFixed(1)));
  const fleschScore = calculateFleschReadingEase(text);

  let readConfidence: 'Reads Human' | 'Mixed' | 'Flagged AI' = 'Reads Human';
  const flaggedCount = paragraphScores.filter(p => p.status === 'flagged').length;

  if (flaggedCount >= 1 || tellDensity > 2.5 || blockers.length > 0) {
    readConfidence = 'Flagged AI';
  } else if (tellDensity > 0.8 || paragraphScores.some(p => p.status === 'borderline')) {
    readConfidence = 'Mixed';
  }

  return {
    readConfidence,
    tellDensity,
    fleschScore,
    paragraphScores,
    blockers,
    warnings
  };
}

export function rewriteText(text: string, tier: ScrubTier = 'strict'): RewriteDiff {
  let rewritten = text;
  const changesApplied: RewriteChange[] = [];

  // Pass 1: Remove reveal bridges
  for (const bridge of REVEAL_BRIDGES) {
    const regex = new RegExp(`\\b${bridge.phrase}\\b\\s*`, 'gi');
    if (regex.test(rewritten)) {
      rewritten = rewritten.replace(regex, '');
      changesApplied.push({
        rule: 'Bridge Scrub',
        before: bridge.phrase,
        after: '',
        explanation: 'Removed formulaic reveal bridge to normalize reading flow.'
      });
    }
  }

  // Pass 2: Remove staccato buzz runs
  for (const trio of STACCATO_TRIOS) {
    if (trio.pattern.test(rewritten)) {
      rewritten = rewritten.replace(trio.pattern, '');
      changesApplied.push({
        rule: 'Trio Scrub',
        before: 'No excuses. No delays. Just execution.',
        after: '',
        explanation: 'Deleted synthetic staccato 3-word buzz cadence.'
      });
    }
  }

  // Pass 3: Vocabulary substitutions
  for (const item of AI_TELL_WORDS) {
    const regex = new RegExp(`\\b${item.word}\\b`, 'gi');
    if (regex.test(rewritten)) {
      rewritten = rewritten.replace(regex, item.replacement);
      changesApplied.push({
        rule: 'Vocabulary',
        before: item.word,
        after: item.replacement,
        explanation: item.reason
      });
    }
  }

  // Pass 4: Clean up em-dashes and formatting
  const emDashCount = (rewritten.match(/—/g) || []).length;
  if (emDashCount > 2) {
    let replaced = 0;
    rewritten = rewritten.replace(/—/g, match => {
      replaced++;
      return replaced > 2 ? ', ' : match;
    });
    changesApplied.push({
      rule: 'Em-Dash Cap',
      before: `${emDashCount} em-dashes`,
      after: 'Capped to 2',
      explanation: 'Normalized punctuation to under 1 em-dash per 100 words.'
    });
  }

  // Pass 5: Remove engagement bait closing
  if (/What do you think\?\s*Tag someone who needs to hear this!/i.test(rewritten)) {
    const beforeText = 'What do you think? Tag someone who needs to hear this!';
    const afterText = 'What is your team’s experience handling this bottleneck?';
    rewritten = rewritten.replace(/What do you think\?\s*Tag someone who needs to hear this!/i, afterText);
    changesApplied.push({
      rule: 'CTA Reframe',
      before: beforeText,
      after: afterText,
      explanation: 'Replaced penalized engagement bait with genuine technical discussion prompt.'
    });
  }

  // Normalize excessive blank lines
  rewritten = rewritten.replace(/\n{3,}/g, '\n\n').trim();

  return {
    original: text,
    rewritten,
    changesApplied
  };
}
