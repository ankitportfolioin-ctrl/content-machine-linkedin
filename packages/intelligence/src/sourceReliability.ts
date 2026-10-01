/**
 * Source Reliability & Fact-Checking Framework (YFP Content Brain)
 *
 * Different sources provide different kinds of evidence. This module keeps
 * that distinction explicit so scoring and generation never treat a Reddit
 * upvote as proof of factual accuracy, or a search-trend blip as proof of
 * educational value.
 */

export type SourceCategory =
  | 'OFFICIAL_ANNOUNCEMENT'
  | 'OFFICIAL_DOCUMENTATION'
  | 'SEARCH_TREND_SIGNAL'
  | 'PUBLIC_DISCUSSION'
  | 'THIRD_PARTY_EDUCATIONAL'
  | 'SOCIAL_ENGAGEMENT_SIGNAL'
  | 'UNKNOWN';

export type ReliabilityTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SourceReliability {
  sourceType: string;
  category: SourceCategory;
  factualReliability: ReliabilityTier;
  trendReliability: ReliabilityTier;
  audienceSignalReliability: ReliabilityTier;
  notes: string;
}

const RELIABILITY_TABLE: Record<string, SourceReliability> = {
  YOUTUBE: {
    sourceType: 'YOUTUBE',
    category: 'THIRD_PARTY_EDUCATIONAL',
    factualReliability: 'LOW',
    trendReliability: 'MEDIUM',
    audienceSignalReliability: 'MEDIUM',
    notes: 'Useful for topic/format discovery. View/like counts signal attention, never factual accuracy. Verify claims against official docs.',
  },
  REDDIT: {
    sourceType: 'REDDIT',
    category: 'PUBLIC_DISCUSSION',
    factualReliability: 'LOW',
    trendReliability: 'MEDIUM',
    audienceSignalReliability: 'HIGH',
    notes: 'Best source for audience problems and pain points. Qualitative evidence only — do not claim a problem is widespread from one thread.',
  },
  GOOGLE_TRENDS: {
    sourceType: 'GOOGLE_TRENDS',
    category: 'SEARCH_TREND_SIGNAL',
    factualReliability: 'LOW',
    trendReliability: 'HIGH',
    audienceSignalReliability: 'MEDIUM',
    notes: 'Relative interest (0-100) only, never absolute volume. Missing data means "unknown", never zero.',
  },
  LINKEDIN: {
    sourceType: 'LINKEDIN',
    category: 'SOCIAL_ENGAGEMENT_SIGNAL',
    factualReliability: 'LOW',
    trendReliability: 'MEDIUM',
    audienceSignalReliability: 'MEDIUM',
    notes: 'Professional conversation signal. Engagement metrics are attention signals, not proof of educational value.',
  },
  X: {
    sourceType: 'X',
    category: 'SOCIAL_ENGAGEMENT_SIGNAL',
    factualReliability: 'LOW',
    trendReliability: 'HIGH',
    audienceSignalReliability: 'MEDIUM',
    notes: 'Best for breaking news velocity. High engagement never implies factual accuracy — verify before publishing.',
  },
  INSTAGRAM: {
    sourceType: 'INSTAGRAM',
    category: 'SOCIAL_ENGAGEMENT_SIGNAL',
    factualReliability: 'LOW',
    trendReliability: 'MEDIUM',
    audienceSignalReliability: 'MEDIUM',
    notes: 'Format/hook inspiration. Engagement is attention, not accuracy.',
  },
  TIKTOK: {
    sourceType: 'TIKTOK',
    category: 'SOCIAL_ENGAGEMENT_SIGNAL',
    factualReliability: 'LOW',
    trendReliability: 'HIGH',
    audienceSignalReliability: 'MEDIUM',
    notes: 'Fast-moving format/trend signal. Verify any factual claim elsewhere.',
  },
  RSS: {
    sourceType: 'RSS',
    category: 'THIRD_PARTY_EDUCATIONAL',
    factualReliability: 'MEDIUM',
    trendReliability: 'MEDIUM',
    audienceSignalReliability: 'LOW',
    notes: 'Depends on publisher. Prefer official company blogs and docs for facts.',
  },
  ATOM: {
    sourceType: 'ATOM',
    category: 'THIRD_PARTY_EDUCATIONAL',
    factualReliability: 'MEDIUM',
    trendReliability: 'MEDIUM',
    audienceSignalReliability: 'LOW',
    notes: 'Depends on publisher. Prefer official company blogs and docs for facts.',
  },
  HACKERNEWS: {
    sourceType: 'HACKERNEWS',
    category: 'PUBLIC_DISCUSSION',
    factualReliability: 'MEDIUM',
    trendReliability: 'MEDIUM',
    audienceSignalReliability: 'MEDIUM',
    notes: 'Technical discussion with higher signal, still qualitative. Verify facts.',
  },
  GITHUB_RELEASES: {
    sourceType: 'GITHUB_RELEASES',
    category: 'OFFICIAL_ANNOUNCEMENT',
    factualReliability: 'HIGH',
    trendReliability: 'MEDIUM',
    audienceSignalReliability: 'LOW',
    notes: 'Official release notes — trustworthy for version/feature facts.',
  },
  BLOG: {
    sourceType: 'BLOG',
    category: 'THIRD_PARTY_EDUCATIONAL',
    factualReliability: 'MEDIUM',
    trendReliability: 'LOW',
    audienceSignalReliability: 'LOW',
    notes: 'Depends on publisher. Official company blogs rank higher for facts.',
  },
  SITE: {
    sourceType: 'SITE',
    category: 'THIRD_PARTY_EDUCATIONAL',
    factualReliability: 'MEDIUM',
    trendReliability: 'LOW',
    audienceSignalReliability: 'LOW',
    notes: 'Depends on publisher. Official documentation is HIGH for facts.',
  },
  ARTICLE: {
    sourceType: 'ARTICLE',
    category: 'THIRD_PARTY_EDUCATIONAL',
    factualReliability: 'MEDIUM',
    trendReliability: 'LOW',
    audienceSignalReliability: 'LOW',
    notes: 'Depends on publisher. Cross-check important claims.',
  },
  WEBSITE: {
    sourceType: 'WEBSITE',
    category: 'THIRD_PARTY_EDUCATIONAL',
    factualReliability: 'MEDIUM',
    trendReliability: 'LOW',
    audienceSignalReliability: 'LOW',
    notes: 'Depends on publisher. Official docs are HIGH for facts.',
  },
  USER_URL: {
    sourceType: 'USER_URL',
    category: 'UNKNOWN',
    factualReliability: 'LOW',
    trendReliability: 'LOW',
    audienceSignalReliability: 'LOW',
    notes: 'User-provided URL of unknown provenance. Verify before use.',
  },
};

export function getSourceReliability(sourceType: string): SourceReliability {
  const key = (sourceType || '').toUpperCase();
  return (
    RELIABILITY_TABLE[key] ?? {
      sourceType: key || 'UNKNOWN',
      category: 'UNKNOWN' as SourceCategory,
      factualReliability: 'LOW' as ReliabilityTier,
      trendReliability: 'LOW' as ReliabilityTier,
      audienceSignalReliability: 'LOW' as ReliabilityTier,
      notes: 'Unknown source type — treat all claims as unverified.',
    }
  );
}

export function listSourceReliabilities(): SourceReliability[] {
  return Object.values(RELIABILITY_TABLE);
}

export interface FactCheckItem {
  claim: string;
  requiredSourceCategory: SourceCategory[];
  verified: boolean;
  verifiedBy: string | null;
  note: string;
}

export interface FactCheckReport {
  items: FactCheckItem[];
  blocked: boolean;
  summary: string;
}

/**
 * Builds a fact-check checklist for technology claims. Pure and
 * deterministic: it never verifies anything itself, it only states what
 * category of source would be required to consider a claim supported.
 */
export function buildFactCheckList(claims: string[]): FactCheckReport {
  const items: FactCheckItem[] = claims.map((claim) => {
    const lowered = claim.toLowerCase();
    const isReleaseLike =
      /releas|launch|announc|version \d|model|api|pricing|deprecat|shutdown|acqui/.test(lowered);
    return {
      claim: claim.slice(0, 500),
      requiredSourceCategory: isReleaseLike
        ? ['OFFICIAL_ANNOUNCEMENT', 'OFFICIAL_DOCUMENTATION']
        : ['OFFICIAL_DOCUMENTATION', 'THIRD_PARTY_EDUCATIONAL'],
      verified: false,
      verifiedBy: null,
      note: isReleaseLike
        ? 'News-type claim: requires an official company announcement or docs before publishing.'
        : 'Educational claim: requires documentation or a reputable source; mark as uncertain until then.',
    };
  });
  return {
    items,
    blocked: false,
    summary:
      items.length === 0
        ? 'No factual claims submitted for fact-checking.'
        : `${items.length} claim(s) need source verification before they can be stated as fact.`,
  };
}
