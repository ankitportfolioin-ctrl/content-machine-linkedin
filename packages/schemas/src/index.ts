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
  summary: z.string().max(2000).optional(),
  industry: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  avatarUrl: urlSchema.optional(),
});

export const profileUpdateSchema = profileCreateSchema.partial();

export const icpCreateSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  criteria: z.record(z.unknown()).optional(),
});

export const icpUpdateSchema = icpCreateSchema.partial();

export const contentIdeaCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: descriptionSchema,
  angle: z.string().max(500).optional(),
  format: z.enum(['post', 'article', 'carousel', 'video', 'poll']).optional(),
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