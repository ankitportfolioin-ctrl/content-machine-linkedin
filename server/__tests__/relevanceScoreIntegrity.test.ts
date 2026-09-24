import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  clusterDocuments,
  matchTrendPillar,
  scoreAudienceRelevance,
  ContentDocument
} from '../trendIntelligence';
import { VoiceProfile } from '../voiceProfileService';

function createDoc(partial: {
  id: string;
  title: string;
  body: string;
  headings?: string[];
  keywords?: string[];
  topics?: string[];
  url?: string;
  sourceName?: string;
  sourceType?: 'RSS';
  quality?: 'PRIMARY' | 'SECONDARY';
  accessStatus?: 'OK';
  publishedAt?: string;
}): ContentDocument {
  const url = partial.url || `https://example.com/${partial.id}`;
  return {
    id: partial.id,
    canonicalUrl: url,
    url,
    title: partial.title,
    publisher: partial.sourceName || 'Test Publisher',
    sourceId: 'src_test',
    sourceName: partial.sourceName || 'Test Source',
    sourceType: partial.sourceType || 'RSS',
    sourceDomain: 'example.com',
    retrievedAt: new Date().toISOString(),
    discoveredAt: new Date().toISOString(),
    text: partial.body,
    body: partial.body,
    excerpt: partial.body.slice(0, 100),
    topics: partial.topics || [],
    keywords: partial.keywords || [],
    headings: partial.headings || [],
    tags: [],
    contentHash: 'hash_' + partial.id,
    quality: partial.quality || 'PRIMARY',
    accessStatus: partial.accessStatus || 'OK',
    publishedAt: partial.publishedAt,
    provenance: {
      adapter: 'test',
      targetUrl: url,
      fetchedAt: new Date().toISOString(),
    },
  };
}

describe('Micro-Audit: Relevance Score Integrity & Non-Fabrication Suite', () => {
  const personaA: VoiceProfile = {
    filled: true,
    role: 'Staff Software Engineer',
    audience: 'Platform Engineers, DevOps Leads, System Architects',
    contentPillars: ['Distributed Systems Resilience', 'Kubernetes Scaling', 'Developer Velocity'],
    sentenceRhythm: 'punchy',
    signatureOpeners: [],
    bannedWords: [],
    alwaysRules: [],
    neverRules: [],
    primaryLink: '',
    ctaStyle: 'Direct Question',
    signatureExamples: [],
    keyReceipts: []
  };

  const personaB: VoiceProfile = {
    filled: true,
    role: 'D2C Brand Founder & Operator',
    audience: 'E-commerce Operators, D2C Founders, Retail Leaders',
    contentPillars: ['D2C Unit Economics', 'WhatsApp Automation & Retention', 'Last-Mile Delivery'],
    sentenceRhythm: 'punchy',
    signatureOpeners: [],
    bannedWords: [],
    alwaysRules: [],
    neverRules: [],
    primaryLink: '',
    ctaStyle: 'Direct Question',
    signatureExamples: [],
    keyReceipts: []
  };

  it('1. Perfectly relevant document achieves high evidence-based relevance (>= 90%)', () => {
    const doc = createDoc({
      id: 'doc-perf',
      title: 'Kubernetes Scaling and Distributed Systems Resilience for Platform Engineers',
      body: 'In this technical architecture guide for platform engineers and system architects, we analyze Kubernetes scaling patterns, distributed systems resilience under node failure, and developer velocity metrics.',
      headings: ['Cluster Resilience', 'Dynamic Scaling'],
      keywords: ['kubernetes', 'scaling', 'resilience', 'platform'],
      topics: ['DevOps'],
      url: 'https://github.blog/kubernetes-scaling',
      sourceName: 'GitHub Engineering',
      sourceType: 'RSS',
      quality: 'PRIMARY',
      accessStatus: 'OK',
      publishedAt: new Date().toISOString()
    });

    const clusters = clusterDocuments([doc], personaA);
    assert.strictEqual(clusters.length, 1);
    const cl = clusters[0];

    assert.strictEqual(cl.scores.pillarRelevanceScore, 100, 'Pillar score must reflect complete token coverage');
    assert.strictEqual(cl.scores.audienceRelevanceScore, 100, 'Audience score must reflect role/segment coverage');
    assert.strictEqual(cl.relevance, 100, 'Relevance must be 100% for perfectly aligned text');
    assert.strictEqual(cl.relevanceLevel, 'HIGH');
    assert.strictEqual(cl.classification, 'RELEVANT');
    assert.ok(cl.trendScore >= 75, 'Trend score must be high for perfectly relevant primary source');
  });

  it('2. Strongly relevant document achieves strong relevance (>= 60%)', () => {
    const doc = createDoc({
      id: 'doc-strong',
      title: 'Scaling Kubernetes Pods with Dynamic HPA Metrics',
      body: 'Architecting platform infrastructure requires deep observability into developer velocity and cluster health metrics.',
      headings: ['Observability', 'HPA Metrics'],
      keywords: ['kubernetes', 'hpa'],
      topics: ['Platform Engineering'],
      url: 'https://example.com/k8s-hpa',
      sourceName: 'Tech Blog',
      sourceType: 'RSS',
      quality: 'PRIMARY',
      accessStatus: 'OK',
      publishedAt: new Date().toISOString()
    });

    const clusters = clusterDocuments([doc], personaA);
    assert.strictEqual(clusters.length, 1);
    const cl = clusters[0];

    assert.ok(cl.scores.pillarRelevanceScore >= 66, 'Pillar match should be substantial');
    assert.ok(cl.relevance >= 60, 'Relevance should be >= 60%');
    assert.ok(cl.relevanceLevel === 'HIGH' || cl.relevanceLevel === 'MEDIUM');
  });

  it('3. Weakly relevant document receives honest low score (< 40%) without artificial inflation', () => {
    const doc = createDoc({
      id: 'doc-weak',
      title: 'New Trends in Modern Engineering Tools',
      body: 'A broad industry survey of popular software development and engineering workflows across various companies.',
      headings: ['Tools Survey'],
      keywords: ['tools', 'survey'],
      topics: ['Tech'],
      url: 'https://example.com/survey',
      sourceName: 'Industry Review',
      sourceType: 'RSS',
      quality: 'SECONDARY',
      accessStatus: 'OK',
      publishedAt: new Date().toISOString()
    });

    const clusters = clusterDocuments([doc], personaA);
    assert.strictEqual(clusters.length, 1);
    const cl = clusters[0];

    assert.ok(cl.relevance < 40, `Relevance should be low for generic text, was ${cl.relevance}%`);
    assert.strictEqual(cl.relevanceLevel, 'LOW');
    assert.ok(cl.trendScore < 45, 'Trend score must reflect weak topical fit');
  });

  it('4. Completely unrelated document receives STRICTLY 0% relevance and UNRELATED classification', () => {
    const doc = createDoc({
      id: 'doc-unrelated',
      title: '10 Best Sourdough Bread Recipes for Crispy Crust',
      body: 'Baking authentic sourdough bread requires active starter, organic flour, water, salt, and precise fermentation timing in a Dutch oven.',
      headings: ['Starter Hydration', 'Baking Temp'],
      keywords: ['sourdough', 'bread', 'baking', 'flour'],
      topics: ['Baking'],
      url: 'https://baking.example.com/sourdough',
      sourceName: 'Baking Digest',
      sourceType: 'RSS',
      quality: 'PRIMARY',
      accessStatus: 'OK',
      publishedAt: new Date().toISOString()
    });

    const clusters = clusterDocuments([doc], personaA);
    assert.strictEqual(clusters.length, 1);
    const cl = clusters[0];

    assert.strictEqual(cl.scores.pillarRelevanceScore, 0, 'Pillar score must be 0 for baking doc');
    assert.strictEqual(cl.scores.audienceRelevanceScore, 0, 'Audience score must be 0 for baking doc');
    assert.strictEqual(cl.relevance, 0, 'Relevance must be strictly 0%');
    assert.strictEqual(cl.relevanceLevel, 'NONE');
    assert.strictEqual(cl.classification, 'UNRELATED');
    assert.ok(cl.trendScore <= 15, `Trend score for unrelated content must be penalized (was ${cl.trendScore})`);
    assert.strictEqual(cl.confidence, 'LOW');
  });

  it('5. Empty document receives STRICTLY 0% relevance', () => {
    const doc = createDoc({
      id: 'doc-empty',
      title: '',
      body: '',
      headings: [],
      keywords: [],
      topics: [],
      url: 'https://example.com/empty',
      sourceName: 'Empty',
      sourceType: 'RSS',
      quality: 'PRIMARY',
      accessStatus: 'OK',
      publishedAt: new Date().toISOString()
    });

    const clusters = clusterDocuments([doc], personaA);
    assert.strictEqual(clusters.length, 1);
    const cl = clusters[0];

    assert.strictEqual(cl.scores.pillarRelevanceScore, 0);
    assert.strictEqual(cl.scores.audienceRelevanceScore, 0);
    assert.strictEqual(cl.relevance, 0);
    assert.strictEqual(cl.relevanceLevel, 'NONE');
    assert.strictEqual(cl.classification, 'UNRELATED');
    assert.ok(cl.trendScore <= 15);
  });

  it('6. Missing title/body (whitespace-only) receives STRICTLY 0% relevance', () => {
    const doc = createDoc({
      id: 'doc-whitespace',
      title: '   \n  \t ',
      body: '   \t  \n ',
      headings: [],
      keywords: [],
      topics: [],
      url: 'https://example.com/whitespace',
      sourceName: 'Blank',
      sourceType: 'RSS',
      quality: 'PRIMARY',
      accessStatus: 'OK',
      publishedAt: new Date().toISOString()
    });

    const clusters = clusterDocuments([doc], personaA);
    assert.strictEqual(clusters.length, 1);
    const cl = clusters[0];

    assert.strictEqual(cl.scores.pillarRelevanceScore, 0);
    assert.strictEqual(cl.scores.audienceRelevanceScore, 0);
    assert.strictEqual(cl.relevance, 0);
    assert.strictEqual(cl.relevanceLevel, 'NONE');
    assert.strictEqual(cl.classification, 'UNRELATED');
    assert.ok(cl.trendScore <= 15);
  });

  it('7. Persona A technical document evaluated against Persona B (D2C) produces 0% relevance', () => {
    const techDoc = createDoc({
      id: 'doc-tech',
      title: 'Kubernetes Scaling and Distributed Systems Resilience for Platform Engineers',
      body: 'In this guide for platform engineers and system architects, we dive into Kubernetes scaling patterns, distributed systems resilience, and developer velocity benchmarks.',
      headings: [],
      keywords: [],
      topics: [],
      url: 'https://example.com/tech',
      sourceName: 'Tech',
      sourceType: 'RSS',
      quality: 'PRIMARY',
      accessStatus: 'OK',
      publishedAt: new Date().toISOString()
    });

    const clusters = clusterDocuments([techDoc], personaB);
    assert.strictEqual(clusters.length, 1);
    const cl = clusters[0];

    assert.strictEqual(cl.scores.pillarRelevanceScore, 0, 'Tech doc must have 0% D2C pillar match');
    assert.strictEqual(cl.scores.audienceRelevanceScore, 0, 'Tech doc must have 0% D2C audience match');
    assert.strictEqual(cl.relevance, 0, 'Relevance must be 0% across personas');
    assert.strictEqual(cl.relevanceLevel, 'NONE');
    assert.strictEqual(cl.classification, 'UNRELATED');
    assert.ok(cl.trendScore <= 15, 'Trend score must be penalized for cross-persona mismatch');
  });

  it('8. Persona B D2C document evaluated against Persona A (Tech) produces 0% relevance', () => {
    const d2cDoc = createDoc({
      id: 'doc-d2c',
      title: 'D2C Unit Economics and WhatsApp Automation for Indian E-commerce Brands',
      body: 'Retail leaders and e-commerce operators share benchmarks on last-mile delivery and WhatsApp customer retention.',
      headings: [],
      keywords: [],
      topics: [],
      url: 'https://example.com/d2c',
      sourceName: 'D2C',
      sourceType: 'RSS',
      quality: 'PRIMARY',
      accessStatus: 'OK',
      publishedAt: new Date().toISOString()
    });

    const clusters = clusterDocuments([d2cDoc], personaA);
    assert.strictEqual(clusters.length, 1);
    const cl = clusters[0];

    assert.strictEqual(cl.scores.pillarRelevanceScore, 0, 'D2C doc must have 0% Tech pillar match');
    assert.strictEqual(cl.scores.audienceRelevanceScore, 0, 'D2C doc must have 0% Tech audience match');
    assert.strictEqual(cl.relevance, 0, 'Relevance must be 0% across personas');
    assert.strictEqual(cl.relevanceLevel, 'NONE');
    assert.strictEqual(cl.classification, 'UNRELATED');
    assert.ok(cl.trendScore <= 15, 'Trend score must be penalized for cross-persona mismatch');
  });

  it('9. Direct helper tests: matchTrendPillar returns 0 when no match, not 40', () => {
    const res = matchTrendPillar('unrelated chocolate chip cookies recipe', personaA);
    assert.strictEqual(res.pillarRelevanceScore, 0, 'Unmatched text must return 0 pillar relevance');
  });

  it('10. Direct helper tests: scoreAudienceRelevance returns 0 when no match, not 45', () => {
    const score = scoreAudienceRelevance('unrelated chocolate chip cookies recipe', personaA);
    assert.strictEqual(score, 0, 'Unmatched text must return 0 audience relevance');
  });
});
