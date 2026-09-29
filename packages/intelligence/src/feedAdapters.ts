/**
 * Dedicated adapters for platform feed types (Batch 3 #13).
 *
 * The generic path fetches any URL and auto-detects RSS/Atom/HTML. These
 * adapters cover the two platform types the product treats as first-class
 * signal sources, without scraping pages:
 *
 * - HACKERNEWS: frontpage/discussion URLs expand through the OFFICIAL public
 *   Hacker News API (top stories → item records). Plain HN RSS URLs keep the
 *   generic path. Only title/url/published-time are used — no scores,
 *   comment counts, or other engagement values are ever read or stored, and
 *   no velocity is claimed (timestamps come from the items themselves).
 * - GITHUB_RELEASES: `github.com/<owner>/<repo>` URLs resolve to the
 *   OFFICIAL releases Atom feed (`/releases.atom`), which the generic ATOM
 *   path then ingests natively (per-release items with published dates).
 *
 * Every ingested item keeps source URL, retrieved time, published time when
 * available, title, and canonical URL. Adapter failure never fails the run:
 * callers treat a throw as per-feed isolation (mark + continue).
 */

export interface AdapterItem {
  url: string;
  title: string | null;
  publishedAt: Date | null;
}

const HN_API = 'https://hacker-news.firebaseio.com/v0';
const FETCH_TIMEOUT_MS = 15000;
const MAX_ADAPTER_ITEMS = 30;

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GrowthOperator/1.0 (+https://growth-operator.dev/bot)',
      },
    });
    if (!response.ok) {
      throw new Error(`Hacker News API responded ${response.status} for ${url}.`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

/** True for URLs the generic RSS/Atom detector already handles. */
export function isFeedUrl(url: string): boolean {
  return /(\.(rss|atom|xml)|\/(rss|atom|feed|feeds)(\/|$|\?|#))/i.test(url);
}

/**
 * Resolve a GitHub repository URL to its official releases Atom feed.
 * Already-feed URLs and non-GitHub URLs pass through untouched.
 */
export function resolveReleaseFeedUrl(url: string): string {
  const trimmed = url.trim();
  if (isFeedUrl(trimmed)) return trimmed;
  const match = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/.*)?$/i.exec(trimmed);
  if (!match) return trimmed;
  const owner = match[1] as string;
  const repo = match[2] as string;
  if (!owner || !repo) return trimmed;
  return `https://github.com/${owner}/${repo}/releases.atom`;
}

interface HnItem {
  id?: number;
  url?: string;
  title?: string;
  time?: number;
}

/**
 * Expand a Hacker News frontpage/discussion URL into story items via the
 * official API. Returns null when the URL is not an HN host or is already
 * a feed (generic path owns those). Throws on API failure so callers can
 * failure-isolate the feed.
 */
export async function expandHackerNewsFeed(
  feedUrl: string,
  opts: { maxItems?: number } = {}
): Promise<AdapterItem[] | null> {
  let parsed: URL;
  try {
    parsed = new URL(feedUrl);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const isHnHost = host === 'news.ycombinator.com' || host.endsWith('.ycombinator.com');
  if (!isHnHost || isFeedUrl(feedUrl)) return null;

  const ids = await fetchJson(`${HN_API}/topstories.json`);
  if (!Array.isArray(ids)) {
    throw new Error('Hacker News API returned an unexpected top-stories payload.');
  }
  const max = Math.min(Math.max(1, opts.maxItems ?? MAX_ADAPTER_ITEMS), MAX_ADAPTER_ITEMS);
  const items: AdapterItem[] = [];
  for (const id of ids.slice(0, max)) {
    if (typeof id !== 'number') continue;
    try {
      const story = (await fetchJson(`${HN_API}/item/${id}.json`)) as HnItem | null;
      if (!story) continue;
      // Ask-HN style items carry no external URL: the discussion page IS the
      // canonical source (never invented, never replaced by a guess).
      const url =
        typeof story.url === 'string' && story.url.trim().length > 0
          ? story.url.trim()
          : `https://news.ycombinator.com/item?id=${story.id ?? id}`;
      items.push({
        url,
        title: typeof story.title === 'string' ? story.title : null,
        publishedAt: typeof story.time === 'number' ? new Date(story.time * 1000) : null,
      });
    } catch {
      continue;
    }
  }
  if (items.length === 0) {
    throw new Error('Hacker News API resolved no stories; feed marked unavailable.');
  }
  return items;
}
