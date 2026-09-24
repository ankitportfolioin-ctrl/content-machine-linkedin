import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formulateContentStrategy,
  generateStructuredPost,
  validateHookRelevance,
  validateContentStrategy,
  validateFormatFit,
  validateVisualFit,
  extractSourceFacts,
  PUBLIC_CONTENT_PATTERNS,
  ContentStrategy,
} from '../contentStrategyEngine';
import { VoiceProfile } from '../voiceProfileService';

const mockProfile: VoiceProfile = {
  filled: true,
  role: 'Staff Infrastructure Architect',
  audience: 'Software engineers, tech leads, VP of Engineering',
  contentPillars: ['Distributed Systems', 'Cloud Infrastructure', 'Engineering Efficiency'],
  sentenceRhythm: 'Clear, direct, and conversational.',
  signatureOpeners: [],
  bannedWords: [],
  alwaysRules: [],
  neverRules: [],
  primaryLink: '',
  ctaStyle: 'Direct Question',
  signatureExamples: [],
  keyReceipts: ['Reduced database latency from 45ms to 12ms during Black Friday traffic spike of 40k req/sec'],
};

test('Content Machine 2.0 Strategy Engine Suite', async (t) => {
  await t.test('1. Extracts grounded facts and key entities from source documents', () => {
    const subject = 'Anthropic releases Claude 3.7 Sonnet with hybrid reasoning at $3 per million input tokens';
    const docs = [
      {
        title: 'Claude 3.7 Sonnet Hybrid Reasoning Launch',
        body: 'Anthropic announced Claude 3.7 Sonnet, introducing hybrid reasoning models. Input pricing is set at $3 per million tokens, while competing models charge $5. Developers can toggle standard vs extended thinking modes.',
      },
    ];

    const facts = extractSourceFacts(subject, docs);
    assert.ok(facts.entities.length > 0 || facts.importantFacts.length > 0, 'Should extract entities or facts');
    const allText = `${facts.centralClaim} ${facts.entities.join(' ')} ${facts.importantFacts.join(' ')}`.toLowerCase();
    assert.ok(allText.includes('anthropic') || allText.includes('claude'), 'Should contain Claude/Anthropic');
  });

  await t.test('2. Formulates strategy dynamically without fixed templates', async () => {
    const strategy = await formulateContentStrategy({
      subject: 'OpenAI vs Anthropic pricing comparison for high-throughput batch inference',
      profile: mockProfile,
      sourceDocuments: [
        {
          title: 'LLM Pricing Index 2026',
          body: 'Comparing inference costs across Anthropic Claude 3.7 and OpenAI models for enterprise batch workloads.',
        },
      ],
    });

    // Content Type should be determined dynamically (e.g., COMPARISON or BREAKDOWN or DEEP_ANALYSIS)
    assert.ok(
      strategy.contentType === 'COMPARISON' ||
      strategy.contentType === 'BREAKDOWN' ||
      strategy.contentType === 'DEEP_ANALYSIS' ||
      strategy.contentType === 'INDUSTRY_ANALYSIS' ||
      strategy.contentType === 'FRAMEWORK',
      `Unexpected content type: ${strategy.contentType}`
    );

    // Format should recommend an appropriate content format
    assert.ok(
      strategy.recommendedFormat === 'CAROUSEL_DOCUMENT' ||
      strategy.recommendedFormat === 'TEXT_PLUS_DIAGRAM' ||
      strategy.recommendedFormat === 'TEXT_POST' ||
      strategy.recommendedFormat === 'TEXT_PLUS_CHART',
      `Format should match comparison: ${strategy.recommendedFormat}`
    );

    // Visual strategy must be concrete and justified
    assert.ok(strategy.visualStrategy.visualReason.length > 0, 'Visual strategy must have a clear reason');
    assert.ok(strategy.visualStrategy.visualBrief.length > 0, 'Visual strategy must have a clear brief');

    // Narrative structure must not be a fixed single universal string
    assert.ok(Array.isArray(strategy.narrativeStructure), 'Narrative structure must be an array of steps');
    assert.ok(strategy.narrativeStructure.length >= 4, 'Should have at least 4 narrative steps');
  });

  await t.test('3. Semantic Hook Validation rejects generic disconnected hooks', () => {
    const subject = 'Anthropic Claude 3.7 pricing vs OpenAI o3-mini';
    const angle = 'Cost Economics';

    // Hook that is completely generic and disconnected
    const genericDisconnectedHook = "Most friction in today's fast-paced world doesn't come from tooling deficits, it is a game-changer.";
    const invalidResult = validateHookRelevance(genericDisconnectedHook, subject, angle);
    assert.equal(invalidResult.isValid, false, 'Generic disconnected hook should be rejected');
    assert.ok(invalidResult.issues.length > 0, 'Should have issues listed');

    // Hook that actually mentions subject entities
    const relevantHook = 'When evaluating Claude 3.7 pricing versus OpenAI models, raw token cost hides latency spikes.';
    const validResult = validateHookRelevance(relevantHook, subject, angle);
    assert.equal(validResult.isValid, true, 'Relevant grounded hook should be accepted');
  });

  await t.test('4. Format Fit Validation checks narrative step sufficiency and asset availability', () => {
    const baseStrategy: ContentStrategy = {
      id: 'test_strat',
      subject: 'Distributed Tracing in High-Throughput Microservices',
      coreQuestion: 'How to monitor 100k req/sec microservices without tracing overhead?',
      audienceNeed: 'Latency reduction without blind spots',
      audienceEmotion: 'Operational focus',
      contentObjective: 'Provide actionable architecture checklist',
      contentType: 'HOW_TO',
      recommendedFormat: 'CAROUSEL_DOCUMENT',
      formatReason: 'Step-by-step breakdown needs pagination',
      narrativeStructure: ['Step 1: Sampling rates'], // only 1 step
      hookStrategy: 'Practical warning',
      hookConcepts: [
        {
          id: 'h1',
          hook: 'Tracing 100% of microservice requests adds 15ms of latency before your code even executes.',
          strategyType: 'Warning',
          angleName: 'Latency Overhead',
          characterCount: 95,
          rationale: 'Direct trade-off',
        },
        {
          id: 'h2',
          hook: 'When tracing overhead spikes, standardizing on head-based sampling creates massive blind spots.',
          strategyType: 'Anti-pattern',
          angleName: 'Blind Spot Risk',
          characterCount: 98,
          rationale: 'Architectural lesson',
        },
      ],
      visualStrategy: {
        visualRequired: true,
        visualType: 'CAROUSEL',
        visualReason: 'Visual slides',
        visualBrief: 'Carousel slides',
      },
      CTAType: 'Question',
      evidenceRequirements: [],
      sourceRequirements: [],
      originalityDirection: 'Engineering realism',
      estimatedLength: '800 chars',
      confidence: 'HIGH',
      internalReasoning: {
        stopScrollingReason: 'Latency impact',
        coreQuestionAnswered: 'How to sample efficiently',
        tensionIdentified: 'Observability vs performance',
        usefulInsightDelivered: 'Adaptive sampling rules',
        saveReason: 'Tracing checklist',
        shareReason: 'Valuable for SREs',
        commentPromptReason: 'Ask for sampling rates',
      },
      isAiGenerated: false,
      generationMode: 'AI_DYNAMIC',
    };

    // Carousel with only 1 step should fail format fit
    const poorFit = validateFormatFit(baseStrategy);
    assert.equal(poorFit.isFit, false, 'Carousel with 1 step should fail fit check');

    // Screenshot format without user assets should fail
    const screenshotStrategy = { ...baseStrategy, recommendedFormat: 'TEXT_PLUS_SCREENSHOT' as const, narrativeStructure: ['S1', 'S2', 'S3'] };
    const screenshotFit = validateFormatFit(screenshotStrategy, undefined, []);
    assert.equal(screenshotFit.isFit, false, 'Screenshot format without assets should fail fit check');

    // Proper carousel with 4 steps should pass
    const goodFitStrategy = { ...baseStrategy, narrativeStructure: ['Step 1', 'Step 2', 'Step 3', 'Step 4'] };
    const goodFit = validateFormatFit(goodFitStrategy);
    assert.equal(goodFit.isFit, true, 'Proper carousel with 4 steps should pass fit check');
  });

  await t.test('5. Visual Fit Validation blocks conflicting visual requirements', () => {
    const baseStrategy: ContentStrategy = {
      id: 'test_strat',
      subject: 'Database Optimization',
      coreQuestion: 'How to scale Postgres queries?',
      audienceNeed: 'Faster queries',
      audienceEmotion: 'Focus',
      contentObjective: 'Show indexing tips',
      contentType: 'HOW_TO',
      recommendedFormat: 'TEXT_POST',
      formatReason: 'Concise explanation',
      narrativeStructure: ['Step 1', 'Step 2', 'Step 3'],
      hookStrategy: 'Observation',
      hookConcepts: [
        {
          id: 'h1',
          hook: 'Before adding read replicas to Postgres, inspect your unindexed foreign keys.',
          strategyType: 'Checklist',
          angleName: 'Index check',
          characterCount: 80,
          rationale: 'High ROI check',
        },
        {
          id: 'h2',
          hook: 'Most Postgres query latency comes from missing indexes on joined foreign keys.',
          strategyType: 'Root cause',
          angleName: 'Root cause analysis',
          characterCount: 80,
          rationale: 'Common pitfall',
        },
      ],
      visualStrategy: {
        visualRequired: true,
        visualType: 'NONE', // Incompatible
        visualReason: 'Missing visual',
        visualBrief: 'None',
      },
      CTAType: 'Question',
      evidenceRequirements: [],
      sourceRequirements: [],
      originalityDirection: 'Realism',
      estimatedLength: '800 chars',
      confidence: 'HIGH',
      internalReasoning: {
        stopScrollingReason: 'Query cost',
        coreQuestionAnswered: 'How to index',
        tensionIdentified: 'Replicas vs indexes',
        usefulInsightDelivered: 'Index checklist',
        saveReason: 'Index list',
        shareReason: 'SRE sharing',
        commentPromptReason: 'Ask for index habits',
      },
      isAiGenerated: false,
      generationMode: 'AI_DYNAMIC',
    };

    const badVisual = validateVisualFit(baseStrategy);
    assert.equal(badVisual.isFit, false, 'visualRequired=true with visualType=NONE should fail');

    const goodStrategy = {
      ...baseStrategy,
      visualStrategy: {
        visualRequired: true,
        visualType: 'DIAGRAM' as const,
        visualReason: 'Visual query plan',
        visualBrief: 'Explain query plan visual',
      },
    };
    const goodVisual = validateVisualFit(goodStrategy);
    assert.equal(goodVisual.isFit, true, 'Proper visual pairing should pass');
  });

  await t.test('6. Strategy Validation Gate enforces all required strategic fields', () => {
    const validStrategy: ContentStrategy = {
      id: 'strat_123',
      subject: 'Claude 3.7 vs OpenAI Model Economics',
      coreQuestion: 'How does Claude 3.7 pricing impact high-throughput batch inference?',
      audienceNeed: 'Decision-makers need honest token cost comparison',
      audienceEmotion: 'Cautious and analytical',
      contentObjective: 'Help engineers evaluate model economics',
      contentType: 'COMPARISON',
      recommendedFormat: 'TEXT_PLUS_DIAGRAM',
      formatReason: 'Comparing prices requires clear visual contrast',
      narrativeStructure: ['Hook', 'Context', 'Matrix', 'Decision Framework', 'Takeaway'],
      hookStrategy: 'Direct economic comparison',
      hookConcepts: [
        {
          id: 'hook_1',
          hook: 'Model token price tables hide the real infrastructure bill: latency and rate limit degradation.',
          strategyType: 'Surprising Observation',
          angleName: 'Economic Reality',
          characterCount: 97,
          rationale: 'Focuses on true cost',
        },
        {
          id: 'hook_2',
          hook: 'Before switching your batch pipeline to Claude 3.7, inspect token serialization overhead.',
          strategyType: 'Practical Warning',
          angleName: 'Operational Reality',
          characterCount: 93,
          rationale: 'Pragmatic sanity check',
        },
      ],
      visualStrategy: {
        visualRequired: true,
        visualType: 'DIAGRAM',
        visualReason: 'Compare throughput costs side-by-side',
        visualBrief: 'Create a clean diagram contrasting pricing tiers and latency guarantees',
      },
      CTAType: 'Direct Discussion Question',
      evidenceRequirements: ['Pricing benchmarks from official documentation'],
      sourceRequirements: ['Claude 3.7 pricing table'],
      originalityDirection: 'Engineering realism over marketing hype',
      estimatedLength: '800 - 1100 characters',
      confidence: 'HIGH',
      internalReasoning: {
        stopScrollingReason: 'Highlights hidden infrastructure costs',
        coreQuestionAnswered: 'True cost of inference',
        tensionIdentified: 'Token cost vs operational latency',
        usefulInsightDelivered: 'Framework for model selection',
        saveReason: 'Decision checklist',
        shareReason: 'Valuable for team infrastructure planning',
        commentPromptReason: 'Asks for real production cost experiences',
      },
      isAiGenerated: false,
      generationMode: 'AI_DYNAMIC',
    };

    const audit = validateContentStrategy(validStrategy);
    assert.equal(audit.isValid, true, 'Valid strategy must pass gate');
    assert.equal(audit.errors.length, 0, 'No errors expected on valid strategy');
  });

  await t.test('7. generateStructuredPost follows the strategy narrativeStructure and validates facts', async () => {
    const strategy: ContentStrategy = {
      id: 'strat_op_lesson',
      subject: 'Microservices Latency and Network Marshaling',
      coreQuestion: 'Why do microservices slow down even when database queries are fast?',
      audienceNeed: 'Engineering managers struggling with microservices latency',
      audienceEmotion: 'Engineering focus',
      contentObjective: 'Demonstrate how to isolate network boundary bottlenecks',
      contentType: 'HOW_TO',
      recommendedFormat: 'TEXT_POST',
      formatReason: 'A structured text post clearly explains root causes without unnecessary graphic clutter',
      narrativeStructure: ['Hook', 'Failure Mode Breakdown', '3 Core Principles', 'Receipt Grounding', 'Discussion'],
      hookStrategy: 'Root cause observation',
      hookConcepts: [
        {
          id: 'hook_1',
          hook: 'When microservices slow down, teams blame database queries before checking serialization overhead.',
          strategyType: 'Root Cause Observation',
          angleName: 'Operational Reality',
          characterCount: 104,
          rationale: 'Targets common misconception',
        },
        {
          id: 'hook_2',
          hook: 'Before adding Redis caches to slow microservices, profile your JSON serialization overhead.',
          strategyType: 'Practical Warning',
          angleName: 'Serialization Warning',
          characterCount: 97,
          rationale: 'Identifies premature optimization',
        },
      ],
      visualStrategy: {
        visualRequired: false,
        visualType: 'NONE',
        visualReason: 'Text post is optimal',
        visualBrief: 'None',
      },
      CTAType: 'Discussion question',
      evidenceRequirements: [],
      sourceRequirements: [],
      originalityDirection: 'First-principles systems engineering',
      estimatedLength: '850 characters',
      confidence: 'HIGH',
      internalReasoning: {
        stopScrollingReason: 'Calls out a counter-intuitive latency bottleneck',
        coreQuestionAnswered: 'How to diagnose serialization overhead',
        tensionIdentified: 'Database vs marshaling blame',
        usefulInsightDelivered: 'Check boundary serialization first',
        saveReason: 'Debugging checklist',
        shareReason: 'Saves team hours of misdirected caching work',
        commentPromptReason: 'Asks where teams found surprising serialization cost',
      },
      isAiGenerated: false,
      generationMode: 'AI_DYNAMIC',
    };

    const result = await generateStructuredPost({
      strategy,
      hook: strategy.hookConcepts[0].hook,
      profile: mockProfile,
    });

    assert.ok(result.post.length >= 250, `Post too short: ${result.post.length}`);
    assert.ok(result.post.startsWith(strategy.hookConcepts[0].hook), 'Post must start with chosen hook');
    assert.equal(result.validation.isValid, true, 'Fact validation should succeed');
    assert.equal(result.validation.unsupportedCount, 0, 'Should have 0 unsupported claims');
  });

  await t.test('8. PUBLIC_CONTENT_PATTERNS exposes rich taxonomy of content patterns', () => {
    assert.ok(PUBLIC_CONTENT_PATTERNS.length >= 5, 'Should define at least 5 public content patterns');

    for (const pat of PUBLIC_CONTENT_PATTERNS) {
      assert.ok(pat.id, 'Pattern must have id');
      assert.ok(pat.format, 'Pattern must have format');
      assert.ok(pat.structure.length >= 3, 'Pattern must have multi-step structure');
      assert.ok(pat.hookPattern, 'Pattern must have hookPattern');
      assert.ok(pat.visualPattern, 'Pattern must have visualPattern');
    }
  });
});
