import { GateResult, GateStatus } from './types';
import { validatePersonalization } from './strategy';

const INTERNAL_MARKUP = ['[SLIDE', '[HOOK]', '[HOOK', '[CTA]', '```', '{{', '}}', 'GENERATION INSTRUCTIONS', 'INTERNAL:'];
const PLACEHOLDERS = ['lorem ipsum', 'todo', '[insert', '[todo', 'tbd', 'xxx', 'placeholder text'];
const SPAM_MARKERS = [
  'guaranteed', 'guarantee', '10x', '100x', 'overnight success', 'get rich',
  'act now', 'limited time', 'once in a lifetime', 'risk-free', 'no-brainer',
  'blast', 'spray and pray',
];

function rankStatus(statuses: GateStatus[]): GateStatus {
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  if (statuses.includes('REVIEW_REQUIRED')) return 'REVIEW_REQUIRED';
  return 'PASS';
}

export interface OutreachGateInput {
  body: string;
  qualificationStatus?: string | null;
  evidenceRefs?: string[];
  personalizationStatements?: string[];
  contradictionPresent?: boolean;
  contradictionSeverity?: string | null;
  existingBodies?: string[];
  cta?: string | null;
  draftType?: string | null;
}

export interface OutreachGateRun {
  results: GateResult[];
  finalStatus: GateStatus;
  overallScore: number;
  dimensions: Array<{ name: string; score: number }>;
}

export function runOutreachGates(input: OutreachGateInput): OutreachGateRun {
  const results: GateResult[] = [];
  const push = (gate: string, status: GateStatus, severity: GateResult['severity'], message: string, evidence: string[] = []) => {
    results.push({ gate, status, severity, message, evidence });
  };
  const text: string = input.body ?? '';

  // 1. prospect_fit
  if (!input.qualificationStatus || input.qualificationStatus === 'INSUFFICIENT_DATA') {
    push('prospect_fit', 'REVIEW_REQUIRED', 'MEDIUM', 'Qualification unknown. Confirm fit before approving outreach.');
  } else if (input.qualificationStatus === 'UNQUALIFIED') {
    push('prospect_fit', 'BLOCKED', 'CRITICAL', 'Prospect is UNQUALIFIED. Outreach must not proceed.');
  } else {
    push('prospect_fit', 'PASS', 'LOW', `Qualification status: ${input.qualificationStatus}.`);
  }

  // 2. evidence_grounding
  const refs = input.evidenceRefs ?? [];
  if (refs.length === 0) {
    push('evidence_grounding', 'REVIEW_REQUIRED', 'MEDIUM', 'No evidence references attached to this draft.');
  } else {
    push('evidence_grounding', 'PASS', 'LOW', `${refs.length} evidence reference(s) attached.`);
  }

  // 3. personalization_grounding
  const personalization = validatePersonalization(input.personalizationStatements ?? [], refs.map((r) => r));
  push('personalization_grounding',
    personalization.ok ? 'PASS' : 'BLOCKED',
    personalization.ok ? 'LOW' : 'CRITICAL',
    personalization.ok ? 'Personalization grounded or absent.' : (personalization as { reason: string }).reason);

  // 4. unsupported_claims (numbers without evidence)
  const numbers = text.match(/\d+(\.\d+)?/g) ?? [];
  const evidenceText = refs.join(' | ');
  const unsupportedNumbers = numbers.filter((n) => !evidenceText.includes(n));
  if (unsupportedNumbers.length > 0) {
    push('unsupported_claims', 'BLOCKED', 'CRITICAL', `Numbers without evidence (${unsupportedNumbers.slice(0, 3).join(', ')}). Remove or ground them.`, unsupportedNumbers.slice(0, 3));
  } else {
    push('unsupported_claims', 'PASS', 'LOW', 'No unsupported numbers detected.');
  }

  // 5. fabricated_details (absolute achievement/social-proof language)
  const fabricated = /\b(congrats on your (recent )?funding|as a fellow (alum|graduate)|we met at|following up on our call|per our conversation)\b/i.test(text)
    && refs.length === 0;
  push('fabricated_details',
    fabricated ? 'BLOCKED' : 'PASS',
    fabricated ? 'CRITICAL' : 'LOW',
    fabricated ? 'Draft asserts relationship events or achievements with no evidence.' : 'No fabricated relationship details detected.');

  // 6. contradiction
  if (input.contradictionPresent) {
    const high = ['HIGH', 'CRITICAL'].includes((input.contradictionSeverity || '').toUpperCase());
    push('contradiction', high ? 'BLOCKED' : 'REVIEW_REQUIRED', high ? 'CRITICAL' : 'HIGH',
      high ? 'High-severity contradiction present.' : 'Contradiction present; review which claim the draft follows.');
  } else {
    push('contradiction', 'PASS', 'LOW', 'No contradiction flagged.');
  }

  // 7. relevance
  if (text.trim().length < 60) {
    push('relevance', 'REVIEW_REQUIRED', 'MEDIUM', 'Draft is very short; confirm it carries real relevance.');
  } else {
    push('relevance', 'PASS', 'LOW', 'Draft carries substantive content.');
  }

  // 8. clarity (extreme length / unreadable blocks)
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const longSentences = sentences.filter((s) => s.split(/\s+/).length > 45);
  if (longSentences.length > 0) {
    push('clarity', 'REVIEW_REQUIRED', 'LOW', `${longSentences.length} very long sentence(s). Consider splitting.`);
  } else {
    push('clarity', 'PASS', 'LOW', 'Sentence lengths acceptable.');
  }

  // 9. spamminess
  const spamHits = SPAM_MARKERS.filter((m) => text.toLowerCase().includes(m));
  if (spamHits.length > 0) {
    push('spamminess', 'BLOCKED', 'HIGH', `Spam markers detected: ${spamHits.join(', ')}.`, spamHits);
  } else {
    push('spamminess', 'PASS', 'LOW', 'No spam markers detected.');
  }

  // 10. CTA validity
  if (input.cta && /(guarantee|10x|overnight|get rich|act now)/i.test(input.cta)) {
    push('cta_validity', 'REVIEW_REQUIRED', 'MEDIUM', 'CTA promises outcomes or urgency. Confirm it is supported.');
  } else {
    push('cta_validity', 'PASS', 'LOW', 'CTA acceptable or absent.');
  }

  // 11. tone (shouting / excessive formatting)
  const shouty = (text.match(/[A-Z]{6,}/g) ?? []).length;
  const exclamations = (text.match(/!/g) ?? []).length;
  if (shouty > 0 || exclamations > 3) {
    push('tone', 'REVIEW_REQUIRED', 'LOW', 'Tone check: all-caps runs or excessive exclamation marks.');
  } else {
    push('tone', 'PASS', 'LOW', 'Tone acceptable.');
  }

  // 12. length (per draft type guidance)
  if (text.length > 3000) {
    push('length', 'REVIEW_REQUIRED', 'LOW', 'Draft is long for outreach; confirm every paragraph earns its place.');
  } else {
    push('length', 'PASS', 'LOW', 'Length acceptable.');
  }

  // 13. duplicate_message
  const normalized = text.trim().toLowerCase();
  const duplicate = (input.existingBodies ?? []).some((b) => b.trim().toLowerCase() === normalized && normalized.length > 0);
  push('duplicate_message',
    duplicate ? 'REVIEW_REQUIRED' : 'PASS',
    duplicate ? 'MEDIUM' : 'LOW',
    duplicate ? 'Identical message body already exists in this workspace.' : 'No duplicate detected.');

  // 14. internal_markup
  const markupHits = INTERNAL_MARKUP.filter((m) => text.toUpperCase().includes(m.toUpperCase()));
  if (markupHits.length > 0) {
    push('internal_markup', 'BLOCKED', 'CRITICAL', `Internal markup exposed: ${markupHits.join(', ')}.`, markupHits);
  } else {
    push('internal_markup', 'PASS', 'LOW', 'No internal markup detected.');
  }

  // 15. privacy_boundary
  const privacyHits = /\b(home address|personal (phone|email)|salary|compensation|medical|health condition|political|religion)\b/i.test(text);
  push('privacy_boundary',
    privacyHits ? 'BLOCKED' : 'PASS',
    privacyHits ? 'CRITICAL' : 'LOW',
    privacyHits ? 'Draft touches private personal data. Remove it.' : 'No private personal data detected.');

  // Placeholder scan folded into malformed output honesty:
  const placeholderHits = PLACEHOLDERS.filter((p) => text.toLowerCase().includes(p));
  if (placeholderHits.length > 0) {
    push('placeholder_detection', 'BLOCKED', 'HIGH', `Placeholder text detected: ${placeholderHits.join(', ')}.`, placeholderHits);
  }

  const finalStatus = rankStatus(results.map((r) => r.status));
  const scoreOf = (s: string) => (s === 'PASS' ? 1 : s === 'REVIEW_REQUIRED' ? 0.4 : 0);
  const dimensions = results.map((r) => ({ name: r.gate, score: scoreOf(r.status) }));
  const overallScore = Math.round((dimensions.reduce((a, d) => a + d.score, 0) / Math.max(1, dimensions.length)) * 100) / 100;
  return { results, finalStatus, overallScore, dimensions };
}
