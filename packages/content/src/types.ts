export type ContentObjective =
  | 'EDUCATE'
  | 'EXPLAIN'
  | 'CHALLENGE'
  | 'BUILD_AUTHORITY'
  | 'SHARE_FRAMEWORK'
  | 'START_DISCUSSION'
  | 'TEACH_PRACTICAL'
  | 'ANALYZE'
  | 'REFRAME';

export type ContentAngle =
  | 'EDUCATIONAL'
  | 'CONTRARIAN'
  | 'PRACTICAL'
  | 'FRAMEWORK'
  | 'ANALYSIS'
  | 'OBSERVATION'
  | 'BREAKDOWN';

export type ContentFormatKind =
  | 'POST'
  | 'TEXT_POST'
  | 'ARTICLE'
  | 'CAROUSEL'
  | 'VIDEO'
  | 'POLL'
  | 'CHECKLIST'
  | 'FRAMEWORK'
  | 'CONTRARIAN';

export type ContentNarrative =
  | 'PROBLEM_WHY_SOLUTION'
  | 'OBSERVATION_ANALYSIS_IMPLICATION'
  | 'HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY'
  | 'MISTAKE_CONSEQUENCE_BETTER_APPROACH'
  | 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION';

export type GateStatus = 'PASS' | 'WARN' | 'REVIEW_REQUIRED' | 'BLOCKED';

export type GateSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface GateResult {
  gate: string;
  status: GateStatus;
  severity: GateSeverity;
  message: string;
  evidence: string[];
}

export type EvidenceStatus = 'SUPPORTED' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'CONTRADICTED';

export interface AudienceContext {
  primaryAudience: string;
  matchReason: string;
  assumedKnowledge: string;
  relevantNeeds: string[];
  appropriateLanguage: string;
  exclusionsConsidered: string[];
  icpId: string | null;
  insufficientContext: boolean;
}

export interface ThesisCheck {
  verdict: 'OK' | 'REVIEW_REQUIRED' | 'BLOCKED';
  similarity: number;
  explanation: string;
}
