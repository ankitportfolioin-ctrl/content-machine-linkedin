import { prisma } from '@growth-operator/db';
import {
  CONNECTOR_CATALOGUE,
  WORKER_ELIGIBLE_SOURCE_TYPES,
  getCatalogueEntry,
  isFeedOwnedSourceType,
  isResearchConnectorType,
} from '@growth-operator/intelligence';
import {
  connectorConfigSchemaFor,
  redditConnectorConfigSchema,
  googleTrendsConnectorConfigSchema,
} from '@growth-operator/schemas';

export type ConnectorFetchConfigs = Record<
  string,
  { enabled: boolean; config: Record<string, unknown> }
>;

/**
 * Default configs mirror the zod schema defaults of each connector — used
 * when a workspace enables a connector without supplying parameters.
 * These are defaults, never global enforcement: persistence per workspace
 * is the only thing the worker reads.
 */
export function defaultConfigFor(sourceType: string): Record<string, unknown> {
  if (sourceType === 'REDDIT') {
    return {
      subreddits: [...(redditConnectorConfigSchema.shape.subreddits._def.defaultValue?.() as string[] ?? [])],
      timeFilter: 'day',
      sortBy: 'hot',
    };
  }
  if (sourceType === 'GOOGLE_TRENDS') {
    return {
      topics: [...(googleTrendsConnectorConfigSchema.shape.topics._def.defaultValue?.() as string[] ?? [])],
      geo: 'US',
      timeRange: 'now 7-d',
      category: 0,
    };
  }
  return {};
}

/** Validate a user-supplied config against the connector's real parameters. */
export function validateConnectorConfig(
  sourceType: string,
  config: unknown,
): { ok: true; config: Record<string, unknown> } | { ok: false; error: string } {
  const schema = connectorConfigSchemaFor(sourceType);
  if (!schema) return { ok: false, error: `Unknown connector "${sourceType}".` };
  const parsed = schema.safeParse(config ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join('.') || 'config'}: ${first.message}` : 'Invalid configuration.',
    };
  }
  return { ok: true, config: parsed.data as Record<string, unknown> };
}

/**
 * Load persisted per-workspace connector configs.
 *
 * INVARIANT: a missing row means DISABLED. This function never invents
 * `enabled: true` — the worker executes only what the workspace stored.
 */
export async function loadWorkspaceConnectorConfigs(
  workspaceId: string,
): Promise<ConnectorFetchConfigs> {
  const rows = await prisma.workspaceConnector.findMany({ where: { workspaceId } });
  const byType = new Map(rows.map((r) => [r.sourceType, r]));
  const out: ConnectorFetchConfigs = {};
  for (const entry of CONNECTOR_CATALOGUE) {
    const row = byType.get(entry.sourceType);
    if (!row || !row.enabled) {
      out[entry.sourceType] = { enabled: false, config: defaultConfigFor(entry.sourceType) };
      continue;
    }
    const validated = validateConnectorConfig(entry.sourceType, row.config ?? {});
    out[entry.sourceType] = validated.ok
      ? { enabled: true, config: validated.config }
      : { enabled: true, config: defaultConfigFor(entry.sourceType) };
  }
  return out;
}

/**
 * Build the exact object passed to ConnectorRegistry.fetchFromAllSources().
 * Only catalogue entries flagged workerEligible are ever included as
 * runnable — everything else is reported, never executed.
 */
export function buildWorkerFetchConfigs(
  persisted: ConnectorFetchConfigs,
): { fetchConfigs: ConnectorFetchConfigs; skipped: Array<{ sourceType: string; reason: string }> } {
  const fetchConfigs: ConnectorFetchConfigs = {};
  const skipped: Array<{ sourceType: string; reason: string }> = [];
  for (const [sourceType, entry] of Object.entries(persisted)) {
    const catalogue = getCatalogueEntry(sourceType);
    if (!catalogue) continue;
    if (!catalogue.workerEligible) {
      skipped.push({
        sourceType,
        reason: entry.enabled
          ? (catalogue.notWiredReason ?? 'Not executable in this version.')
          : 'Disabled.',
      });
      continue;
    }
    fetchConfigs[sourceType] = entry;
  }
  // Belt-and-braces: never hand the registry a type outside the eligible set,
  // even if persisted data was written by a newer/older version.
  for (const key of Object.keys(fetchConfigs)) {
    if (!(WORKER_ELIGIBLE_SOURCE_TYPES as readonly string[]).includes(key)) {
      delete fetchConfigs[key];
    }
  }
  return { fetchConfigs, skipped };
}

export function assertResearchConnectorType(sourceType: string): void {
  if (isFeedOwnedSourceType(sourceType)) {
    throw new Error(
      `FEED_OWNED: "${sourceType}" is managed through feed sources (FeedSource), not workspace connector configuration.`,
    );
  }
  if (!isResearchConnectorType(sourceType)) {
    throw new Error(`UNKNOWN_CONNECTOR: "${sourceType}" is not a supported research connector.`);
  }
}
