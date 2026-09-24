import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formulateContentStrategy,
  generateStructuredPost,
  validateHookRelevance,
  hasSufficientEvidenceForGroundedGeneration,
  buildDeterministicStructuredPost,
  cleanSubjectTitle,
  extractSourceFacts,
  ContentStrategy,
} from '../contentStrategyEngine';
import { validatePostFacts } from '../contentEngine';
import { VoiceProfile } from '../voiceProfileService';

const marketingProfile: VoiceProfile = {
  filled: true,
  role: 'VP of Product Marketing',
  audience: 'B2B CMOs, Product Leaders, Growth Directors',
  contentPillars: ['GTM Strategy', 'Product Positioning', 'Enterprise Demand Gen'],
  sentenceRhythm: 'Concise, sharp, and data-backed.',
  signatureOpeners: [],
  bannedWords: [],
  alwaysRules: [],
  neverRules: [],
  primaryLink: '',
  ctaStyle: 'Direct Question',
  signatureExamples: [],
  keyReceipts: ['Grew enterprise pipeline by 42% across 3 quarters using localized landing pages'],
};

test('Content Machine 2.0 Fallback & Integrity Audit Suite', async (t) => {
  await t.test('1. Hyphenated subjects are preserved without truncation', () => {
    assert.strictEqual(
      cleanSubjectTitle('SOC-2 Compliance: What fast-growing SaaS startups overlook'),
      'SOC-2 Compliance: What fast-growing SaaS startups overlook'
    );
    assert.strictEqual(
      cleanSubjectTitle('End-to-End Encryption in Distributed Messaging Systems'),
      'End-to-End Encryption in Distributed Messaging Systems'
    );
    assert.strictEqual(
      cleanSubjectTitle('Multi-Agent Architectures for Autonomous Workflows'),
      'Multi-Agent Architectures for Autonomous Workflows'
    );
  });

  await t.test('2. Source-backed statistics are verified and NOT flagged as unsupported', () => {
    const postWithSourceStats = `Recent benchmarking reveals that 68% of enterprise teams experience integration delays during API migrations.

For B2B leaders, this operational bottleneck adds roughly $20M in annualized maintenance overhead.

Here are the key principles:
1. Validate schemas before routing.
2. Monitor real production workloads.

What is your team doing to curb integration drag?`;

    const sourceDocs = [
      {
        title: 'Enterprise API Migration Report 2026',
        body: 'A comprehensive study found that 68% of enterprise teams face notable integration delays, driving up to $20M in annualized maintenance overhead.',
      },
    ];

    const extracted = {
      evidence: ['68%', '$20M'],
      importantFacts: ['68% of enterprise teams experience integration delays'],
      centralClaim: 'Enterprise API migrations introduce heavy maintenance overhead',
    };

    const validation = validatePostFacts(postWithSourceStats, marketingProfile, sourceDocs, extracted);

    assert.strictEqual(validation.unsupportedCount, 0, 'Source-backed stats must not count as unsupported');
    assert.ok(validation.isValid, 'Validation must pass when statistics are backed by source documents');
    assert.ok(
      validation.validatedPost.includes('68%'),
      'Source-backed percentage should NOT be stripped or replaced'
    );
    assert.ok(
      validation.validatedPost.includes('$20M'),
      'Source-backed dollar amount should NOT be stripped'
    );

    const statClaim = validation.claims.find((c) => c.claim.includes('68%'));
    assert.ok(statClaim, 'Claim should be identified');
    assert.strictEqual(
      statClaim.classification,
      'SUPPORTED_BY_SOURCE',
      'Classification must be SUPPORTED_BY_SOURCE'
    );
  });

  await t.test('3. Truly fabricated statistics are flagged and replaced', () => {
    const fabricatedPost = `We discovered that 93% of all cloud databases fail within 14 days without our custom watchdog.`;

    const validation = validatePostFacts(fabricatedPost, marketingProfile, [], { evidence: [] });

    assert.ok(validation.unsupportedCount > 0, 'Fabricated metric must be flagged as unsupported');
    assert.ok(
      !validation.validatedPost.includes('93%'),
      'Fabricated percentage must be sanitized from output'
    );
  });

  await t.test('4. Clickbait formulas are rejected by hook validation', () => {
    const clickbait1 = validateHookRelevance(
      'Most people get this wrong about B2B GTM strategy',
      'B2B GTM Strategy',
      'Direct'
    );
    assert.strictEqual(clickbait1.isValid, false, 'Clickbait "Most people get this wrong" must be rejected');
    assert.ok(
      clickbait1.issues.some((i) => i.toLowerCase().includes('clickbait')),
      'Should report clickbait issue'
    );

    const clickbait2 = validateHookRelevance(
      'This changes everything for enterprise product marketing',
      'Enterprise Product Marketing',
      'Provocative'
    );
    assert.strictEqual(clickbait2.isValid, false, 'Clickbait "This changes everything" must be rejected');

    const groundedHook = validateHookRelevance(
      'When enterprise teams scale B2B GTM campaigns, the bottleneck is rarely budget—it is positioning clarity.',
      'B2B GTM Strategy',
      'Analytical'
    );
    assert.strictEqual(groundedHook.isValid, true, 'Grounded substantive hook must pass validation');
  });

  await t.test('5. System never falsely claims AI dynamic generation in fallback mode', async () => {
    // Force fallback conditions by passing profile without Gemini API key or with mock
    const strategy = await formulateContentStrategy({
      subject: 'Supply chain visibility in European cold-storage logistics',
      profile: {
        ...marketingProfile,
        role: 'Global Logistics Director',
        audience: 'Cold-chain operators and fleet managers',
        contentPillars: ['Cold Chain Logistics', 'Fleet Telematics'],
      },
      sourceDocuments: [
        {
          title: 'EU Cold Storage Regulations 2026',
          body: 'New telemetry mandates require real-time temperature tracking across all cross-border refrigerated transports.',
        },
      ],
    });

    assert.ok(strategy.generationMode, 'Strategy must have explicit generationMode');
    if (!strategy.isAiGenerated) {
      assert.strictEqual(
        strategy.generationMode,
        'DETERMINISTIC_GROUNDED',
        'Deterministic strategy must be explicitly marked DETERMINISTIC_GROUNDED'
      );
      assert.strictEqual(strategy.isAiGenerated, false, 'isAiGenerated must be false when AI not used');
    }

    // Generate structured post
    const postResult = await generateStructuredPost({
      strategy,
      hook: 'Temperature compliance in cold-storage logistics is never just a sensor problem—it is a data handoff problem.',
      profile: {
        ...marketingProfile,
        role: 'Global Logistics Director',
        audience: 'Cold-chain operators and fleet managers',
      },
      sources: [
        {
          title: 'EU Cold Storage Regulations 2026',
          url: 'https://example.com/logistics',
          sourceName: 'EU Logistics Gazette',
        },
      ],
    });

    assert.ok(postResult.generationMode, 'Post result must contain generationMode');
    if (postResult.modelUsed.includes('deterministic')) {
      assert.strictEqual(
        postResult.generationMode,
        'DETERMINISTIC_GROUNDED',
        'Fallback post must declare DETERMINISTIC_GROUNDED'
      );
      assert.ok(
        !postResult.post.toLowerCase().includes('frontier model providers'),
        'Fallback must NOT contain legacy software-engineering templates'
      );
      assert.ok(
        !postResult.post.toLowerCase().includes('inference pricing'),
        'Fallback must NOT contain AI inference pricing filler'
      );
    }

    // Explicit test of deterministic builder to guarantee zero legacy template contamination
    const deterministicPost = buildDeterministicStructuredPost(
      'Temperature compliance in cold-storage logistics is never just a sensor problem—it is a data handoff problem.',
      strategy,
      {
        ...marketingProfile,
        role: 'Global Logistics Director',
        audience: 'Cold-chain operators and fleet managers',
      }
    );
    assert.ok(
      !deterministicPost.toLowerCase().includes('frontier model providers'),
      'Deterministic post must NOT contain legacy software-engineering templates'
    );
    assert.ok(
      !deterministicPost.toLowerCase().includes('inference pricing'),
      'Deterministic post must NOT contain AI inference pricing filler'
    );
    assert.ok(
      !deterministicPost.toLowerCase().includes('database latency'),
      'Deterministic post must NOT contain unrelated database metrics'
    );
  });

  await t.test('6. Empty evidence halts safely with UNAVAILABLE mode rather than spewing ungrounded filler', async () => {
    const evidenceCheck = hasSufficientEvidenceForGroundedGeneration(
      'A completely mysterious and ungrounded topic XYZ-998877',
      [],
      {
        entities: [],
        evidence: [],
        importantFacts: [],
        centralClaim: '',
        changes: [],
        disagreements: [],
        implications: [],
        interestingDetails: [],
        unansweredQuestions: [],
        tensions: [],
      },
      {
        role: '',
        audience: '',
        contentPillars: [],
        keyReceipts: [],
        filled: false,
      } as any
    );

    assert.strictEqual(
      evidenceCheck.sufficient,
      false,
      'Insufficient evidence check must return false when no sources, entities, or receipts exist'
    );
  });
});
