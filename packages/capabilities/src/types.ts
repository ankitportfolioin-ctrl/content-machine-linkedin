/**
 * Capability registry types — the vocabulary for every capability claim.
 *
 * This package owns the STATES. Every entry in the registry uses exactly
 * these states; no layer may invent its own. Runtime overlays (e.g.
 * NOT_CONNECTED vs CONNECTED for a workspace account) are computed by the
 * API from this static truth plus live facts — they never replace it.
 */

/** The only allowed capability states. Never auto-upgrade UNKNOWN. */
export type CapabilityState =
  | 'AVAILABLE'
  | 'AVAILABLE_WITH_AUTH'
  | 'AVAILABLE_WITH_APPROVAL'
  | 'PARTIALLY_AVAILABLE'
  | 'UNAVAILABLE'
  | 'BLOCKED'
  | 'NOT_IMPLEMENTED'
  | 'NOT_CONFIGURED'
  | 'UNKNOWN';

export const CAPABILITY_STATES: readonly CapabilityState[] = [
  'AVAILABLE',
  'AVAILABLE_WITH_AUTH',
  'AVAILABLE_WITH_APPROVAL',
  'PARTIALLY_AVAILABLE',
  'UNAVAILABLE',
  'BLOCKED',
  'NOT_IMPLEMENTED',
  'NOT_CONFIGURED',
  'UNKNOWN',
];

/** The five product-loop domains the registry covers. */
export type CapabilityDomain =
  | 'RESEARCH'
  | 'EXECUTION'
  | 'OBSERVATION'
  | 'SALES'
  | 'LEARNING';

/** Data provenance states. USER_REPORTED is never upgraded to OBSERVED. */
export type ProvenanceState = 'OBSERVED' | 'USER_REPORTED' | 'INFERRED' | 'UNKNOWN';

/**
 * One authoritative capability entry. Every field is required so that no
 * capability can exist as a bare boolean without a reason and evidence.
 */
export interface CapabilityEntry {
  /** Stable namespaced id, e.g. `research.reddit`, `execution.linkedin_publish`. */
  id: string;
  domain: CapabilityDomain;
  displayName: string;
  /** Best-known effective state of this capability (static code + last probe). */
  state: CapabilityState;
  /** Plain-language reason for the state. Never a fake promise. */
  reason: string;
  /** Code/data references backing the claim (file + symbol). Non-empty. */
  evidence: string[];
  /**
   * True only when a live verification was actually executed and read in
   * this repository's history (real HTTP, real grant, real run) — never
   * because code or a test file exists.
   */
  liveVerified: boolean;
  /** What the verification proved, or what verification is still missing. */
  verifyNote: string;
  /** Whether using it needs a credential/grant the user or admin must provide. */
  requiresAuth: boolean;
  /** Whether using it needs a recorded human approval. */
  requiresApproval: boolean;
  /** Provenance of the data this capability consumes or produces. */
  provenance: ProvenanceState;
  /** Honest user-facing next step (never a fake promise). */
  userAction: string;
}

/**
 * Research-only extension. The intelligence worker, the connectors API, and
 * the social platform descriptors all derive from these fields — none of
 * them keeps its own copy.
 */
export interface ResearchCapabilityFields {
  /**
   * Whether the intelligence worker may ATTEMPT this source when a workspace
   * enables it. Attempting is not succeeding: BLOCKED sources are attempted
   * and fail honestly with the provider's exact error (failure isolation).
   * False means the worker MUST NEVER call its fetch method.
   */
  workerAttempt: boolean;
  /** Whether backend code capable of research for this source exists at all. */
  researchCodeExists: boolean;
  /**
   * Feed-owned source types (RSS/ATOM/HN/...) run through the FeedSource
   * loop, not the connector registry. `covers` lists the extra source-type
   * keys this entry describes (e.g. WEBSITE covers BLOG/SITE/USER_URL).
   */
  covers: string[];
  /** UI catalogue card content (single-sourced here, rendered everywhere). */
  catalogue: {
    group: 'RESEARCH' | 'CONNECTED_PLATFORM' | 'UNAVAILABLE';
    description: string;
    authKind: 'NONE' | 'API_KEY' | 'OAUTH';
    sourceOfTruth: string;
    notWiredReason: string | null;
    accountConnectable: boolean;
    requiresAccountNote: string | null;
    userAction: string;
  };
}

export type ResearchCapabilityEntry = CapabilityEntry & {
  domain: 'RESEARCH';
  fields: ResearchCapabilityFields;
};
