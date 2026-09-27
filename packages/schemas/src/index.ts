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
  sourceType: z.enum(['article', 'rss', 'atom', 'sitemap', 'website', 'user_url']).optional(),
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