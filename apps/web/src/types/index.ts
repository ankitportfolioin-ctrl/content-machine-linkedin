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
  feedbackSummary?: OpportunityFeedbackSummary;
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
  feedbackSummary?: OpportunityFeedbackSummary;
  rankedOverallScore?: number;
  feedbackPenalty?: number;
}

export type OpportunityFeedbackKind =
  | 'useful'
  | 'not_useful'
  | 'already_covered'
  | 'wrong_audience'
  | 'weak_evidence'
  | 'not_timely';

export type OpportunityTriageStatus = 'REVIEWED' | 'DISMISSED';

export interface OpportunityFeedbackSummary {
  total: number;
  counts: Record<string, number>;
  reasons: Array<{ feedback: string; reason: string; createdAt: string }>;
}

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

/**
 * Mirrors the Prisma Profile model (user facts for this workspace).
 * The signed-in account's name/email live on User (AuthContext), not here.
 */
export interface UserProfile {
  id: string;
  userId?: string;
  workspaceId?: string;
  linkedinUrl?: string | null;
  headline?: string | null;
  role?: string | null;
  summary?: string | null;
  professionalContext?: string | null;
  industry?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
}

export interface CreateProfileInput {
  linkedinUrl?: string;
  headline?: string;
  role?: string;
  summary?: string;
  professionalContext?: string;
  industry?: string;
  location?: string;
  avatarUrl?: string;
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

export interface RelevantContentSuggestion {
  ideaId: string;
  title: string;
  topicId: string;
  topicName: string;
  relevance: number;
  reason: string;
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
  acceptedAt?: string | null;
  acceptedBy?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  evidenceRefs?: string[];
  model?: string | null;
  modelVersion?: string | null;
  policySnapshot?: Record<string, unknown> | null;
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
  signalConfidence?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  recommendationConfidence?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  whyNot?: string[];
  nextAction?: string | null;
  requiredAuthorization?: string | null;
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
  maturity?: string | null;
  evidenceCount?: number | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Batch 2: controlled preparation, maturity, attribution, comment signals
// ---------------------------------------------------------------------------

export type AuthorizationSource =
  | 'IMPORT_ACCEPTANCE'
  | 'PRIOR_TRIAGE'
  | 'PRIOR_APPROVAL'
  | 'EXISTING_STRATEGY'
  | 'EXPLICIT_ACCEPTANCE'
  | 'POLICY_AUTO_PREP';

export interface AutoPrepPolicyState {
  autoPrepareApprovedWork: boolean;
  autoPrepareColdWork: boolean;
  dailyAutoPreparationQuota: number;
}

export interface AutoPrepStatus {
  policy: AutoPrepPolicyState;
  usedToday: number;
  remaining: number;
  quotaReached: boolean;
}

export interface PreparationLogItem {
  id: string;
  kind: string;
  subjectType: string;
  subjectId?: string | null;
  resultType?: string | null;
  resultId?: string | null;
  authorizationSource: AuthorizationSource | string;
  authorizationReason: string;
  status: 'PREPARED' | 'SKIPPED' | string;
  skipReason?: string | null;
  createdAt?: string;
  [key: string]: unknown;
}

export type AttributionType = 'DIRECT' | 'INFERRED' | 'UNKNOWN';

export interface AttributionLinkItem {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  attributionType: AttributionType | string;
  evidenceRefs: string[];
  reason?: string | null;
  recordedBy?: string | null;
  recordedAt?: string;
  [key: string]: unknown;
}

export interface CommentSalesSignalItem {
  id: string;
  commentId: string;
  audienceSignalId?: string | null;
  signalType: string;
  evidence: string;
  reason: string;
  status: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
  [key: string]: unknown;
}

export interface LearningProposalsResponse {
  proposals: LearningProposal[];
}

export interface TodayBrainRecommendation {
  text: string;
  why: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT DATA';
}

export interface TodayBrain {
  newSignals: number;
  highPotentialOpportunities: number;
  readyForApproval: number;
  awaitingAnalytics: number;
  newAudienceSignals: number;
  runningExperiments: number;
  newLearnedPatterns: number;
  recommendation: TodayBrainRecommendation | null;
}

export interface AudienceSegment {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  problems?: string[];
  goals?: string[];
  interests?: string[];
  tools?: string[];
  [key: string]: unknown;
}

export interface LearningDashboard {
  whatWeKnow: Array<{ id: string; dimension: string; pattern: string; sample: number; confidence?: number | null; maturity?: string | null; evidenceCount?: number | null }>;
  whatWeThink: Array<{ id: string; dimension: string; pattern: string; confidence?: number | null; maturity?: string | null; evidenceCount?: number | null }>;
  whatWeAreTesting: Array<{ id: string; hypothesis: string; variable: string; metric: string }>;
  whatWeDontKnow: string[];
}

export interface ExperimentItem {
  id: string;
  hypothesis: string;
  variable: string;
  metricName: string;
  status: string;
  result?: string | null;
  confidence?: number | null;
  conclusion?: string | null;
  [key: string]: unknown;
}

export interface OnboardingProgress {
  steps: Record<string, boolean>;
  currentStep: string | null;
  complete: boolean;
  counts: {
    writingSamples: number;
    icps: number;
    audienceSegments: number;
    activeFeedSources: number;
    completedLeadBatches: number;
    leads: number;
  };
  state?: unknown;
}

export interface WorkspaceSettings {
  id: string;
  timezone: string;
  dailyRunTime: string;
  dailyLlmCallCap: number;
  dailyFetchCap: number;
  dailyPreparationCap: number;
  paused: boolean;
  killSwitch: boolean;
  autonomyTier: number;
  [key: string]: unknown;
}

export interface AutonomyPolicy {
  id: string;
  tier1PostingEnabled: boolean;
  tier1PostingDailyCap: number;
  tier1RequireApprovedPost: boolean;
  tier2HumanApprovalAck: boolean;
  autoPrepareApprovedWork?: boolean;
  autoPrepareColdWork?: boolean;
  dailyAutoPreparationQuota?: number;
  [key: string]: unknown;
}

export interface PlatformExecutionStatus {
  platform: string;
  displayName: string;
  connected: boolean;
  publishingReady: boolean;
  reason: string;
  details: {
    integrationExists: boolean;
    oauthConnected: boolean;
    publishingEnabled: boolean;
    lastVerifiedAt: string | null;
  };
}

export interface ReadinessDetail {
  ready: boolean;
  reason: string;
  details: Record<string, boolean | string>;
}

export interface ReadinessState {
  workspaceIntelligenceReady: ReadinessDetail;
  humanApprovalReady: ReadinessDetail;
  platformExecution: PlatformExecutionStatus[];
  overall: 'ready' | 'partial' | 'not_ready';
}

export interface ReadinessResponse {
  readiness: ReadinessState;
}

export interface FeedSource {
  id: string;
  url: string;
  type: string;
  name?: string | null;
  active: boolean;
  lastFetchedAt?: string | null;
  lastError?: string | null;
  [key: string]: unknown;
}

export interface LeadImportBatch {
  id: string;
  filename?: string | null;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  status: string;
  error?: string | null;
  [key: string]: unknown;
}

export interface IntelligenceReport {
  id: string;
  frequency: string;
  periodStart: string;
  periodEnd: string;
  audienceCaredAbout?: unknown;
  emergingTopics?: Array<{ id?: string; title?: string; score?: number }>;
  strongSignals?: Array<{ id?: string; title?: string }>;
  weakSignals?: Array<{ id?: string; title?: string }>;
  learnedPatterns?: Array<{ id?: string; dimension?: string; pattern?: string; status?: string }>;
  experiments?: Array<{ id?: string; hypothesis?: string; status?: string; result?: string | null }>;
  recommendedTopics?: Array<{ id?: string; title?: string }>;
  confidenceLevel?: string | null;
  generatedAt: string;
  [key: string]: unknown;
}

export interface DailyRunSummary {
  id: string;
  runDate: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  summary?: unknown;
  stages?: Array<{ stage: string; status: string }>;
  [key: string]: unknown;
}

export interface BrainComment {
  id: string;
  text: string;
  type: string;
  sentiment?: string | null;
  isQuestion: boolean;
  isRequest: boolean;
  isLeadSignal: boolean;
  [key: string]: unknown;
}

export type SocialConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'NOT_CONNECTED'
  | 'CONNECTED'
  | 'PAUSED'
  | 'ERROR'
  | 'EXPIRED';

export interface IntegrationCapabilities {
  research?: boolean;
  publishing?: boolean;
  analytics?: boolean;
  comments?: boolean;
  audience?: boolean;
  verification?: 'NOT_VERIFIED' | 'VERIFIED' | 'FAILED';
  lastVerifiedAt?: string | null;
}

export interface SocialAccountBlock {
  supported: boolean;
  status: 'CONNECTED' | 'PAUSED' | 'NOT_CONNECTED' | 'NOT_AVAILABLE';
  connectable: boolean;
  reasonCode?: string | null;
}

export interface SocialServerBlock {
  configured: boolean;
  redirectUri: string;
  redirectUriSource: 'SOCIAL_REDIRECT_URI' | 'API_URL';
  requiredEnvVars: string[];
  docsUrl: string;
  docsLabel: string;
}

export interface SocialCapabilityBlock {
  supported: boolean;
  wired: boolean;
  status: string;
  note?: string | null;
}

export interface SocialConnection {
  platform: string;
  displayName: string;
  configured: boolean;
  connected: boolean;
  status: SocialConnectionStatus;
  accountLabel?: string | null;
  active: boolean;
  lastPulledAt?: string | null;
  lastError?: string | null;
  postCount: number;
  provides: string[];
  limitations: string[];
  scopes: string[];
  capabilities?: IntegrationCapabilities;
  account?: SocialAccountBlock;
  server?: SocialServerBlock;
  research?: SocialCapabilityBlock;
  publishing?: SocialCapabilityBlock;
  [key: string]: unknown;
}

export interface ConnectorProbe {
  status: string;
  checkedAt?: string | null;
  error?: string | null;
  scope?: string;
}

export interface WorkspaceConnectorEntry {
  sourceType: string;
  displayName: string;
  group: 'RESEARCH' | 'CONNECTED_PLATFORM' | 'UNAVAILABLE';
  description: string;
  authKind: 'NONE' | 'API_KEY' | 'OAUTH';
  sourceOfTruth: string;
  workerEligible: boolean;
  notWiredReason?: string | null;
  accountConnectable: boolean;
  requiresAccountNote?: string | null;
  userAction: string;
  enabled: boolean;
  enabledState: 'ENABLED' | 'DISABLED';
  configState: 'CONFIGURED' | 'NOT_CONFIGURED';
  config: Record<string, unknown>;
  accountState: 'CONNECTED' | 'NOT_CONNECTED' | 'NOT_CONFIGURED';
  serverCredsPresent: boolean;
  workerWillRun: boolean;
  probe: ConnectorProbe;
  [key: string]: unknown;
}

export interface SocialPost {
  id: string;
  platform: string;
  externalId: string;
  url?: string | null;
  title?: string | null;
  text?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  mediaKind?: string | null;
  hashtags: string[];
  fetchedAt: string;
  connectionId?: string | null;
  [key: string]: unknown;
}

export interface AudienceProblemGroup {
  id: string;
  problem: string;
  audience: string;
  evidence: Array<{
    sourceId: string;
    sourceTitle: string | null;
    sourceUrl: string;
    sourceType: string;
    quote: string;
    publishedAt: string | null;
  }>;
  frequency: number;
  suggestedContent: {
    angle: string;
    format: 'TUTORIAL' | 'EXPLAINER' | 'CAROUSEL' | 'FRAMEWORK' | 'CASE_STUDY' | 'TOOL_BREAKDOWN' | 'PROJECT_WALKTHROUGH' | 'MYTH_VS_FACT';
    hook: string;
    educationalValue: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  yfpRelevance: 'HIGH' | 'MEDIUM' | 'LOW';
  businessAlignment: string;
  confidence: number;
}

export interface AudienceProblemsResponse {
  groups: AudienceProblemGroup[];
  totalSignalsAnalyzed: number;
  groupedCount: number;
  ungroupedCount: number;
  errors: string[];
}

export interface YFPScoreDimension {
  name: 'audience_relevance' | 'trend_momentum' | 'educational_value' | 'timeliness' | 'content_differentiation';
  score: number;
  maxScore: number;
  explanation: string;
  evidence: string[];
}

export interface YFPScoreResult {
  overallScore: number;
  dimensions: YFPScoreDimension[];
  criticalFailure: boolean;
  failureReason?: string;
}

export interface YFPQualityGateInput {
  draftBody: string;
  structure?: unknown;
  format?: string | null;
  planThesis?: string | null;
  draftThesis?: string | null;
  bannedWords?: string[];
  receiptFacts?: string[];
  boundEvidenceTexts?: string[];
  evidenceFindings?: Array<{ kind: string; severity: string; span: string }>;
  evidenceCoverage?: number;
  contradictionPresent?: boolean;
  contradictionSeverity?: string | null;
  existingTitles?: string[];
  cta?: string | null;
  workspaceProfile?: string;
  icp?: string;
  audienceProblems?: Array<{ problem: string; audience: string }>;
  sourceTypes?: string[];
  topicCategory?: string;
}

export interface YFPQualityGateDimension {
  name: 'relevance' | 'educational_value' | 'originality' | 'accuracy' | 'structure' | 'business_alignment';
  score: number;
  maxScore: number;
  status: string;
  evidence: string[];
}

export interface YFPQualityGateResult {
  results: Array<{
    gate: string;
    status: string;
    severity: string;
    message: string;
    evidence: string[];
  }>;
  finalStatus: string;
  overallScore: number;
  dimensions: Array<{ name: string; score: number }>;
  yfpDimensions: YFPQualityGateDimension[];
  yfpOverallScore: number;
}

export interface PerformancePattern {
  pattern: string;
  type: 'TOPIC' | 'FORMAT' | 'ANGLE' | 'HOOK' | 'OBJECTIVE' | 'CATEGORY';
  supportingPosts: string[];
  metricName: string;
  avgPerformance: number;
  vsBaseline: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  evidence: string;
}

export interface PerformanceRecommendation {
  type: 'TEST_MORE' | 'CONTINUE' | 'AVOID' | 'EXPERIMENT';
  description: string;
  reasoning: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedAction: string;
}

export interface PerformanceReviewResult {
  postsAnalyzed: number;
  reviewTriggered: boolean;
  reason: string;
  patterns: PerformancePattern[];
  recommendations: PerformanceRecommendation[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  nextReviewAt: number;
}

export interface TenPostReviewConfig {
  enabled: boolean;
  minPostsForReview: number;
  metricsToAnalyze: string[];
  attributesToCompare: Array<'format' | 'angle' | 'objective' | 'topic'>;
  minSamplePerGroup: number;
}
