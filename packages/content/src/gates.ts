import { checkBannedWords, checkReceiptLeakage } from './voice';
import { checkThesisPreservation } from './thesis';
import { validateFormatStructure } from './strategy';
import { DraftValidationFinding } from './evidence';
import { ContentFormatKind, GateResult, GateStatus } from './types';

export interface YFPQualityGateInput extends GateInput {
  workspaceProfile?: string;
  icp?: string;
  audienceProblems?: Array<{ problem: string; audience: string }>;
  sourceTypes?: string[];
  topicCategory?: string;
}

export interface YFPQualityGateResult extends GateRunResult {
  yfpDimensions: Array<{
    name: 'relevance' | 'educational_value' | 'originality' | 'accuracy' | 'structure' | 'business_alignment';
    score: number;
    maxScore: number;
    status: GateStatus;
    evidence: string[];
  }>;
  yfpOverallScore: number;
}

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

const YFP_CATEGORIES = [
  'AI news and new AI tools',
  'Latest technology updates',
  'Vibe coding and AI-assisted development',
  'Beginner-friendly coding tutorials',
  'Practical AI use cases',
  'Free tools and platforms',
  'Web development and rapid prototyping',
  'AI workflow automation',
  'Freelancing and client acquisition',
  'Real-world project building',
  'Common beginner problems and solutions',
  'Startup and developer productivity tips',
];

const BEGINNER_INDICATORS = [
  'beginner', 'start', 'first', 'basic', 'intro', 'fundamental',
  'step-by-step', 'tutorial', 'guide', 'how to', 'learn',
  'simple', 'easy', 'from scratch', 'zero to', 'complete guide',
];

const HYPE_INDICATORS = [
  'guaranteed', 'overnight', 'instant', '10x', '100x',
  'get rich', 'passive income', 'effortless', 'secret',
  'hack', 'trick', 'magic', 'revolutionary', 'game-changer',
];

const UNSUPPORTED_CLAIM_PATTERNS = [
  /studies show/i,
  /research proves/i,
  /experts agree/i,
  /data shows/i,
  /statistics indicate/i,
  /\d+% (of|more|less)/,
  /survey (found|revealed|shows)/i,
];

function runYFPQualityGates(input: YFPQualityGateInput): YFPQualityGateResult {
  const baseResult = runQualityGates(input);
  const yfpDimensions: YFPQualityGateResult['yfpDimensions'] = [];
  const pushYFP = (
    name: YFPQualityGateResult['yfpDimensions'][0]['name'],
    score: number,
    maxScore: number,
    status: GateStatus,
    evidence: string[]
  ) => {
    yfpDimensions.push({ name, score, maxScore, status, evidence });
  };

  // 1. Relevance (0-25)
  let relevanceScore = 0;
  const relevanceEvidence: string[] = [];

  if (input.topicCategory && YFP_CATEGORIES.some(c => c.toLowerCase().includes(input.topicCategory!.toLowerCase()))) {
    relevanceScore += 10;
    relevanceEvidence.push(`Topic matches YFP category: ${input.topicCategory}`);
  }

  if (input.audienceProblems && input.audienceProblems.length > 0) {
    relevanceScore += 8;
    relevanceEvidence.push(`${input.audienceProblems.length} audience problem(s) addressed`);
  }

  if (input.workspaceProfile && input.workspaceProfile.length > 20) {
    relevanceScore += 4;
    relevanceEvidence.push('Workspace profile defined');
  }

  if (input.icp && input.icp.length > 20) {
    relevanceScore += 3;
    relevanceEvidence.push('ICP defined');
  }

  pushYFP('relevance', Math.min(25, relevanceScore), 25,
    relevanceScore >= 15 ? 'PASS' : relevanceScore >= 8 ? 'REVIEW_REQUIRED' : 'BLOCKED',
    relevanceEvidence);

  // 2. Educational Value (0-20)
  let eduScore = 0;
  const eduEvidence: string[] = [];

  const bodyLower = input.draftBody.toLowerCase();
  const beginnerMatches = BEGINNER_INDICATORS.filter(kw => bodyLower.includes(kw)).length;
  if (beginnerMatches >= 3) {
    eduScore += 8;
    eduEvidence.push(`${beginnerMatches} beginner-friendly indicators`);
  } else if (beginnerMatches >= 1) {
    eduScore += 4;
    eduEvidence.push(`${beginnerMatches} beginner indicator(s)`);
  }

  const hasActionableSteps = /step \d|first,|second,|third,|next,|finally,/i.test(input.draftBody);
  if (hasActionableSteps) {
    eduScore += 6;
    eduEvidence.push('Actionable step-by-step structure detected');
  }

  const hasPracticalExample = /example|demo|walkthrough|case study|real world|practical/i.test(input.draftBody);
  if (hasPracticalExample) {
    eduScore += 6;
    eduEvidence.push('Practical example or case study included');
  }

  pushYFP('educational_value', Math.min(20, eduScore), 20,
    eduScore >= 12 ? 'PASS' : eduScore >= 6 ? 'REVIEW_REQUIRED' : 'BLOCKED',
    eduEvidence);

  // 3. Originality (0-15)
  let origScore = 0;
  const origEvidence: string[] = [];

  const hasPersonalVoice = /i (think|believe|found|discovered|learned|tried)/i.test(input.draftBody);
  if (hasPersonalVoice) {
    origScore += 5;
    origEvidence.push('Personal perspective/voice detected');
  }

  const hasUniqueAngle = input.draftBody.length > 500 && !/(introduction|conclusion|summary)/i.test(input.draftBody.slice(0, 200));
  if (hasUniqueAngle) {
    origScore += 5;
    origEvidence.push('Non-generic structure detected');
  }

  const hasSpecificDetails = /specifically|in particular|for example|such as|namely/i.test(input.draftBody);
  if (hasSpecificDetails) {
    origScore += 5;
    origEvidence.push('Specific details vs generic advice');
  }

  pushYFP('originality', Math.min(15, origScore), 15,
    origScore >= 8 ? 'PASS' : origScore >= 4 ? 'REVIEW_REQUIRED' : 'WARN',
    origEvidence);

  // 4. Accuracy (0-20)
  let accScore = 0;
  const accEvidence: string[] = [];

  const unsupportedClaims = UNSUPPORTED_CLAIM_PATTERNS.filter(pattern => pattern.test(input.draftBody)).length;
  if (unsupportedClaims === 0) {
    accScore += 10;
    accEvidence.push('No unsupported statistical claims detected');
  } else {
    accEvidence.push(`${unsupportedClaims} potential unsupported claim pattern(s) found`);
  }

  const hasSourceReferences = /source:|according to|reference:|\[source\]|\(source\)/i.test(input.draftBody);
  if (hasSourceReferences) {
    accScore += 5;
    accEvidence.push('Source references present');
  }

  const hasHedgeLanguage = /may|could|might|potentially|possibly|appears to|suggests/i.test(input.draftBody);
  if (hasHedgeLanguage) {
    accScore += 5;
    accEvidence.push('Appropriate hedge language for uncertain claims');
  }

  pushYFP('accuracy', Math.min(20, accScore), 20,
    accScore >= 12 ? 'PASS' : accScore >= 6 ? 'REVIEW_REQUIRED' : 'BLOCKED',
    accEvidence);

  // 5. Structure (0-10)
  let structScore = 0;
  const structEvidence: string[] = [];

  const hasHook = /^.{10,200}[.!?]/m.test(input.draftBody);
  if (hasHook) {
    structScore += 3;
    structEvidence.push('Clear opening hook present');
  }

  const hasClearSections = /^#{1,3}\s/m.test(input.draftBody) || /^\d+\.\s/m.test(input.draftBody);
  if (hasClearSections) {
    structScore += 4;
    structEvidence.push('Clear section structure');
  }

  const hasTakeaway = /takeaway|key point|remember|bottom line|in summary/i.test(input.draftBody);
  if (hasTakeaway) {
    structScore += 3;
    structEvidence.push('Clear takeaway/conclusion');
  }

  pushYFP('structure', Math.min(10, structScore), 10,
    structScore >= 7 ? 'PASS' : structScore >= 4 ? 'REVIEW_REQUIRED' : 'WARN',
    structEvidence);

  // 6. Business Alignment (0-10)
  let bizScore = 0;
  const bizEvidence: string[] = [];

  const yfpKeywords = ['project', 'build', 'freelance', 'client', 'portfolio', 'skill', 'learn', 'practical', 'real world', 'deploy', 'ship'];
  const yfpMatches = yfpKeywords.filter(kw => bodyLower.includes(kw)).length;
  if (yfpMatches >= 3) {
    bizScore += 5;
    bizEvidence.push(`${yfpMatches} YFP-aligned keywords`);
  } else if (yfpMatches >= 1) {
    bizScore += 2;
    bizEvidence.push(`${yfpMatches} YFP keyword(s)`);
  }

  const hypeMatches = HYPE_INDICATORS.filter(kw => bodyLower.includes(kw)).length;
  if (hypeMatches === 0) {
    bizScore += 5;
    bizEvidence.push('No hype/misleading language detected');
  } else {
    bizEvidence.push(`${hypeMatches} hype indicator(s) - review recommended`);
  }

  pushYFP('business_alignment', Math.min(10, bizScore), 10,
    bizScore >= 7 ? 'PASS' : bizScore >= 4 ? 'REVIEW_REQUIRED' : 'WARN',
    bizEvidence);

  const yfpOverallScore = yfpDimensions.reduce((sum, d) => sum + d.score, 0);
  const maxYFPScore = yfpDimensions.reduce((sum, d) => sum + d.maxScore, 0);
  const yfpPercentage = Math.round((yfpOverallScore / maxYFPScore) * 100);

  return {
    ...baseResult,
    yfpDimensions,
    yfpOverallScore: yfpPercentage,
  };
}

export { runYFPQualityGates };
