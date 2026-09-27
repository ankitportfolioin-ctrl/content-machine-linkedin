export type ActionKind =
  | 'content_opportunity'
  | 'content_gap'
  | 'trend_signal'
  | 'content_review'
  | 'outreach_review'
  | 'follow_up'
  | 'prepared_action'
  | 'learning_proposal'
  | 'stale_draft'
  | 'objection_pattern'
  | 'prospect_relevance';

export type ActionStatus = 'PENDING' | 'DISMISSED' | 'COMPLETED';

export interface EvidenceLink {
  label: string;
  ref: string;
}

export interface Candidate {
  kind: ActionKind;
  identityKey: string;
  subjectId: string | null;
  title: string;
  createdAt: Date;
  facts: {
    waitingDays?: number;
    relevance01?: number;
    evidenceCount?: number;
    ready?: boolean;
    learningDimensions?: string[];
    subjectMeta?: Record<string, unknown>;
  };
  reasons: string[];
  evidenceLinks: EvidenceLink[];
}

export interface ScoreDimension {
  name: 'urgency' | 'relevance' | 'evidence_strength' | 'readiness' | 'freshness' | 'learning_boost';
  points: number;
  maxPoints: number;
  reason: string | null;
}

export interface ScoredAction extends Candidate {
  score: number;
  dimensions: ScoreDimension[];
  learningApplied: Array<{ dimension: string; adjustment: number; reason: string; proposalId: string }>;
}

export interface ActionExplanation {
  identityKey: string;
  kind: ActionKind;
  title: string;
  score: number;
  status: string;
  reasons: string[];
  dimensions: ScoreDimension[];
  evidenceLinks: EvidenceLink[];
  lifecycle: string;
  learningApplied: ScoredAction['learningApplied'];
  subjectMeta: Record<string, unknown>;
}
