import crypto from 'crypto';
import { ContentDocument, extractKeywords, SourceQuality } from './crawler/sourceAdapters';
export type { ContentDocument };
import { VoiceProfile } from './voiceProfileService';

export interface SourceReference {
  sourceId: string;
  sourceName: string;
  domain?: string;
  publisher?: string;
  author?: string;
  url: string;
  title: string;
  publishedAt?: string;
  snippet: string;
  body?: string;
  description?: string;
  quality: SourceQuality | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface TrendScores {
  freshnessScore: number;
  sourceCountScore: number;
  velocityScore: number;
  crossSourceScore: number;
  audienceRelevanceScore: number;
  pillarRelevanceScore: number;
  discussionIntensityScore: number;
}

export interface ContentAngle {
  type: 'Educational' | 'Contrarian' | 'Practical' | 'Framework' | 'Opinion';
  hookConcept: string;
  angleDescription: string;
  proposedThesis: string;
}

export interface TrendCluster {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  topics: string[];
  sourceCount: number;
  uniqueSourceCount: number;
  sources: SourceReference[];
  firstSeenAt: string;
  lastSeenAt: string;
  freshness: 'TRENDING' | 'BREAKING' | 'TODAY' | 'THIS WEEK' | 'RECENT' | 'EVERGREEN' | 'STALE' | 'UNKNOWN';
  classification: 'RECENT' | 'RELEVANT' | 'EMERGING' | 'TRENDING' | 'EVERGREEN' | 'UNRELATED';
  confidence: 'HIGH' | 'MODERATE' | 'LOW';
  confidenceReason: string;
  engagementSignal: string;
  primaryPublisher: string;
  hasValidTimestamp: boolean;
  velocity: 'HIGH' | 'MEDIUM' | 'STEADY';
  relevance: number; // 0-100 (Evidence-based)
  relevanceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  trendScore: number; // 0-100 (Explainable)
  scores: TrendScores;
  discussionSignals: {
    questions: string[];
    painPoints: string[];
    disagreements: string[];
    emergingTerminology: string[];
  };
  contentFormat: string;
  angles: ContentAngle[];
  matchedPillar: string;
  targetAudience: string;
  provenance: {
    type: 'TREND_RESEARCH' | 'URL_RESEARCH' | 'CONTENT_PILLAR';
    discoveredAt: string;
  };
}

const STOP_WORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'all', 'and', 'any', 'are', 'aren',
  'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'could', 'did', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'her', 'here', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'into', 'its', 'itself', 'just', 'more', 'most', 'not',
  'now', 'off', 'once', 'only', 'other', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'same', 'should', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'too', 'under', 'until', 'very', 'was', 'were', 'what', 'when', 'where', 'which',
  'while', 'who', 'whom', 'why', 'with', 'would', 'your', 'yours', 'yourself',
  'see', 'across', 'turn', 'will', 'can'
]);

/**
 * Normalizes words to standard lower-case alphanumeric tokens without stop words.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Calculates Jaccard similarity index between two token sets (0.0 to 1.0).
 */
function jaccardSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Comprehensive 5-layer deduplication:
 * Layer A: Canonical URL
 * Layer B: Normalized URL (strips protocol, www, parameters, trailing slashes)
 * Layer C: Content Hash (SHA-256 of cleaned body)
 * Layer D: Title similarity (token Jaccard >= 0.85)
 * Layer E: Text snippet containment
 */
export function deduplicateDocuments(docs: ContentDocument[]): ContentDocument[] {
  const seenCanonicalUrls = new Set<string>();
  const seenNormalizedUrls = new Set<string>();
  const seenContentHashes = new Set<string>();
  const seenTitleTokens: { title: string; tokens: Set<string> }[] = [];
  const seenBodyTokens: { title: string; tokens: Set<string> }[] = [];
  const unique: ContentDocument[] = [];

  for (const doc of docs) {
    // Layer A: Canonical URL
    const canonicalKey = (doc.canonicalUrl || '').trim().toLowerCase().replace(/\/+$/, '');
    if (canonicalKey && seenCanonicalUrls.has(canonicalKey)) {
      continue;
    }

    // Layer B: Normalized URL
    const normKey = (doc.url || '')
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '');
    if (normKey && seenNormalizedUrls.has(normKey)) {
      continue;
    }

    // Layer C: Content Hash
    if (doc.contentHash && seenContentHashes.has(doc.contentHash)) {
      continue;
    }

    // Layer D: Title similarity
    const currentTokens = new Set(tokenize(doc.title));
    let isTitleDuplicate = false;
    for (const prev of seenTitleTokens) {
      const sim = jaccardSimilarity(currentTokens, prev.tokens);
      if (sim >= 0.85) {
        isTitleDuplicate = true;
        break;
      }
    }
    if (isTitleDuplicate) {
      continue;
    }

    // Layer E: Body / Snippet Containment & Wire Syndication
    const currentBodyTokens = new Set(tokenize(doc.body ? doc.body.slice(0, 400) : (doc.description || '')));
    let isBodySyndicate = false;
    if (currentBodyTokens.size >= 10) {
      for (const prev of seenBodyTokens) {
        const bodySim = jaccardSimilarity(currentBodyTokens, prev.tokens);
        if (bodySim >= 0.85) {
          isBodySyndicate = true;
          break;
        }
      }
    }
    if (isBodySyndicate) {
      continue;
    }

    // Register document
    if (canonicalKey) seenCanonicalUrls.add(canonicalKey);
    if (normKey) seenNormalizedUrls.add(normKey);
    if (doc.contentHash) seenContentHashes.add(doc.contentHash);
    seenTitleTokens.push({ title: doc.title, tokens: currentTokens });
    if (currentBodyTokens.size >= 10) {
      seenBodyTokens.push({ title: doc.title, tokens: currentBodyTokens });
    }

    unique.push(doc);
  }

  return unique;
}

/**
 * Clusters related documents across sources discussing the same core subject.
 */
export function clusterDocuments(
  docs: ContentDocument[],
  profile: VoiceProfile,
  similarityThreshold: number = 0.20
): TrendCluster[] {
  const deduped = deduplicateDocuments(docs);
  const clusters: { docs: ContentDocument[]; tokenSet: Set<string> }[] = [];

  for (const doc of deduped) {
    const docTokens = new Set(
      tokenize(
        `${doc.title || ''} ${(doc.topics || []).join(' ')} ${(doc.headings || []).join(' ')} ${(doc.keywords || []).join(' ')}`
      )
    );

    // Try to find matching cluster
    let bestClusterIndex = -1;
    let maxSim = 0;

    for (let i = 0; i < clusters.length; i++) {
      const sim = jaccardSimilarity(docTokens, clusters[i].tokenSet);
      if (sim > maxSim && sim >= similarityThreshold) {
        maxSim = sim;
        bestClusterIndex = i;
      }
    }

    if (bestClusterIndex >= 0) {
      clusters[bestClusterIndex].docs.push(doc);
      // Merge tokens
      for (const t of docTokens) clusters[bestClusterIndex].tokenSet.add(t);
    } else {
      clusters.push({
        docs: [doc],
        tokenSet: docTokens,
      });
    }
  }

  // Convert raw clusters into rich TrendCluster models
  const trendClusters: TrendCluster[] = [];

  for (const cl of clusters) {
    const primaryDoc = cl.docs[0];
    const allTitles = cl.docs.map((d) => d.title).join(' ');
    const allBodies = cl.docs.map((d) => d.body).join(' ');
    const combinedText = `${allTitles} ${allBodies}`;

    const keywords = extractKeywords(combinedText).slice(0, 8);
    const sources: SourceReference[] = cl.docs.map((d) => ({
      sourceId: d.sourceId,
      sourceName: d.sourceName,
      domain: d.sourceDomain,
      publisher: d.publisher || d.sourceName,
      author: d.author,
      url: d.url,
      title: d.title,
      publishedAt: d.publishedAt,
      snippet: d.description || d.body.slice(0, 180),
      body: d.body || d.text,
      description: d.description,
      quality: d.quality,
    }));

    // Find unique domains
    const uniqueDomains = new Set(cl.docs.map((d) => {
      try { return new URL(d.url).hostname; } catch { return d.sourceName; }
    }));

    // Calculate dates & freshness strictly from valid timestamps
    const timestamps = cl.docs
      .map((d) => (d.publishedAt ? new Date(d.publishedAt).getTime() : NaN))
      .filter((t) => !isNaN(t) && t > 0);

    const hasTimestamps = timestamps.length > 0;
    const minTime = hasTimestamps ? Math.min(...timestamps) : Date.now();
    const maxTime = hasTimestamps ? Math.max(...timestamps) : Date.now();
    const ageHours = hasTimestamps ? Math.max(0, (Date.now() - maxTime) / (3600 * 1000)) : 999;

    let freshness: 'TRENDING' | 'BREAKING' | 'TODAY' | 'THIS WEEK' | 'RECENT' | 'EVERGREEN' | 'STALE' | 'UNKNOWN' = 'RECENT';
    let freshnessScore = 60;
    if (!hasTimestamps) {
      freshness = 'UNKNOWN'; // Transparent: unknown dates must remain unknown
      freshnessScore = 40;
    } else if (ageHours <= 6 && uniqueDomains.size >= 2) {
      freshness = 'TRENDING';
      freshnessScore = 98;
    } else if (ageHours <= 6) {
      freshness = 'BREAKING';
      freshnessScore = 95;
    } else if (ageHours <= 24) {
      freshness = 'TODAY';
      freshnessScore = 88;
    } else if (ageHours <= 168) { // < 7 days
      freshness = 'THIS WEEK';
      freshnessScore = 75;
    } else if (ageHours <= 720) { // < 30 days
      freshness = 'RECENT';
      freshnessScore = 60;
    } else if (ageHours <= 2160) { // < 90 days
      freshness = 'EVERGREEN';
      freshnessScore = 45;
    } else {
      freshness = 'STALE';
      freshnessScore = 25;
    }

    // Source count & cross source scoring
    const sourceCount = cl.docs.length;
    const uniqueSourceCount = uniqueDomains.size;
    const sourceCountScore = Math.min(100, Math.round(sourceCount >= 4 ? 95 : sourceCount === 3 ? 82 : sourceCount === 2 ? 68 : 45));
    const crossSourceScore = Math.min(100, uniqueDomains.size * 30);
    const velocityScore = !hasTimestamps ? 50 : ageHours <= 24 && uniqueDomains.size >= 2 ? 90 : ageHours <= 48 ? 75 : 55;
    const velocity: 'HIGH' | 'MEDIUM' | 'STEADY' = !hasTimestamps ? 'STEADY' : velocityScore >= 80 ? 'HIGH' : velocityScore >= 65 ? 'MEDIUM' : 'STEADY';

    // Relevance scoring against user profile (Pure evidence-based, 0-100 without artificial floors)
    const { matchedPillar, pillarRelevanceScore } = matchTrendPillar(combinedText, profile);
    const audienceRelevanceScore = scoreAudienceRelevance(combinedText, profile);
    const relevance = Math.round((pillarRelevanceScore + audienceRelevanceScore) / 2);

    // Semantic relevance tier: NONE (0), LOW (1-34), MEDIUM (35-69), HIGH (70-100)
    let relevanceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' = 'NONE';
    if (relevance >= 70) relevanceLevel = 'HIGH';
    else if (relevance >= 35) relevanceLevel = 'MEDIUM';
    else if (relevance > 0) relevanceLevel = 'LOW';
    else relevanceLevel = 'NONE';

    // Discussion signals
    const discussionSignals = extractDiscussionSignals(combinedText);
    const discussionIntensityScore = Math.min(
      100,
      discussionSignals.questions.length * 20 + discussionSignals.painPoints.length * 15 + discussionSignals.disagreements.length * 20 + 30
    );

    // Five-way classification: RECENT, RELEVANT, EMERGING, TRENDING, EVERGREEN, UNRELATED
    let classification: 'RECENT' | 'RELEVANT' | 'EMERGING' | 'TRENDING' | 'EVERGREEN' | 'UNRELATED' = 'RECENT';
    if (relevance === 0) {
      classification = 'UNRELATED';
    } else if (hasTimestamps && uniqueDomains.size >= 2 && ageHours <= 48 && relevance >= 50) {
      classification = 'TRENDING';
    } else if (hasTimestamps && ((uniqueDomains.size >= 2 && ageHours <= 168) || (ageHours <= 24 && discussionIntensityScore >= 70)) && relevance >= 30) {
      classification = 'EMERGING';
    } else if (relevance >= 60) {
      classification = 'RELEVANT';
    } else if (!hasTimestamps || ageHours > 720) {
      classification = 'EVERGREEN';
    } else {
      classification = 'RECENT';
    }

    // Confidence model
    let confidence: 'HIGH' | 'MODERATE' | 'LOW' = 'LOW';
    let confidenceReason = 'Single source signal with limited cross-domain corroboration.';
    if (relevance === 0) {
      confidence = 'LOW';
      confidenceReason = 'Zero keyword overlap with active profile pillars or target audience.';
    } else if (uniqueDomains.size >= 3 && hasTimestamps && ageHours <= 48) {
      confidence = 'HIGH';
      confidenceReason = `Corroborated across ${uniqueDomains.size} independent domains with fresh verified timestamps.`;
    } else if (uniqueDomains.size >= 2 || (hasTimestamps && ageHours <= 24 && primaryDoc.quality === 'PRIMARY')) {
      confidence = 'MODERATE';
      confidenceReason = uniqueDomains.size >= 2
        ? `Corroborated by ${uniqueDomains.size} independent domains.`
        : 'Official primary publisher announcement with verified timestamp.';
    } else if (!hasTimestamps) {
      confidence = 'LOW';
      confidenceReason = 'Publication date unavailable from feed (unverified recency).';
    }

    // Transparent, explainable overall trend score formula
    // Unrelated content with 0% relevance is penalized so it ranks strictly at the bottom.
    let trendScore = 0;
    if (relevance === 0) {
      trendScore = Math.min(15, Math.round((freshnessScore + sourceCountScore + crossSourceScore) * 0.05));
    } else {
      trendScore = Math.round(
        0.35 * pillarRelevanceScore +
        0.35 * audienceRelevanceScore +
        0.10 * freshnessScore +
        0.10 * sourceCountScore +
        0.10 * crossSourceScore
      );
    }

    // Generate original angles tailored to this user's profile and pillar
    const angles = generateOriginalAngles(primaryDoc.title, combinedText, matchedPillar, profile);

    trendClusters.push({
      id: `trend_${crypto.randomBytes(6).toString('hex')}`,
      title: primaryDoc.title,
      summary: primaryDoc.description || primaryDoc.body.slice(0, 240) + '...',
      keywords,
      topics: keywords.slice(0, 4),
      sourceCount,
      uniqueSourceCount,
      sources,
      firstSeenAt: new Date(minTime).toISOString(),
      lastSeenAt: new Date(maxTime).toISOString(),
      freshness,
      classification,
      confidence,
      confidenceReason,
      engagementSignal: 'Engagement metrics unavailable from public RSS/Atom feeds (zero simulated stats).',
      primaryPublisher: primaryDoc.publisher || primaryDoc.sourceName || (primaryDoc.sourceDomain ? primaryDoc.sourceDomain : 'Public Web'),
      hasValidTimestamp: hasTimestamps,
      velocity,
      relevance,
      relevanceLevel,
      trendScore,
      scores: {
        freshnessScore,
        sourceCountScore,
        velocityScore,
        crossSourceScore,
        audienceRelevanceScore,
        pillarRelevanceScore,
        discussionIntensityScore,
      },
      discussionSignals,
      contentFormat: primaryDoc.format || 'educational',
      angles,
      matchedPillar,
      targetAudience: getFocalAudience(profile),
      provenance: {
        type: 'TREND_RESEARCH',
        discoveredAt: new Date().toISOString(),
      },
    });
  }

  // Sort by transparent trendScore descending
  return trendClusters.sort((a, b) => b.trendScore - a.trendScore);
}

/**
 * Matches trend content to the user's defined Content Pillars.
 * Pure evidence-based score: 0 to 100 with NO artificial minimum floor or ceiling.
 * If there is no evidence of relevance, it returns 0.
 */
export function matchTrendPillar(
  text: string,
  profile: VoiceProfile
): { matchedPillar: string; pillarRelevanceScore: number } {
  const pillars = (profile.contentPillars || []).filter((p) => p && p.trim().length > 0);
  if (pillars.length === 0) {
    return { matchedPillar: 'General Strategy', pillarRelevanceScore: 0 };
  }

  const textTokens = new Set(tokenize(text));
  if (textTokens.size === 0) {
    return { matchedPillar: pillars[0], pillarRelevanceScore: 0 };
  }

  let bestPillar = pillars[0];
  let maxScore = 0;

  for (const pillar of pillars) {
    const pillarTokens = tokenize(pillar);
    if (pillarTokens.length === 0) continue;
    let matched = 0;
    for (const pt of pillarTokens) {
      if (textTokens.has(pt)) matched++;
    }
    const score = (matched / pillarTokens.length) * 100;
    if (score > maxScore) {
      maxScore = score;
      bestPillar = pillar;
    }
  }

  if (maxScore === 0) {
    return { matchedPillar: pillars[0], pillarRelevanceScore: 0 };
  }

  const pillarRelevanceScore = Math.min(100, Math.round(maxScore));
  return { matchedPillar: bestPillar, pillarRelevanceScore };
}

/**
 * Scores how closely this trend relates to the user's ICP and target audience.
 * Pure evidence-based score: 0 to 100 with NO artificial minimum floor or ceiling.
 * If there is no evidence of relevance, it returns 0.
 */
export function scoreAudienceRelevance(text: string, profile: VoiceProfile): number {
  if (!profile.audience && !profile.role) return 0;

  const textTokens = new Set(tokenize(text));
  if (textTokens.size === 0) return 0;

  // Split audience into distinct role/ICP segments
  const segments: string[] = [];
  if (profile.audience) {
    segments.push(...profile.audience.split(/[,;]|\band\b|\bor\b/i).map((s) => s.trim()).filter((s) => s.length > 0));
  }
  if (profile.role) {
    segments.push(profile.role.trim());
  }

  if (segments.length === 0) return 0;

  let maxCoverage = 0;
  for (const seg of segments) {
    const segTokens = tokenize(seg);
    if (segTokens.length === 0) continue;
    let matched = 0;
    for (const st of segTokens) {
      if (textTokens.has(st)) matched++;
    }
    const coverage = matched / segTokens.length;
    if (coverage > maxCoverage) {
      maxCoverage = coverage;
    }
  }

  if (maxCoverage === 0) return 0;
  return Math.min(100, Math.round(maxCoverage * 100));
}

/**
 * Extracts questions, recurring pain points, and disagreements from discussion texts.
 */
function extractDiscussionSignals(text: string): {
  questions: string[];
  painPoints: string[];
  disagreements: string[];
  emergingTerminology: string[];
} {
  const questions: string[] = [];
  const painPoints: string[] = [];
  const disagreements: string[] = [];
  const emergingTerminology: string[] = [];

  // Extract questions
  const qMatches = [...text.matchAll(/([A-Z][^.?!]{8,90}\?)/g)];
  for (const q of qMatches) {
    const cleanQ = q[1].trim();
    if (cleanQ.length > 15 && cleanQ.length < 100 && !questions.includes(cleanQ)) {
      questions.push(cleanQ);
      if (questions.length >= 3) break;
    }
  }

  if (questions.length === 0) {
    questions.push('What is the actual production trade-off when adopting this approach?');
  }

  // Detect pain points
  const painKeywords = ['friction', 'bottleneck', 'overhead', 'churn', 'latency', 'complexity', 'debt', 'burnout', 'expensive', 'failure'];
  for (const pk of painKeywords) {
    if (text.toLowerCase().includes(pk)) {
      painPoints.push(`Operational ${pk} when scaling workflows`);
      if (painPoints.length >= 2) break;
    }
  }

  // Detect disagreements
  if (/\b(?:vs|versus|trade-off|controversial|debate|disagree|myth)\b/i.test(text)) {
    disagreements.push('Disagreement between immediate implementation speed and long-term architectural stability.');
  }

  return { questions, painPoints, disagreements, emergingTerminology };
}

/**
 * Extracts a concise, professional focal audience slice (no 10-role raw dumps).
 */
function getFocalAudience(profile: VoiceProfile): string {
  if (!profile.audience) return 'Industry leaders and operators';
  const parts = profile.audience.split(/,|\band\b/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 2) return profile.audience;
  return `${parts[0]} and ${parts[1]}`;
}

/**
 * Generates 3-4 distinct ORIGINAL content angles for a trend.
 * NEVER rewrites or copies the source—transforms source facts into original educational perspectives.
 */
export function generateOriginalAngles(
  trendTitle: string,
  contextText: string,
  matchedPillar: string,
  profile: VoiceProfile
): ContentAngle[] {
  const focalAudience = getFocalAudience(profile);

  // Clean title without destroying natural hyphenated terms
  const cleanTitle = trendTitle
    .replace(/\s+[|–—]\s+[^|–—]+$/i, '')
    .replace(/\s+-\s+[A-Z][a-zA-Z0-9\s.]+$/i, '')
    .trim();

  return [
    {
      type: 'Educational',
      hookConcept: `What ${cleanTitle} actually changes in modern workflows—and what it leaves completely untouched.`,
      angleDescription: 'Walk through the operational mechanism without hype, teaching builders how to evaluate the change.',
      proposedThesis: `Understanding the shift behind ${cleanTitle}: why understanding system contracts matters more than tool adoption.`
    },
    {
      type: 'Contrarian',
      hookConcept: `Most teams adopting ${cleanTitle} are optimizing for the wrong metric.`,
      angleDescription: 'Challenge the conventional reaction, showing where teams accidentally create compound overhead.',
      proposedThesis: `Why high output velocity does not equal high delivery value, and what disciplined ${focalAudience} should prioritize instead.`
    },
    {
      type: 'Practical',
      hookConcept: `3 non-negotiable checkpoints before integrating ${cleanTitle} into production systems.`,
      angleDescription: 'A direct, tactical checklist to prevent regressions and operational surprises.',
      proposedThesis: `A step-by-step framework to harness this shift with minimal friction and maximum predictability.`
    },
    {
      type: 'Framework',
      hookConcept: `The 3-layer architecture for scaling ${matchedPillar} without adding unnecessary operational weight.`,
      angleDescription: 'A structured mental model tailored to the user’s exact content pillar.',
      proposedThesis: `How mature operators structure their processes to make execution transparent and repeatable.`
    }
  ];
}

export interface SimilarityAnalysis {
  similarityScore: number; // 0 - 100% (similarity to source material)
  similarityLevel: 'LOW' | 'MODERATE' | 'HIGH';
  phraseOverlap: string;
  overlappingPhrases: string[];
  potentiallySimilarPassages: {
    postExcerpt: string;
    sourceExcerpt: string;
    similarity: number;
  }[];
  requiresRegeneration: boolean;
  isSafeToReview: boolean;
  message: string;
  originalityScore: number; // 100 - similarityScore (for backward compatibility)
  isOriginal: boolean;
}

/**
 * Multi-layer source similarity analysis:
 * 1. Exact phrase matching (>= 6 words verbatim)
 * 2. 3-gram and 4-gram Jaccard overlap
 * 3. Token-level Jaccard similarity
 * 4. Structural near-paraphrase sentence alignment (detects rewritten source sentences)
 */
export function checkSourceSimilarity(
  postText: string,
  sourceDocuments: { body: string; title: string }[]
): SimilarityAnalysis {
  if (!postText || !sourceDocuments || sourceDocuments.length === 0) {
    return {
      similarityScore: 0,
      similarityLevel: 'LOW',
      phraseOverlap: 'None detected',
      overlappingPhrases: [],
      potentiallySimilarPassages: [],
      requiresRegeneration: false,
      isSafeToReview: true,
      message: 'No source material provided to compare against.',
      originalityScore: 100,
      isOriginal: true,
    };
  }

  const postWords = postText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const postSentences = postText
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 5);

  const combinedSourceText = sourceDocuments
    .map((s) => `${s.title}. ${s.body}`)
    .join('\n')
    .toLowerCase();
  
  const sourceSentences = combinedSourceText
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 5);

  // 1. Exact phrase matching (6-word rolling n-grams)
  const exactMatches: string[] = [];
  const phraseLength = 6;
  if (postWords.length >= phraseLength) {
    for (let i = 0; i <= postWords.length - phraseLength; i++) {
      const phrase = postWords.slice(i, i + phraseLength).join(' ');
      if (combinedSourceText.includes(phrase)) {
        if (!exactMatches.some((m) => m.includes(phrase) || phrase.includes(m))) {
          exactMatches.push(phrase);
        }
      }
    }
  }

  // 2. Token-level Jaccard similarity
  const postTokenSet = new Set(postWords.filter((w) => w.length > 2));
  const sourceWords = combinedSourceText.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const sourceTokenSet = new Set(sourceWords);
  
  let intersectionCount = 0;
  for (const token of postTokenSet) {
    if (sourceTokenSet.has(token)) intersectionCount++;
  }
  const unionCount = new Set([...postTokenSet, ...sourceTokenSet]).size;
  const tokenJaccard = unionCount > 0 ? (intersectionCount / unionCount) : 0;

  // 3. Structural & near-paraphrase sentence alignment
  // Compares each sentence in post against each sentence in source
  const potentiallySimilarPassages: {
    postExcerpt: string;
    sourceExcerpt: string;
    similarity: number;
  }[] = [];

  for (const pSentence of postSentences) {
    const pTokens = new Set(pSentence.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
    if (pTokens.size < 4) continue;

    for (const sSentence of sourceSentences) {
      const sTokens = new Set(sSentence.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
      if (sTokens.size < 4) continue;

      let shared = 0;
      for (const t of pTokens) {
        if (sTokens.has(t)) shared++;
      }
      const sentenceUnion = new Set([...pTokens, ...sTokens]).size;
      const sentenceJaccard = sentenceUnion > 0 ? (shared / sentenceUnion) : 0;
      const containment = Math.min(pTokens.size, sTokens.size) > 0 ? (shared / Math.min(pTokens.size, sTokens.size)) : 0;

      // Detect near-paraphrases using either Jaccard or token containment (>= 60% of source clause)
      if ((sentenceJaccard >= 0.40 || containment >= 0.60) && shared >= 4) {
        potentiallySimilarPassages.push({
          postExcerpt: pSentence.slice(0, 120),
          sourceExcerpt: sSentence.slice(0, 120),
          similarity: Math.round(Math.max(sentenceJaccard, containment) * 100),
        });
        break;
      }
    }
  }

  // 4. Calculate weighted composite similarity score (0 to 100)
  // - Exact 6-word matches penalize heavily
  // - Near-paraphrase sentence matches add weight
  // - Vocabulary Jaccard adds baseline overlap
  const exactPenalty = Math.min(50, exactMatches.length * 15);
  const paraphrasePenalty = Math.min(40, potentiallySimilarPassages.length * 12);
  const jaccardWeight = Math.min(30, Math.round(tokenJaccard * 100));

  const compositeSimilarity = Math.min(100, Math.round(exactPenalty * 0.45 + paraphrasePenalty * 0.35 + jaccardWeight * 0.20));

  let similarityLevel: 'LOW' | 'MODERATE' | 'HIGH' = 'LOW';
  if (compositeSimilarity > 35 || exactMatches.length >= 2 || potentiallySimilarPassages.length >= 3) {
    similarityLevel = 'HIGH';
  } else if (compositeSimilarity >= 20 || exactMatches.length === 1 || potentiallySimilarPassages.length >= 1) {
    similarityLevel = 'MODERATE';
  }

  const phraseOverlap = exactMatches.length === 0
    ? 'None detected'
    : `${exactMatches.length} verbatim phrase match${exactMatches.length === 1 ? '' : 'es'} detected`;

  const requiresRegeneration = similarityLevel === 'HIGH';
  const isSafeToReview = similarityLevel !== 'HIGH';
  const originalityScore = Math.max(0, 100 - compositeSimilarity);

  return {
    similarityScore: compositeSimilarity,
    similarityLevel,
    phraseOverlap,
    overlappingPhrases: exactMatches.slice(0, 3),
    potentiallySimilarPassages: potentiallySimilarPassages.slice(0, 3),
    requiresRegeneration,
    isSafeToReview,
    message: similarityLevel === 'LOW'
      ? 'Low similarity to source material. High independent synthesis.'
      : similarityLevel === 'MODERATE'
      ? 'Moderate similarity detected. Review highlighted passages or regenerate with a different angle.'
      : 'High similarity to source material detected. Auto-regeneration recommended.',
    originalityScore,
    isOriginal: similarityLevel !== 'HIGH',
  };
}

/**
 * Backward compatibility alias for checkContentOriginality.
 */
export function checkContentOriginality(
  postText: string,
  sourceDocuments: { body: string; title: string }[]
) {
  return checkSourceSimilarity(postText, sourceDocuments);
}
