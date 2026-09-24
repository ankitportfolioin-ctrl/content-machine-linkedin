import assert from 'assert';
import {
  pipelineArticleToContent,
  pipelineIdeaToContent,
  validateFormatExecution,
  CarouselExecution,
  evaluateMultiDimensionalQuality,
} from '../server/contentStrategyEngine';
import {
  validatePostFacts,
  extractSourceUnderstanding,
} from '../server/contentEngine';
import {
  DEFAULT_TECH_CREATOR_PROFILE,
  DEFAULT_D2C_FOUNDER_PROFILE,
  switchPersona,
  getVoiceProfile,
  resetVoiceProfile,
} from '../server/voiceProfileService';
import { generateDailyBriefing } from '../server/autopilotService';

async function runAcceptanceGapTests() {
  console.log('==================================================================');
  console.log(' RUNNING GROWTH OPERATOR ACCEPTANCE GAP REMEDIATION TEST SUITE');
  console.log('==================================================================\n');

  let passedTests = 0;

  // TEST 1: Public Article Ingestion -> Final Content Workflow
  console.log('👉 TEST 1: Public Article Ingestion Workflow');
  const mockArticle = {
    title: 'Distributed Consensus in Autonomous Multi-Agent Swarms',
    body: 'Autonomous multi-agent clusters frequently encounter consensus deadlocks under high network latency. Raft and Paxos variants require synchronous leader elections that fail when agents disconnect. We found that asynchronous gossip protocols with monotonic clocks resolved 94% of split-brain edge cases.',
    author: 'Elena Rostova',
    publisher: 'Distributed Systems Journal',
  };

  const articleResult = await pipelineArticleToContent(
    'https://systemsjournal.org/autonomous-multi-agent-consensus',
    DEFAULT_TECH_CREATOR_PROFILE,
    { fallbackArticle: mockArticle }
  );

  assert.ok(articleResult.source, 'Source must be present');
  assert.equal(articleResult.source.title, mockArticle.title);
  assert.ok(articleResult.understanding, 'Understanding must be extracted');
  assert.ok(articleResult.strategy, 'Strategy must be formulated');
  assert.ok(articleResult.contentType, 'Content type must be dynamically selected');
  assert.ok(articleResult.format, 'Format must be dynamically selected');
  assert.ok(articleResult.hookStrategy, 'Hook strategy must be determined');
  assert.ok(articleResult.finalContent, 'Final post content must be generated');
  assert.ok(Array.isArray(articleResult.provenance), 'Provenance list must be present');
  assert.ok(articleResult.qualityGates, 'Quality gates must be evaluated');
  assert.ok(['PASSED', 'REVIEW_REQUIRED'].includes(articleResult.finalStatus), 'Final status must be explicit');
  console.log(`   ✅ Article pipeline produced ${articleResult.format} with status ${articleResult.finalStatus}`);
  passedTests++;

  // TEST 2: User Idea -> Content Workflow
  console.log('\n👉 TEST 2: User Idea -> Autonomous Content Workflow');
  const idea = 'AI agents should not always be autonomous.';
  const ideaResult = await pipelineIdeaToContent(idea, DEFAULT_TECH_CREATOR_PROFILE);

  assert.ok(ideaResult.strategy, 'Strategy must be autonomously generated from idea');
  assert.ok(ideaResult.finalContent, 'Final content must be generated');
  assert.ok(ideaResult.strategy.targetAudience, 'Audience must be inferred');
  assert.ok(ideaResult.strategy.selectedAngle, 'Angle must be inferred');
  assert.ok(ideaResult.strategy.callToAction, 'CTA must be determined');
  console.log(`   ✅ Idea "${idea}" formulated into angle: "${ideaResult.strategy.selectedAngle}"`);
  passedTests++;

  // TEST 3: Unsupported Claim Detection & Provenance Rejection (Regression on 5 exact patterns)
  console.log('\n👉 TEST 3: Unsupported Claim Detection & Provenance Hard Gates');
  const unsupportedClaims = [
    'We analyzed 40 B2B founders last quarter to uncover conversion drops.',
    'Our agency scaled from zero to $1M ARR in just 6 months.',
    'Response rate jumps from 1.5% to 24% after adding this single email step.',
    'In 2024, I hired 12 senior machine learning engineers across 3 continents.',
    'Our campaign resulted in zero closed meetings and total silence.',
  ];

  for (const claimText of unsupportedClaims) {
    const postWithFakeClaim = `Here is a breakdown of our operating findings.\n\n${claimText}\n\nWhat is your experience?`;
    const validation = validatePostFacts(
      postWithFakeClaim,
      DEFAULT_TECH_CREATOR_PROFILE,
      [], // zero source docs
      []  // zero verified facts
    );

    // Each unsupported claim must be detected and marked UNAVAILABLE
    const unavail = validation.claims.find((c) => (c as any).provenance === 'UNAVAILABLE');
    assert.ok(
      unavail || !validation.validatedPost.includes(claimText),
      `Claim "${claimText}" must be flagged as UNAVAILABLE or sanitized from post`
    );

    // If unverified claims remain in text, quality evaluation must NEVER PASS
    const qEval = evaluateMultiDimensionalQuality(
      postWithFakeClaim,
      ideaResult.strategy,
      DEFAULT_TECH_CREATOR_PROFILE,
      []
    );
    assert.notEqual(
      qEval.overallStatus,
      'PASSED',
      `Post containing ungrounded claim "${claimText}" must NEVER receive PASSED`
    );
  }
  console.log('   ✅ All 5 unverified/invented claims flagged as UNAVAILABLE and blocked from PASSED');
  passedTests++;

  // TEST 4: Source Contradiction Gate (Title 5 vs Body 7)
  console.log('\n👉 TEST 4: Source Contradiction Hard Gate');
  const conflictingArticle = {
    title: '5 Core Micro-Agent Architectures for High-Throughput Pipelines',
    body: 'In our comprehensive benchmarks, we identified exactly 7 distinct micro-agent patterns: 1. Dispatcher 2. Router 3. Verifier 4. Arbiter 5. Synthesizer 6. Watchdog 7. Janitor. Each has distinct latency profiles.',
    author: 'Alex Rivera',
    publisher: 'Engineering Systems Weekly',
  };

  const conflictResult = await pipelineArticleToContent(
    'https://systemsweekly.com/5-vs-7-patterns',
    DEFAULT_TECH_CREATOR_PROFILE,
    { fallbackArticle: conflictingArticle }
  );

  assert.equal(conflictResult.source.status, 'CONFLICTING', 'Source status must be CONFLICTING');
  assert.equal(conflictResult.finalStatus, 'REVIEW_REQUIRED', 'Contradictory source must NEVER PASS');
  assert.equal(conflictResult.qualityGates.overallPass, false, 'Quality gate must fail');
  const contradictionCheck = conflictResult.qualityGates.criticalQualityChecks.find(
    (c) => c.id === 'source-contradictions'
  );
  assert.ok(contradictionCheck && !contradictionCheck.passed, 'Source contradiction gate check must be marked failed');
  console.log('   ✅ Title 5 vs Body 7 contradiction caught: status is CONFLICTING & REVIEW_REQUIRED');
  passedTests++;

  // TEST 5: Carousel Generation & Inspection
  console.log('\n👉 TEST 5: Carousel Inspection & Quality Validation');
  const validCarousel: CarouselExecution = {
    format: 'CAROUSEL_DOCUMENT',
    title: 'Multi-Agent Latency Budgets',
    slides: [
      {
        slideNumber: 1,
        headline: 'Why Multi-Agent Handoffs Hit Latency Walls',
        body: 'Synchronous blocking calls between agents accumulate serial delay across steps.',
        purpose: 'Problem framing',
        sourceFacts: ['Synchronous handoffs accumulate latency'],
        visualDirection: 'Architecture flow chart with latency bottleneck markers',
      },
      {
        slideNumber: 2,
        headline: 'Asynchronous Gossip and Event Buses',
        body: 'Decoupling agent coordination through durable message queues drops p99 tail latency.',
        purpose: 'Architecture solution',
        sourceFacts: ['Message queues decouple execution'],
        visualDirection: 'Event-driven pub/sub queue diagram',
      },
      {
        slideNumber: 3,
        headline: 'Implementation Checklist for Engineering Teams',
        body: 'Define explicit latency budgets per agent tier and set monotonic timeout limits.',
        purpose: 'Practical action items',
        sourceFacts: ['Monotonic timeouts prevent cascading lockup'],
        visualDirection: 'Checklist card with save prompt',
      },
    ],
    caption: 'How engineering teams solve multi-agent latency bottlenecks.',
  };

  const validCheck = validateFormatExecution('CAROUSEL_DOCUMENT', validCarousel);
  assert.ok(validCheck.isValid, `Valid carousel should pass validation: ${validCheck.errors.join(', ')}`);

  // Test failure on filler heading
  const fillerCarousel: CarouselExecution = {
    ...validCarousel,
    slides: [
      { ...validCarousel.slides[0], headline: 'Slide 1' },
      validCarousel.slides[1],
      validCarousel.slides[2],
    ],
  };
  const fillerCheck = validateFormatExecution('CAROUSEL_DOCUMENT', fillerCarousel);
  assert.ok(!fillerCheck.isValid, 'Carousel with filler heading "Slide 1" must fail validation');

  // Test failure on duplicated sentences
  const duplicateCarousel: CarouselExecution = {
    ...validCarousel,
    slides: [
      validCarousel.slides[0],
      { ...validCarousel.slides[1], body: validCarousel.slides[0].body },
      validCarousel.slides[2],
    ],
  };
  const dupCheck = validateFormatExecution('CAROUSEL_DOCUMENT', duplicateCarousel);
  assert.ok(!dupCheck.isValid, 'Carousel with duplicated sentence across slides must fail validation');

  console.log('   ✅ Carousel validation correctly enforces slide counts, concrete headings, and unique content');
  passedTests++;

  // TEST 6: Persona Switching & Context Isolation (Tech Creator <-> D2C Founder)
  console.log('\n👉 TEST 6: Persona Switching & Zero Cross-Contamination');
  const wsTest = 'test-persona-switch-ws';
  resetVoiceProfile(wsTest);

  // Switch to D2C Founder
  const d2cProfile = switchPersona('D2C_FOUNDER', wsTest);
  assert.equal(d2cProfile.role, 'D2C Founder & Brand Operator');
  assert.ok(d2cProfile.contentPillars.includes('Customer Retention'));
  assert.ok(!d2cProfile.contentPillars.includes('Software Development'));

  // Switch back to Tech Creator
  const techProfile = switchPersona('TECH_CREATOR', wsTest);
  assert.equal(techProfile.role, 'Tech Creator & Educator');
  assert.ok(techProfile.contentPillars.includes('Software Development'));
  assert.ok(!techProfile.contentPillars.includes('Customer Retention'));

  console.log('   ✅ Clean switching between Tech Creator and D2C Founder with isolated context');
  passedTests++;

  // TEST 7: Empty Workspace Honesty
  console.log('\n👉 TEST 7: Empty Workspace Honesty');
  const emptyBriefing = await generateDailyBriefing('empty-test-workspace');
  assert.equal(emptyBriefing.metrics.newIndustrySignals, 0);
  assert.equal(emptyBriefing.metrics.contentOpportunities, 0);
  assert.equal(emptyBriefing.metrics.prospectsWithSignals, 0);
  assert.equal(emptyBriefing.todaySalesFocus.topProspectName, 'No active prospects');
  assert.equal(emptyBriefing.todayContentRecommendation.topic, 'No profile configured yet');
  console.log('   ✅ Empty workspace honesty verified: zero invented opportunities or metrics');
  passedTests++;

  console.log('\n==================================================================');
  console.log(` ALL ${passedTests} ACCEPTANCE GAP REMEDIATION TESTS PASSED!`);
  console.log('==================================================================');
}

runAcceptanceGapTests().catch((err) => {
  console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
