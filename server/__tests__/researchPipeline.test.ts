import assert from 'assert';
import { RssAtomAdapter, SitemapAdapter, ContentDocument } from '../crawler/sourceAdapters';
import { extractArticleContent } from '../crawler/htmlExtractor';
import { deduplicateDocuments, clusterDocuments } from '../trendIntelligence';
import { validateAndNormalizeUrl, validateDnsDestination, safeFetchWithRedirectValidation } from '../crawler/crawlerSafety';
import { discoverSourcesForProfile, deriveResearchTopics } from '../trendSourceRegistry';
import { generateIdeaFromTrend, generateCompletePost, generateContentIdeas } from '../contentEngine';
import { VoiceProfile } from '../voiceProfileService';

function createMockProfile(partial: Partial<VoiceProfile>): VoiceProfile {
  return {
    filled: true,
    role: 'Operator',
    audience: 'Target Audience',
    contentPillars: ['Operations'],
    sentenceRhythm: 'punchy',
    signatureOpeners: [],
    bannedWords: [],
    alwaysRules: [],
    neverRules: [],
    primaryLink: '',
    ctaStyle: 'Direct Question',
    signatureExamples: [],
    keyReceipts: [],
    ...partial,
  };
}

let passedTests = 0;
let totalTests = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

export async function runAllPipelineTests() {
  console.log('\n======================================================');
  console.log('RUNNING AUTOMATED AUDIT & PRODUCTION HARDENING SUITE');
  console.log('======================================================\n');

  // 1. ADAPTER PARSING: RSS & ATOM
  console.log('--- 1. Adapter Parsing: RSS & Atom ---');
  await runTest('RssAtomAdapter correctly parses RSS 2.0 with dates and metadata', () => {
    const adapter = new RssAtomAdapter();
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>Test Tech News</title>
          <link>https://tech.example.com</link>
          <item>
            <title>Scaling AI Customer Support in 2026</title>
            <link>https://tech.example.com/posts/scaling-ai-support?utm_source=feed&amp;utm_medium=rss</link>
            <pubDate>Wed, 23 Sep 2026 05:00:00 GMT</pubDate>
            <description>How modern consumer brands handle customer tickets efficiently.</description>
            <content:encoded><![CDATA[Full article discussing WhatsApp automation, response SLAs, and human-in-the-loop workflows.]]></content:encoded>
          </item>
        </channel>
      </rss>`;

    const docs = adapter.parseFeedXml(rssXml, 'https://tech.example.com/feed', 'Tech News', 'src_tech');
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].title, 'Scaling AI Customer Support in 2026');
    assert.strictEqual(docs[0].sourceType, 'RSS');
    assert.strictEqual(docs[0].publishedAt, '2026-09-23T05:00:00.000Z');
    // Normalized URL should have tracking parameters stripped
    assert.strictEqual(docs[0].url, 'https://tech.example.com/posts/scaling-ai-support');
    assert(docs[0].text.includes('WhatsApp automation'));
    assert(docs[0].contentHash.length > 20);
  });

  await runTest('RssAtomAdapter correctly parses Atom XML feed', () => {
    const adapter = new RssAtomAdapter();
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Engineering Feed</title>
        <entry>
          <title>Optimizing Next.js SSR Latency</title>
          <link rel="alternate" href="https://blog.example.com/nextjs-ssr" />
          <id>urn:uuid:12345</id>
          <updated>2026-09-22T14:30:00Z</updated>
          <summary>Benchmarking Edge functions vs Node clusters.</summary>
        </entry>
      </feed>`;

    const docs = adapter.parseFeedXml(atomXml, 'https://blog.example.com/atom.xml', 'Blog', 'src_blog');
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].title, 'Optimizing Next.js SSR Latency');
    assert.strictEqual(docs[0].sourceType, 'ATOM');
    assert.strictEqual(docs[0].publishedAt, '2026-09-22T14:30:00.000Z');
    assert.strictEqual(docs[0].url, 'https://blog.example.com/nextjs-ssr');
  });

  await runTest('RssAtomAdapter does NOT fabricate dates when pubDate is missing', () => {
    const adapter = new RssAtomAdapter();
    const xmlWithoutDate = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>No Date Feed</title>
          <item>
            <title>Timeless Engineering Wisdom</title>
            <link>https://example.com/timeless</link>
            <description>General advice on software architecture.</description>
          </item>
        </channel>
      </rss>`;

    const docs = adapter.parseFeedXml(xmlWithoutDate, 'https://example.com/feed', 'Example', 'src_ex');
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].publishedAt, undefined, 'Must not fabricate date');
  });

  // 2. HTML CONTENT EXTRACTION
  console.log('\n--- 2. HTML Article Extraction ---');
  await runTest('extractArticleContent strips boilerplate, nav, scripts, and extracts clean text', () => {
    const rawHtml = `<!DOCTYPE html>
      <html>
        <head>
          <title>How We Reduced First Response Time By 60%</title>
          <meta name="description" content="A playbook for high volume customer support." />
          <meta property="article:published_time" content="2026-09-20T10:00:00Z" />
        </head>
        <body>
          <header><nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav></header>
          <main>
            <article>
              <h1>How We Reduced First Response Time By 60%</h1>
              <p>For growing D2C brands, customer inquiry surges during seasonal campaigns create severe ticket backlogs.</p>
              <h2>The Triage Bottleneck</h2>
              <p>By routing repetitive order status requests to instant WhatsApp confirmation, our tier 1 queue dropped significantly.</p>
            </article>
          </main>
          <footer><p>&copy; 2026 Company Inc. All rights reserved.</p></footer>
          <script>console.log("analytics");</script>
        </body>
      </html>`;

    const extracted = extractArticleContent(rawHtml, 'https://support.example.com/case-study');
    assert.strictEqual(extracted.title, 'How We Reduced First Response Time By 60%');
    assert(extracted.body.includes('For growing D2C brands'));
    assert(extracted.headings.includes('The Triage Bottleneck'));
    assert(!extracted.body.includes('Pricing'), 'Must strip navigation links');
    assert(!extracted.body.includes('console.log'), 'Must strip script tags');
    assert.strictEqual(extracted.publishedAt, '2026-09-20T10:00:00.000Z');
  });

  // 3. MULTI-LAYER DEDUPLICATION
  console.log('\n--- 3. Multi-layer Deduplication ---');
  await runTest('deduplicateDocuments enforces canonical URL, normalized URL, content hash, and title similarity', () => {
    const baseDoc: ContentDocument = {
      id: 'doc_1',
      canonicalUrl: 'https://example.com/posts/ai-trends',
      url: 'https://example.com/posts/ai-trends?utm_source=twitter',
      title: 'Top 5 AI Automation Strategies for 2026',
      publisher: 'Tech Daily',
      sourceId: 'src_1',
      sourceName: 'Tech Daily',
      sourceType: 'RSS',
      sourceDomain: 'example.com',
      retrievedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      text: 'Detailed overview of automating support workflows.',
      body: 'Detailed overview of automating support workflows.',
      excerpt: 'Detailed overview...',
      topics: ['ai', 'automation'],
      keywords: ['ai', 'automation'],
      headings: [],
      tags: ['ai'],
      contentHash: 'hash_abc123',
      quality: 'PRIMARY',
      accessStatus: 'OK',
      provenance: { adapter: 'RSS', targetUrl: 'https://example.com', fetchedAt: new Date().toISOString() },
    };

    // Duplicate 1: Different URL query parameters, same canonical URL
    const dupCanonical: ContentDocument = {
      ...baseDoc,
      id: 'doc_2',
      url: 'https://example.com/posts/ai-trends?utm_source=linkedin&ref=newsletter',
      canonicalUrl: 'https://example.com/posts/ai-trends',
    };

    // Duplicate 2: Different URL protocol / www prefix
    const dupNormalized: ContentDocument = {
      ...baseDoc,
      id: 'doc_3',
      canonicalUrl: '',
      url: 'http://www.example.com/posts/ai-trends',
    };

    // Duplicate 3: Different URL, but identical content hash
    const dupHash: ContentDocument = {
      ...baseDoc,
      id: 'doc_4',
      url: 'https://syndicate.com/repost-ai-trends',
      canonicalUrl: 'https://syndicate.com/repost-ai-trends',
      contentHash: 'hash_abc123',
    };

    // Duplicate 4: Very high title token similarity (>= 0.85)
    const dupTitle: ContentDocument = {
      ...baseDoc,
      id: 'doc_5',
      url: 'https://another-domain.com/posts/top-5-ai-automation-strategies',
      canonicalUrl: 'https://another-domain.com/posts/top-5-ai-automation-strategies',
      contentHash: 'hash_xyz999',
      title: 'Top 5 AI Automation Strategies for 2026!',
    };

    // Unique document
    const uniqueDoc: ContentDocument = {
      ...baseDoc,
      id: 'doc_6',
      canonicalUrl: 'https://example.com/posts/supply-chain',
      url: 'https://example.com/posts/supply-chain',
      contentHash: 'hash_supply_456',
      title: 'D2C Supply Chain Resilience in Emerging Markets',
    };

    const deduped = deduplicateDocuments([baseDoc, dupCanonical, dupNormalized, dupHash, dupTitle, uniqueDoc]);
    assert.strictEqual(deduped.length, 2, `Expected exactly 2 unique documents, received ${deduped.length}`);
    assert.strictEqual(deduped[0].id, 'doc_1');
    assert.strictEqual(deduped[1].id, 'doc_6');
  });

  // 4. FRESHNESS & VELOCITY MODEL
  console.log('\n--- 4. Freshness & Velocity Model ---');
  await runTest('Freshness model handles breaking, recent, evergreen, and missing timestamps honestly', () => {
    const mockProfile: VoiceProfile = createMockProfile({
      role: 'D2C Support Operator',
      audience: 'D2C Founders',
      contentPillars: ['AI Support Automation', 'D2C Customer Experience'],
    });

    const now = Date.now();
    const docBreaking: ContentDocument = {
      id: 'd_break',
      canonicalUrl: 'https://example.com/1',
      url: 'https://example.com/1',
      title: 'Breaking: Instant Refunds API Released',
      publisher: 'Source A',
      sourceId: 'src_a',
      sourceName: 'Source A',
      sourceType: 'RSS',
      sourceDomain: 'example.com',
      publishedAt: new Date(now - 2 * 3600 * 1000).toISOString(), // 2 hours ago
      retrievedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      text: 'Instant refunds API reduces customer support inquiries drastically.',
      body: 'Instant refunds API reduces customer support inquiries drastically.',
      excerpt: 'Instant refunds...',
      topics: ['refunds', 'support'],
      keywords: ['refunds', 'support', 'api', 'customer'],
      headings: [],
      tags: ['refunds'],
      contentHash: 'hash_1',
      quality: 'PRIMARY',
      accessStatus: 'OK',
      provenance: { adapter: 'RSS', targetUrl: 'https://example.com', fetchedAt: new Date().toISOString() },
    };

    const docOld: ContentDocument = {
      ...docBreaking,
      id: 'd_old',
      canonicalUrl: 'https://example.com/2',
      url: 'https://example.com/2',
      title: 'Evergreen Principles of Customer Care',
      publishedAt: new Date(now - 60 * 24 * 3600 * 1000).toISOString(), // 60 days ago
      contentHash: 'hash_2',
    };

    const docUndated: ContentDocument = {
      ...docBreaking,
      id: 'd_undated',
      canonicalUrl: 'https://example.com/3',
      url: 'https://example.com/3',
      title: 'Undated Overview of Support Metrics',
      publishedAt: undefined, // Missing timestamp
      contentHash: 'hash_3',
    };

    const clusterBreaking = clusterDocuments([docBreaking], mockProfile);
    assert(clusterBreaking.length === 1);
    assert(['BREAKING', 'TODAY', 'TRENDING'].includes(clusterBreaking[0].freshness));

    const clusterOld = clusterDocuments([docOld], mockProfile);
    assert(clusterOld.length === 1);
    assert.strictEqual(clusterOld[0].freshness, 'EVERGREEN');

    const clusterUndated = clusterDocuments([docUndated], mockProfile);
    assert(clusterUndated.length === 1);
    assert(['UNKNOWN', 'RECENT'].includes(clusterUndated[0].freshness), 'Undated sources must be classified UNKNOWN or RECENT, never BREAKING');
    assert.strictEqual(clusterUndated[0].hasValidTimestamp, false, 'hasValidTimestamp must be false when timestamp is missing');
  });

  // 5. TREND CLUSTERING
  console.log('\n--- 5. Trend Clustering ---');
  await runTest('clusterDocuments aggregates multiple related articles across different sources', () => {
    const mockProfile: VoiceProfile = createMockProfile({
      role: 'Founder',
      audience: 'B2B Founders',
      contentPillars: ['AI Workflows', 'Customer Retention'],
    });

    const docSource1: ContentDocument = {
      id: 'd_s1',
      canonicalUrl: 'https://techcrunch.com/whatsapp-agents',
      url: 'https://techcrunch.com/whatsapp-agents',
      title: 'WhatsApp AI Support Agents See Explosive Adoption Across Retailers',
      publisher: 'TechCrunch',
      sourceId: 'src_tc',
      sourceName: 'TechCrunch',
      sourceType: 'RSS',
      sourceDomain: 'techcrunch.com',
      publishedAt: new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      text: 'Retailers are integrating AI support agents on WhatsApp to automate ticket resolution.',
      body: 'Retailers are integrating AI support agents on WhatsApp to automate ticket resolution.',
      excerpt: 'Retailers are integrating AI support...',
      topics: ['whatsapp', 'ai', 'support'],
      keywords: ['whatsapp', 'ai', 'support', 'agents', 'retailers'],
      headings: [],
      tags: ['whatsapp'],
      contentHash: 'hash_tc',
      quality: 'PRIMARY',
      accessStatus: 'OK',
      provenance: { adapter: 'RSS', targetUrl: 'https://techcrunch.com', fetchedAt: new Date().toISOString() },
    };

    const docSource2: ContentDocument = {
      id: 'd_s2',
      canonicalUrl: 'https://inc42.com/whatsapp-support-growth',
      url: 'https://inc42.com/whatsapp-support-growth',
      title: 'Commerce Brands Turn to WhatsApp AI Support Agents for Faster Turnaround',
      publisher: 'Inc42',
      sourceId: 'src_inc42',
      sourceName: 'Inc42',
      sourceType: 'RSS',
      sourceDomain: 'inc42.com',
      publishedAt: new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      text: 'Commerce brands report 50% faster ticket turnaround after launching automated WhatsApp agents.',
      body: 'Commerce brands report 50% faster ticket turnaround after launching automated WhatsApp agents.',
      excerpt: 'Commerce brands report faster turnaround...',
      topics: ['whatsapp', 'ai', 'support'],
      keywords: ['whatsapp', 'ai', 'support', 'agents', 'turnaround'],
      headings: [],
      tags: ['whatsapp'],
      contentHash: 'hash_inc42',
      quality: 'PRIMARY',
      accessStatus: 'OK',
      provenance: { adapter: 'RSS', targetUrl: 'https://inc42.com', fetchedAt: new Date().toISOString() },
    };

    const clusters = clusterDocuments([docSource1, docSource2], mockProfile);
    assert.strictEqual(clusters.length, 1, 'Both documents discuss WhatsApp AI agents and should cluster together');
    assert.strictEqual(clusters[0].sourceCount, 2, 'Cluster should track both independent contributing sources');
    assert.strictEqual(clusters[0].sources.length, 2);
    assert(clusters[0].scores.crossSourceScore > 50, 'Cross-source score should reflect multiple domains');
  });

  // 6. SSRF SECURITY PROTECTION
  console.log('\n--- 6. SSRF Security & Redirect Validation ---');
  await runTest('Crawler strictly rejects loopback, private IPs, and metadata services', async () => {
    const unsafeUrls = [
      'http://127.0.0.1:3000/admin',
      'http://localhost:8080/secrets',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/router',
      'http://192.168.1.1/gateway',
      'http://172.16.0.5/internal',
      'ftp://example.com/file.txt',
      'file:///etc/passwd',
    ];

    for (const url of unsafeUrls) {
      const check = validateAndNormalizeUrl(url);
      assert.strictEqual(check.safe, false, `Expected URL '${url}' to be rejected by SSRF validator`);
    }
  });

  await runTest('DNS validator flags private IP resolutions', async () => {
    const dns1 = await validateDnsDestination('127.0.0.1');
    assert.strictEqual(dns1.safe, false);

    const dns2 = await validateDnsDestination('169.254.169.254');
    assert.strictEqual(dns2.safe, false);

    const dns3 = await validateDnsDestination('localhost');
    assert.strictEqual(dns3.safe, false);
  });

  await runTest('safeFetchWithRedirectValidation blocks unsafe destinations before request', async () => {
    try {
      await safeFetchWithRedirectValidation('http://169.254.169.254/secret');
      assert.fail('Should have thrown an SSRF error');
    } catch (err: any) {
      assert(err.message.includes('SSRF Blocked'));
    }
  });

  // 7. PERSONA ISOLATION & DYNAMIC TOPIC DERIVATION
  console.log('\n--- 7. Persona Isolation & Dynamic Topic Derivation ---');
  await runTest('Tech Developer persona vs Indian D2C persona produce isolated topics & sources', () => {
    const personaA_Tech: VoiceProfile = createMockProfile({
      role: 'Staff Engineer building DevTools and Distributed Systems',
      audience: 'Backend Engineers & Systems Architects',
      contentPillars: ['Distributed Systems', 'Go Concurrency', 'Database Internals'],
    });

    const personaB_D2C: VoiceProfile = createMockProfile({
      role: 'Founder & Operator helping Indian D2C brands automate customer support',
      audience: 'Indian D2C founders, e-commerce operators, consumer brands',
      contentPillars: ['AI customer support', 'D2C growth', 'WhatsApp automation', 'customer experience'],
    });

    const topicsA = deriveResearchTopics(personaA_Tech);
    const topicsB = deriveResearchTopics(personaB_D2C);

    // Verify dynamic topic derivation
    assert(topicsA.some((t) => t.toLowerCase().includes('distributed systems') || t.toLowerCase().includes('concurrency')));
    assert(!topicsA.some((t) => t.toLowerCase().includes('whatsapp') || t.toLowerCase().includes('d2c')));

    assert(topicsB.some((t) => t.toLowerCase().includes('whatsapp') || t.toLowerCase().includes('customer support')));
    assert(!topicsB.some((t) => t.toLowerCase().includes('distributed systems') || t.toLowerCase().includes('concurrency')));

    // Verify source matching
    const { sources: sourcesA } = discoverSourcesForProfile(personaA_Tech);
    const { sources: sourcesB } = discoverSourcesForProfile(personaB_D2C);

    const sourceNamesA = sourcesA.map((s) => s.name);
    const sourceNamesB = sourcesB.map((s) => s.name);

    assert(sourceNamesA.some((n) => n.includes('GitHub') || n.includes('Hacker News')));
    assert(sourceNamesB.some((n) => n.includes('Inc42') || n.includes('YourStory') || n.includes('Ecommerce')));
  });

  // 8. FOUR CONTENT GENERATION PATHS & PROVENANCE
  console.log('\n--- 8. Four Content Paths with Full Provenance ---');
  await runTest('Path 1: Trend -> Idea -> Post preserves source references and provenance', async () => {
    const profile: VoiceProfile = createMockProfile({
      role: 'D2C Support Operator',
      audience: 'D2C Founders',
      contentPillars: ['AI customer support', 'WhatsApp automation'],
    });

    const mockTrend = {
      id: 'trend_test_123',
      title: 'Surge in Automated WhatsApp Commerce Support in India',
      summary: 'D2C brands automate 70% of routine tickets.',
      matchedPillar: 'WhatsApp automation',
      targetAudience: 'D2C Founders',
      sources: [
        {
          sourceId: 'src_inc42',
          sourceName: 'Inc42',
          url: 'https://inc42.com/d2c-support',
          title: 'How D2C Brands Automate Customer Support',
          snippet: 'Routine tickets solved via WhatsApp.',
          quality: 'PRIMARY' as const,
        },
      ],
    };

    const mockAngle = {
      type: 'Practical' as const,
      hookConcept: 'The 3-tier WhatsApp triage rule',
      angleDescription: 'Step-by-step triage setup',
      proposedThesis: 'Tier 1 order tracking belongs on WhatsApp, not agent desks.',
    };

    const idea = generateIdeaFromTrend(mockTrend, mockAngle, profile);
    assert.strictEqual(idea.trendId, 'trend_test_123');
    assert.strictEqual(idea.sourceReferences?.length, 1);
    assert.strictEqual(idea.provenance?.type, 'TREND_RESEARCH');

    const hook = 'Tier 1 order tracking belongs on WhatsApp, not human agent desks.';
    const res = await generateCompletePost({
      idea,
      hook,
      voiceProfile: profile,
      includeSources: true,
      sources: idea.sourceReferences,
    });

    assert(res.post.length > 300, 'Must generate complete post');
    assert(res.post.includes('WhatsApp'), 'Must preserve core theme');
    assert(res.post.includes('Sources & References:'), 'Must include source citations');
    assert(res.validation.unsupportedClaimsCount === 0, 'Must pass fact validation');
    assert((res.similarityAnalysis?.similarityScore || 0) < 50, 'Must maintain low source similarity');
    assert(res.originality.originalityScore > 50, 'Must maintain high originality');
  });

  await runTest('Path 2: Content Pillars generates 5 distinct ideas grounded in user profile', async () => {
    const profile: VoiceProfile = createMockProfile({
      role: 'E-commerce Logistics Consultant',
      audience: 'Supply Chain Directors',
      contentPillars: ['Warehouse SLA Optimization', 'Last-Mile Efficiency', 'Inventory Shrinkage'],
    });

    const ideas = await generateContentIdeas(profile);
    assert.strictEqual(ideas.length, 5);
    for (const idea of ideas) {
      assert(idea.targetPillar, 'Each idea must map to a target pillar');
      assert(profile.contentPillars.includes(idea.targetPillar), 'Target pillar must come from user profile');
    }
  });

  // 9. LIVE SMOKE TEST (SEPARATED)
  console.log('\n--- 9. Live External Feed Retrieval Smoke Test ---');
  await runTest('Live network test retrieves public XML from Hacker News RSS', async () => {
    const adapter = new RssAtomAdapter();
    const docs = await adapter.fetch('https://news.ycombinator.com/rss', {
      sourceName: 'Hacker News',
      sourceId: 'src_hn_live',
      quality: 'COMMUNITY',
    });

    assert(docs.length > 0, 'Live RSS fetch must return documents');
    assert(docs[0].title.length > 0, 'First document must have a title');
    assert(docs[0].url.startsWith('http'), 'Document URL must be a valid HTTP URL');
    assert.strictEqual(docs[0].sourceName, 'Hacker News');
    assert(docs[0].contentHash.length === 64, 'Document must have valid SHA-256 hash');
  });

  console.log('\n======================================================');
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('======================================================\n');
}

// Run immediately if executed directly via tsx
runAllPipelineTests().catch((err) => {
  console.error('\nSUITE EXECUTION FAILED:', err);
  process.exit(1);
});
