export interface VoiceInputs {
  profile?: {
    role?: string | null;
    headline?: string | null;
    professionalContext?: string | null;
    industry?: string | null;
  } | null;
  voiceProfile?: {
    role?: string | null;
    headline?: string | null;
    professionalContext?: string | null;
    tone?: string | null;
    writingStyle?: string | null;
    bannedWords?: string[];
    preferredVocabulary?: string[];
    contentPillars?: string[];
  } | null;
  receipts?: Array<{ fact: string; context?: string | null }>;
  samples?: Array<{ title?: string | null; content: string }>;
}

export interface VoiceContext {
  instructions: string;
  bannedWords: string[];
  preferredVocabulary: string[];
  pillars: string[];
  receiptFacts: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Assembles INTERNAL voice context. The returned instructions must never be
 * rendered into user-visible content; they guide generation only.
 */
export function assembleVoiceContext(inputs: VoiceInputs): VoiceContext {
  const lines: string[] = [];
  const role = inputs.voiceProfile?.role || inputs.profile?.role;
  const headline = inputs.voiceProfile?.headline || inputs.profile?.headline;
  const context = inputs.voiceProfile?.professionalContext || inputs.profile?.professionalContext;
  const industry = inputs.profile?.industry;
  if (role) lines.push(`Author role: ${role}.`);
  if (headline) lines.push(`Author headline: ${headline}.`);
  if (context) lines.push(`Professional context: ${context}.`);
  if (industry) lines.push(`Industry context: ${industry}.`);
  if (inputs.voiceProfile?.tone) lines.push(`Tone: ${inputs.voiceProfile.tone}.`);
  if (inputs.voiceProfile?.writingStyle) lines.push(`Writing style: ${inputs.voiceProfile.writingStyle}.`);
  if (inputs.voiceProfile?.contentPillars && inputs.voiceProfile.contentPillars.length > 0) {
    lines.push(`Content pillars: ${inputs.voiceProfile.contentPillars.join('; ')}.`);
  }
  if (inputs.voiceProfile?.preferredVocabulary && inputs.voiceProfile.preferredVocabulary.length > 0) {
    lines.push(`Preferred vocabulary: ${inputs.voiceProfile.preferredVocabulary.join(', ')}.`);
  }
  lines.push('Write in the author\u2019s voice. Do not paste profile fields, receipts, or samples into the content.');

  return {
    instructions: lines.join('\n'),
    bannedWords: [...(inputs.voiceProfile?.bannedWords ?? [])],
    preferredVocabulary: [...(inputs.voiceProfile?.preferredVocabulary ?? [])],
    pillars: [...(inputs.voiceProfile?.contentPillars ?? [])],
    receiptFacts: (inputs.receipts ?? []).map((r) => r.fact),
  };
}

export interface BannedWordViolation {
  word: string;
  occurrences: number;
}

/**
 * Case-insensitive banned-word check with word boundaries, so a configured
 * word only matches whole words (e.g. "leverage" does not match "leveraged"
 * unless the user configured a stem rule — which this checker does not infer).
 */
export function checkBannedWords(text: string, bannedWords: string[]): BannedWordViolation[] {
  const violations: BannedWordViolation[] = [];
  for (const raw of bannedWords) {
    const word = raw.trim();
    if (!word) continue;
    const matches = text.match(new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi'));
    if (matches && matches.length > 0) {
      violations.push({ word, occurrences: matches.length });
    }
  }
  return violations;
}

function normalizeFragment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface LeakageFinding {
  receiptFact: string;
  supportedByEvidence: boolean;
}

/**
 * Flags verified-receipt phrases appearing in the draft. A receipt phrase is
 * only acceptable when the draft also carries an evidence binding that
 * references supporting material; otherwise it is flagged REVIEW_REQUIRED
 * (receipts are evidence, not decoration).
 */
export function checkReceiptLeakage(
  text: string,
  receiptFacts: string[],
  boundEvidenceTexts: string[]
): LeakageFinding[] {
  const findings: LeakageFinding[] = [];
  const normalizedText = normalizeFragment(text);
  const normalizedEvidence = boundEvidenceTexts.map(normalizeFragment).join(' | ');
  for (const fact of receiptFacts) {
    const normalizedFact = normalizeFragment(fact);
    if (normalizedFact.length < 20) continue;
    if (!normalizedText.includes(normalizedFact)) continue;
    const supportedByEvidence = normalizedEvidence.length > 0 && normalizedEvidence.includes(normalizedFact);
    if (!supportedByEvidence) {
      findings.push({ receiptFact: fact, supportedByEvidence: false });
    }
  }
  return findings;
}
