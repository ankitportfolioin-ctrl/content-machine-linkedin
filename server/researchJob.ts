import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  ContentDocument,
  SourceStatusReport,
  RssAtomAdapter,
  SitemapAdapter,
  HtmlArticleAdapter,
  UserUrlAdapter
} from './crawler/sourceAdapters';
import { getVoiceProfile, resolveDataDir, VoiceProfile } from './voiceProfileService';
import { discoverSourcesForProfile, WebSource } from './trendSourceRegistry';
import { clusterDocuments, deduplicateDocuments, TrendCluster } from './trendIntelligence';

export interface ResearchDiagnostics {
  researchRunId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  topics: string[];
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  documentsFetched: number;
  documentsNormalized: number;
  documentsDeduplicated: number;
  trendClustersCreated: number;
  errors: string[];
  sourceReports: SourceStatusReport[];
}

export interface ResearchJobStatus {
  status: 'IDLE' | 'RESEARCHING' | 'COMPLETED' | 'FAILED';
  lastRunAt: string | null;
  durationMs: number;
  sourcesScanned: number;
  sourcesSuccessful: number;
  sourcesUnavailable: number;
  documentsDiscovered: number;
  trendsFound: number;
  warnings: string[];
  error?: string;
}

export interface ResearchStore {
  status: ResearchJobStatus;
  trends: TrendCluster[];
  documents: ContentDocument[];
  discoveredAt: string;
  diagnostics?: ResearchDiagnostics;
}

// Map of currently running jobs by workspace ID to prevent concurrent races
const runningJobs = new Map<string, boolean>();

function getResearchFilePath(workspaceId?: string): string {
  const dir = resolveDataDir(workspaceId);
  return path.join(dir, 'trend-research.json');
}

/**
 * Loads stored research results for a specific workspace.
 * Strict workspace isolation: never reads cross-workspace data.
 */
export function getStoredResearch(workspaceId?: string): ResearchStore {
  const file = getResearchFilePath(workspaceId);
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8').trim();
      if (raw.length > 0) {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object' && data.status) {
          return data;
        }
      }
    }
  } catch (err) {
    console.warn(`Could not read trend research file for [${workspaceId || 'default'}]:`, err);
  }

  const defaultStore: ResearchStore = {
    status: {
      status: 'IDLE',
      lastRunAt: null,
      durationMs: 0,
      sourcesScanned: 0,
      sourcesSuccessful: 0,
      sourcesUnavailable: 0,
      documentsDiscovered: 0,
      trendsFound: 0,
      warnings: [],
    },
    trends: [],
    documents: [],
    discoveredAt: new Date().toISOString(),
  };

  // Self-heal: repair empty or corrupt file atomically
  try {
    saveResearch(defaultStore, workspaceId);
  } catch {}

  return defaultStore;
}

/**
 * Persists research results to the workspace directory.
 * Uses atomic rename to guarantee zero-byte or partially written files can never occur.
 */
function saveResearch(store: ResearchStore, workspaceId?: string): void {
  const file = getResearchFilePath(workspaceId);
  const dir = path.dirname(file);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = `${file}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tempFile, file);
  } catch (err) {
    console.error(`Failed to save trend research for [${workspaceId || 'default'}]:`, err);
  }
}

/**
 * Executes a full Web Trend Intelligence research cycle.
 * Crawls permitted public RSS/Atom feeds, sitemaps, and public HTML pages.
 * Deduplicates with 5-layer checks, clusters, and scores trends with explainable math.
 */
export async function runTrendResearch(
  workspaceId?: string,
  options?: {
    mode?: 'MY_NICHE' | 'SPECIFIC_TOPIC' | 'URL_RESEARCH';
    topic?: string;
    url?: string;
    maxSources?: number;
  }
): Promise<ResearchStore> {
  const wsKey = workspaceId || 'default';
  if (runningJobs.get(wsKey)) {
    console.log(`[TrendResearch] Research already in progress for workspace [${wsKey}]`);
    return getStoredResearch(workspaceId);
  }

  runningJobs.set(wsKey, true);
  const startTime = Date.now();
  const startedAtIso = new Date().toISOString();
  const runId = `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const warnings: string[] = [];
  const errors: string[] = [];
  const sourceReports: SourceStatusReport[] = [];

  try {
    const profile: VoiceProfile = getVoiceProfile(workspaceId);

    // Initial adapters
    const rssAdapter = new RssAtomAdapter();
    const sitemapAdapter = new SitemapAdapter();
    const htmlAdapter = new HtmlArticleAdapter();
    const userUrlAdapter = new UserUrlAdapter();

    // Mode C: Direct URL Research
    if (options?.mode === 'URL_RESEARCH' && options.url) {
      console.log(`[TrendResearch] Analyzing single public URL: ${options.url}`);
      const fetchStart = Date.now();
      try {
        const docs = await userUrlAdapter.fetch(options.url, {
          sourceName: 'Target URL',
          sourceId: 'src_custom_url',
          quality: 'PRIMARY',
        });

        if (docs.length === 0) {
          throw new Error('Unable to access or extract content from the requested public URL. Ensure it is publicly accessible.');
        }

        const primaryDoc = docs[0];
        sourceReports.push({
          source: options.url,
          adapter: 'UserUrlAdapter',
          type: 'USER_URL',
          status: 'USER_PROVIDED',
          lastCheckedAt: new Date().toISOString(),
          documentsRetrieved: 1,
          latencyMs: Date.now() - fetchStart,
          errors: [],
        });

        const clusters = clusterDocuments([primaryDoc], profile);
        const completedAtIso = new Date().toISOString();
        const durationMs = Date.now() - startTime;

        const diagnostics: ResearchDiagnostics = {
          researchRunId: runId,
          startedAt: startedAtIso,
          completedAt: completedAtIso,
          durationMs,
          topics: [options.url],
          sourcesAttempted: 1,
          sourcesSucceeded: 1,
          sourcesFailed: 0,
          documentsFetched: 1,
          documentsNormalized: 1,
          documentsDeduplicated: 1,
          trendClustersCreated: clusters.length,
          errors: [],
          sourceReports,
        };

        const store: ResearchStore = {
          status: {
            status: 'COMPLETED',
            lastRunAt: completedAtIso,
            durationMs,
            sourcesScanned: 1,
            sourcesSuccessful: 1,
            sourcesUnavailable: 0,
            documentsDiscovered: 1,
            trendsFound: clusters.length,
            warnings: [],
          },
          trends: clusters,
          documents: [primaryDoc],
          discoveredAt: completedAtIso,
          diagnostics,
        };

        saveResearch(store, workspaceId);
        return store;
      } catch (err: any) {
        errors.push(err.message);
        sourceReports.push({
          source: options.url,
          adapter: 'UserUrlAdapter',
          type: 'USER_URL',
          status: 'BROKEN',
          lastCheckedAt: new Date().toISOString(),
          documentsRetrieved: 0,
          latencyMs: Date.now() - fetchStart,
          errors: [err.message],
        });
        throw err;
      }
    }

    // Mode A & B: Multi-source research dynamically derived from Profile / Topic
    const customKeywords = options?.topic ? [options.topic] : undefined;
    const { sources: matchedSources, derivedTopics } = discoverSourcesForProfile(profile, customKeywords, workspaceId);
    const maxSources = options?.maxSources || 6;
    const sourcesToScan = matchedSources.slice(0, maxSources);

    console.log(
      `[TrendResearch] Scanning ${sourcesToScan.length} public sources for workspace [${wsKey}] ` +
      `(Profile: ${profile.role || 'General'}, Topics: ${derivedTopics.slice(0, 3).join(', ')})`
    );

    const allDocuments: ContentDocument[] = [];
    let successfulSources = 0;
    let unavailableSources = 0;

    for (const source of sourcesToScan) {
      const sourceStart = Date.now();
      try {
        let docs: ContentDocument[] = [];

        if (source.sourceType === 'RSS' || source.sourceType === 'ATOM' || source.feedUrl) {
          const feedUrl = source.feedUrl || `https://${source.domain}/feed`;
          docs = await rssAdapter.fetch(feedUrl, {
            sourceName: source.name,
            sourceId: source.sourceId,
            quality: source.sourceQuality || 'PRIMARY',
          });
        } else if (source.sourceType === 'SITEMAP' || source.sitemapUrl) {
          const sitemapUrl = source.sitemapUrl || `https://${source.domain}/sitemap.xml`;
          docs = await sitemapAdapter.fetch(sitemapUrl, {
            sourceName: source.name,
            sourceId: source.sourceId,
            quality: source.sourceQuality || 'SECONDARY',
          });
        } else {
          // Public HTML landing or article crawl
          docs = await htmlAdapter.fetch(`https://${source.domain}`, {
            sourceName: source.name,
            sourceId: source.sourceId,
            quality: source.sourceQuality || 'SECONDARY',
          });
        }

        const sourceDuration = Date.now() - sourceStart;
        if (docs.length > 0) {
          allDocuments.push(...docs.slice(0, 8)); // Top 8 per source
          successfulSources++;
          sourceReports.push({
            source: source.name,
            adapter: source.sourceType || 'RSS',
            type: source.sourceType,
            status: 'LIVE',
            lastCheckedAt: new Date().toISOString(),
            documentsRetrieved: docs.length,
            latencyMs: sourceDuration,
            errors: [],
          });
        } else {
          unavailableSources++;
          warnings.push(`${source.name} returned 0 items`);
          sourceReports.push({
            source: source.name,
            adapter: source.sourceType || 'RSS',
            type: source.sourceType,
            status: 'PARTIALLY_LIVE',
            lastCheckedAt: new Date().toISOString(),
            documentsRetrieved: 0,
            latencyMs: sourceDuration,
            errors: ['Returned 0 items for feed query'],
          });
        }
      } catch (err: any) {
        unavailableSources++;
        const msg = `${source.name} unavailable: ${err.message}`;
        warnings.push(msg);
        errors.push(msg);
        sourceReports.push({
          source: source.name,
          adapter: source.sourceType || 'RSS',
          type: source.sourceType,
          status: 'BROKEN',
          lastCheckedAt: new Date().toISOString(),
          documentsRetrieved: 0,
          latencyMs: Date.now() - sourceStart,
          errors: [err.message],
        });
      }
    }

    // Deduplication step
    const dedupedDocuments = deduplicateDocuments(allDocuments);

    // Enforce honest zero-data state: NO SOURCE = NO TREND (Never generate synthetic documents)
    if (dedupedDocuments.length === 0) {
      warnings.push('No fresh source data was retrieved from configured public sources. You can retry research or generate directly from content pillars.');
    } else if (unavailableSources > 0) {
      warnings.push(`Research completed with partial source coverage (${successfulSources} succeeded, ${unavailableSources} unavailable).`);
    }

    // Cluster real retrieved documents only
    const clusters = dedupedDocuments.length > 0 ? clusterDocuments(dedupedDocuments, profile) : [];

    const completedAtIso = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const diagnostics: ResearchDiagnostics = {
      researchRunId: runId,
      startedAt: startedAtIso,
      completedAt: completedAtIso,
      durationMs,
      topics: derivedTopics,
      sourcesAttempted: sourcesToScan.length,
      sourcesSucceeded: successfulSources,
      sourcesFailed: unavailableSources,
      documentsFetched: allDocuments.length,
      documentsNormalized: allDocuments.length,
      documentsDeduplicated: dedupedDocuments.length,
      trendClustersCreated: clusters.length,
      errors,
      sourceReports,
    };

    const store: ResearchStore = {
      status: {
        status: allDocuments.length > 0 ? 'COMPLETED' : (unavailableSources > 0 ? 'COMPLETED' : 'IDLE'),
        lastRunAt: completedAtIso,
        durationMs,
        sourcesScanned: sourcesToScan.length,
        sourcesSuccessful: successfulSources,
        sourcesUnavailable: unavailableSources,
        documentsDiscovered: dedupedDocuments.length,
        trendsFound: clusters.length,
        warnings,
      },
      trends: clusters,
      documents: dedupedDocuments.slice(0, 30),
      discoveredAt: completedAtIso,
      diagnostics,
    };

    saveResearch(store, workspaceId);
    return store;
  } catch (err: any) {
    console.error(`[TrendResearch] Research failed for workspace [${wsKey}]:`, err);
    const completedAtIso = new Date().toISOString();
    const failedStore: ResearchStore = {
      status: {
        status: 'FAILED',
        lastRunAt: completedAtIso,
        durationMs: Date.now() - startTime,
        sourcesScanned: 0,
        sourcesSuccessful: 0,
        sourcesUnavailable: 0,
        documentsDiscovered: 0,
        trendsFound: 0,
        warnings,
        error: err.message,
      },
      trends: [],
      documents: [],
      discoveredAt: completedAtIso,
      diagnostics: {
        researchRunId: runId,
        startedAt: startedAtIso,
        completedAt: completedAtIso,
        durationMs: Date.now() - startTime,
        topics: [],
        sourcesAttempted: 0,
        sourcesSucceeded: 0,
        sourcesFailed: 0,
        documentsFetched: 0,
        documentsNormalized: 0,
        documentsDeduplicated: 0,
        trendClustersCreated: 0,
        errors: [err.message, ...errors],
        sourceReports,
      },
    };
    saveResearch(failedStore, workspaceId);
    return failedStore;
  } finally {
    runningJobs.delete(wsKey);
  }
}
