import { getVoiceProfile } from './voiceProfileService';

export interface ContentSource {
  name: string;
  url: string;
  query?: string;
  pillarHints: string[];
}

export interface DiscoveredItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  source: string;
  matchedPillar: string;
  score: number;
}

const DEFAULT_SOURCES: ContentSource[] = [
  { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', pillarHints: ['ai', 'gemini', 'automation', 'tools'] },
  { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', pillarHints: ['ai', 'agents', 'automation', 'tools'] },
  { name: 'Anthropic News', url: 'https://www.anthropic.com/news/rss.xml', pillarHints: ['ai', 'agents', 'safety', 'tools'] },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/', pillarHints: ['software', 'developer', 'coding', 'ai', 'open source'] },
  { name: 'Vercel Changelog', url: 'https://vercel.com/atom', pillarHints: ['software', 'web', 'developer', 'tools'] },
  { name: 'Hacker News AI', url: 'https://hnrss.org/newest?q=AI%20OR%20automation%20OR%20developer%20tools', pillarHints: ['ai', 'software', 'automation', 'startup'] },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', pillarHints: ['ai', 'startup', 'business', 'tools'] },
];

function clean(value: string): string {
  return value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function decodeXml(value: string): string {
  return clean(value).replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)));
}

function getTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function parseFeed(xml: string, source: ContentSource): DiscoveredItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi)].map(m => m[0]);
  return blocks.map(block => {
    const title = getTag(block, 'title');
    const summary = getTag(block, 'description') || getTag(block, 'summary') || getTag(block, 'content');
    const publishedAt = getTag(block, 'pubDate') || getTag(block, 'published') || getTag(block, 'updated') || null;
    const linkTag = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
    const linkText = getTag(block, 'link');
    const url = decodeXml(linkTag?.[1] || linkText || source.url);
    return { title, url, summary: summary.slice(0, 420), publishedAt, source: source.name, matchedPillar: '', score: 0 };
  }).filter(item => item.title && item.url);
}

function tokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9+#.-]+/).filter(token => token.length > 2);
}

function matchPillar(item: DiscoveredItem, pillars: string[]): { pillar: string; score: number } {
  const itemTokens = new Set(tokens(`${item.title} ${item.summary}`));
  let best = { pillar: pillars[0] || 'AI and practical technology', score: 0 };
  for (const pillar of pillars) {
    const score = tokens(pillar).reduce((sum, token) => sum + (itemTokens.has(token) ? 3 : 0), 0);
    if (score > best.score) best = { pillar, score };
  }
  return best;
}

function dedupe(items: DiscoveredItem[]): DiscoveredItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.url.replace(/[?#].*$/, '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getDefaultContentSources(): ContentSource[] {
  return DEFAULT_SOURCES;
}

export async function discoverLatestContent(options?: { pillars?: string[]; limit?: number }): Promise<{ items: DiscoveredItem[]; sourcesChecked: number; fetchedAt: string; warnings: string[] }> {
  const profile = getVoiceProfile();
  const pillars = options?.pillars?.length ? options.pillars : profile.contentPillars?.length ? profile.contentPillars : (profile.role ? [profile.role] : ['Business Operations', 'Customer Growth', 'Industry Strategy']);
  const warnings: string[] = [];
  const results = await Promise.all(DEFAULT_SOURCES.map(async source => {
    try {
      const response = await fetch(source.url, { headers: { 'user-agent': 'LinkedInSkillsStudio/1.0 (+content research)' }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseFeed(await response.text(), source);
    } catch (error: any) {
      warnings.push(`${source.name}: ${error.message}`);
      return [];
    }
  }));
  const now = Date.now();
  const items = dedupe(results.flat()).map(item => {
    const match = matchPillar(item, pillars);
    const ageHours = item.publishedAt ? Math.max(0, (now - new Date(item.publishedAt).getTime()) / 36e5) : 999;
    const freshness = Number.isFinite(ageHours) ? Math.max(0, 24 - Math.min(ageHours, 24)) / 4 : 0;
    return { ...item, matchedPillar: match.pillar, score: match.score + freshness };
  }).sort((a, b) => b.score - a.score || String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, options?.limit || 18);
  return { items, sourcesChecked: DEFAULT_SOURCES.length, fetchedAt: new Date().toISOString(), warnings };
}

export function formatDiscoveryContext(items: DiscoveredItem[], limit = 5): string {
  return items.slice(0, limit).map((item, index) => `${index + 1}. ${item.title} (${item.source}; ${item.publishedAt || 'date unavailable'})\nURL: ${item.url}\nSummary: ${item.summary}`).join('\n\n');
}
