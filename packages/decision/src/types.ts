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
  | 'prospect_relevance'
  | 'sales_content_signal'
  | 'comment_signal';

// Batch 2 (A): ACCEPTED authorizes preparation of internal work from a
// recommendation. It is NOT execution approval: accepted actions still need
// the existing human approval gates before any external consequence.
export type ActionStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED' | 'COMPLETED';

export interface EvidenceLink {
  label: string;
  ref: string;
}

export interface ObjectiveLink {
  level: string;
  goal: string;
  terms: string[];
}

export interface AttributionMarker {
  strongest: string;
  linkCount: number;
  reason: string | null;
  target: string;
}

export interface LeadStateMarker {
  status: string;
  qualificationStatus: string | null;
  hasApprovedStrategy: boolean;
  hasSubmittedReview: boolean;
  hasReadyAction: boolean;
  latestFollowUp: string | null;
  outreachBlockedBy: string | null;
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
    subjectMeta?: Record<string, unknown> & {
      objectiveMatches?: ObjectiveLink[];
      objectivesConfigured?: boolean;
      attribution?: AttributionMarker | null;
      leadState?: LeadStateMarker | null;
    };
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
  signalConfidence: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  recommendationConfidence: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
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
  signalConfidence: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  recommendationConfidence: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  whyNot?: string[];
}
