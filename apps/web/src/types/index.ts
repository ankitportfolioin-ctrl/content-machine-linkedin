export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  role?: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
  version: string;
  dependencies?: {
    database: string;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    path: string;
    requestId?: string;
  };
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface WorkspacesResponse {
  workspaces: Workspace[];
}

export interface Opportunity {
  id: string;
  title: string;
  description?: string;
  status?: string;
  score?: number;
  topicId?: string;
  topic?: string;
  audience?: string;
  evidence?: unknown;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface OpportunitiesResponse {
  opportunities: Opportunity[];
  pagination?: {
    page?: number;
    perPage?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface OpportunityDetailResponse {
  opportunity: Opportunity;
}

export interface OpportunityScoringDimension {
  name: string;
  score: number;
  explanation: string;
  evidence: string[];
  baseScore: number;
  appliedAdjustment: number;
}

export interface OpportunityScoring {
  overallScore: number;
  baseOverallScore: number;
  dimensions: OpportunityScoringDimension[];
  criticalFailure: boolean;
  failureReason?: string;
  learning: {
    applied: Array<{ dimension: string; adjustment: number; reason: string; proposalId: string; confirmedAt: string }>;
    ignored: Array<{ dimension: string; reason: string }>;
  };
}

export interface OpportunityScoringResponse {
  scoring: OpportunityScoring;
  scoringInputs: Record<string, unknown>;
  storedScore?: number;
}

export type OpportunityFeedbackKind =
  | 'useful'
  | 'not_useful'
  | 'already_covered'
  | 'wrong_audience'
  | 'weak_evidence'
  | 'not_timely';

export interface OpportunityFeedback {
  id?: string;
  feedback?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface IntelligenceOverview {
  sources?: number;
  topics?: number;
  trends?: number;
  opportunities?: number;
  gaps?: number;
  recentOpportunities?: Opportunity[];
  recentSources?: Source[];
  recentTrends?: TrendSignal[];
  [key: string]: unknown;
}

export interface TrendSignal {
  id: string;
  title?: string;
  description?: string;
  strength?: number;
  [key: string]: unknown;
}

export interface TrendsResponse {
  trends?: TrendSignal[];
  trendSignals?: TrendSignal[];
}

export interface ContentGap {
  id: string;
  title?: string;
  description?: string;
  [key: string]: unknown;
}

export interface GapsResponse {
  gaps: ContentGap[];
}

export interface Source {
  id: string;
  url?: string;
  title?: string;
  status?: string;
  [key: string]: unknown;
}

export interface SourcesResponse {
  sources: Source[];
}

export interface ConvertOpportunityResponse {
  contentIdea: ContentIdea;
  provenance?: {
    opportunityId?: string;
    topicId?: string;
    sourceIds?: string[];
    claimIds?: string[];
    trendSignalIds?: string[];
  };
}

export interface ContentIdea {
  id: string;
  title: string;
  description?: string;
  angle?: string;
  format?: string;
  tags?: string[];
  status?: string;
  opportunityId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ContentIdeasResponse {
  contentIdeas: ContentIdea[];
}

export interface ContentIdeaDetailResponse {
  contentIdea: ContentIdea;
}

export interface ContentPlan {
  id: string;
  thesis?: string;
  audience?: string;
  objective?: string;
  angle?: string;
  format?: string;
  narrativeStructure?: string;
  keyPoints?: string[];
  status?: string;
  contentIdeaId?: string;
  [key: string]: unknown;
}

export interface PlansResponse {
  plans: ContentPlan[];
}

export interface PlanDetailResponse {
  plan: ContentPlan;
}

export interface PlanValidation {
  ok: boolean;
  reasons: string[];
}

export interface ContentDraft {
  id: string;
  body?: string;
  structure?: unknown;
  preview?: string;
  status?: string;
  planId?: string;
  version?: number;
  [key: string]: unknown;
}

export interface ComposeDraftResponse {
  draftId: string;
  body?: string;
  structure?: unknown;
  preview?: string;
  contentDraft?: ContentDraft;
  [key: string]: unknown;
}

export interface DraftDetailResponse {
  contentDraft: ContentDraft;
}

export interface EvidenceBinding {
  id?: string;
  span?: string;
  sourceClaimId?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface BindingsResponse {
  bindings: EvidenceBinding[];
}

export interface DraftValidationResult {
  name?: string;
  check?: string;
  status?: string;
  passed?: boolean;
  score?: number;
  message?: string;
  [key: string]: unknown;
}

export interface DraftValidationResponse {
  validation?: {
    results?: DraftValidationResult[];
    finalStatus?: string;
    overallScore?: number;
    [key: string]: unknown;
  };
  findings?: unknown[];
  results?: DraftValidationResult[];
  finalStatus?: string;
  overallScore?: number;
}

export interface QualityGate {
  id?: string;
  name?: string;
  status?: string;
  score?: number;
  [key: string]: unknown;
}

export interface GatesResponse {
  gates: QualityGate[];
}

export interface DraftPreview {
  preview?: string;
  body?: string;
  internalMarkupFound?: string[];
  [key: string]: unknown;
}

export interface ContentReview {
  id: string;
  draftId?: string;
  note?: string;
  status?: string;
  decision?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ReviewsResponse {
  reviews: ContentReview[];
}

export interface ReviewDetailResponse {
  review: ContentReview;
}

export type ReviewDecision = 'approve' | 'reject' | 'request_changes';

export interface ContentVersion {
  id: string;
  draftId?: string;
  body?: string;
  changeSummary?: string;
  isFinal?: boolean;
  final?: boolean;
  createdAt?: string;
  [key: string]: unknown;
}

export interface VersionsResponse {
  versions: ContentVersion[];
}

export interface VersionDetailResponse {
  contentVersion: ContentVersion;
}

export interface VoiceProfile {
  id?: string;
  role?: string;
  headline?: string;
  professionalContext?: string;
  tone?: string;
  writingStyle?: string;
  bannedWords?: string[];
  preferredVocabulary?: string[];
  contentPillars?: string[];
  [key: string]: unknown;
}

export interface VoiceProfileResponse {
  voiceProfile: VoiceProfile | null;
}

export interface VoiceReceipt {
  id: string;
  fact?: string;
  context?: string;
  [key: string]: unknown;
}

export interface VoiceReceiptsResponse {
  receipts: VoiceReceipt[];
}

export interface VoiceReceiptDetailResponse {
  receipt: VoiceReceipt;
}

export interface VoiceSample {
  id: string;
  title?: string;
  content?: string;
  [key: string]: unknown;
}

export interface VoiceSamplesResponse {
  samples: VoiceSample[];
}

export interface VoiceSampleDetailResponse {
  sample: VoiceSample;
}

export interface UserProfile {
  id: string;
  name?: string;
  email?: string;
  headline?: string;
  bio?: string;
  [key: string]: unknown;
}

export interface ProfileResponse {
  profile: UserProfile;
}

export interface Icp {
  id: string;
  name: string;
  description?: string;
  targetRoles?: string[];
  industries?: string[];
  companySize?: string;
  problems?: string;
  exclusions?: string;
  [key: string]: unknown;
}

export interface IcpsResponse {
  icps: Icp[];
}

export interface IcpDetailResponse {
  icp: Icp;
}

// ---------------------------------------------------------------------------
// Phase 4: Sales domain types
// ---------------------------------------------------------------------------

export interface SalesLead {
  id: string;
  name: string;
  headline?: string;
  company?: string;
  location?: string;
  status?: string;
  tags?: string[];
  notes?: string;
  linkedinUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface SalesLeadsResponse {
  leads: SalesLead[];
}

export interface SalesLeadDetailResponse {
  lead: SalesLead;
}

export interface ProspectCandidate {
  name?: string;
  title?: string;
  company?: string;
  companyDomain?: string;
  location?: string;
  publicSourceUrls?: string[];
  evidence?: unknown[];
  confidence?: number;
  unknownFields?: string[];
  [key: string]: unknown;
}

export interface ProspectResearch {
  id?: string;
  leadId?: string;
  summary?: string;
  findings?: unknown;
  [key: string]: unknown;
}

export interface ProspectSignal {
  id?: string;
  leadId?: string;
  signalType?: string;
  source?: string;
  observedAt?: string;
  confidence?: number;
  evidence?: unknown;
  interpretation?: string;
  [key: string]: unknown;
}

export interface ProspectIntent {
  status?: string;
  signals?: ProspectSignal[];
  [key: string]: unknown;
}

export interface QualificationDimension {
  name?: string;
  score?: number;
  reason?: string;
  evidence?: unknown[];
  missing?: string;
  [key: string]: unknown;
}

export interface ProspectQualification {
  status?: string;
  dimensions?: QualificationDimension[];
  missingData?: string[];
  reasoning?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface QualificationScore {
  overallScore?: number;
  dimensions?: unknown;
  insufficientData?: boolean;
  [key: string]: unknown;
}

export interface ProspectBrief {
  id: string;
  leadId?: string;
  researchId?: string;
  title?: string;
  summary?: string;
  content?: unknown;
  [key: string]: unknown;
}

export interface BriefSynthesis {
  synthesis?: unknown;
  summary?: string;
  [key: string]: unknown;
}

export interface OutreachStrategy {
  id: string;
  leadId?: string;
  briefId?: string;
  objective?: string;
  audience?: string;
  relationshipStage?: string;
  angle?: string;
  reasonForContact?: string;
  relevantEvidence?: unknown[];
  personalizationLevel?: string;
  ctaType?: string;
  riskFlags?: string[];
  mustNotClaim?: string[];
  status?: string;
  approved?: boolean;
  [key: string]: unknown;
}

export interface OutreachDraft {
  id: string;
  strategyId?: string;
  leadId?: string;
  draftType?: string;
  body?: string;
  content?: string;
  status?: string;
  [key: string]: unknown;
}

export interface OutreachValidationResult {
  gate?: string;
  name?: string;
  status?: string;
  severity?: string;
  message?: string;
  [key: string]: unknown;
}

export interface OutreachValidation {
  results?: OutreachValidationResult[];
  finalStatus?: string;
  overallScore?: number;
  [key: string]: unknown;
}

export interface OutreachQualityGate {
  id?: string;
  name?: string;
  status?: string;
  score?: number;
  message?: string;
  [key: string]: unknown;
}

export interface OutreachReview {
  id: string;
  draftId?: string;
  note?: string;
  status?: string;
  decision?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface PreparedAction {
  id: string;
  actionType?: string;
  target?: string;
  draftId?: string;
  approvalId?: string;
  evidence?: unknown;
  expiresAt?: string;
  status?: string;
  [key: string]: unknown;
}

export interface SalesConversation {
  id: string;
  leadId?: string;
  subject?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface SalesMessage {
  id?: string;
  conversationId?: string;
  body?: string;
  content?: string;
  direction?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ConversationClassification {
  id?: string;
  conversationId?: string;
  label?: string;
  category?: string;
  confidence?: number;
  reasoning?: string;
  [key: string]: unknown;
}

export interface FollowUpRecommendation {
  id?: string;
  conversationId?: string;
  leadId?: string;
  recommendation?: string;
  suggestedMessage?: string;
  reason?: string;
  timing?: string;
  [key: string]: unknown;
}

export interface ContentSignalItem {
  id?: string;
  signalType?: string;
  sourceConversationIds?: string[];
  evidence?: unknown;
  frequency?: string;
  recommendedAngle?: string;
  reasoning?: string;
  [key: string]: unknown;
}

export interface PipelineOpportunity {
  id: string;
  leadId?: string;
  name?: string;
  title?: string;
  stage?: string;
  value?: number;
  expectedCloseDate?: string;
  probability?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Phase 6: Operator next actions + explanations (ranked, honest states only)
// ---------------------------------------------------------------------------

export interface OperatorEvidenceLink {
  label: string;
  ref: string;
}

export type OperatorActionStatus = 'PENDING' | 'DISMISSED' | 'COMPLETED' | string;

export interface OperatorAction {
  id: string;
  identityKey: string;
  kind: string;
  subjectId: string;
  title: string;
  score: number;
  reasons: string[];
  evidenceLinks: OperatorEvidenceLink[];
  subjectMeta: Record<string, unknown>;
  status: OperatorActionStatus;
  dismissedAt?: string | null;
  completedAt?: string | null;
}

export interface NextActionsResponse {
  actions: OperatorAction[];
  total: number;
}

export interface ActionsResponse {
  actions: OperatorAction[];
}

export interface ActionDetailResponse {
  action: OperatorAction;
}

export interface ScoreDimension {
  name: string;
  points: number;
  maxPoints: number;
  reason: string;
}

export interface ActionExplanation {
  identityKey: string;
  kind: string;
  title: string;
  score: number;
  status: string;
  reasons: string[];
  dimensions: ScoreDimension[];
  evidenceLinks: OperatorEvidenceLink[];
  lifecycle?: string | null;
  learningApplied?: string[];
  subjectMeta: Record<string, unknown>;
}

export interface ExplanationResponse {
  explanation: ActionExplanation;
}

export interface AiExplanationResponse {
  explanation: ActionExplanation;
  aiSummary?: string | null;
  aiAvailable: boolean;
  aiError?: string | null;
}

// ---------------------------------------------------------------------------
// Phase 5: Recorded outcomes + derived learning (recorded data only)
// ---------------------------------------------------------------------------

export interface PublishRecord {
  id: string;
  contentVersionId?: string | null;
  outreachDraftId?: string | null;
  pipelineOpportunityId?: string | null;
  channel?: string;
  externalRef?: string | null;
  recordedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface PublishRecordsResponse {
  publishRecords: PublishRecord[];
}

export interface PublishRecordDetailResponse {
  publishRecord: PublishRecord;
}

export interface OutcomeMetric {
  id: string;
  publishRecordId?: string | null;
  contentVersionId?: string | null;
  outreachDraftId?: string | null;
  pipelineOpportunityId?: string | null;
  metricName: string;
  metricValue: number;
  unit?: string | null;
  source: string;
  recordedAt?: string;
  [key: string]: unknown;
}

export interface OutcomeMetricsResponse {
  outcomeMetrics: OutcomeMetric[];
}

export interface AnalyticsAggregate {
  metricName: string;
  count: number;
  sum: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  sources: string[];
  sampleSize: number;
  period: { from: string | null; to: string | null };
  metricIds: string[];
  [key: string]: unknown;
}

export interface AnalyticsRate {
  name: string;
  numerator: number;
  denominator: number;
  value: number;
  numeratorMetricIds?: string[];
  denominatorMetricIds?: string[];
  [key: string]: unknown;
}

export interface AnalyticsOmittedRate {
  name: string;
  reason: string;
  [key: string]: unknown;
}

export interface AnalyticsSummary {
  aggregates: AnalyticsAggregate[];
  rates: AnalyticsRate[];
  omittedRates: AnalyticsOmittedRate[];
  totalMetrics: number;
  [key: string]: unknown;
}

export type LearningProposalStatus = 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'REVOKED' | string;

export interface LearningProposal {
  id: string;
  dimension: string;
  observedPattern: string;
  supportingMeasurements?: unknown;
  sourceMetricIds?: string[];
  sampleSize: number;
  denominator?: number | null;
  proposedAdjustment: number;
  reason: string;
  confidence?: number | null;
  status: LearningProposalStatus;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  [key: string]: unknown;
}

export interface LearningProposalsResponse {
  proposals: LearningProposal[];
}
