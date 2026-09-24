import fs from 'fs';
import path from 'path';
import { resolveDataDir, VoiceProfile } from './voiceProfileService';

export interface WebSource {
  sourceId: string;
  name: string;
  domain: string;
  sourceType: 'RSS' | 'ATOM' | 'HTML' | 'SITEMAP' | 'BLOG' | 'NEWS' | 'FORUM' | 'REDDIT' | 'LINKEDIN';
  enabled: boolean;
  crawlMethod: 'FEED' | 'ARTICLE' | 'SITEMAP' | 'SEARCH';
  feedUrl?: string;
  sitemapUrl?: string;
  allowed: boolean;
  lastCrawledAt?: string;
  crawlIntervalHours: number;
  rateLimitMs: number;
  reliability: number; // 0-100
  quality: 'HIGH' | 'MEDIUM' | 'LOW';
  sourceQuality: 'PRIMARY' | 'SECONDARY' | 'COMMUNITY' | 'AGGREGATOR' | 'UNKNOWN';
  tags: string[];
  description?: string;
}

// Curated public sources indexed by topic tags
export const GLOBAL_SOURCE_CATALOG: WebSource[] = [
  // --- TECH, SOFTWARE, DEVELOPER TOOLS, AI ---
  {
    sourceId: 'src_hn_ai_dev',
    name: 'Hacker News (Tech & AI)',
    domain: 'news.ycombinator.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://news.ycombinator.com/rss',
    allowed: true,
    crawlIntervalHours: 2,
    rateLimitMs: 1000,
    reliability: 98,
    quality: 'HIGH',
    sourceQuality: 'COMMUNITY',
    tags: ['ai', 'software development', 'developer tools', 'coding', 'tech', 'startups', 'architecture'],
    description: 'Real-time discussion on technology, emerging AI tools, and developer debates.'
  },
  {
    sourceId: 'src_github_blog',
    name: 'GitHub Engineering & Product Blog',
    domain: 'github.blog',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://github.blog/feed/',
    allowed: true,
    crawlIntervalHours: 6,
    rateLimitMs: 1000,
    reliability: 98,
    quality: 'HIGH',
    sourceQuality: 'PRIMARY',
    tags: ['software development', 'developer tools', 'ai', 'devops', 'coding', 'open source'],
    description: 'Official GitHub updates on developer velocity, Copilot, and system reliability.'
  },
  {
    sourceId: 'src_openai_news',
    name: 'OpenAI Research & Product News',
    domain: 'openai.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://openai.com/news/rss.xml',
    allowed: true,
    crawlIntervalHours: 4,
    rateLimitMs: 1500,
    reliability: 99,
    quality: 'HIGH',
    sourceQuality: 'PRIMARY',
    tags: ['ai', 'ai tools', 'models', 'artificial intelligence', 'emerging technology'],
    description: 'Primary source announcements for frontier AI models and agentic capabilities.'
  },
  {
    sourceId: 'src_anthropic_news',
    name: 'Anthropic Research & Changelog',
    domain: 'anthropic.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://www.anthropic.com/news/rss.xml',
    allowed: true,
    crawlIntervalHours: 4,
    rateLimitMs: 1500,
    reliability: 99,
    quality: 'HIGH',
    sourceQuality: 'PRIMARY',
    tags: ['ai', 'ai tools', 'prompt engineering', 'artificial intelligence', 'models'],
    description: 'Official Anthropic releases, Claude architecture updates, and agent workflows.'
  },
  {
    sourceId: 'src_google_ai',
    name: 'Google AI & Developer Blog',
    domain: 'blog.google',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://blog.google/technology/ai/rss/',
    allowed: true,
    crawlIntervalHours: 6,
    rateLimitMs: 1000,
    reliability: 98,
    quality: 'HIGH',
    sourceQuality: 'PRIMARY',
    tags: ['ai', 'gemini', 'technology news', 'software development', 'developer tools'],
    description: 'Google AI research breakthroughs, Gemini updates, and ecosystem news.'
  },
  {
    sourceId: 'src_simon_willison',
    name: "Simon Willison's Weblog (Practical AI)",
    domain: 'simonwillison.net',
    sourceType: 'ATOM',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://simonwillison.net/atom/entries/',
    allowed: true,
    crawlIntervalHours: 6,
    rateLimitMs: 1000,
    reliability: 95,
    quality: 'HIGH',
    sourceQuality: 'PRIMARY',
    tags: ['ai', 'ai tools', 'practical ai', 'coding', 'llms', 'developer tools', 'software development'],
    description: 'Respected technical notes on prompt engineering, embeddings, and real-world LLM tooling.'
  },
  {
    sourceId: 'src_techcrunch_ai',
    name: 'TechCrunch AI & Enterprise',
    domain: 'techcrunch.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    allowed: true,
    crawlIntervalHours: 3,
    rateLimitMs: 1200,
    reliability: 90,
    quality: 'HIGH',
    sourceQuality: 'SECONDARY',
    tags: ['ai', 'startups', 'technology news', 'funding', 'saas', 'venture capital'],
    description: 'Tech news on AI company funding rounds, tool releases, and market shifts.'
  },

  // --- E-COMMERCE, INDIAN D2C, CUSTOMER SUPPORT, WHATSAPP AUTOMATION ---
  {
    sourceId: 'src_inc42_d2c',
    name: 'Inc42 Indian Startups & D2C',
    domain: 'inc42.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://inc42.com/category/startups/feed/',
    allowed: true,
    crawlIntervalHours: 3,
    rateLimitMs: 1000,
    reliability: 94,
    quality: 'HIGH',
    sourceQuality: 'SECONDARY',
    tags: ['d2c', 'd2c growth', 'indian d2c', 'e-commerce', 'startups', 'retail', 'india'],
    description: 'Leading coverage of Indian D2C consumer brands, e-commerce scale, and logistics.'
  },
  {
    sourceId: 'src_yourstory',
    name: 'YourStory D2C & Commerce',
    domain: 'yourstory.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://yourstory.com/feed',
    allowed: true,
    crawlIntervalHours: 3,
    rateLimitMs: 1000,
    reliability: 92,
    quality: 'HIGH',
    sourceQuality: 'SECONDARY',
    tags: ['d2c', 'd2c growth', 'indian d2c', 'e-commerce', 'customer experience', 'retail', 'india'],
    description: 'Stories and trends from Indian brand founders, direct-to-consumer growth, and retail shifts.'
  },
  {
    sourceId: 'src_entrackr_ecommerce',
    name: 'Entrackr Commerce & Tech',
    domain: 'entrackr.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://entrackr.com/feed/',
    allowed: true,
    crawlIntervalHours: 4,
    rateLimitMs: 1200,
    reliability: 90,
    quality: 'HIGH',
    sourceQuality: 'SECONDARY',
    tags: ['d2c', 'e-commerce', 'india', 'payments', 'whatsapp automation', 'logistics'],
    description: 'Market data on Indian consumer brands, quick commerce, and customer operations.'
  },
  {
    sourceId: 'src_hubspot_service',
    name: 'HubSpot Customer Experience & Support',
    domain: 'blog.hubspot.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://blog.hubspot.com/service/rss.xml',
    allowed: true,
    crawlIntervalHours: 6,
    rateLimitMs: 1000,
    reliability: 95,
    quality: 'HIGH',
    sourceQuality: 'PRIMARY',
    tags: ['customer support', 'customer experience', 'ai customer support', 'automation', 'crm', 'retention'],
    description: 'Practical playbooks for customer support automation, retention metrics, and response times.'
  },
  {
    sourceId: 'src_intercom_blog',
    name: 'Intercom Customer Service & AI Support',
    domain: 'intercom.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://www.intercom.com/blog/feed/',
    allowed: true,
    crawlIntervalHours: 6,
    rateLimitMs: 1200,
    reliability: 96,
    quality: 'HIGH',
    sourceQuality: 'PRIMARY',
    tags: ['customer support', 'ai customer support', 'customer experience', 'chatbots', 'whatsapp automation', 'automation'],
    description: 'Thought leadership on AI support bots, ticket deflection, and multichannel support.'
  },
  {
    sourceId: 'src_practicalecommerce',
    name: 'Practical Ecommerce Insights',
    domain: 'practicalecommerce.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://www.practicalecommerce.com/feed',
    allowed: true,
    crawlIntervalHours: 6,
    rateLimitMs: 1000,
    reliability: 91,
    quality: 'HIGH',
    sourceQuality: 'SECONDARY',
    tags: ['e-commerce', 'd2c growth', 'conversion', 'analytics', 'customer experience', 'marketing'],
    description: 'Tactical guidance for independent e-commerce stores, checkout conversion, and omnichannel sales.'
  },

  // --- STARTUPS, SAAS & FOUNDER STRATEGY ---
  {
    sourceId: 'src_indie_hackers',
    name: 'Indie Hackers Real Discussions',
    domain: 'indiehackers.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://feed.indiehackers.world/',
    allowed: true,
    crawlIntervalHours: 4,
    rateLimitMs: 1000,
    reliability: 90,
    quality: 'HIGH',
    sourceQuality: 'COMMUNITY',
    tags: ['startups', 'saas', 'indie hackers', 'bootstrapping', 'growth', 'product market fit'],
    description: 'Transparent founder revenue metrics, early traction experiments, and bootstrap lessons.'
  },
  {
    sourceId: 'src_saastr_blog',
    name: 'SaaStr Founder & Operations',
    domain: 'saastr.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://www.saastr.com/feed/',
    allowed: true,
    crawlIntervalHours: 6,
    rateLimitMs: 1200,
    reliability: 93,
    quality: 'HIGH',
    sourceQuality: 'SECONDARY',
    tags: ['saas', 'startups', 'growth', 'sales', 'customer success', 'b2b'],
    description: 'B2B SaaS growth tactics, customer retention benchmarks, and hiring frameworks.'
  },

  // --- RESTAURANT, FOOD & HOSPITALITY ---
  {
    sourceId: 'src_restaurant_dive',
    name: 'Restaurant Dive Industry & Tech',
    domain: 'restaurantdive.com',
    sourceType: 'RSS',
    enabled: true,
    crawlMethod: 'FEED',
    feedUrl: 'https://www.restaurantdive.com/feeds/news/',
    allowed: true,
    crawlIntervalHours: 6,
    rateLimitMs: 1000,
    reliability: 92,
    quality: 'HIGH',
    sourceQuality: 'SECONDARY',
    tags: ['restaurant', 'repeat orders', 'restaurant growth', 'hospitality', 'food ordering', 'guest retention'],
    description: 'Independent and chain restaurant technology, repeat diner retention, and online ordering.'
  }
];

/**
 * Normalizes keyword tokens from a string.
 */
function tokenize(str: string): string[] {
  return str.toLowerCase().split(/[^a-z0-9+#.-]+/).filter((t) => t.length > 2);
}

/**
 * Dynamically derives research topics from active user context (Role, Audience/ICP, Pillars).
 * Generates tailored compound topics without hardcoded universal defaults.
 */
export function deriveResearchTopics(
  profile: VoiceProfile,
  customTopic?: string
): string[] {
  const topics: string[] = [];

  if (customTopic && customTopic.trim()) {
    topics.push(customTopic.trim());
  }

  // 1. Content Pillars form the primary topic backbone
  const pillars = (profile.contentPillars || []).filter((p) => p && p.trim().length > 0);
  for (const pillar of pillars) {
    topics.push(pillar.trim());
  }

  // 2. Audience / ICP context compound phrases
  const audience = profile.audience?.trim() || '';
  const role = profile.role?.trim() || '';

  // Extract core domain descriptor from role/audience
  const domainMatch = role.match(/(?:helping|for|building|in)\s+([^,.;]+)/i);
  const domainQualifier = domainMatch ? domainMatch[1].trim() : '';

  for (const pillar of pillars.slice(0, 3)) {
    if (domainQualifier && !pillar.toLowerCase().includes(domainQualifier.toLowerCase())) {
      topics.push(`${domainQualifier} ${pillar}`.trim());
    }
    if (audience && !pillar.toLowerCase().includes(audience.toLowerCase())) {
      const shortAudience = audience.split(/[,/]/)[0].trim();
      if (shortAudience.length < 25) {
        topics.push(`${shortAudience} ${pillar}`.trim());
      }
    }
  }

  // 3. User focus / keywords
  if (role) {
    const roleClean = role.replace(/^(founder|operator|leader|engineer|consultant)\s*(?:&|\+|,)?\s*/i, '').trim();
    if (roleClean && !topics.some((t) => t.toLowerCase() === roleClean.toLowerCase())) {
      topics.push(roleClean);
    }
  }

  // Deduplicate case-insensitively and filter
  const uniqueTopics: string[] = [];
  const seen = new Set<string>();
  for (const t of topics) {
    const lower = t.toLowerCase().replace(/\s+/g, ' ').trim();
    if (lower.length > 2 && !seen.has(lower)) {
      seen.add(lower);
      uniqueTopics.push(t.trim());
    }
  }

  return uniqueTopics.slice(0, 8);
}

/**
 * Intelligently matches and ranks sources from the registry based on user's profile.
 * Persona-aware: ensures Indian D2C profiles match D2C/e-commerce/support sources,
 * and Tech Creator profiles match software/AI sources.
 */
export function discoverSourcesForProfile(
  profile: VoiceProfile,
  customKeywords?: string[],
  workspaceId?: string
): { sources: WebSource[]; derivedTopics: string[] } {
  const derivedTopics = deriveResearchTopics(profile, customKeywords?.[0]);
  const profileTokens = new Set<string>();

  for (const dt of derivedTopics) {
    for (const token of tokenize(dt)) profileTokens.add(token);
  }

  // Ingest role & audience tokens
  for (const token of tokenize(`${profile.role || ''} ${profile.audience || ''}`)) {
    profileTokens.add(token);
  }

  // Get source pool (combines global catalog with any workspace custom sources)
  const sourcePool = getWorkspaceSources(workspaceId);

  // Score sources based on tag and topic intersection
  const scored = sourcePool.map((source) => {
    let matchScore = 0;
    for (const tag of source.tags) {
      const tagTokens = tokenize(tag);
      for (const tt of tagTokens) {
        if (profileTokens.has(tt)) {
          matchScore += 3;
        }
      }
    }
    // Boost enabled and high reliability sources
    if (source.enabled) matchScore += 1;
    if (source.quality === 'HIGH') matchScore += 2;

    return { source, matchScore };
  });

  // Filter sources with positive match score
  const matched = scored
    .filter((s) => s.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .map((s) => s.source);

  // If no source matched, fall back to the top reliable sources
  const finalSources = matched.length === 0 ? sourcePool.slice(0, 5) : matched.slice(0, 8);

  return {
    sources: finalSources,
    derivedTopics,
  };
}

/**
 * Loads workspace-specific sources (allows user to add/toggle sources).
 */
export function getWorkspaceSources(workspaceId?: string): WebSource[] {
  const dir = resolveDataDir(workspaceId);
  const file = path.join(dir, 'sources.json');

  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch {}
  }

  return GLOBAL_SOURCE_CATALOG;
}

/**
 * Adds or updates a source in the workspace registry.
 */
export function saveWorkspaceSource(source: Partial<WebSource>, workspaceId?: string): WebSource {
  const dir = resolveDataDir(workspaceId);
  const file = path.join(dir, 'sources.json');
  const existing = getWorkspaceSources(workspaceId);

  const newSource: WebSource = {
    sourceId: source.sourceId || `src_custom_${Date.now()}`,
    name: source.name || 'Custom Web Source',
    domain: source.domain || 'example.com',
    sourceType: source.sourceType || 'RSS',
    enabled: source.enabled !== false,
    crawlMethod: source.crawlMethod || 'FEED',
    feedUrl: source.feedUrl,
    sitemapUrl: source.sitemapUrl,
    allowed: true,
    crawlIntervalHours: source.crawlIntervalHours || 6,
    rateLimitMs: source.rateLimitMs || 1000,
    reliability: source.reliability || 90,
    quality: source.quality || 'MEDIUM',
    sourceQuality: source.sourceQuality || 'COMMUNITY',
    tags: source.tags || ['custom'],
    description: source.description,
  };

  const updated = [newSource, ...existing.filter((s) => s.sourceId !== newSource.sourceId)];
  fs.writeFileSync(file, JSON.stringify(updated, null, 2), 'utf-8');
  return newSource;
}
