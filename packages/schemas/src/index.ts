import { z } from 'zod';

export const idSchema = z.string().uuid();
export const slugSchema = z.string().min(1).max(100).regex(/^[a-z0-9-]+$/);
export const emailSchema = z.string().email().max(255).toLowerCase();
export const passwordSchema = z.string().min(8).max(128);
export const nameSchema = z.string().min(1).max(100).trim();
export const descriptionSchema = z.string().max(5000).optional();
export const urlSchema = z.string().url().max(2048);
export const isoDateSchema = z.string().datetime({ offset: true });

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const sortSchema = z.object({
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const listQuerySchema = paginationSchema.merge(sortSchema);

export const userCreateSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});

export const userLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const workspaceCreateSchema = z.object({
  name: nameSchema,
  slug: slugSchema.optional(),
  description: descriptionSchema,
});

export const workspaceUpdateSchema = z.object({
  name: nameSchema.optional(),
  description: descriptionSchema,
});

export const workspaceMembershipCreateSchema = z.object({
  userId: idSchema,
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

export const workspaceMembershipUpdateSchema = z.object({
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

export const profileCreateSchema = z.object({
  linkedinUrl: urlSchema.optional(),
  headline: z.string().max(220).optional(),
  role: z.string().max(120).optional(),
  summary: z.string().max(2000).optional(),
  professionalContext: z.string().max(5000).optional(),
  industry: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  avatarUrl: urlSchema.optional(),
});

export const profileUpdateSchema = profileCreateSchema.partial();

export const icpCreateSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  criteria: z.record(z.unknown()).optional(),
  targetRoles: z.array(z.string().max(100)).max(20).default([]),
  industries: z.array(z.string().max(100)).max(20).default([]),
  companySize: z.string().max(100).optional(),
  problems: z.string().max(5000).optional(),
  exclusions: z.string().max(5000).optional(),
});

export const icpUpdateSchema = icpCreateSchema.partial();

export const contentFormatSchema = z.enum([
  'post',
  'text_post',
  'article',
  'carousel',
  'video',
  'poll',
  'checklist',
  'framework',
  'contrarian',
]);

export const contentIdeaCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: descriptionSchema,
  angle: z.string().max(500).optional(),
  format: contentFormatSchema.optional(),
  status: z.enum(['draft', 'review', 'approved', 'published', 'archived']).default('draft'),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export const contentIdeaUpdateSchema = contentIdeaCreateSchema.partial();

export const contentDraftCreateSchema = z.object({
  contentIdeaId: idSchema,
  body: z.string().max(50000),
  version: z.number().int().positive().default(1),
});

export const contentDraftUpdateSchema = z.object({
  body: z.string().max(50000).optional(),
  version: z.number().int().positive().optional(),
});

export const contentVersionCreateSchema = z.object({
  contentDraftId: idSchema,
  body: z.string().max(50000),
  version: z.number().int().positive(),
  changeSummary: z.string().max(500).optional(),
});

export const leadCreateSchema = z.object({
  linkedinUrl: urlSchema,
  name: nameSchema,
  headline: z.string().max(220).optional(),
  company: z.string().max(200).optional(),
  location: z.string().max(100).optional(),
  status: z.enum(['new', 'contacted', 'connected', 'responding', 'qualified', 'disqualified', 'closed']).default('new'),
  tags: z.array(z.string().max(50)).max(20).default([]),
  notes: z.string().max(5000).optional(),
});

export const leadUpdateSchema = leadCreateSchema.partial();

export const conversationCreateSchema = z.object({
  leadId: idSchema,
  subject: z.string().max(200).optional(),
});

export const messageCreateSchema = z.object({
  conversationId: idSchema,
  body: z.string().min(1).max(10000),
  direction: z.enum(['inbound', 'outbound']),
  linkedinMessageId: z.string().max(100).optional(),
});

export const pipelineOpportunityCreateSchema = z.object({
  leadId: idSchema,
  name: nameSchema,
  stage: z.enum(['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost']),
  value: z.number().nonnegative().optional(),
  expectedCloseDate: isoDateSchema.optional(),
  probability: z.number().min(0).max(100).default(0),
});

export const pipelineOpportunityUpdateSchema = pipelineOpportunityCreateSchema.partial();

export const analyticsEventCreateSchema = z.object({
  eventType: z.string().max(100),
  eventName: z.string().max(100),
  properties: z.record(z.unknown()).optional(),
  timestamp: isoDateSchema.optional(),
});

export const learningSignalCreateSchema = z.object({
  sourceType: z.enum(['content_performance', 'engagement', 'conversion', 'feedback']),
  sourceId: idSchema,
  signalType: z.string().max(100),
  signalValue: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

export const intelligenceSourceCreateSchema = z.object({
  url: urlSchema,
  sourceType: z.enum(['article', 'rss', 'atom', 'sitemap', 'website', 'user_url', 'reddit', 'youtube', 'google_trends', 'linkedin', 'x', 'instagram', 'tiktok']).optional(),
});

export const intelligenceSourceUpdateSchema = z.object({
  status: z.enum(['active', 'failed', 'blocked', 'stale']).optional(),
});

export const topicResearchSchema = z.object({
  query: z.string().min(1).max(500),
  sourceUrls: z.array(urlSchema).max(10).optional(),
});

export const opportunityFeedbackSchema = z.object({
  feedback: z.enum(['useful', 'not_useful', 'already_covered', 'wrong_audience', 'weak_evidence', 'not_timely']),
  reason: z.string().max(2000).optional(),
});

export const opportunityConvertSchema = z.object({
  contentIdeaTitle: z.string().min(1).max(200).optional(),
});

export const opportunityTriageSchema = z.object({
  status: z.string().min(1).max(50),
});

export const contentObjectiveSchema = z.enum([
  'educate',
  'explain',
  'challenge',
  'build_authority',
  'share_framework',
  'start_discussion',
  'teach_practical',
  'analyze',
  'reframe',
]);

export const contentAngleSchema = z.enum([
  'educational',
  'contrarian',
  'practical',
  'framework',
  'analysis',
  'observation',
  'breakdown',
]);

export const contentNarrativeSchema = z.enum([
  'problem_why_solution',
  'observation_analysis_implication',
  'hook_context_framework_application_takeaway',
  'mistake_consequence_better_approach',
  'thesis_evidence_tradeoff_conclusion',
]);

export const contentPlanCreateSchema = z.object({
  contentIdeaId: idSchema.optional(),
  opportunityId: idSchema.optional(),
  topicId: idSchema.optional(),
  thesis: z.string().min(1).max(5000),
  coreQuestion: z.string().max(2000).optional(),
  audience: z.string().min(1).max(5000),
  audienceReason: z.string().max(5000).optional(),
  objective: contentObjectiveSchema,
  angle: contentAngleSchema,
  format: contentFormatSchema,
  narrativeStructure: contentNarrativeSchema,
  keyPoints: z.array(z.string().min(1).max(1000)).min(1).max(20),
  hookDirection: z.string().max(2000).optional(),
  ctaStrategy: z.string().max(2000).optional(),
  evidenceMap: z.array(z.object({
    claimRef: z.string().max(2000),
    sourceClaimId: idSchema.optional(),
    note: z.string().max(2000).optional(),
  })).max(50).default([]),
  contradictionNotes: z.string().max(5000).optional(),
  voiceInstructions: z.string().max(5000).optional(),
  mustNotClaim: z.array(z.string().min(1).max(1000)).max(30).default([]),
  sourceIds: z.array(idSchema).max(50).optional(),
  claimIds: z.array(idSchema).max(100).optional(),
  trendSignalIds: z.array(idSchema).max(20).optional(),
  reasoning: z.string().max(5000).optional(),
  evidenceSnapshot: z.record(z.unknown()).optional(),
});

export const contentPlanGenerateSchema = z.object({
  contentIdeaId: idSchema.optional(),
  opportunityId: idSchema.optional(),
  topicId: idSchema.optional(),
  objective: contentObjectiveSchema.optional(),
  angle: contentAngleSchema.optional(),
  format: contentFormatSchema.optional(),
  audienceOverride: z.string().max(5000).optional(),
  thesisOverride: z.string().max(5000).optional(),
});

export const draftComposeSchema = z.object({
  planId: idSchema,
});

export const draftReviseSchema = z.object({
  body: z.string().min(1).max(50000).optional(),
  structure: z.record(z.unknown()).optional(),
});

export const claimBindingCreateSchema = z.object({
  span: z.string().min(1).max(5000),
  sourceClaimId: idSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const reviewActionSchema = z.object({
  action: z.enum(['submit', 'approve', 'reject', 'request_changes']),
  note: z.string().max(5000).optional(),
});

export const versionFinalizeSchema = z.object({
  changeSummary: z.string().max(500).optional(),
});

export const hookGenerateSchema = z.object({
  planId: idSchema,
  strategy: z.enum(['observation', 'tension', 'implication', 'question', 'claim', 'contrast']).optional(),
});

export const voiceProfileCreateSchema = z.object({
  role: z.string().max(120).optional(),
  headline: z.string().max(220).optional(),
  professionalContext: z.string().max(5000).optional(),
  tone: z.string().max(5000).optional(),
  writingStyle: z.string().max(5000).optional(),
  bannedWords: z.array(z.string().min(1).max(100)).max(100).default([]),
  preferredVocabulary: z.array(z.string().min(1).max(100)).max(100).default([]),
  contentPillars: z.array(z.string().min(1).max(200)).max(20).default([]),
});

export const voiceProfileUpdateSchema = voiceProfileCreateSchema.partial();

export const voiceReceiptCreateSchema = z.object({
  fact: z.string().min(1).max(2000),
  context: z.string().max(2000).optional(),
});

export const writingSampleCreateSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(20000),
});

export const prospectResearchCreateSchema = z.object({
  leadId: idSchema.optional(),
  name: z.string().max(100).optional(),
  title: z.string().max(220).optional(),
  company: z.string().max(200).optional(),
  companyDomain: z.string().max(255).optional(),
  location: z.string().max(100).optional(),
  publicSourceUrls: z.array(urlSchema).max(20).default([]),
});

export const prospectSignalCreateSchema = z.object({
  leadId: idSchema.optional(),
  signalType: z.enum([
    'hiring',
    'product_launch',
    'tech_migration',
    'expansion',
    'operational_change',
    'announcement',
    'problem_content',
    'company_initiative',
  ]),
  source: z.string().min(1).max(2000),
  observedAt: isoDateSchema.optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1).max(5000),
  interpretation: z.string().min(1).max(5000),
});

export const qualificationRunSchema = z.object({
  leadId: idSchema,
});

export const prospectBriefCreateSchema = z.object({
  leadId: idSchema.optional(),
  researchId: idSchema.optional(),
});

export const outreachStrategyCreateSchema = z.object({
  leadId: idSchema.optional(),
  briefId: idSchema.optional(),
  objective: z.string().min(1).max(100),
  audience: z.string().min(1).max(5000),
  relationshipStage: z.enum(['cold', 'aware', 'engaged', 'conversation', 'opportunity', 'customer']).default('cold'),
  angle: z.string().min(1).max(100),
  reasonForContact: z.string().min(1).max(5000),
  relevantEvidence: z.array(z.object({
    statement: z.string().min(1).max(2000),
    sourceRef: z.string().max(500).optional(),
  })).max(30).default([]),
  personalizationLevel: z.enum(['none', 'light', 'moderate', 'high']).default('light'),
  ctaType: z.string().max(100).optional(),
  riskFlags: z.array(z.string().max(500)).max(20).default([]),
  mustNotClaim: z.array(z.string().min(1).max(1000)).max(30).default([]),
  relevantContentId: idSchema.optional(),
  contentReason: z.string().max(2000).optional(),
});

export const outreachDraftComposeSchema = z.object({
  strategyId: idSchema,
  draftType: z.enum(['connection_note', 'first_message', 'follow_up', 'value_message', 'content_based_outreach']),
});

export const outreachDraftReviseSchema = z.object({
  opening: z.string().max(2000).optional(),
  relevance: z.string().max(5000).optional(),
  evidence: z.string().max(5000).optional().nullable(),
  value: z.string().max(5000).optional(),
  cta: z.string().max(1000).optional().nullable(),
  body: z.string().max(10000).optional(),
});

export const outreachReviewActionSchema = z.object({
  action: z.enum(['submit', 'approve', 'reject', 'request_changes']),
  note: z.string().max(5000).optional(),
});

export const preparedActionCreateSchema = z.object({
  actionType: z.string().min(1).max(100),
  target: z.string().max(500).optional(),
  draftId: idSchema.optional(),
  approvalId: idSchema.optional(),
  evidence: z.record(z.unknown()).optional(),
  expiresAt: isoDateSchema.optional(),
  idempotencyKey: z.string().max(200).optional(),
});

export const conversationClassifySchema = z.object({
  conversationId: idSchema,
});

export const followUpRecommendSchema = z.object({
  conversationId: idSchema.optional(),
  leadId: idSchema.optional(),
});

export const salesContentSignalCreateSchema = z.object({
  signalType: z.string().min(1).max(100),
  sourceConversationIds: z.array(idSchema).max(50).default([]),
  evidence: z.string().min(1).max(5000),
  frequency: z.number().int().nonnegative().optional(),
  recommendedAngle: z.string().max(200).optional(),
  reasoning: z.string().max(5000).optional(),
});

export const pipelineStageUpdateSchema = z.object({
  stage: z.enum(['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost']),
});

export const publishRecordCreateSchema = z.object({
  contentVersionId: idSchema.optional(),
  outreachDraftId: idSchema.optional(),
  pipelineOpportunityId: idSchema.optional(),
  channel: z.string().min(1).max(100),
  externalRef: z.string().max(2048).optional(),
  recordedAt: isoDateSchema.optional(),
});

export const outcomeMetricCreateSchema = z.object({
  publishRecordId: idSchema.optional(),
  contentVersionId: idSchema.optional(),
  outreachDraftId: idSchema.optional(),
  pipelineOpportunityId: idSchema.optional(),
  metricName: z.string().min(1).max(100),
  metricValue: z.number().finite(),
  unit: z.string().max(50).optional(),
  source: z.string().min(3).max(2000),
  recordedAt: isoDateSchema.optional(),
  idempotencyKey: z.string().max(200).optional(),
});

export const learningDeriveSchema = z.object({
  metricName: z.string().min(1).max(100).optional(),
  minSampleSize: z.number().int().min(2).max(100).default(3),
});

export const learningConfirmSchema = z.object({
  note: z.string().max(2000).optional(),
});

export const contentOutcomeDeriveSchema = z.object({
  metricName: z.string().min(1).max(100).default('responses'),
  attribute: z.enum(['format', 'angle', 'objective']),
  minSampleSize: z.number().int().min(2).max(100).default(3),
});

export const opportunityScoreSchema = z.object({
  topicId: idSchema,
  sourceIds: z.array(idSchema).max(100).default([]),
  claimIds: z.array(idSchema).max(200).default([]),
  trendSignalIds: z.array(idSchema).max(100).default([]),
  workspaceProfile: z.string().max(5000).default(''),
  icp: z.string().max(5000).default(''),
  contentGaps: z.array(z.object({
    type: z.string().min(1).max(100),
    description: z.string().min(1).max(2000),
    evidence: z.string().min(1).max(2000),
  })).max(50).default([]),
});

export const yfpOpportunityScoreSchema = opportunityScoreSchema;

export const yfpQualityGateSchema = z.object({
  draftBody: z.string().min(50).max(50000),
  structure: z.record(z.unknown()).optional(),
  format: z.string().max(50).optional().nullable(),
  planThesis: z.string().max(5000).optional().nullable(),
  draftThesis: z.string().max(5000).optional().nullable(),
  bannedWords: z.array(z.string().max(200)).max(100).default([]),
  receiptFacts: z.array(z.string().max(2000)).max(100).default([]),
  boundEvidenceTexts: z.array(z.string().max(5000)).max(100).default([]),
  evidenceFindings: z.array(z.object({
    kind: z.string().max(100),
    severity: z.string().max(50),
    span: z.string().max(2000),
  })).max(100).default([]),
  evidenceCoverage: z.number().min(0).max(1).default(0),
  contradictionPresent: z.boolean().default(false),
  contradictionSeverity: z.string().max(50).optional().nullable(),
  existingTitles: z.array(z.string().max(300)).max(200).default([]),
  cta: z.string().max(1000).optional().nullable(),
  workspaceProfile: z.string().max(5000).default(''),
  icp: z.string().max(5000).default(''),
  audienceProblems: z.array(z.object({
    problem: z.string().max(500),
    audience: z.string().max(200),
  })).max(50).default([]),
  sourceTypes: z.array(z.string().max(50)).max(50).default([]),
  topicCategory: z.string().max(200).optional(),
});

export const performanceReviewSchema = z.object({
  enabled: z.boolean().default(true),
  minPostsForReview: z.number().int().min(2).max(50).default(10),
  metricsToAnalyze: z.array(z.string().max(100)).max(30).default(['impressions', 'reactions', 'comments', 'reposts', 'saves', 'linkClicks', 'profileViews']),
  attributesToCompare: z.array(z.enum(['format', 'angle', 'objective', 'topic'])).max(4).default(['format', 'angle', 'objective', 'topic']),
  minSamplePerGroup: z.number().int().min(2).max(10).default(2),
});

export const researchTriggerSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
  sources: z.record(z.object({
    enabled: z.boolean(),
    config: z.record(z.unknown()).default({}),
  })).optional(),
});

export const factCheckSchema = z.object({
  claims: z.array(z.string().min(1).max(2000)).min(1).max(50),
});

export const operatorActionKindSchema = z.enum([
  'content_opportunity',
  'content_gap',
  'trend_signal',
  'content_review',
  'outreach_review',
  'follow_up',
  'prepared_action',
  'learning_proposal',
  'stale_draft',
]);

export const operatorActionsQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'dismissed', 'completed']).default('pending'),
  kind: z.string().max(100).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type UserCreate = z.infer<typeof userCreateSchema>;
export type UserLogin = z.infer<typeof userLoginSchema>;
export type WorkspaceCreate = z.infer<typeof workspaceCreateSchema>;
export type WorkspaceUpdate = z.infer<typeof workspaceUpdateSchema>;
export type WorkspaceMembershipCreate = z.infer<typeof workspaceMembershipCreateSchema>;
export type WorkspaceMembershipUpdate = z.infer<typeof workspaceMembershipUpdateSchema>;
export type ProfileCreate = z.infer<typeof profileCreateSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type ICPCreate = z.infer<typeof icpCreateSchema>;
export type ICPUpdate = z.infer<typeof icpUpdateSchema>;
export type ContentIdeaCreate = z.infer<typeof contentIdeaCreateSchema>;
export type ContentIdeaUpdate = z.infer<typeof contentIdeaUpdateSchema>;
export type ContentDraftCreate = z.infer<typeof contentDraftCreateSchema>;
export type ContentDraftUpdate = z.infer<typeof contentDraftUpdateSchema>;
export type ContentVersionCreate = z.infer<typeof contentVersionCreateSchema>;
export type LeadCreate = z.infer<typeof leadCreateSchema>;
export type LeadUpdate = z.infer<typeof leadUpdateSchema>;
export type ConversationCreate = z.infer<typeof conversationCreateSchema>;
export type MessageCreate = z.infer<typeof messageCreateSchema>;
export type PipelineOpportunityCreate = z.infer<typeof pipelineOpportunityCreateSchema>;
export type PipelineOpportunityUpdate = z.infer<typeof pipelineOpportunityUpdateSchema>;
export type AnalyticsEventCreate = z.infer<typeof analyticsEventCreateSchema>;
export type LearningSignalCreate = z.infer<typeof learningSignalCreateSchema>;
export type IntelligenceSourceCreate = z.infer<typeof intelligenceSourceCreateSchema>;
export type IntelligenceSourceUpdate = z.infer<typeof intelligenceSourceUpdateSchema>;
export type TopicResearch = z.infer<typeof topicResearchSchema>;
export type OpportunityFeedback = z.infer<typeof opportunityFeedbackSchema>;
export type OpportunityConvert = z.infer<typeof opportunityConvertSchema>;
export type OpportunityTriage = z.infer<typeof opportunityTriageSchema>;
export type ContentObjective = z.infer<typeof contentObjectiveSchema>;
export type ContentAngle = z.infer<typeof contentAngleSchema>;
export type ContentNarrative = z.infer<typeof contentNarrativeSchema>;
export type ContentPlanCreate = z.infer<typeof contentPlanCreateSchema>;
export type ContentPlanGenerate = z.infer<typeof contentPlanGenerateSchema>;
export type DraftCompose = z.infer<typeof draftComposeSchema>;
export type ClaimBindingCreate = z.infer<typeof claimBindingCreateSchema>;
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type HookGenerate = z.infer<typeof hookGenerateSchema>;
export type VoiceProfileCreate = z.infer<typeof voiceProfileCreateSchema>;
export type VoiceProfileUpdate = z.infer<typeof voiceProfileUpdateSchema>;
export type VoiceReceiptCreate = z.infer<typeof voiceReceiptCreateSchema>;
export type WritingSampleCreate = z.infer<typeof writingSampleCreateSchema>;
export type ProspectResearchCreate = z.infer<typeof prospectResearchCreateSchema>;
export type ProspectSignalCreate = z.infer<typeof prospectSignalCreateSchema>;
export type ProspectBriefCreate = z.infer<typeof prospectBriefCreateSchema>;
export type OutreachStrategyCreate = z.infer<typeof outreachStrategyCreateSchema>;
export type OutreachDraftCompose = z.infer<typeof outreachDraftComposeSchema>;
export type OutreachReviewAction = z.infer<typeof outreachReviewActionSchema>;
export type PreparedActionCreate = z.infer<typeof preparedActionCreateSchema>;
export type SalesContentSignalCreate = z.infer<typeof salesContentSignalCreateSchema>;
export type PublishRecordCreate = z.infer<typeof publishRecordCreateSchema>;
export type OutcomeMetricCreate = z.infer<typeof outcomeMetricCreateSchema>;
export type LearningDerive = z.infer<typeof learningDeriveSchema>;
export type ContentOutcomeDerive = z.infer<typeof contentOutcomeDeriveSchema>;
export type OpportunityScore = z.infer<typeof opportunityScoreSchema>;
export type YfpOpportunityScore = z.infer<typeof yfpOpportunityScoreSchema>;
export type YfpQualityGate = z.infer<typeof yfpQualityGateSchema>;
export type PerformanceReview = z.infer<typeof performanceReviewSchema>;
export type ResearchTrigger = z.infer<typeof researchTriggerSchema>;
export type FactCheck = z.infer<typeof factCheckSchema>;
export type OperatorActionKind = z.infer<typeof operatorActionKindSchema>;
export type OperatorCycleTrigger = z.infer<typeof operatorCycleTriggerSchema>;

export const businessProfileSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  mission: z.string().max(5000).optional(),
  products: z.array(z.record(z.unknown())).default([]),
  services: z.array(z.record(z.unknown())).default([]),
  skills: z.array(z.record(z.unknown())).default([]),
  ebooks: z.array(z.record(z.unknown())).default([]),
  guides: z.array(z.record(z.unknown())).default([]),
  targetOutcomes: z.array(z.record(z.unknown())).default([]),
  monetizationGoals: z.array(z.record(z.unknown())).default([]),
});

export const brandProfileSchema = z.object({
  tone: z.string().max(5000).optional(),
  writingStyle: z.string().max(5000).optional(),
  bannedPhrases: z.array(z.string().max(200)).max(100).default([]),
  preferredVocabulary: z.array(z.string().max(200)).max(100).default([]),
  visualIdentity: z.record(z.unknown()).optional(),
  contentBoundaries: z.string().max(5000).optional(),
});

export const strategyProfileSchema = z.object({
  businessGoals: z.array(z.record(z.unknown())).default([]),
  audienceGoals: z.array(z.record(z.unknown())).default([]),
  contentGoals: z.array(z.record(z.unknown())).default([]),
  growthGoals: z.array(z.record(z.unknown())).default([]),
  productGoals: z.array(z.record(z.unknown())).default([]),
  // Prisma StrategyProfile.salesGoals exists and StrategyProfileService
  // validates/persists it — the API layer must not strip it.
  salesGoals: z.array(z.record(z.unknown())).default([]),
});

export const audienceSegmentSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum([
    'BEGINNER_DEVELOPER',
    'AI_LEARNER',
    'AI_BUILDER',
    'SOFTWARE_DEVELOPER',
    'STARTUP_BUILDER',
    'TECH_STUDENT',
    'TECHNOLOGY_ENTHUSIAST',
    'CUSTOM',
  ]),
  description: z.string().max(2000).optional(),
  problems: z.array(z.string().max(500)).max(50).default([]),
  goals: z.array(z.string().max(500)).max(50).default([]),
  interests: z.array(z.string().max(200)).max(50).default([]),
  tools: z.array(z.string().max(200)).max(50).default([]),
  skills: z.array(z.string().max(200)).max(50).default([]),
  painPoints: z.array(z.string().max(500)).max(50).default([]),
  motivations: z.array(z.string().max(500)).max(50).default([]),
  contentPreferences: z.array(z.string().max(200)).max(50).default([]),
});

export const contentDNASchema = z.object({
  contentIdeaId: idSchema.optional(),
  contentDraftId: idSchema.optional(),
  contentVersionId: idSchema.optional(),
  topic: z.string().max(200).optional(),
  subtopic: z.string().max(200).optional(),
  audienceSegmentId: idSchema.optional(),
  skillLevel: z.string().max(50).optional(),
  pillar: z.string().max(100).optional(),
  format: z.enum([
    'TEXT_POST','CAROUSEL','DOCUMENT','IMAGE','VIDEO_SCRIPT','TUTORIAL',
    'NEWS_EXPLANATION','HOW_TO','LIST','COMPARISON','CASE_STUDY','EXPERIMENT',
    'MYTH_VS_FACT','TOOL_BREAKDOWN','PROJECT_WALKTHROUGH',
  ]).optional(),
  angle: z.string().max(5000).optional(),
  hookType: z.enum(['PROBLEM','QUESTION','STATEMENT','STORY','STATISTIC','CONTRARIAN','PREDICTION','FRAMEWORK']).optional(),
  hook: z.string().max(5000).optional(),
  hookLength: z.number().int().nonnegative().optional(),
  title: z.string().max(300).optional(),
  structure: z.record(z.unknown()).optional(),
  bodyLength: z.number().int().nonnegative().optional(),
  visualType: z.string().max(50).optional(),
  visualConcept: z.string().max(5000).optional(),
  ctaType: z.enum(['COMMENT','SHARE','FOLLOW','DOWNLOAD','SIGNUP','BUY','LEARN_MORE','DM','SAVE']).optional(),
  cta: z.string().max(1000).optional(),
  hashtags: z.array(z.string().max(100)).max(30).default([]),
  sourceIds: z.array(idSchema).max(100).default([]),
  freshness: z.string().max(50).optional(),
  publishTime: isoDateSchema.optional(),
  stage: z.enum([
    'RESEARCH','OPPORTUNITY','IDEA','ANGLE','HOOK','SCRIPT','VISUAL_CONCEPT',
    'CAPTION','HASHTAGS','FACT_CHECK','ORIGINALITY_CHECK','QUALITY_CHECK','HUMAN_APPROVAL','PUBLISHING',
  ]).default('RESEARCH'),
});

export const contentStageAdvanceSchema = z.object({
  toStage: z.enum([
    'RESEARCH','OPPORTUNITY','IDEA','ANGLE','HOOK','SCRIPT','VISUAL_CONCEPT',
    'CAPTION','HASHTAGS','FACT_CHECK','ORIGINALITY_CHECK','QUALITY_CHECK','HUMAN_APPROVAL','PUBLISHING',
  ]),
  notes: z.string().max(2000).optional(),
});

export const originalityCheckSchema = z.object({
  draft: z.string().min(1).max(50000),
  sources: z.array(z.object({ id: z.string().max(200), text: z.string().min(1).max(20000) })).max(20).default([]),
});

export const commentIngestSchema = z.object({
  contentVersionId: idSchema.optional(),
  platform: z.string().max(50).default('linkedin'),
  authorName: z.string().max(100).optional(),
  authorUrl: z.string().max(2048).optional(),
  text: z.string().min(1).max(5000),
  externalId: z.string().max(200).optional(),
  postedAt: isoDateSchema.optional(),
});

export const experimentCreateSchema = z.object({
  hypothesis: z.string().min(10).max(2000),
  variable: z.string().min(1).max(100),
  controlDescription: z.string().min(1).max(2000),
  variantDescription: z.string().min(1).max(2000),
  controlContentDNAId: idSchema.optional(),
  variantContentDNAId: idSchema.optional(),
  metricName: z.string().min(1).max(100).default('saves'),
});

export const experimentCompleteSchema = z.object({
  controlMetrics: z.record(z.number()).default({}),
  variantMetrics: z.record(z.number()).default({}),
  sampleSize: z.number().int().min(2),
  conclusion: z.string().max(2000).optional(),
  nextTest: z.string().max(2000).optional(),
});

export const runsTriggerSchema = z.object({
  runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'runDate must be YYYY-MM-DD').optional(),
});

export const operatorCycleTriggerSchema = z.object({
  idempotencyKey: z.string().min(1).max(100),
  correlationId: z.string().max(100).optional(),
});

// Step D: onboarding / workspace settings. Autonomy stays Tier 0 until the
// §6 LinkedIn report is approved: autonomyTier accepts only 0 for now.
export const scheduleUpdateSchema = z.object({
  timezone: z.string().min(1).max(100),
  dailyRunTime: z.string().regex(/^\d{2}:\d{2}$/, 'dailyRunTime must be HH:mm'),
  dailyLlmCallCap: z.number().int().min(0).max(1000),
  dailyFetchCap: z.number().int().min(0).max(5000),
  dailyPreparationCap: z.number().int().min(0).max(500),
  autonomyTier: z.literal(0),
  // Policy setting only: persisted so the autonomy posture is explicit, but
  // the worker's EXECUTION stage stays SKIPPED until a real authorized
  // integration exists — this value never enables execution by itself.
  dailyExecutionCap: z.number().int().min(0).max(10).optional(),
});

export const policyUpdateSchema = z.object({
  tier1PostingEnabled: z.boolean(),
  tier1PostingDailyCap: z.number().int().min(0).max(10),
  tier1RequireApprovedPost: z.boolean(),
  tier2HumanApprovalAck: z.boolean(),
  // Batch 2 (B): explicit workspace auto-preparation policy.
  autoPrepareApprovedWork: z.boolean().optional(),
  autoPrepareColdWork: z.boolean().optional(),
  dailyAutoPreparationQuota: z.number().int().min(0).max(100).optional(),
});

// Batch 2 (D): provenance-based attribution links.
export const attributionLinkSchema = z.object({
  sourceType: z.string().min(1).max(100),
  sourceId: z.string().min(1).max(100),
  targetType: z.string().min(1).max(100),
  targetId: z.string().min(1).max(100),
  attributionType: z.enum(['DIRECT', 'INFERRED', 'UNKNOWN']),
  evidenceRefs: z.array(z.string().min(1).max(500)).max(50).default([]),
  reason: z.string().max(2000).optional(),
});

export const attributionUpdateSchema = z.object({
  attributionType: z.enum(['DIRECT', 'INFERRED', 'UNKNOWN']).optional(),
  evidenceRefs: z.array(z.string().min(1).max(500)).max(50).optional(),
  reason: z.string().max(2000).optional(),
});

// Batch 2 (C): evidence maturity promotion (single step, evidence-backed).
export const maturityPromoteSchema = z.object({
  to: z.enum(['OBSERVED', 'REPEATED_SIGNAL', 'HYPOTHESIS', 'EXPERIMENT', 'SUPPORTED_PATTERN']),
  sourceMetricIds: z.array(z.string().uuid()).max(100).default([]),
  reason: z.string().min(1).max(2000),
});

export const killUpdateSchema = z.object({
  paused: z.boolean().optional(),
  killSwitch: z.boolean().optional(),
}).refine((o) => o.paused !== undefined || o.killSwitch !== undefined, {
  message: 'Provide at least one of paused or killSwitch.',
});

export const feedSourceCreateSchema = z.object({
  url: urlSchema,
  type: z.enum(['rss', 'atom', 'hackernews', 'github_releases', 'blog', 'site', 'reddit', 'youtube', 'google_trends', 'linkedin', 'x', 'instagram', 'tiktok']).default('rss'),
  name: z.string().max(200).optional(),
  active: z.boolean().default(true),
});

export const feedSourceUpdateSchema = z.object({
  name: z.string().max(200).optional(),
  type: z.enum(['rss', 'atom', 'hackernews', 'github_releases', 'blog', 'site', 'reddit', 'youtube', 'google_trends', 'linkedin', 'x', 'instagram', 'tiktok']).optional(),
  active: z.boolean().optional(),
});

export const socialPlatformSchema = z.enum(['instagram', 'facebook', 'linkedin', 'youtube', 'x']);

export const socialRefreshSchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const socialSaveIdeaSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const leadImportSchema = z.object({
  csv: z.string().min(1).max(500000),
  filename: z.string().max(255).optional(),
});

/**
 * Workspace connector configuration (research connectors only).
 * Feed-driven sources (RSS, ATOM, HACKERNEWS, GITHUB_RELEASES, BLOG, SITE)
 * keep FeedSource as their source of truth and are rejected by the
 * connectors API. Each config mirrors parameters the existing connector
 * implementation actually reads — no invented options.
 */
export const researchConnectorTypeSchema = z.enum([
  'REDDIT',
  'GOOGLE_TRENDS',
  'YOUTUBE',
  'LINKEDIN',
  'X',
  'INSTAGRAM',
  'TIKTOK',
  'FACEBOOK',
  'QUORA',
]);

const subredditName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_]+$/, 'Subreddit names may only contain letters, numbers and underscores (without the r/ prefix).')
  .transform((s) => s.replace(/^r\//i, ''));

export const redditConnectorConfigSchema = z
  .object({
    // Mirrors redditConnector.fetchRecentItems: subreddits (capped at 20),
    // timeFilter (default 'day'), sortBy (default 'hot').
    subreddits: z.array(subredditName).min(1).max(20).default(['programming', 'artificial', 'technology']),
    timeFilter: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).default('day'),
    sortBy: z.enum(['hot', 'new', 'top', 'rising', 'controversial']).default('hot'),
  })
  .strict();

export const googleTrendsConnectorConfigSchema = z
  .object({
    // Mirrors googleTrendsConnector.fetchRecentItems: topics, geo, timeRange,
    // category. Endpoints are unofficial public CSV — never an official API.
    topics: z.array(z.string().trim().min(1).max(100)).min(1).max(10).default(['AI']),
    geo: z
      .string()
      .trim()
      .min(2)
      .max(8)
      .regex(/^[A-Za-z-]+$/, 'Region must be a Trends geo code such as US or GB.')
      .default('US')
      .transform((g) => g.toUpperCase()),
    timeRange: z.string().trim().min(1).max(30).default('now 7-d'),
    category: z.number().int().min(0).max(2000).default(0),
  })
  .strict();

export const emptyConnectorConfigSchema = z.object({}).strict();

export const linkedinConnectorConfigSchema = z
  .object({
    // Mirrors linkedinConnector.fetchRecentItems: optional organizationIds.
    organizationIds: z.array(z.string().trim().min(1).max(100)).max(25).default([]),
  })
  .strict();

export function connectorConfigSchemaFor(sourceType: string) {
  switch (sourceType) {
    case 'REDDIT':
      return redditConnectorConfigSchema;
    case 'GOOGLE_TRENDS':
      return googleTrendsConnectorConfigSchema;
    case 'LINKEDIN':
      return linkedinConnectorConfigSchema;
    case 'YOUTUBE':
    case 'X':
    case 'INSTAGRAM':
    case 'TIKTOK':
    case 'FACEBOOK':
    case 'QUORA':
      return emptyConnectorConfigSchema;
    default:
      return null;
  }
}

export const workspaceConnectorUpsertSchema = z.object({
  enabled: z.boolean(),
  // Validated per sourceType by the route via connectorConfigSchemaFor().
  config: z.record(z.unknown()).default({}),
});

export const performanceRecordSchema = z.object({
  impressions: z.number().int().nonnegative().optional(),
  reach: z.number().int().nonnegative().optional(),
  reactions: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  reposts: z.number().int().nonnegative().optional(),
  saves: z.number().int().nonnegative().optional(),
  sends: z.number().int().nonnegative().optional(),
  linkClicks: z.number().int().nonnegative().optional(),
  profileViews: z.number().int().nonnegative().optional(),
  followerGain: z.number().int().optional(),
  businessActions: z.number().int().nonnegative().optional(),
});