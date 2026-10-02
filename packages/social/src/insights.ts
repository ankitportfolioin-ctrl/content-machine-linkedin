import type { SocialItem, SocialPlatform } from './types';

/**
 * Hook + format patterns derived ONLY from real pulled items.
 * No item → no pattern. Nothing is inferred, averaged, or invented.
 */
export interface HookPattern {
  hook: string;
  sourceExternalId: string;
  sourceUrl: string | null;
}

export interface FormatPattern {
  kind: string;
  count: number;
}

export interface ConnectorInsights {
  platform: SocialPlatform;
  itemCount: number;
  hooks: HookPattern[];
  formats: FormatPattern[];
  topHashtags: Array<{ tag: string; count: number }>;
}

/** First non-empty line, capped — the "hook" is quoted verbatim. */
export function extractHook(item: Pick<SocialItem, 'text' | 'title'>): string | null {
  const source = item.title?.trim() || item.text?.trim() || '';
  const firstLine = source.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  if (!firstLine) return null;
  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine;
}

export function summarizeItems(platform: SocialPlatform, items: SocialItem[]): ConnectorInsights {
  const hooks: HookPattern[] = [];
  const formatCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const item of items) {
    const hook = extractHook(item);
    if (hook) {
      hooks.push({ hook, sourceExternalId: item.externalId, sourceUrl: item.url });
    }
    if (hooks.length >= 10) break;
    const kind = item.mediaKind ?? 'unknown';
    formatCounts.set(kind, (formatCounts.get(kind) ?? 0) + 1);
    for (const tag of item.hashtags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  return {
    platform,
    itemCount: items.length,
    hooks: hooks.slice(0, 10),
    formats: [...formatCounts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
    topHashtags: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}
