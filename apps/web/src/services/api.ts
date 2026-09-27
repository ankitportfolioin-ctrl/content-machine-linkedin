import {
  ApiError,
  BindingsResponse,
  BriefSynthesis,
  ComposeDraftResponse,
  ContentIdea,
  ContentIdeaDetailResponse,
  ContentIdeasResponse,
  ContentPlan,
  ContentSignalItem,
  ContentVersion,
  ConversationClassification,
  ConvertOpportunityResponse,
  DraftDetailResponse,
  DraftPreview,
  DraftValidationResponse,
  FollowUpRecommendation,
  GapsResponse,
  GatesResponse,
  HealthResponse,
  Icp,
  IcpDetailResponse,
  IcpsResponse,
  IntelligenceOverview,
  LoginResponse,
  OpportunitiesResponse,
  OpportunityDetailResponse,
  OpportunityFeedback,
  OpportunityFeedbackKind,
  OutreachDraft,
  OutreachQualityGate,
  OutreachReview,
  OutreachStrategy,
  OutreachValidation,
  PipelineOpportunity,
  PlanDetailResponse,
  PlanValidation,
  PlansResponse,
  PreparedAction,
  ProfileResponse,
  ProspectBrief,
  ProspectCandidate,
  ProspectIntent,
  ProspectQualification,
  ProspectResearch,
  ProspectSignal,
  QualificationScore,
  ReviewDetailResponse,
  ReviewDecision,
  ReviewsResponse,
  SalesConversation,
  SalesLead,
  SalesMessage,
  SourcesResponse,
  Source,
  TrendsResponse,
  UserProfile,
  VersionDetailResponse,
  VersionsResponse,
  VoiceProfile,
  VoiceProfileResponse,
  VoiceReceipt,
  VoiceReceiptDetailResponse,
  VoiceReceiptsResponse,
  VoiceSampleDetailResponse,
  VoiceSamplesResponse,
  VoiceSample as VoiceSampleType,
  WorkspacesResponse,
  ContentReview,
} from '../types';

export type { HealthResponse, ApiError };

const API_BASE = '/api/v1';

export const TOKEN_STORAGE_KEY = 'go_token';
export const WORKSPACE_STORAGE_KEY = 'go_workspace';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getStoredWorkspaceId(): string | null {
  try {
    return localStorage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export class ApiRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

export function isAiUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 503 && error.code === 'AI_UNAVAILABLE';
}

export function friendlyErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 503 && error.code === 'AI_UNAVAILABLE') {
      return 'AI assistance is temporarily unavailable. Please try again later.';
    }
    if (error.status === 403) {
      return 'You do not have access to this workspace item.';
    }
    if (error.status === 422) {
      return `This action was blocked by quality checks: ${error.message}`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

async function handleResponse<T>(response: Response): Promise<T> {
  let data: unknown = null;
  try {
    const text = await response.text();
    data = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const maybeError = data as ApiError | null;
    const code = maybeError?.error?.code ?? `HTTP_${response.status}`;
    const message = maybeError?.error?.message ?? `Request failed with status ${response.status}`;
    throw new ApiRequestError(response.status, code, message);
  }

  return data as T;
}

interface AuthedOptions extends RequestInit {
  authOptional?: boolean;
}

async function authedFetch(path: string, options: AuthedOptions = {}): Promise<Response> {
  const { authOptional, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };

  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (!authOptional && !path.startsWith('/auth/')) {
    // Let the request go through without a token so the server
    // returns an honest 401; UI gates on auth state separately.
  }

  const workspaceId = getStoredWorkspaceId();
  const isLogin = path.startsWith('/auth/login');
  if (workspaceId && !isLogin) {
    headers['X-Workspace-ID'] = workspaceId;
  }

  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function authedRequest<T>(path: string, options: AuthedOptions = {}): Promise<T> {
  const response = await authedFetch(path, options);
  return handleResponse<T>(response);
}

// ---------------------------------------------------------------------------
// Unauthenticated health checks (kept for HomePage)
// ---------------------------------------------------------------------------

export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`);
  return handleResponse<HealthResponse>(response);
}

export async function checkReady(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/ready`);
  return handleResponse<HealthResponse>(response);
}

// ---------------------------------------------------------------------------
// Auth + workspaces
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse<LoginResponse>(response);
}

export async function listWorkspaces(): Promise<WorkspacesResponse> {
  return authedRequest<WorkspacesResponse>('/workspaces');
}

// ---------------------------------------------------------------------------
// Intelligence
// ---------------------------------------------------------------------------

export async function getIntelligenceOverview(): Promise<IntelligenceOverview> {
  const data = await authedRequest<Record<string, unknown>>('/intelligence/overview');
  return (data ?? {}) as IntelligenceOverview;
}

export async function listOpportunities(): Promise<OpportunitiesResponse> {
  const data = await authedRequest<Record<string, unknown>>('/intelligence/opportunities');
  const opportunities = Array.isArray(data['opportunities']) ? data['opportunities'] : [];
  return {
    opportunities: opportunities as OpportunitiesResponse['opportunities'],
    pagination: (data['pagination'] as OpportunitiesResponse['pagination']) ?? undefined,
  };
}

export async function getOpportunity(id: string): Promise<OpportunityDetailResponse> {
  return authedRequest<OpportunityDetailResponse>(`/intelligence/opportunities/${encodeURIComponent(id)}`);
}

export async function submitOpportunityFeedback(
  id: string,
  feedback: OpportunityFeedbackKind,
  reason?: string,
): Promise<{ feedback: OpportunityFeedback }> {
  return authedRequest<{ feedback: OpportunityFeedback }>(
    `/intelligence/opportunities/${encodeURIComponent(id)}/feedback`,
    { method: 'POST', body: JSON.stringify({ feedback, reason }) },
  );
}

export async function convertOpportunity(
  id: string,
  contentIdeaTitle?: string,
): Promise<ConvertOpportunityResponse> {
  return authedRequest<ConvertOpportunityResponse>(
    `/intelligence/opportunities/${encodeURIComponent(id)}/convert`,
    { method: 'POST', body: JSON.stringify({ contentIdeaTitle }) },
  );
}

export async function listTrends(): Promise<TrendSignalList> {
  const data = await authedRequest<Record<string, unknown>>('/intelligence/trends');
  const list = Array.isArray(data['trends'])
    ? data['trends']
    : Array.isArray(data['trendSignals'])
      ? data['trendSignals']
      : [];
  return { trends: list as TrendsResponse['trends'] };
}

interface TrendSignalList {
  trends: TrendsResponse['trends'];
}

export async function listGaps(): Promise<GapsResponse> {
  const data = await authedRequest<Record<string, unknown>>('/intelligence/gaps');
  return { gaps: (Array.isArray(data['gaps']) ? data['gaps'] : []) as GapsResponse['gaps'] };
}

export async function listSources(): Promise<SourcesResponse> {
  const data = await authedRequest<Record<string, unknown>>('/intelligence/sources');
  return { sources: (Array.isArray(data['sources']) ? data['sources'] : []) as Source[] };
}

export async function createSource(url: string): Promise<Source | { error: unknown }> {
  return authedRequest<Source | { error: unknown }>('/intelligence/sources', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

// ---------------------------------------------------------------------------
// Content ideas
// ---------------------------------------------------------------------------

export async function listContentIdeas(): Promise<ContentIdeasResponse> {
  const data = await authedRequest<Record<string, unknown>>('/content-ideas');
  return {
    contentIdeas: (Array.isArray(data['contentIdeas']) ? data['contentIdeas'] : []) as ContentIdea[],
  };
}

export interface CreateContentIdeaInput {
  title: string;
  description?: string;
  angle?: string;
  format?: string;
  tags?: string[];
}

export async function createContentIdea(input: CreateContentIdeaInput): Promise<ContentIdeaDetailResponse> {
  return authedRequest<ContentIdeaDetailResponse>('/content-ideas', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getContentIdea(id: string): Promise<ContentIdeaDetailResponse> {
  return authedRequest<ContentIdeaDetailResponse>(`/content-ideas/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Content plans
// ---------------------------------------------------------------------------

export interface CreatePlanInput {
  thesis: string;
  audience: string;
  objective: string;
  angle: string;
  format: string;
  narrativeStructure: string;
  keyPoints: string[];
  hookDirection?: string;
  ctaStrategy?: string;
  evidenceMap?: unknown[];
  contradictionNotes?: string;
  voiceInstructions?: string;
  mustNotClaim?: string[];
  contentIdeaId?: string;
  opportunityId?: string;
}

export async function listPlans(contentIdeaId?: string): Promise<PlansResponse> {
  const query = contentIdeaId ? `?contentIdeaId=${encodeURIComponent(contentIdeaId)}` : '';
  const data = await authedRequest<Record<string, unknown>>(`/content-plans${query}`);
  return { plans: (Array.isArray(data['plans']) ? data['plans'] : []) as ContentPlan[] };
}

export async function createPlan(input: CreatePlanInput): Promise<PlanDetailResponse> {
  return authedRequest<PlanDetailResponse>('/content-plans', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface GeneratePlanInput {
  contentIdeaId?: string;
  opportunityId?: string;
  objective?: string;
  angle?: string;
  format?: string;
  audienceOverride?: string;
  thesisOverride?: string;
}

export async function generatePlan(input: GeneratePlanInput): Promise<PlanDetailResponse> {
  return authedRequest<PlanDetailResponse>('/content-plans/generate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getPlan(id: string): Promise<PlanDetailResponse> {
  return authedRequest<PlanDetailResponse>(`/content-plans/${encodeURIComponent(id)}`);
}

export async function approvePlan(id: string): Promise<PlanDetailResponse> {
  return authedRequest<PlanDetailResponse>(`/content-plans/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
  });
}

export async function validatePlan(id: string): Promise<{ validation: PlanValidation }> {
  return authedRequest<{ validation: PlanValidation }>(
    `/content-plans/${encodeURIComponent(id)}/validate`,
    { method: 'POST' },
  );
}

// ---------------------------------------------------------------------------
// Content drafts
// ---------------------------------------------------------------------------

export async function composeDraft(planId: string): Promise<ComposeDraftResponse> {
  return authedRequest<ComposeDraftResponse>('/content-drafts/compose', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  });
}

export async function getDraft(id: string): Promise<DraftDetailResponse> {
  return authedRequest<DraftDetailResponse>(`/content-drafts/${encodeURIComponent(id)}`);
}

export async function updateDraftBody(id: string, body: string): Promise<DraftDetailResponse> {
  return authedRequest<DraftDetailResponse>(`/content-drafts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

export interface AddBindingInput {
  span: string;
  sourceClaimId?: string;
  confidence?: number;
}

export async function addDraftBindings(
  id: string,
  bindings: AddBindingInput[],
): Promise<BindingsResponse> {
  return authedRequest<BindingsResponse>(`/content-drafts/${encodeURIComponent(id)}/bindings`, {
    method: 'POST',
    body: JSON.stringify({ bindings }),
  });
}

export async function listDraftBindings(id: string): Promise<BindingsResponse> {
  const data = await authedRequest<Record<string, unknown>>(
    `/content-drafts/${encodeURIComponent(id)}/bindings`,
  );
  return {
    bindings: (Array.isArray(data['bindings']) ? data['bindings'] : []) as BindingsResponse['bindings'],
  };
}

export async function validateDraft(id: string): Promise<DraftValidationResponse> {
  return authedRequest<DraftValidationResponse>(`/content-drafts/${encodeURIComponent(id)}/validate`, {
    method: 'POST',
  });
}

export async function getDraftGates(id: string): Promise<GatesResponse> {
  const data = await authedRequest<Record<string, unknown>>(
    `/content-drafts/${encodeURIComponent(id)}/gates`,
  );
  return { gates: (Array.isArray(data['gates']) ? data['gates'] : []) as GatesResponse['gates'] };
}

export async function getDraftPreview(id: string): Promise<DraftPreview> {
  return authedRequest<DraftPreview>(`/content-drafts/${encodeURIComponent(id)}/preview`);
}

export async function createDraftRevision(id: string): Promise<DraftDetailResponse> {
  return authedRequest<DraftDetailResponse>(`/content-drafts/${encodeURIComponent(id)}/revisions`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export async function listReviews(draftId?: string): Promise<ReviewsResponse> {
  const query = draftId ? `?draftId=${encodeURIComponent(draftId)}` : '';
  const data = await authedRequest<Record<string, unknown>>(`/content-reviews${query}`);
  return {
    reviews: (Array.isArray(data['reviews']) ? data['reviews'] : []) as ContentReview[],
  };
}

export async function submitReview(draftId: string, note?: string): Promise<ReviewDetailResponse> {
  return authedRequest<ReviewDetailResponse>('/content-reviews', {
    method: 'POST',
    body: JSON.stringify({ draftId, note }),
  });
}

export async function decideReview(
  id: string,
  action: ReviewDecision,
  note?: string,
): Promise<ReviewDetailResponse> {
  return authedRequest<ReviewDetailResponse>(`/content-reviews/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ action, note }),
  });
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export async function listVersions(draftId?: string): Promise<VersionsResponse> {
  const query = draftId ? `?draftId=${encodeURIComponent(draftId)}` : '';
  const data = await authedRequest<Record<string, unknown>>(`/content-versions${query}`);
  return {
    versions: (Array.isArray(data['versions']) ? data['versions'] : []) as ContentVersion[],
  };
}

export async function getVersion(id: string): Promise<VersionDetailResponse> {
  return authedRequest<VersionDetailResponse>(`/content-versions/${encodeURIComponent(id)}`);
}

export async function finalizeVersion(draftId: string, changeSummary?: string): Promise<VersionDetailResponse> {
  return authedRequest<VersionDetailResponse>('/content-versions/finalize', {
    method: 'POST',
    body: JSON.stringify({ draftId, changeSummary }),
  });
}

export async function deleteVersion(id: string): Promise<void> {
  const response = await authedFetch(`/content-versions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await handleResponse<unknown>(response);
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

export async function getVoiceProfile(): Promise<VoiceProfileResponse> {
  return authedRequest<VoiceProfileResponse>('/voice/profile');
}

export async function updateVoiceProfile(input: Partial<VoiceProfile>): Promise<VoiceProfileResponse> {
  return authedRequest<VoiceProfileResponse>('/voice/profile', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function listReceipts(): Promise<VoiceReceiptsResponse> {
  const data = await authedRequest<Record<string, unknown>>('/voice/receipts');
  const receipts = Array.isArray(data['receipts'])
    ? data['receipts']
    : Array.isArray(data['voiceReceipts'])
      ? data['voiceReceipts']
      : [];
  return { receipts: receipts as VoiceReceipt[] };
}

export async function createReceipt(fact: string, context?: string): Promise<VoiceReceiptDetailResponse> {
  return authedRequest<VoiceReceiptDetailResponse>('/voice/receipts', {
    method: 'POST',
    body: JSON.stringify({ fact, context }),
  });
}

export async function deleteReceipt(id: string): Promise<void> {
  const response = await authedFetch(`/voice/receipts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await handleResponse<unknown>(response);
}

export async function listSamples(): Promise<VoiceSamplesResponse> {
  const data = await authedRequest<Record<string, unknown>>('/voice/samples');
  return { samples: (Array.isArray(data['samples']) ? data['samples'] : []) as VoiceSampleType[] };
}

export async function createSample(title: string, content: string): Promise<VoiceSampleDetailResponse> {
  return authedRequest<VoiceSampleDetailResponse>('/voice/samples', {
    method: 'POST',
    body: JSON.stringify({ title, content }),
  });
}

export async function deleteSample(id: string): Promise<void> {
  const response = await authedFetch(`/voice/samples/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await handleResponse<unknown>(response);
}

// ---------------------------------------------------------------------------
// Profiles + ICPs
// ---------------------------------------------------------------------------

export async function getMyProfile(): Promise<ProfileResponse> {
  return authedRequest<ProfileResponse>('/profiles/me');
}

export async function updateProfile(id: string, fields: Partial<UserProfile>): Promise<ProfileResponse> {
  return authedRequest<ProfileResponse>(`/profiles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export async function listIcps(): Promise<IcpsResponse> {
  const data = await authedRequest<Record<string, unknown>>('/icps');
  return { icps: (Array.isArray(data['icps']) ? data['icps'] : []) as Icp[] };
}

export interface CreateIcpInput {
  name: string;
  description?: string;
  targetRoles?: string[];
  industries?: string[];
  companySize?: string;
  problems?: string;
  exclusions?: string;
}

export async function createIcp(input: CreateIcpInput): Promise<IcpDetailResponse> {
  return authedRequest<IcpDetailResponse>('/icps', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateIcp(id: string, fields: Partial<Icp>): Promise<IcpDetailResponse> {
  return authedRequest<IcpDetailResponse>(`/icps/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

// ---------------------------------------------------------------------------
// Phase 4: Leads
// ---------------------------------------------------------------------------

export interface CreateSalesLeadInput {
  linkedinUrl: string;
  name: string;
  headline?: string;
  company?: string;
  location?: string;
  status?: string;
  tags?: string[];
  notes?: string;
}

export async function listSalesLeads(): Promise<{ leads: SalesLead[] }> {
  const data = await authedRequest<Record<string, unknown>>('/leads');
  return { leads: (Array.isArray(data['leads']) ? data['leads'] : []) as SalesLead[] };
}

export async function createSalesLead(input: CreateSalesLeadInput): Promise<{ lead: SalesLead }> {
  return authedRequest<{ lead: SalesLead }>('/leads', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Phase 4: Prospects (discover / research / signals / qualification / briefs)
// ---------------------------------------------------------------------------

export interface DiscoverProspectInput {
  name?: string;
  title?: string;
  company?: string;
  companyDomain?: string;
  location?: string;
  publicSourceUrls?: string[];
}

export async function discoverProspect(
  input: DiscoverProspectInput,
): Promise<{ candidate: ProspectCandidate }> {
  return authedRequest<{ candidate: ProspectCandidate }>('/prospects/discover', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface ResearchProspectInput extends DiscoverProspectInput {
  leadId?: string;
}

export async function researchProspect(
  input: ResearchProspectInput,
): Promise<{ research: ProspectResearch }> {
  return authedRequest<{ research: ProspectResearch }>('/prospects/research', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getProspectResearch(leadId: string): Promise<{ research: ProspectResearch }> {
  return authedRequest<{ research: ProspectResearch }>(
    `/prospects/research?leadId=${encodeURIComponent(leadId)}`,
  );
}

export interface RecordSignalInput {
  leadId?: string;
  signalType: string;
  source: string;
  observedAt?: string;
  confidence: number;
  evidence: unknown;
  interpretation: string;
}

export async function recordProspectSignal(input: RecordSignalInput): Promise<{ signal: ProspectSignal }> {
  return authedRequest<{ signal: ProspectSignal }>('/prospects/signals', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listProspectSignals(leadId: string): Promise<{ signals: ProspectSignal[] }> {
  const data = await authedRequest<Record<string, unknown>>(
    `/prospects/signals?leadId=${encodeURIComponent(leadId)}`,
  );
  return { signals: (Array.isArray(data['signals']) ? data['signals'] : []) as ProspectSignal[] };
}

export async function getProspectIntent(leadId: string): Promise<ProspectIntent> {
  const data = await authedRequest<Record<string, unknown>>(
    `/prospects/intent?leadId=${encodeURIComponent(leadId)}`,
  );
  return {
    status: typeof data['status'] === 'string' ? (data['status'] as string) : undefined,
    signals: (Array.isArray(data['signals']) ? data['signals'] : []) as ProspectSignal[],
  };
}

export async function qualifyProspect(
  leadId: string,
): Promise<{ qualification: ProspectQualification }> {
  return authedRequest<{ qualification: ProspectQualification }>('/prospects/qualify', {
    method: 'POST',
    body: JSON.stringify({ leadId }),
  });
}

export async function getProspectQualification(
  leadId: string,
): Promise<{ qualification: ProspectQualification; score: QualificationScore }> {
  return authedRequest<{ qualification: ProspectQualification; score: QualificationScore }>(
    `/prospects/qualification?leadId=${encodeURIComponent(leadId)}`,
  );
}

export async function createProspectBrief(leadId?: string, researchId?: string): Promise<{ brief: ProspectBrief }> {
  return authedRequest<{ brief: ProspectBrief }>('/prospects/briefs', {
    method: 'POST',
    body: JSON.stringify({ leadId, researchId }),
  });
}

export async function listProspectBriefs(leadId: string): Promise<{ briefs: ProspectBrief[] }> {
  const data = await authedRequest<Record<string, unknown>>(
    `/prospects/briefs?leadId=${encodeURIComponent(leadId)}`,
  );
  const list = Array.isArray(data['briefs'])
    ? data['briefs']
    : Array.isArray(data['brief']) && data['brief']
      ? [data['brief']]
      : [];
  return { briefs: list as ProspectBrief[] };
}

export async function synthesizeBrief(
  id: string,
  material: unknown[],
): Promise<{ synthesis: BriefSynthesis }> {
  return authedRequest<{ synthesis: BriefSynthesis }>(
    `/prospects/briefs/${encodeURIComponent(id)}/synthesize`,
    { method: 'POST', body: JSON.stringify({ material }) },
  );
}

// ---------------------------------------------------------------------------
// Phase 4: Outreach (strategies / drafts / reviews / prepared actions)
// ---------------------------------------------------------------------------

export interface CreateStrategyInput {
  leadId?: string;
  briefId?: string;
  objective: string;
  audience: string;
  relationshipStage?: string;
  angle: string;
  reasonForContact: string;
  relevantEvidence?: unknown[];
  personalizationLevel?: string;
  ctaType?: string;
  riskFlags?: string[];
  mustNotClaim?: string[];
  relevantContentId?: string;
  contentReason?: string;
}

export async function createOutreachStrategy(
  input: CreateStrategyInput,
): Promise<{ strategy: OutreachStrategy }> {
  return authedRequest<{ strategy: OutreachStrategy }>('/outreach/strategies', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listOutreachStrategies(leadId: string): Promise<{ strategies: OutreachStrategy[] }> {
  const data = await authedRequest<Record<string, unknown>>(
    `/outreach/strategies?leadId=${encodeURIComponent(leadId)}`,
  );
  return {
    strategies: (Array.isArray(data['strategies']) ? data['strategies'] : []) as OutreachStrategy[],
  };
}

export async function approveOutreachStrategy(id: string): Promise<{ strategy: OutreachStrategy }> {
  return authedRequest<{ strategy: OutreachStrategy }>(
    `/outreach/strategies/${encodeURIComponent(id)}/approve`,
    { method: 'POST' },
  );
}

export async function createOutreachDraft(
  strategyId: string,
  draftType: string,
): Promise<{ draft: OutreachDraft }> {
  return authedRequest<{ draft: OutreachDraft }>('/outreach/drafts', {
    method: 'POST',
    body: JSON.stringify({ strategyId, draftType }),
  });
}

export async function listOutreachDrafts(params: {
  strategyId?: string;
  leadId?: string;
}): Promise<{ drafts: OutreachDraft[] }> {
  const query = new URLSearchParams();
  if (params.strategyId) query.set('strategyId', params.strategyId);
  if (params.leadId) query.set('leadId', params.leadId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await authedRequest<Record<string, unknown>>(`/outreach/drafts${suffix}`);
  return { drafts: (Array.isArray(data['drafts']) ? data['drafts'] : []) as OutreachDraft[] };
}

export async function getOutreachDraft(id: string): Promise<{ draft: OutreachDraft }> {
  return authedRequest<{ draft: OutreachDraft }>(`/outreach/drafts/${encodeURIComponent(id)}`);
}

export async function updateOutreachDraft(
  id: string,
  fields: Record<string, unknown>,
): Promise<{ draft: OutreachDraft }> {
  return authedRequest<{ draft: OutreachDraft }>(`/outreach/drafts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export async function createOutreachDraftRevision(id: string): Promise<{ draft: OutreachDraft }> {
  return authedRequest<{ draft: OutreachDraft }>(
    `/outreach/drafts/${encodeURIComponent(id)}/revisions`,
    { method: 'POST' },
  );
}

export async function validateOutreachDraft(
  id: string,
): Promise<{ validation: OutreachValidation }> {
  return authedRequest<{ validation: OutreachValidation }>(
    `/outreach/drafts/${encodeURIComponent(id)}/validate`,
    { method: 'POST' },
  );
}

export async function getOutreachDraftGates(
  id: string,
): Promise<{ gates: OutreachQualityGate[]; finalStatus?: string; overallScore?: number }> {
  return authedRequest<{ gates: OutreachQualityGate[]; finalStatus?: string; overallScore?: number }>(
    `/outreach/drafts/${encodeURIComponent(id)}/gates`,
  );
}

export async function submitOutreachReview(
  draftId: string,
  note?: string,
): Promise<{ review: OutreachReview }> {
  return authedRequest<{ review: OutreachReview }>('/outreach/reviews', {
    method: 'POST',
    body: JSON.stringify({ draftId, note }),
  });
}

export async function listOutreachReviews(draftId: string): Promise<{ reviews: OutreachReview[] }> {
  const data = await authedRequest<Record<string, unknown>>(
    `/outreach/reviews?draftId=${encodeURIComponent(draftId)}`,
  );
  return { reviews: (Array.isArray(data['reviews']) ? data['reviews'] : []) as OutreachReview[] };
}

export async function decideOutreachReview(
  id: string,
  action: 'approve' | 'reject' | 'request_changes',
): Promise<{ review: OutreachReview }> {
  return authedRequest<{ review: OutreachReview }>(
    `/outreach/reviews/${encodeURIComponent(id)}/decision`,
    { method: 'POST', body: JSON.stringify({ action }) },
  );
}

export interface CreatePreparedActionInput {
  actionType: string;
  target?: string;
  draftId?: string;
  approvalId?: string;
  evidence?: unknown;
  expiresAt?: string;
}

export async function createPreparedAction(
  input: CreatePreparedActionInput,
): Promise<{ preparedAction: PreparedAction }> {
  return authedRequest<{ preparedAction: PreparedAction }>('/outreach/prepared-actions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listPreparedActions(): Promise<{ preparedActions: PreparedAction[] }> {
  const data = await authedRequest<Record<string, unknown>>('/outreach/prepared-actions');
  return {
    preparedActions: (Array.isArray(data['preparedActions'])
      ? data['preparedActions']
      : []) as PreparedAction[],
  };
}

export async function markPreparedActionReady(id: string): Promise<{ preparedAction: PreparedAction }> {
  return authedRequest<{ preparedAction: PreparedAction }>(
    `/outreach/prepared-actions/${encodeURIComponent(id)}/ready`,
    { method: 'POST' },
  );
}

// ---------------------------------------------------------------------------
// Phase 4: Sales intelligence (classification / follow-ups / content signals)
// ---------------------------------------------------------------------------

export async function classifyConversation(
  conversationId: string,
): Promise<{ classification: ConversationClassification }> {
  return authedRequest<{ classification: ConversationClassification }>(
    '/sales-intelligence/classify',
    { method: 'POST', body: JSON.stringify({ conversationId }) },
  );
}

export async function listClassifications(
  conversationId: string,
): Promise<{ classifications: ConversationClassification[] }> {
  const data = await authedRequest<Record<string, unknown>>(
    `/sales-intelligence/classifications?conversationId=${encodeURIComponent(conversationId)}`,
  );
  const list = Array.isArray(data['classifications'])
    ? data['classifications']
    : Array.isArray(data['classification']) && data['classification']
      ? [data['classification']]
      : [];
  return { classifications: list as ConversationClassification[] };
}

export async function recommendFollowUp(input: {
  conversationId?: string;
  leadId?: string;
}): Promise<{ followUp: FollowUpRecommendation }> {
  return authedRequest<{ followUp: FollowUpRecommendation }>('/sales-intelligence/follow-ups', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listFollowUps(): Promise<{ followUps: FollowUpRecommendation[] }> {
  const data = await authedRequest<Record<string, unknown>>('/sales-intelligence/follow-ups');
  return {
    followUps: (Array.isArray(data['followUps']) ? data['followUps'] : []) as FollowUpRecommendation[],
  };
}

export interface CreateContentSignalInput {
  signalType: string;
  sourceConversationIds: string[];
  evidence: unknown;
  frequency?: string;
  recommendedAngle?: string;
  reasoning?: string;
}

export async function createContentSignal(
  input: CreateContentSignalInput,
): Promise<{ signal: ContentSignalItem }> {
  return authedRequest<{ signal: ContentSignalItem }>('/sales-intelligence/content-signals', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listContentSignals(): Promise<{ signals: ContentSignalItem[] }> {
  const data = await authedRequest<Record<string, unknown>>('/sales-intelligence/content-signals');
  return { signals: (Array.isArray(data['signals']) ? data['signals'] : []) as ContentSignalItem[] };
}

// ---------------------------------------------------------------------------
// Phase 4: Conversations + messages
// ---------------------------------------------------------------------------

export async function listSalesConversations(): Promise<{ conversations: SalesConversation[] }> {
  const data = await authedRequest<Record<string, unknown>>('/conversations');
  return {
    conversations: (Array.isArray(data['conversations'])
      ? data['conversations']
      : []) as SalesConversation[],
  };
}

export async function createSalesConversation(input: {
  leadId: string;
  subject?: string;
}): Promise<{ conversation: SalesConversation }> {
  return authedRequest<{ conversation: SalesConversation }>('/conversations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listSalesMessages(
  conversationId: string,
): Promise<{ messages: SalesMessage[] }> {
  const data = await authedRequest<Record<string, unknown>>(
    `/messages?conversationId=${encodeURIComponent(conversationId)}`,
  );
  let list: unknown[] = [];
  if (Array.isArray(data['messages'])) {
    list = data['messages'] as unknown[];
  } else if (Array.isArray(data)) {
    list = data as unknown[];
  }
  const filtered = (list as SalesMessage[]).filter((m) => {
    if (!m || typeof m !== 'object') return true;
    const cid = (m as Record<string, unknown>)['conversationId'];
    return typeof cid === 'undefined' || cid === null || cid === conversationId;
  });
  return { messages: filtered };
}

export async function recordSalesMessage(input: {
  conversationId: string;
  body: string;
  direction: string;
}): Promise<{ message: SalesMessage }> {
  return authedRequest<{ message: SalesMessage }>('/messages', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Phase 4: Pipeline
// ---------------------------------------------------------------------------

export interface CreatePipelineInput {
  leadId: string;
  name: string;
  stage?: string;
  value?: number;
  expectedCloseDate?: string;
  probability?: number;
}

export async function listPipeline(): Promise<{ opportunities: PipelineOpportunity[] }> {
  const data = await authedRequest<Record<string, unknown>>('/pipeline');
  const list = Array.isArray(data['opportunities'])
    ? data['opportunities']
    : Array.isArray(data['pipeline'])
      ? data['pipeline']
      : [];
  return { opportunities: list as PipelineOpportunity[] };
}

export async function createPipelineOpportunity(
  input: CreatePipelineInput,
): Promise<{ opportunity: PipelineOpportunity }> {
  return authedRequest<{ opportunity: PipelineOpportunity }>('/pipeline', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updatePipelineOpportunity(
  id: string,
  fields: Partial<CreatePipelineInput>,
): Promise<{ opportunity: PipelineOpportunity }> {
  return authedRequest<{ opportunity: PipelineOpportunity }>(
    `/pipeline/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(fields) },
  );
}

export async function deletePipelineOpportunity(id: string): Promise<void> {
  const response = await authedFetch(`/pipeline/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await handleResponse<unknown>(response);
}
