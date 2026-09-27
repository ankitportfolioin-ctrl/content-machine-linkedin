import {
  ApiError,
  BindingsResponse,
  ComposeDraftResponse,
  ContentIdea,
  ContentIdeaDetailResponse,
  ContentIdeasResponse,
  ContentPlan,
  ContentVersion,
  ConvertOpportunityResponse,
  DraftDetailResponse,
  DraftPreview,
  DraftValidationResponse,
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
  PlanDetailResponse,
  PlanValidation,
  PlansResponse,
  ProfileResponse,
  ReviewDetailResponse,
  ReviewDecision,
  ReviewsResponse,
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
