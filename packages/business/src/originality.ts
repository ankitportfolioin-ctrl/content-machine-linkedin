function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function shingles(text: string, n = 5): Set<string> {
  const tokens = normalize(text).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) {
    out.add(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

export interface OriginalityResult {
  status: 'PASS' | 'WARNING' | 'FAIL';
  jaccard: number;
  longestCommonSubstringChars: number;
  explanation: string;
  guidance: string;
}

function longestCommonSubstringLen(a: string, b: string, cap = 2000): number {
  const A = normalize(a).slice(0, cap);
  const B = normalize(b).slice(0, cap);
  if (!A || !B) return 0;
  let best = 0;
  const prev = new Array(B.length + 1).fill(0);
  for (let i = 1; i <= A.length; i++) {
    let diag = 0;
    for (let j = 1; j <= B.length; j++) {
      const tmp = prev[j]!;
      if (A[i - 1] === B[j - 1]) {
        prev[j] = diag + 1;
        if (prev[j]! > best) best = prev[j]!;
      } else {
        prev[j] = 0;
      }
      diag = tmp;
    }
    if (best > 200) return best;
  }
  return best;
}

/**
 * Originality Engine: SOURCE -> UNDERSTAND -> NEW ANGLE -> ORIGINAL OUTPUT.
 * Pure function. Never calls external services. Compares draft against source texts.
 * Thresholds are conservative and documented; borderline cases return WARNING with evidence.
 */
export function checkOriginality(draft: string, sources: Array<{ id: string; text: string }>): OriginalityResult {
  if (!draft || draft.trim().length < 20) {
    return {
      status: 'FAIL',
      jaccard: 0,
      longestCommonSubstringChars: 0,
      explanation: 'Draft too short to assess originality.',
      guidance: 'Write an original explanation of at least a few sentences; do not copy source wording.',
    };
  }
  if (sources.length === 0) {
    return {
      status: 'WARNING',
      jaccard: 0,
      longestCommonSubstringChars: 0,
      explanation: 'No source texts supplied; originality assessed as unverifiable.',
      guidance: 'Attach source material the draft was derived from, then re-run the check.',
    };
  }
  const draftShingles = shingles(draft);
  let bestJ = 0;
  let bestLcs = 0;
  let bestId = '';
  for (const s of sources) {
    const sSh = shingles(s.text);
    const inter = [...draftShingles].filter((x) => sSh.has(x)).length;
    const union = new Set([...draftShingles, ...sSh]).size;
    const j = union === 0 ? 0 : inter / union;
    const lcs = longestCommonSubstringLen(draft, s.text);
    if (j > bestJ) {
      bestJ = j;
      bestId = s.id;
    }
    if (lcs > bestLcs) bestLcs = lcs;
  }

  if (bestLcs >= 120 || bestJ >= 0.35) {
    return {
      status: 'FAIL',
      jaccard: Math.round(bestJ * 1000) / 1000,
      longestCommonSubstringChars: bestLcs,
      explanation: `Draft too similar to source ${bestId} (jaccard=${bestJ.toFixed(3)}, longest verbatim run ~${bestLcs} chars). Learn facts, rewrite angle/examples in your own words.`,
      guidance: 'SOURCE -> UNDERSTAND FACTS -> NEW ANGLE -> ORIGINAL EXAMPLES. Do not reuse hooks, structure, or phrasing.',
    };
  }
  if (bestLcs >= 60 || bestJ >= 0.15) {
    return {
      status: 'WARNING',
      jaccard: Math.round(bestJ * 1000) / 1000,
      longestCommonSubstringChars: bestLcs,
      explanation: `Possible close paraphrase of source ${bestId} (jaccard=${bestJ.toFixed(3)}, run ~${bestLcs} chars). Review and rewrite flagged passages.`,
      guidance: 'Rewrite examples and transitions; keep only facts, not wording.',
    };
  }
  return {
    status: 'PASS',
    jaccard: Math.round(bestJ * 1000) / 1000,
    longestCommonSubstringChars: bestLcs,
    explanation: `No substantial overlap detected (best jaccard=${bestJ.toFixed(3)}, run ~${bestLcs} chars).`,
    guidance: 'Proceed; keep source citations for facts.',
  };
}
