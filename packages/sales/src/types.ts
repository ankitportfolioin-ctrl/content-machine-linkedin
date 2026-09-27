export type QualificationStatus = 'UNQUALIFIED' | 'POSSIBLE_FIT' | 'QUALIFIED' | 'INSUFFICIENT_DATA';

export type IntentStatus = 'NO_SIGNAL' | 'WEAK_SIGNAL' | 'RELEVANT_SIGNAL' | 'MULTIPLE_SIGNALS';

export type PersonalizationLevel = 'NONE' | 'LIGHT' | 'MODERATE' | 'HIGH';

export type RelationshipStage = 'COLD' | 'AWARE' | 'ENGAGED' | 'CONVERSATION' | 'OPPORTUNITY' | 'CUSTOMER';

export type OutreachDraftType =
  | 'CONNECTION_NOTE'
  | 'FIRST_MESSAGE'
  | 'FOLLOW_UP'
  | 'VALUE_MESSAGE'
  | 'CONTENT_BASED_OUTREACH';

export type GateStatus = 'PASS' | 'REVIEW_REQUIRED' | 'BLOCKED';

export type GateSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface GateResult {
  gate: string;
  status: GateStatus;
  severity: GateSeverity;
  message: string;
  evidence: string[];
}

export type ConversationClassification =
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'QUESTION'
  | 'OBJECTION'
  | 'NEEDS_INFO'
  | 'MEETING_REQUEST'
  | 'POSITIVE'
  | 'NEGATIVE'
  | 'NEUTRAL'
  | 'UNCLEAR';

export type FollowUpRecommendation =
  | 'NO_FOLLOW_UP'
  | 'FOLLOW_UP_NOW'
  | 'FOLLOW_UP_LATER'
  | 'RESPOND_TO_QUESTION'
  | 'SEND_VALUE'
  | 'ASK_CLARIFYING_QUESTION'
  | 'MOVE_TO_OPPORTUNITY'
  | 'CLOSE_OUT';

export interface QualificationDimension {
  name: string;
  score: number;
  reason: string;
  evidence: string[];
  missing: boolean;
}

export interface ICPMatchContext {
  matched: boolean;
  fitReasons: string[];
  mismatchReasons: string[];
  missingSignals: string[];
  confidence: number;
  icpId: string | null;
}
