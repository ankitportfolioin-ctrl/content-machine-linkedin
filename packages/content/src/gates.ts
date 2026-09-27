import { checkBannedWords, checkReceiptLeakage } from './voice';
import { checkThesisPreservation } from './thesis';
import { validateFormatStructure } from './strategy';
import { DraftValidationFinding } from './evidence';
import { ContentFormatKind, GateResult, GateStatus } from './types';

const INTERNAL_MARKUP = [
  '[SLIDE',
  '[HOOK]',
  '[CTA]',
  '[HOOK',
  '```json',
  '```',
  '{{',
  '}}',
  'GENERATION INSTRUCTIONS',
  'INTERNAL:',
  '<!--',
];

const PLACEHOLDERS = ['lorem ipsum', 'todo', '[insert', '[todo', 'tbd', 'xxx', 'placeholder text'];

function rankStatus(statuses: GateStatus[]): GateStatus {
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  if (statuses.includes('REVIEW_REQUIRED')) return 'REVIEW_REQUIRED';
  if (statuses.includes('WARN')) return 'WARN';
  return 'PASS';
}

export interface GateInput {
  draftBody: string;
  structure?: unknown;
  format?: ContentFormatKind | null;
  planThesis?: string | null;
  draftThesis?: string | null;
  bannedWords?: string[];
  receiptFacts?: string[];
  boundEvidenceTexts?: string[];
  evidenceFindings?: DraftValidationFinding[];
  evidenceCoverage?: number;
  contradictionPresent?: boolean;
  contradictionSeverity?: string | null;
  existingTitles?: string[];
  cta?: string | null;
}

export interface GateRunResult {
  results: GateResult[];
  finalStatus: GateStatus;
  overallScore: number;
  dimensions: Array<{ name: string; score: number }>;
}

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

export function runQualityGates(input: GateInput): GateRunResult {
  const results: GateResult[] = [];
  const push = (gate: string, status: GateStatus, severity: GateResult['severity'], message: string, evidence: string[] = []) => {
    results.push({ gate, status, severity, message, evidence });
  };

  // 1. Thesis fidelity
  if (input.planThesis && input.draftThesis) {
    const check = checkThesisPreservation(input.planThesis, input.draftThesis);
    push('thesis_fidelity',
      check.verdict === 'OK' ? 'PASS' : check.verdict,
      check.verdict === 'BLOCKED' ? 'CRITICAL' : check.verdict === 'REVIEW_REQUIRED' ? 'HIGH' : 'LOW',
      check.explanation);
  } else {
    push('thesis_fidelity', 'REVIEW_REQUIRED', 'MEDIUM', 'Draft thesis unavailable for comparison.');
  }

  // 2. Evidence coverage
  const coverage = input.evidenceCoverage ?? 0;
  const hasFindings = (input.evidenceFindings ?? []).length > 0;
  if ((input.evidenceFindings ?? []).some((f) => f.severity === 'BLOCKED')) {
    push('evidence_coverage', 'BLOCKED', 'CRITICAL', 'Blocking evidence findings exist (invented statistics, overreach, or contradicted claims).',
      (input.evidenceFindings ?? []).filter((f) => f.severity === 'BLOCKED').map((f) => `${f.kind}: ${f.span.slice(0, 120)}`));
  } else if (hasFindings) {
    push('evidence_coverage', 'REVIEW_REQUIRED', 'HIGH', 'Evidence findings require human review.',
      (input.evidenceFindings ?? []).map((f) => `${f.kind}: ${f.span.slice(0, 120)}`));
  } else if (coverage < 0.5) {
    push('evidence_coverage', 'REVIEW_REQUIRED', 'MEDIUM', `Evidence coverage is low (${Math.round(coverage * 100)}%). Bind more factual claims to SourceClaims.`);
  } else {
    push('evidence_coverage', 'PASS', 'LOW', `Evidence coverage ${Math.round(coverage * 100)}%.`);
  }

  // 3. Statistics grounding is covered by evidence findings; add explicit gate
  const statBlocked = (input.evidenceFindings ?? []).some((f) => f.kind === 'UNSUPPORTED_STATISTIC');
  push('statistics_grounding',
    statBlocked ? 'BLOCKED' : 'PASS',
    statBlocked ? 'CRITICAL' : 'LOW',
    statBlocked ? 'Unsupported statistics detected.' : 'No unsupported statistics detected.');

  // 4. Contradiction
  if (input.contradictionPresent) {
    const high = (input.contradictionSeverity || '').toUpperCase() === 'HIGH' || (input.contradictionSeverity || '').toUpperCase() === 'CRITICAL';
    push('contradiction', high ? 'BLOCKED' : 'REVIEW_REQUIRED', high ? 'CRITICAL' : 'HIGH',
      high ? 'High-severity contradiction present. Resolve before approval.' : 'Contradiction present. Review which claim the draft follows.');
  } else {
    push('contradiction', 'PASS', 'LOW', 'No contradiction flagged.');
  }

  // 5. Format structure
  if (input.format && input.structure !== undefined) {
    const validation = validateFormatStructure(input.format, input.structure);
    push('format_structure',
      validation.ok ? 'PASS' : 'BLOCKED',
      validation.ok ? 'LOW' : 'HIGH',
      validation.ok ? `${input.format} structure valid.` : (validation as { reason: string }).reason);
  } else if (input.format) {
    push('format_structure', 'REVIEW_REQUIRED', 'MEDIUM', 'No structured payload supplied for format validation.');
  } else {
    push('format_structure', 'REVIEW_REQUIRED', 'MEDIUM', 'Format unknown.');
  }

  // 6. Voice compliance (banned words)
  const violations = checkBannedWords(input.draftBody, input.bannedWords ?? []);
  if (violations.length > 0) {
    push('voice_compliance', 'BLOCKED', 'HIGH',
      `Banned words detected: ${violations.map((v) => `${v.word} x${v.occurrences}`).join(', ')}.`,
      violations.map((v) => v.word));
  } else {
    push('voice_compliance', 'PASS', 'LOW', 'No banned words detected.');
  }

  // 7. Voice leakage
  const leakage = checkReceiptLeakage(input.draftBody, input.receiptFacts ?? [], input.boundEvidenceTexts ?? []);
  if (leakage.length > 0) {
    push('voice_leakage', 'REVIEW_REQUIRED', 'MEDIUM',
      'Verified-receipt phrasing appears without supporting evidence binding. Confirm relevance or remove.',
      leakage.map((l) => l.receiptFact.slice(0, 120)));
  } else {
    push('voice_leakage', 'PASS', 'LOW', 'No receipt leakage detected.');
  }

  // 8. Repetition
  const sentences = sentencesOf(input.draftBody);
  const seen = new Map<string, number>();
  for (const s of sentences) {
    const key = s.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const repeated = [...seen.entries()].filter(([sentence, count]) => count > 1 && sentence.length > 20);
  if (repeated.length > 0) {
    push('repetition', 'REVIEW_REQUIRED', 'MEDIUM', `Repeated sentences detected (${repeated.length}).`, repeated.map(([s]) => s.slice(0, 120)));
  } else {
    push('repetition', 'PASS', 'LOW', 'No repeated sentences detected.');
  }

  // 9. Duplicate content
  const titleGuess = sentences[0] ?? '';
  const duplicate = (input.existingTitles ?? []).some((t) => t.trim().toLowerCase() === titleGuess.trim().toLowerCase() && titleGuess.length > 0);
  if (duplicate) {
    push('duplicate_content', 'REVIEW_REQUIRED', 'MEDIUM', 'Identical opening/title already exists in this workspace.');
  } else {
    push('duplicate_content', 'PASS', 'LOW', 'No duplicate title detected.');
  }

  // 10. Malformed output / empty sections
  if (!input.draftBody || input.draftBody.trim().length < 50) {
    push('malformed_output', 'BLOCKED', 'HIGH', 'Draft body is empty or too short to be valid content.');
  } else {
    push('malformed_output', 'PASS', 'LOW', 'Draft body present.');
  }
  const emptySectionMarkers = (input.draftBody.match(/^(#+\s*$|-\s*$)/gm) ?? []).length;
  if (emptySectionMarkers > 0) {
    push('empty_sections', 'REVIEW_REQUIRED', 'MEDIUM', `${emptySectionMarkers} empty section(s) detected.`);
  } else {
    push('empty_sections', 'PASS', 'LOW', 'No empty sections detected.');
  }

  // 11. Internal markup
  const markupHits = INTERNAL_MARKUP.filter((m) => input.draftBody.toUpperCase().includes(m.toUpperCase()));
  if (markupHits.length > 0) {
    push('internal_markup', 'BLOCKED', 'CRITICAL', `Internal markup exposed: ${markupHits.join(', ')}.`, markupHits);
  } else {
    push('internal_markup', 'PASS', 'LOW', 'No internal markup detected.');
  }

  // 12. Placeholder detection
  const placeholderHits = PLACEHOLDERS.filter((p) => input.draftBody.toLowerCase().includes(p));
  if (placeholderHits.length > 0) {
    push('placeholder_detection', 'BLOCKED', 'HIGH', `Placeholder text detected: ${placeholderHits.join(', ')}.`, placeholderHits);
  } else {
    push('placeholder_detection', 'PASS', 'LOW', 'No placeholder text detected.');
  }

  // 13. Source fidelity (roll-up of evidence validator)
  const overreach = (input.evidenceFindings ?? []).some((f) => f.kind === 'OVERREACH');
  push('source_fidelity',
    overreach ? 'BLOCKED' : hasFindings ? 'REVIEW_REQUIRED' : 'PASS',
    overreach ? 'CRITICAL' : hasFindings ? 'HIGH' : 'LOW',
    overreach ? 'Evidence overreach detected: draft stronger than sources.' : hasFindings ? 'Evidence findings need review.' : 'Draft consistent with bound evidence.');

  // 14. CTA validity
  if (input.cta && input.cta.trim().length > 0) {
    const ctaLower = input.cta.toLowerCase();
    const hasOutcomePromise = /(guarantee|guaranteed|10x|100x|overnight|instant results|get rich)/.test(ctaLower);
    if (hasOutcomePromise) {
      push('cta_validity', 'REVIEW_REQUIRED', 'MEDIUM', 'CTA promises outcomes. Confirm the promise is supported.');
    } else {
      push('cta_validity', 'PASS', 'LOW', 'CTA present and unobjectionable.');
    }
  } else {
    push('cta_validity', 'PASS', 'LOW', 'No CTA supplied; none required.');
  }

  // 15. Hook quality (structural only; semantic hook checks live in hook.ts)
  push('hook_quality', 'PASS', 'LOW', 'Hook semantic checks run in the hook engine when a hook is generated.');

  const finalStatus = rankStatus(results.map((r) => r.status));

  // Secondary score: PASS-heavy dimensions average. NEVER overrides finalStatus.
  const scoreOf = (s: string) => (s === 'PASS' ? 1 : s === 'WARN' ? 0.7 : s === 'REVIEW_REQUIRED' ? 0.4 : 0);
  const dimensions = results.map((r) => ({ name: r.gate, score: scoreOf(r.status) }));
  const overallScore = Math.round((dimensions.reduce((a, d) => a + d.score, 0) / Math.max(1, dimensions.length)) * 100) / 100;

  return { results, finalStatus, overallScore, dimensions };
}
