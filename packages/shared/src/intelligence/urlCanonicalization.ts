const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'msclkid',
  'twclid',
  'li_fat_id',
  'yclid',
  'dm_i',
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',
  '_hsenc',
  '_hsmi',
  'mc_cid',
  'mc_eid',
  'ref',
  'source',
  'medium',
  'campaign',
]);

const MEANINGFUL_QUERY_PARAMS = new Set([
  'q',
  'query',
  'search',
  's',
  'keyword',
  'keywords',
  'tag',
  'tags',
  'category',
  'cat',
  'topic',
  'page',
  'p',
  'offset',
  'limit',
  'per_page',
  'sort',
  'order',
  'dir',
  'year',
  'month',
  'day',
  'date',
  'from',
  'to',
  'since',
  'until',
  'id',
  'ids',
  'slug',
  'path',
]);

export function canonicalizeUrl(inputUrl: string): string {
  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  if ((url.protocol === 'http:' && url.port === '80') ||
      (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }

  url.hash = '';

  const searchParams = new URLSearchParams(url.search);
  const filteredParams: Array<[string, string]> = [];

  searchParams.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (TRACKING_PARAMS.has(lowerKey)) {
      return;
    }
    if (MEANINGFUL_QUERY_PARAMS.has(lowerKey)) {
      filteredParams.push([key, value]);
      return;
    }
    if (lowerKey.startsWith('utm_') ||
        lowerKey.startsWith('fb_') ||
        lowerKey.startsWith('gclid') ||
        lowerKey.startsWith('_hs') ||
        lowerKey.startsWith('mc_') ||
        lowerKey.startsWith('ref_') ||
        lowerKey.startsWith('utm') ||
        lowerKey.startsWith('yclid') ||
        lowerKey.startsWith('twclid') ||
        lowerKey.startsWith('li_') ||
        lowerKey.startsWith('dm_')) {
      return;
    }
    filteredParams.push([key, value]);
  });

  url.search = '';
  const sortedParams = filteredParams.sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, value] of sortedParams) {
    url.searchParams.append(key, value);
  }

  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = pathname;

  return url.toString();
}

export function getUrlHash(url: string): string {
  const canonical = canonicalizeUrl(url);
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    const char = canonical.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function getContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}