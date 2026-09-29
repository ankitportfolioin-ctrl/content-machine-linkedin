import {
  ActionDetailResponse,
  ActionsResponse,
  AiExplanationResponse,
  ApiError,
  ExplanationResponse,
  NextActionsResponse,
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
  OpportunityScoringResponse,
  Opportunity,
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
  RelevantContentSuggestion,
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
  PublishRecord,
  PublishRecordsResponse,
  PublishRecordDetailResponse,
  OutcomeMetric,
  OutcomeMetricsResponse,
  AnalyticsSummary,
  LearningProposal,
  LearningProposalsResponse,
ReadinessResponse,
  ReadinessState,
} from '../types';

export type { HealthResponse, ApiError, ReadinessResponse, ReadinessState };

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

/**
 * Event dispatched on `window` when the API rejects our session with 401.
 * AuthContext listens for it and returns the UI to the signed-out state so
 * the app stops firing authenticated requests instead of 401-storming.
 */
export const AUTH_EXPIRED_EVENT = 'go:auth-expired';

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function notifyAuthExpired(): void {
  clearStoredAuth();
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
  } catch {
    // non-browser environments (tests) have no event bus; storage is cleared above
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

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });

  // The stored session is dead (expired/invalid/revoked): drop it and tell
  // the auth state to sign out, so gated pages stop re-firing requests that
  // can only 401. Auth routes are excluded — a failed login must not wipe
  // (or pretend to wipe) session state, it just returns an honest error.
  if (response.status === 401 && !path.startsWith('/auth/')) {
    notifyAuthExpired();
  }

  return response;
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

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export async function register(input: RegisterInput): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<LoginResponse>(response);
}

/**
 * Validates the stored session against the API. Used on app bootstrap to
 * prove a stored token is still live BEFORE treating the user as signed in.
 * Throws ApiRequestError(401) for a dead session (which also clears storage
 * via the shared 401 handling above).
 */
export async function fetchCurrentUser(): Promise<{ user: import('../types').User }> {
  return authedRequest<{ user: import('../types').User }>('/auth/me');
}

export async function createWorkspace(input: { name: string; slug?: string; description?: string }): Promise<{ workspace: import('../types').Workspace }> {
  return authedRequest<{ workspace: import('../types').Workspace }>('/workspaces', {
    method: 'POST',
    body: JSON.stringify(input),
  });
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

export async function listOpportunities(params?: { status?: string }): Promise<OpportunitiesResponse> {
  const query = params?.status ? `?status=${encodeURIComponent(params.status)}` : '';
  const data = await authedRequest<Record<string, unknown>>(`/intelligence/opportunities${query}`);
  const opportunities = Array.isArray(data['opportunities']) ? data['opportunities'] : [];
  return {
    opportunities: opportunities as OpportunitiesResponse['opportunities'],
    pagination: (data['pagination'] as OpportunitiesResponse['pagination']) ?? undefined,
  };
}

export async function getOpportunity(id: string): Promise<OpportunityDetailResponse> {
  return authedRequest<OpportunityDetailResponse>(`/intelligence/opportunities/${encodeURIComponent(id)}`);
}

export async function getOpportunityScoring(id: string): Promise<OpportunityScoringResponse> {
  return authedRequest<OpportunityScoringResponse>(`/intelligence/opportunities/${encodeURIComponent(id)}/score`);
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

export type OpportunityTriageStatus = 'REVIEWED' | 'DISMISSED';

export async function triageOpportunity(
  id: string,
  status: OpportunityTriageStatus,
): Promise<{ opportunity: Opportunity }> {
  return authedRequest<{ opportunity: Opportunity }>(
    `/intelligence/opportunities/${encodeURIComponent(id)}/status`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
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

export async function listRelevantContent(leadId: string): Promise<{ suggestions: RelevantContentSuggestion[] }> {
  const data = await authedRequest<Record<string, unknown>>(
    `/outreach/strategies/relevant-content?leadId=${encodeURIComponent(leadId)}`,
  );
  return {
    suggestions: (Array.isArray(data['suggestions']) ? data['suggestions'] : []) as RelevantContentSuggestion[],
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

// ---------------------------------------------------------------------------
// Phase 5: Publish records (recording only — user assertions, not verified)
// ---------------------------------------------------------------------------

export interface CreatePublishRecordInput {
  contentVersionId?: string;
  outreachDraftId?: string;
  pipelineOpportunityId?: string;
  channel: string;
  externalRef?: string;
  recordedAt?: string;
}

export async function createPublishRecord(
  input: CreatePublishRecordInput,
): Promise<{ publishRecord: PublishRecord; notice?: string }> {
  return authedRequest<{ publishRecord: PublishRecord; notice?: string }>('/publish-records', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listPublishRecords(): Promise<PublishRecordsResponse> {
  const data = await authedRequest<Record<string, unknown>>('/publish-records');
  return {
    publishRecords: (Array.isArray(data['publishRecords'])
      ? data['publishRecords']
      : []) as PublishRecord[],
  };
}

export async function getPublishRecord(id: string): Promise<PublishRecordDetailResponse> {
  return authedRequest<PublishRecordDetailResponse>(
    `/publish-records/${encodeURIComponent(id)}`,
  );
}

// ---------------------------------------------------------------------------
// Phase 5: Outcome metrics (recorded values only, never estimated)
// ---------------------------------------------------------------------------

export interface CreateOutcomeInput {
  publishRecordId?: string;
  contentVersionId?: string;
  outreachDraftId?: string;
  pipelineOpportunityId?: string;
  metricName: string;
  metricValue: number;
  unit?: string;
  source: string;
  recordedAt?: string;
  idempotencyKey?: string;
}

export async function createOutcome(
  input: CreateOutcomeInput,
): Promise<{ outcomeMetric: OutcomeMetric; notice?: string }> {
  return authedRequest<{ outcomeMetric: OutcomeMetric; notice?: string }>('/outcomes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listOutcomes(params?: {
  metricName?: string;
  publishRecordId?: string;
}): Promise<OutcomeMetricsResponse> {
  const query = new URLSearchParams();
  if (params?.metricName) query.set('metricName', params.metricName);
  if (params?.publishRecordId) query.set('publishRecordId', params.publishRecordId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await authedRequest<Record<string, unknown>>(`/outcomes${suffix}`);
  return {
    outcomeMetrics: (Array.isArray(data['outcomeMetrics'])
      ? data['outcomeMetrics']
      : []) as OutcomeMetric[],
  };
}

// ---------------------------------------------------------------------------
// Phase 5: Analytics summary (computed from recorded rows only)
// ---------------------------------------------------------------------------

export interface AnalyticsRateInput {
  name: string;
  numeratorMetric: string;
  denominatorMetric: string;
}

export async function getAnalyticsSummary(params?: {
  metricName?: string;
  from?: string;
  to?: string;
  rates?: AnalyticsRateInput[];
}): Promise<{ summary: AnalyticsSummary; notice?: string }> {
  const query = new URLSearchParams();
  if (params?.metricName) query.set('metricName', params.metricName);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.rates && params.rates.length > 0) query.set('rates', JSON.stringify(params.rates));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return authedRequest<{ summary: AnalyticsSummary; notice?: string }>(
    `/analytics/summary${suffix}`,
  );
}

// ---------------------------------------------------------------------------
// Phase 5: Derived learning proposals (proposed until explicitly confirmed)
// ---------------------------------------------------------------------------

export interface CreateLearningProposalInput {
  dimension?: string;
  observedPattern?: string;
  supportingMeasurements?: unknown;
  sourceMetricIds?: string[];
  sampleSize?: number;
  denominator?: number;
  proposedAdjustment?: number;
  reason?: string;
  confidence?: number;
  metricName?: string;
  minSampleSize?: number;
}

export async function listLearningProposals(params?: {
  status?: string;
  dimension?: string;
}): Promise<LearningProposalsResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.dimension) query.set('dimension', params.dimension);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await authedRequest<Record<string, unknown>>(`/learning/derived${suffix}`);
  return {
    proposals: (Array.isArray(data['proposals']) ? data['proposals'] : []) as LearningProposal[],
  };
}

export async function createLearningProposal(
  input: CreateLearningProposalInput,
): Promise<{ proposal: LearningProposal }> {
  return authedRequest<{ proposal: LearningProposal }>('/learning/derived', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deriveLearningProposalAuto(input: {
  metricName?: string;
  minSampleSize?: number;
}): Promise<{ proposal: LearningProposal }> {
  return createLearningProposal({
    metricName: input.metricName,
    minSampleSize: input.minSampleSize,
  });
}

export async function confirmLearningProposal(
  id: string,
): Promise<{ proposal: LearningProposal }> {
  return authedRequest<{ proposal: LearningProposal }>(
    `/learning/derived/${encodeURIComponent(id)}/confirm`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function rejectLearningProposal(
  id: string,
): Promise<{ proposal: LearningProposal }> {
  return authedRequest<{ proposal: LearningProposal }>(
    `/learning/derived/${encodeURIComponent(id)}/reject`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function revokeLearningProposal(
  id: string,
): Promise<{ proposal: LearningProposal }> {
  return authedRequest<{ proposal: LearningProposal }>(
    `/learning/derived/${encodeURIComponent(id)}/revoke`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

// ---------------------------------------------------------------------------
// Phase 6: Operator next actions + explanations
// ---------------------------------------------------------------------------

export interface ListNextActionsParams {
  status?: string;
  kind?: string;
  limit?: number;
}

export async function listNextActions(params?: ListNextActionsParams): Promise<NextActionsResponse> {
  const query = new URLSearchParams();
  query.set('status', params?.status ?? 'pending');
  if (typeof params?.kind !== 'undefined' && params.kind !== '') {
    query.set('kind', params.kind);
  }
  if (typeof params?.limit !== 'undefined') {
    query.set('limit', String(params.limit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await authedRequest<NextActionsResponse>(`/operator/next-actions${suffix}`);
  return {
    actions: Array.isArray(data.actions) ? data.actions : [],
    total: typeof data.total === 'number' ? data.total : 0,
  };
}

export async function listActions(params?: { status?: string; limit?: number }): Promise<ActionsResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (typeof params?.limit !== 'undefined') query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await authedRequest<ActionsResponse>(`/operator/actions${suffix}`);
  return { actions: Array.isArray(data.actions) ? data.actions : [] };
}

export interface ProvenanceInput {
  reason?: string;
  evidenceRefs?: string[];
  model?: string;
  modelVersion?: string;
  policySnapshot?: Record<string, unknown>;
}

export async function dismissAction(id: string, provenance?: ProvenanceInput): Promise<ActionDetailResponse> {
  return authedRequest<ActionDetailResponse>(`/operator/actions/${encodeURIComponent(id)}/dismiss`, {
    method: 'POST',
    body: JSON.stringify(provenance ?? {}),
  });
}

// Batch 2 (A): acceptance authorizes preparation — never execution.
export async function acceptAction(id: string, provenance?: ProvenanceInput): Promise<ActionDetailResponse> {
  return authedRequest<ActionDetailResponse>(`/operator/actions/${encodeURIComponent(id)}/accept`, {
    method: 'POST',
    body: JSON.stringify(provenance ?? {}),
  });
}

// ---------------------------------------------------------------------------
// Batch 2: auto-preparation status / runs / log
// ---------------------------------------------------------------------------

export async function getAutoPrepStatus(): Promise<{ status: import('../types').AutoPrepStatus }> {
  return authedRequest<{ status: import('../types').AutoPrepStatus }>(`/auto-preparation/status`);
}

export async function runAutoPreparation(limit?: number): Promise<{
  prepared: Array<{ id: string; kind: string; subjectId: string; authorizationReason: string }>;
  skipped: Array<{ id: string; kind: string; subjectId: string; skipReason: string }>;
  quotaReached: boolean;
  usedToday: number;
}> {
  return authedRequest(`/auto-preparation/run`, {
    method: 'POST',
    body: JSON.stringify({ limit }),
  });
}

export async function listPreparationLogs(take?: number): Promise<{ logs: import('../types').PreparationLogItem[] }> {
  const suffix = typeof take === 'number' ? `?take=${encodeURIComponent(String(take))}` : '';
  return authedRequest(`/auto-preparation/log${suffix}`);
}

// ---------------------------------------------------------------------------
// Batch 2 (D): attribution links (DIRECT / INFERRED / UNKNOWN)
// ---------------------------------------------------------------------------

export async function createAttributionLink(input: {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  attributionType: string;
  evidenceRefs?: string[];
  reason?: string;
}): Promise<{ link: import('../types').AttributionLinkItem }> {
  return authedRequest(`/attribution/links`, { method: 'POST', body: JSON.stringify(input) });
}

export async function updateAttributionLink(
  id: string,
  patch: { attributionType?: string; evidenceRefs?: string[]; reason?: string },
): Promise<{ link: import('../types').AttributionLinkItem }> {
  return authedRequest(`/attribution/links/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function getAttributionForTarget(
  targetType: string,
  targetId: string,
): Promise<{ links: import('../types').AttributionLinkItem[]; strongest: string }> {
  return authedRequest(
    `/attribution?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`,
  );
}

// ---------------------------------------------------------------------------
// Batch 2 (F): comment sales signals (human review, never auto-prospect)
// ---------------------------------------------------------------------------

export async function listCommentSalesSignals(status?: string): Promise<{ signals: import('../types').CommentSalesSignalItem[] }> {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
  return authedRequest(`/comments/sales-signals${suffix}`);
}

export async function reviewCommentSalesSignal(
  id: string,
  decision: 'REVIEWED' | 'DISMISSED',
): Promise<{ signal: import('../types').CommentSalesSignalItem }> {
  return authedRequest(`/comments/sales-signals/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  });
}

// ---------------------------------------------------------------------------
// Batch 2 (C): evidence maturity observation + promotion
// ---------------------------------------------------------------------------

export async function observeProposal(
  id: string,
): Promise<{ proposal: import('../types').LearningProposal }> {
  return authedRequest(`/learning/derived/${encodeURIComponent(id)}/observe`, { method: 'POST', body: JSON.stringify({}) });
}

export async function promoteProposal(
  id: string,
  input: { to: string; sourceMetricIds?: string[]; reason: string },
): Promise<{ proposal: import('../types').LearningProposal }> {
  return authedRequest(`/learning/derived/${encodeURIComponent(id)}/promote`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function completeAction(id: string, provenance?: ProvenanceInput): Promise<ActionDetailResponse> {
  return authedRequest<ActionDetailResponse>(`/operator/actions/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    body: JSON.stringify(provenance ?? {}),
  });
}

export interface StartIdeaResponse {
  idea: { id: string; title?: string };
  action: { id: string };
}

export async function startIdeaFromAction(id: string): Promise<StartIdeaResponse> {
  return authedRequest<StartIdeaResponse>(`/operator/actions/${encodeURIComponent(id)}/ideas`, {
    method: 'POST',
  });
}

export interface StartResearchResponse {
  research: { id: string; leadId: string | null };
  action: { id: string };
}

export async function researchProspectFromAction(id: string): Promise<StartResearchResponse> {
  return authedRequest<StartResearchResponse>(`/operator/actions/${encodeURIComponent(id)}/research`, {
    method: 'POST',
  });
}

export async function getExplanation(id: string): Promise<ExplanationResponse> {
  return authedRequest<ExplanationResponse>(`/operator/explanations/${encodeURIComponent(id)}`);
}

export async function getAiExplanation(id: string): Promise<AiExplanationResponse> {
  return authedRequest<AiExplanationResponse>(
    `/operator/explanations/${encodeURIComponent(id)}?format=ai`,
  );
}

export async function getTodayBrain(): Promise<{ brain: import('../types').TodayBrain }> {
  return authedRequest<{ brain: import('../types').TodayBrain }>(`/brain/today`);
}

export async function getLearningDashboard(): Promise<import('../types').LearningDashboard> {
  return authedRequest<import('../types').LearningDashboard>(`/brain/learning`);
}

export async function listAudienceSegments(): Promise<{ segments: import('../types').AudienceSegment[] }> {
  return authedRequest<{ segments: import('../types').AudienceSegment[] }>(`/audience`);
}

export async function seedDefaultAudiences(): Promise<{ segments: import('../types').AudienceSegment[] }> {
  return authedRequest<{ segments: import('../types').AudienceSegment[] }>(`/audience/seed-defaults`, { method: 'POST' });
}

export async function listExperiments(params?: { status?: string }): Promise<{ experiments: import('../types').ExperimentItem[] }> {
  const q = params?.status ? `?status=${encodeURIComponent(params.status)}` : '';
  return authedRequest<{ experiments: import('../types').ExperimentItem[] }>(`/experiments${q}`);
}

export async function createExperiment(input: { hypothesis: string; variable: string; controlDescription: string; variantDescription: string; metricName?: string }): Promise<{ experiment: import('../types').ExperimentItem }> {
  return authedRequest(`/experiments`, { method: 'POST', body: JSON.stringify(input) });
}

export async function listBrainComments(): Promise<{ comments: import('../types').BrainComment[] }> {
  return authedRequest<{ comments: import('../types').BrainComment[] }>(`/comments`);
}

export async function getBusinessProfile(): Promise<{ business: unknown; brand: unknown; strategy: unknown }> {
  return authedRequest(`/business`);
}

export async function checkOriginality(draft: string, sources: Array<{ id: string; text: string }>): Promise<{ result: { status: string; explanation: string; guidance: string; jaccard: number; longestCommonSubstringChars: number } }> {
  return authedRequest(`/content-dna/originality-check`, { method: 'POST', body: JSON.stringify({ draft, sources }) });
}

export async function getReadiness(): Promise<ReadinessResponse> {
  return authedRequest<ReadinessResponse>(`/readiness`);
}

export async function getOnboarding(): Promise<{ onboarding: import('../types').OnboardingProgress; settings: import('../types').WorkspaceSettings | null; policy: import('../types').AutonomyPolicy | null }> {
  return authedRequest(`/onboarding`);
}

export async function refreshOnboarding(): Promise<{ onboarding: import('../types').OnboardingProgress }> {
  return authedRequest(`/onboarding/refresh`, { method: 'POST' });
}

export async function updateSchedule(input: { timezone: string; dailyRunTime: string; dailyLlmCallCap: number; dailyFetchCap: number; dailyPreparationCap: number; autonomyTier: 0 }): Promise<{ settings: import('../types').WorkspaceSettings }> {
  return authedRequest(`/onboarding/schedule`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function updatePolicy(input: { tier1PostingEnabled: boolean; tier1PostingDailyCap: number; tier1RequireApprovedPost: boolean; tier2HumanApprovalAck: boolean; autoPrepareApprovedWork?: boolean; autoPrepareColdWork?: boolean; dailyAutoPreparationQuota?: number }): Promise<{ policy: import('../types').AutonomyPolicy; effectiveTier1: string; effectiveTier1Reason: string }> {
  return authedRequest(`/onboarding/policy`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function updateKillSwitch(input: { paused?: boolean; killSwitch?: boolean }): Promise<{ settings: import('../types').WorkspaceSettings }> {
  return authedRequest(`/onboarding/kill`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function listFeeds(): Promise<{ feeds: import('../types').FeedSource[] }> {
  return authedRequest(`/feeds`);
}

export async function createFeed(input: { url: string; type?: string; name?: string; active?: boolean }): Promise<{ feed: import('../types').FeedSource }> {
  return authedRequest(`/feeds`, { method: 'POST', body: JSON.stringify(input) });
}

export async function updateFeed(id: string, input: { name?: string; type?: string; active?: boolean }): Promise<{ feed: import('../types').FeedSource }> {
  return authedRequest(`/feeds/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function deleteFeed(id: string): Promise<void> {
  await authedRequest(`/feeds/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function importLeads(csv: string, filename?: string): Promise<{ batch: import('../types').LeadImportBatch; deduped: boolean; imported: number; skipped: Array<{ rowNumber: number; reason: string }> }> {
  return authedRequest(`/leads/import`, { method: 'POST', body: JSON.stringify({ csv, filename }) });
}

export async function updateBusiness(input: Record<string, unknown>): Promise<{ business: unknown }> {
  return authedRequest(`/business/business`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function updateStrategy(input: Record<string, unknown>): Promise<{ strategy: unknown }> {
  return authedRequest(`/business/strategy`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function listReports(params?: { frequency?: string; limit?: number }): Promise<{ reports: import('../types').IntelligenceReport[] }> {
  const query = new URLSearchParams();
  if (params?.frequency) query.set('frequency', params.frequency);
  if (typeof params?.limit !== 'undefined') query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return authedRequest(`/brain/reports${suffix}`);
}

export async function listRuns(params?: { take?: number }): Promise<{ runs: import('../types').DailyRunSummary[] }> {
  const suffix = typeof params?.take !== 'undefined' ? `?take=${params.take}` : '';
  return authedRequest(`/runs${suffix}`);
}

export async function getRun(id: string): Promise<{ run: import('../types').DailyRunSummary }> {
  return authedRequest(`/runs/${encodeURIComponent(id)}`);
}

export async function triggerRun(runDate?: string): Promise<{ result: { runId: string; status: string; stages: Array<{ stage: string; status: string }>; resumed: boolean } }> {
  return authedRequest(`/runs/trigger`, { method: 'POST', body: JSON.stringify(runDate ? { runDate } : {}) });
}
