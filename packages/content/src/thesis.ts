import { ThesisCheck } from './types';

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'has', 'had',
  'will', 'would', 'could', 'should', 'there', 'their', 'about', 'which',
  'when', 'where', 'what', 'who', 'how', 'why', 'because', 'then', 'than',
  'into', 'your', 'you', 'our', 'are', 'was', 'were', 'been', 'being',
]);

function contentTokens(text: string): Set<string> {
  return new Set(normalize(text).filter((w) => !STOPWORDS.has(w)));
}

/**
 * Checks whether a candidate thesis preserves the original thesis.
 * - Byte-identical (after normalization) → OK
 * - High token overlap (>= 0.5 Jaccard) → OK (acceptable wording variation)
 * - Low overlap (< 0.2) or empty candidate → BLOCKED
 * - Otherwise → REVIEW_REQUIRED
 */
export function checkThesisPreservation(original: string, candidate: string): ThesisCheck {
  const normOriginal = original.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normCandidate = candidate.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!normCandidate) {
    return { verdict: 'BLOCKED', similarity: 0, explanation: 'Candidate thesis is empty.' };
  }

  if (normOriginal === normCandidate || normCandidate.includes(normOriginal) || normOriginal.includes(normCandidate)) {
    return { verdict: 'OK', similarity: 1, explanation: 'Thesis preserved verbatim.' };
  }

  const originalTokens = contentTokens(original);
  const candidateTokens = contentTokens(candidate);

  if (originalTokens.size === 0 || candidateTokens.size === 0) {
    return { verdict: 'REVIEW_REQUIRED', similarity: 0, explanation: 'Thesis too short to compare reliably.' };
  }

  let intersection = 0;
  for (const token of candidateTokens) {
    if (originalTokens.has(token)) intersection++;
  }
  const union = originalTokens.size + candidateTokens.size - intersection;
  const similarity = union === 0 ? 0 : intersection / union;

  if (similarity >= 0.5) {
    return { verdict: 'OK', similarity, explanation: `Thesis wording varies but core terms preserved (similarity ${similarity.toFixed(2)}).` };
  }
  if (similarity < 0.2) {
    return { verdict: 'BLOCKED', similarity, explanation: `Major semantic drift detected (similarity ${similarity.toFixed(2)}). Candidate does not reflect the original thesis.` };
  }
  return { verdict: 'REVIEW_REQUIRED', similarity, explanation: `Possible thesis drift (similarity ${similarity.toFixed(2)}). Human review required.` };
}
