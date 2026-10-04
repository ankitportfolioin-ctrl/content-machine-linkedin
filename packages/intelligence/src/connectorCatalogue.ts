/**
 * Workspace connector catalogue — DERIVED VIEW over the capability registry.
 *
 * Single-source rule: all capability state (workerAttempt, reasons,
 * descriptions, wiring notes) is owned by
 * `@growth-operator/capabilities` (CAPABILITY_REGISTRY, domain RESEARCH).
 * This module keeps the legacy catalogue SHAPE (consumed by the connectors
 * API, the worker fetch-config builder, and existing tests) and derives
 * every entry from the registry. Nothing here may contradict the registry;
 * the parity test (apps/api/src/capabilityRegistry.test.ts) enforces it.
 *
 * Feed-driven sources keep FeedSource as their source of truth and are NOT
 * catalogue entries here. The API rejects them for WorkspaceConnector rows.
 */

import {
  researchCapabilities,
  type ResearchCapabilityEntry,
} from '@growth-operator/capabilities';

export type ConnectorGroup = 'RESEARCH' | 'CONNECTED_PLATFORM' | 'UNAVAILABLE';

export type ConnectorAuthKind = 'NONE' | 'API_KEY' | 'OAUTH';

export interface ConnectorCatalogueEntry {
  /** Registry sourceType. Only genuine registry connectors — never feed types. */
  sourceType: string;
  displayName: string;
  group: ConnectorGroup;
  description: string;
  authKind: ConnectorAuthKind;
  /** Exact backend capability that backs this card (file + class/method). */
  sourceOfTruth: string;
  /**
   * Whether the intelligence worker may attempt this connector.
   * False means: visible for transparency, never executed.
   */
  workerEligible: boolean;
  /** Required when workerEligible is false: honest user-facing reason. */
  notWiredReason: string | null;
  /** True when a Connect button may be shown (server app creds + adapter exist). */
  accountConnectable: boolean;
  /** Shown next to account state; always clarifies account != research. */
  requiresAccountNote: string | null;
  /** User-facing action label (never a fake promise). */
  userAction: string;
}

export const FEED_OWNED_SOURCE_TYPES = [
  'RSS',
  'ATOM',
  'HACKERNEWS',
  'GITHUB_RELEASES',
  'BLOG',
  'SITE',
  'USER_URL',
] as const;

export const RESEARCH_CONNECTOR_TYPES = [
  'REDDIT',
  'GOOGLE_TRENDS',
  'YOUTUBE',
  'LINKEDIN',
  'X',
  'INSTAGRAM',
  'TIKTOK',
  'FACEBOOK',
  'QUORA',
] as const;

export type ResearchConnectorType = (typeof RESEARCH_CONNECTOR_TYPES)[number];

/** Legacy catalogue order (UI/API card order). Registry derivation follows it. */
const CATALOGUE_ORDER: readonly ResearchConnectorType[] = [
  'REDDIT',
  'GOOGLE_TRENDS',
  'YOUTUBE',
  'LINKEDIN',
  'X',
  'INSTAGRAM',
  'FACEBOOK',
  'TIKTOK',
  'QUORA',
];

const BY_SOURCE_TYPE = new Map<string, ResearchCapabilityEntry>(
  researchCapabilities().map((e) => [e.id.replace(/^research\./, '').toUpperCase(), e]),
);

function toCatalogueEntry(sourceType: ResearchConnectorType): ConnectorCatalogueEntry {
  const reg = BY_SOURCE_TYPE.get(sourceType);
  if (!reg) throw new Error(`Capability registry has no research entry for ${sourceType}`);
  return {
    sourceType,
    displayName: reg.displayName,
    group: reg.fields.catalogue.group,
    description: reg.fields.catalogue.description,
    authKind: reg.fields.catalogue.authKind,
    sourceOfTruth: reg.fields.catalogue.sourceOfTruth,
    workerEligible: reg.fields.workerAttempt,
    notWiredReason: reg.fields.workerAttempt ? null : reg.fields.catalogue.notWiredReason,
    accountConnectable: reg.fields.catalogue.accountConnectable,
    requiresAccountNote: reg.fields.catalogue.requiresAccountNote,
    userAction: reg.fields.catalogue.userAction,
  };
}

export const CONNECTOR_CATALOGUE: readonly ConnectorCatalogueEntry[] =
  CATALOGUE_ORDER.map(toCatalogueEntry);

/** Source types the worker may ever attempt (subset of the catalogue). */
export const WORKER_ELIGIBLE_SOURCE_TYPES: readonly string[] = CONNECTOR_CATALOGUE.filter(
  (e) => e.workerEligible,
).map((e) => e.sourceType);

export function getCatalogueEntry(sourceType: string): ConnectorCatalogueEntry | undefined {
  return CONNECTOR_CATALOGUE.find((e) => e.sourceType === sourceType);
}

export function isResearchConnectorType(value: string): value is ResearchConnectorType {
  return (RESEARCH_CONNECTOR_TYPES as readonly string[]).includes(value);
}

export function isFeedOwnedSourceType(value: string): boolean {
  return (FEED_OWNED_SOURCE_TYPES as readonly string[]).includes(value);
}
