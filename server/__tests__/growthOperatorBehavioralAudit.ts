import assert from 'assert';
import test from 'node:test';
import {
  evaluateMultiDimensionalQuality,
  extractSourceUnderstanding,
  validateSourceConsistency,
  detectCrossDocumentContradictions,
  buildDeterministicStrategyFallback,
  calculateSourceFidelity,
  ExtractedSourceFacts,
} from '../contentStrategyEngine';
import {
  getPersonaFingerprint,
} from '../learningEngine';
import {
  generateDailyBriefing,
} from '../autopilotService';
import { VoiceProfile } from '../voiceProfileService';

function createTestProfile(partial: Partial<VoiceProfile>): VoiceProfile {
  return {
    filled: true,
    role: 'Growth Operator',
    audience: 'Target Audience',
    contentPillars: ['Pillar 1'],
    sentenceRhythm: 'punchy and direct',
    signatureOpeners: [],
    bannedWords: ['supercharge', 'delve'],
    alwaysRules: ['Provide concrete observations'],
    neverRules: [],
    primaryLink: '',
    ctaStyle: 'Direct question',
    signatureExamples: [],
    keyReceipts: [],
    ...partial,
  };
}

function createTestFacts(partial: Partial<ExtractedSourceFacts>): ExtractedSourceFacts {
  return {
    centralClaim: 'Central topic claim',
    entities: [],
    changes: [],
    evidence: [],
    disagreements: [],
    implications: [],
    importantFacts: [],
    interestingDetails: [],
    unansweredQuestions: [],
    ...partial,
  };
}

test('GROWTH OPERATOR BEHAVIORAL AUDIT SUITE (Tests A - G)', async (t) => {
  // --------------------------------------------------------------------------
  // TEST A: Technical Creator Persona
  // --------------------------------------------------------------------------
  await t.test('Test A: Technical Creator Persona context & recommendations isolation', async () => {
    const techProfile = createTestProfile({
      role: 'Tech Creator & Educator',
      audience: 'Developers, AI builders, technical founders',
      contentPillars: ['AI', 'Software Development', 'Emerging Technology', 'Startups', 'Tech Careers'],
      keyReceipts: ['Built open-source developer tooling used by 40k engineers'],
    });

    const fingerprint = getPersonaFingerprint(techProfile);
    assert(fingerprint.includes('tech_creator') || fingerprint.includes('tech'), 'Fingerprint must identify tech creator');

    // Quality gate test: Contaminated D2C text in Tech Creator workspace MUST fail critical quality gate
    const contaminatedPost = `Here is how we scaled ChaiPoint restaurant reservations using D2C shampoo fulfillment and Meta CAC 42%.`;
    const dummyStrategy = buildDeterministicStrategyFallback(
      { subject: 'LLM Agent Architectures in 2026', profile: techProfile },
      createTestFacts({ centralClaim: 'Architectures are maturing', entities: ['LLM', 'Agents'] })
    );

    const quality = evaluateMultiDimensionalQuality(contaminatedPost, dummyStrategy, techProfile);
    assert.strictEqual(quality.overallPass, false, 'Contaminated post MUST NOT pass overall quality gate');
    assert.strictEqual(quality.overallStatus, 'REVIEW_REQUIRED', 'Contaminated post MUST receive REVIEW_REQUIRED');
    assert(quality.criticalFailures.some((f) => f.toLowerCase().includes('persona') || f.toLowerCase().includes('leakage')), 'Must flag persona contamination');
  });

  // --------------------------------------------------------------------------
  // TEST B: D2C Founder Persona
  // --------------------------------------------------------------------------
  await t.test('Test B: D2C Founder Persona context isolation & cross-contamination prevention', async () => {
    const d2cProfile = createTestProfile({
      role: 'D2C Founder & CEO',
      audience: 'D2C brand operators, retail buyers, consumer goods founders',
      contentPillars: ['E-commerce Operations', 'Omnichannel Retail', 'D2C Unit Economics'],
      alwaysRules: ['Focus on unit economics and margin preservation'],
    });

    const d2cFingerprint = getPersonaFingerprint(d2cProfile);
    assert(d2cFingerprint.includes('d2c_founder') || d2cFingerprint.includes('d2c'), 'Fingerprint must identify D2C founder');

    // Ensure tech creator and d2c founder have totally distinct fingerprints
    const techProfile = createTestProfile({
      role: 'Tech Creator & Educator',
      audience: 'Developers, AI builders',
      contentPillars: ['AI', 'Software Development'],
    });
    const techFingerprint = getPersonaFingerprint(techProfile);
    assert.notStrictEqual(d2cFingerprint, techFingerprint, 'Fingerprints must be isolated');

    // Contaminated low-level compiler text in D2C profile must fail quality gates
    const contaminatedD2CPost = `Today we solved our LLM compiler passes and raft leader election in our distributed consensus algorithm.`;
    const d2cStrategy = buildDeterministicStrategyFallback(
      { subject: 'Retail Inventory Velocity', profile: d2cProfile },
      createTestFacts({ centralClaim: 'Inventory turnover dictates cash runway', entities: ['Inventory', 'Retail'] })
    );
    const qualityD2C = evaluateMultiDimensionalQuality(contaminatedD2CPost, d2cStrategy, d2cProfile);
    assert.strictEqual(qualityD2C.overallPass, false, 'Low-level compiler text in D2C workspace must fail quality gate');
    assert.strictEqual(qualityD2C.overallStatus, 'REVIEW_REQUIRED', 'Must require review');
  });

  // --------------------------------------------------------------------------
  // TEST C: News Source
  // --------------------------------------------------------------------------
  await t.test('Test C: News Source dynamically selects reaction/commentary format', async () => {
    const newsDoc = {
      title: 'Anthropic Launches Claude 3.7 Sonnet with Hybrid Reasoning',
      url: 'https://example.com/claude-3-7-launch',
      body: 'Anthropic has announced and released Claude 3.7 Sonnet, introducing hybrid reasoning capabilities that allow developers to toggle between near-instant responses and extended step-by-step thinking for complex engineering tasks.',
    };

    const understanding = extractSourceUnderstanding(
      'Anthropic Releases Claude 3.7 Sonnet',
      [newsDoc]
    );

    assert.strictEqual(understanding.subjectType, 'INDUSTRY_NEWS', 'Must detect INDUSTRY_NEWS subject type');

    const strategy = buildDeterministicStrategyFallback(
      { subject: 'Anthropic Releases Claude 3.7 Sonnet', sourceDocuments: [newsDoc] },
      createTestFacts({ centralClaim: 'Anthropic launched Claude 3.7 Sonnet with hybrid reasoning.', entities: ['Anthropic', 'Claude 3.7'] }),
      understanding
    );

    assert.strictEqual(strategy.contentType, 'NEWS_REACTION', 'News source must derive NEWS_REACTION content type');
    assert.strictEqual(strategy.recommendedFormat, 'TEXT_POST', 'Reaction news post should be concise TEXT_POST');
  });

  // --------------------------------------------------------------------------
  // TEST D: Tutorial Source
  // --------------------------------------------------------------------------
  await t.test('Test D: Tutorial Source dynamically selects how-to / carousel format', async () => {
    const tutorialDoc = {
      title: 'Step-by-Step Guide: How to Implement Retrieval-Augmented Generation with Evaluation Gates',
      url: 'https://example.com/rag-eval-guide',
      body: `This practical guide walks through implementing production RAG pipelines.
Step 1: Chunk documents using semantic boundary markers rather than naive character splitting.
Step 2: Generate sparse and dense vector embeddings with hybrid re-ranking.
Step 3: Integrate automated citation verification before rendering responses to end users.
Step 4: Monitor retrieval latency and benchmark hallucination rates continuously.`,
    };

    const understanding = extractSourceUnderstanding(
      'How to Implement Production RAG with Evaluation Gates',
      [tutorialDoc]
    );

    assert.strictEqual(understanding.subjectType, 'GUIDE_TUTORIAL', 'Must detect GUIDE_TUTORIAL subject type');

    const strategy = buildDeterministicStrategyFallback(
      { subject: 'How to Implement Production RAG with Evaluation Gates', sourceDocuments: [tutorialDoc] },
      createTestFacts({ centralClaim: 'Disciplined RAG execution requires phased verification.', entities: ['RAG', 'Embeddings'] }),
      understanding
    );

    assert.strictEqual(strategy.contentType, 'HOW_TO', 'Tutorial must derive HOW_TO content type');
    assert.strictEqual(strategy.recommendedFormat, 'CAROUSEL_DOCUMENT', 'Tutorial is formatted as walkthrough carousel');
  });

  // --------------------------------------------------------------------------
  // TEST E: Data / Report Source
  // --------------------------------------------------------------------------
  await t.test('Test E: Data / Report Source selects data interpretation & chart format', async () => {
    const reportDoc = {
      title: 'State of AI Engineering 2026: Benchmark Survey and Production Metrics',
      url: 'https://example.com/state-of-ai-2026',
      body: `The 2026 AI Engineering benchmark report analyzed 1,200 software teams.
Key findings:
• 74% of engineering teams have standardized on automated evaluation suites before deploying models.
• Median time-to-production for fine-tuned models dropped from 14 weeks to 3 weeks.
• 62% cite context window degradation as their primary observability bottleneck.`,
    };

    const understanding = extractSourceUnderstanding(
      'State of AI Engineering 2026 Benchmark Report',
      [reportDoc]
    );

    assert.strictEqual(understanding.subjectType, 'DATA_REPORT', 'Must classify as DATA_REPORT');

    const strategy = buildDeterministicStrategyFallback(
      { subject: 'State of AI Engineering 2026 Benchmark Report', sourceDocuments: [reportDoc] },
      createTestFacts({
        centralClaim: 'AI engineering is shifting toward automated evaluation standards.',
        entities: ['AI Engineering'],
        evidence: ['74% automated evals', '62% observability bottleneck'],
      }),
      understanding
    );

    assert.strictEqual(strategy.contentType, 'DATA_INTERPRETATION', 'Report must derive DATA_INTERPRETATION');
    assert.strictEqual(strategy.recommendedFormat, 'TEXT_PLUS_CHART', 'Report format must recommend chart/data visual');
    assert.strictEqual(strategy.visualStrategy.visualRequired, true, 'Visual must be required for data report');
  });

  // --------------------------------------------------------------------------
  // TEST F: Conflicting Source & Hard Quality Gates
  // --------------------------------------------------------------------------
  await t.test('Test F: Conflicting Source enforces hard gates & prevents PASS status', async () => {
    const docA = {
      title: 'Enterprise AI Adoption Report 2026',
      body: 'Survey shows enterprise AI adoption has surged to 82% of Global 2000 enterprises in 2026.',
    };
    const docB = {
      title: 'Global Tech Benchmark Analysis',
      body: 'Enterprise AI adoption stands at only 47% according to verified production audit benchmarks.',
    };

    const crossDocResult = detectCrossDocumentContradictions([docA, docB]);
    assert.strictEqual(crossDocResult.status, 'CONFLICTING', 'Cross-document contradiction must be CONFLICTING');
    assert.strictEqual(crossDocResult.sourceReviewRequired, true, 'Review must be required');
    assert(crossDocResult.conflicts.length > 0, 'Conflicts must describe conflicting metrics');

    // Title vs Body count contradiction (e.g. Title claims 5 items, body has 7 items)
    const countConsistency = validateSourceConsistency(
      '5 Essential Engineering Practices for High-Scale Teams',
      'Here are the 7 essential practices every modern team needs...',
      [{ name: 'Item 1' }, { name: 'Item 2' }]
    );
    assert.strictEqual(countConsistency.status, 'CONFLICTING', 'Title count vs body count mismatch must be CONFLICTING');
    assert.strictEqual(countConsistency.sourceReviewRequired, true, 'Must require review');

    // Quality gate test: A post with a source contradiction MUST NOT receive PASSED, even if numerical score is high
    const dummyStrategy = buildDeterministicStrategyFallback(
      { subject: 'Enterprise AI Adoption', sourceDocuments: [docA, docB] },
      createTestFacts({ centralClaim: 'AI adoption is shifting.', entities: ['Enterprise AI'] })
    );
    dummyStrategy.sourceUnderstanding = {
      title: 'Enterprise AI Adoption',
      concepts: ['Adoption rates'],
      keyClaims: [{ claim: 'Adoption is rising', importance: 'HIGH' }],
      keyFacts: [],
      items: [],
      practicalImplications: ['Review production deployments carefully'],
      summary: 'Conflicting perspectives on enterprise adoption.',
      namedEntities: ['Enterprise AI'],
      subjectType: 'DATA_REPORT',
      consistencyResult: crossDocResult,
    } as any;

    const postText = `Enterprise AI adoption is reaching a critical inflection point. Teams are evaluating production baselines across infrastructure.\n\nTakeaway: Validate your team workflows before committing to massive tool shifts.`;
    const dummyProfile = createTestProfile({
      role: 'Tech Creator & Educator',
      audience: 'Engineers',
      contentPillars: ['AI'],
    });

    const quality = evaluateMultiDimensionalQuality(postText, dummyStrategy, dummyProfile);
    assert.strictEqual(quality.overallPass, false, 'Contradictory source content MUST NOT receive overallPass = true');
    assert.strictEqual(quality.overallStatus, 'REVIEW_REQUIRED', 'Must receive REVIEW_REQUIRED status');
    assert(quality.criticalFailures.some((f) => f.toLowerCase().includes('contradiction')), 'Critical failures must include source contradictions');

    // Source fidelity score must NEVER be 100% when contradiction exists
    const factRes = { isValid: true, validatedPost: postText, claims: [], unsupportedCount: 0, unsupportedClaimsCount: 0, leakageDetected: false, leakageDetails: [] };
    const fidelity = calculateSourceFidelity(postText, dummyStrategy.sourceUnderstanding, dummyStrategy, factRes);
    assert(fidelity.score <= 45, `Fidelity score (${fidelity.score}) must be capped <= 45 when contradiction exists`);
  });

  // --------------------------------------------------------------------------
  // TEST G: Empty Workspace
  // --------------------------------------------------------------------------
  await t.test('Test G: Empty Workspace returns honest unconfigured state without inventing recommendations', async () => {
    // Test daily briefing in an unconfigured / empty workspace
    const briefing = await generateDailyBriefing('unconfigured_test_ws_id');
    assert.strictEqual(briefing.automationMode, 'MANUAL', 'Unconfigured workspace must be in MANUAL mode');
    assert.strictEqual(briefing.metrics.contentOpportunities, 0, 'Must have 0 content opportunities in empty workspace');
    assert.strictEqual(briefing.metrics.prospectsWithSignals, 0, 'Must have 0 prospects in empty workspace');
    assert.strictEqual(briefing.recommendedFocus.targetActionUrl, '/settings', 'Must guide user to configure profile in settings');
    assert(
      briefing.recommendedFocus.headline.toLowerCase().includes('set up') || briefing.recommendedFocus.headline.toLowerCase().includes('profile'),
      'Must prompt to set up growth profile'
    );
  });
});
