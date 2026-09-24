import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSourceUnderstanding,
  evaluateEvidenceSufficiency,
  calculateSourceFidelity,
  buildDeterministicStrategyFallback,
  buildDeterministicStructuredPost,
  generateStructuredPost,
} from '../contentStrategyEngine';
import { VoiceProfile } from '../voiceProfileService';

test('Source Fidelity & Content Machine 2.0 Pipeline Audit', async (t) => {
  const restaurantProfile: VoiceProfile = {
    role: 'Restaurant Operations Consultant',
    audience: 'Restaurant founders and general managers',
    contentPillars: ['Restaurant Operations & Margin Discipline', 'Hospitality Tech'],
    keyReceipts: ['45 independent bistros & casual dining spots active in operational tracking'],
  } as unknown as VoiceProfile;

  await t.test('1. Extracts canonical SourceUnderstanding with correct subjectType', () => {
    // List/Skills fixture
    const skillsUnderstanding = extractSourceUnderstanding(
      '5 High-Income Skills Worth Learning in 2026',
      [
        {
          title: '5 High-Income Skills Worth Learning in 2026',
          body: 'The 5 essential skills are: 1. AI workflow automation and LLM prompt engineering. 2. Full-stack system architecture with scalable APIs. 3. Data pipeline operations and SQL analytics. 4. Product management with high execution velocity. 5. Strategic revenue operations and enterprise sales.',
        },
      ],
      restaurantProfile
    );

    assert.equal(skillsUnderstanding.subjectType, 'SKILLS_LIST');
    assert.ok(skillsUnderstanding.concepts.length >= 3, 'Must extract concrete skills from source body');
    assert.ok(
      skillsUnderstanding.concepts.some((c) => c.toLowerCase().includes('prompt') || c.toLowerCase().includes('automation') || c.toLowerCase().includes('architecture')),
      'Concepts must reflect actual skills from the body'
    );

    // Guide/Tutorial fixture
    const guideUnderstanding = extractSourceUnderstanding(
      'CRM onboarding: A practical guide for growing teams',
      [
        {
          title: 'CRM onboarding: A practical guide for growing teams',
          body: 'A step-by-step framework: Step 1: Clean data schema and deduplicate contact records. Step 2: Configure role-based permissions and custom fields. Step 3: Train sales reps with interactive sandbox testing. Step 4: Establish automated audit triggers for pipeline updates.',
        },
      ],
      restaurantProfile
    );

    assert.equal(guideUnderstanding.subjectType, 'GUIDE_TUTORIAL');
    assert.ok(guideUnderstanding.concepts.length >= 3, 'Must extract guide steps from source body');
  });

  await t.test('2. Changing source body changes output (Title-only test)', () => {
    const title = 'Modern Workflow Optimization';

    const understandingA = extractSourceUnderstanding(
      title,
      [
        {
          title,
          body: 'Version A focuses entirely on asynchronous Slack communication, daily standup elimination, and written RFC documents for technical decisions.',
        },
      ],
      restaurantProfile
    );

    const understandingB = extractSourceUnderstanding(
      title,
      [
        {
          title,
          body: 'Version B focuses entirely on automated CI/CD deployment pipelines, containerized microservices, and Kubernetes cluster auto-scaling.',
        },
      ],
      restaurantProfile
    );

    const stratA = buildDeterministicStrategyFallback({ subject: title, profile: restaurantProfile }, {} as any, understandingA);
    const postA = buildDeterministicStructuredPost('When optimizing modern workflows, execution clarity matters most.', stratA, restaurantProfile);

    const stratB = buildDeterministicStrategyFallback({ subject: title, profile: restaurantProfile }, {} as any, understandingB);
    const postB = buildDeterministicStructuredPost('When optimizing modern workflows, execution clarity matters most.', stratB, restaurantProfile);

    assert.notEqual(postA, postB, 'Changing source body MUST produce different posts despite identical title');
    assert.ok(postA.toLowerCase().includes('asynchronous') || postA.toLowerCase().includes('communication') || postA.toLowerCase().includes('rfc'), 'Post A must ground in body A');
    assert.ok(postB.toLowerCase().includes('ci/cd') || postB.toLowerCase().includes('deployment') || postB.toLowerCase().includes('kubernetes'), 'Post B must ground in body B');
  });

  await t.test('3. Semantic differentiation: CRM onboarding vs Customer Success OKRs', () => {
    const crmUnderstanding = extractSourceUnderstanding(
      'CRM onboarding: A practical guide for growing teams',
      [
        {
          title: 'CRM onboarding: A practical guide for growing teams',
          body: 'Step 1: Clean data schema and deduplicate contacts. Step 2: Role-based permissions and security audit. Step 3: Hands-on sandbox training for reps. Step 4: Automated pipeline stage validation.',
        },
      ],
      restaurantProfile
    );

    const okrUnderstanding = extractSourceUnderstanding(
      'Customer Success OKRs: Examples and how to set them',
      [
        {
          title: 'Customer Success OKRs: Examples and how to set them',
          body: 'Objective: Maximize net revenue retention and eliminate churn. Key Result 1: Reduce gross revenue churn from 8% to under 3.5%. Key Result 2: Achieve customer onboarding time-to-value within 14 days. Key Result 3: Drive executive business reviews coverage to 85% of tier-1 accounts.',
        },
      ],
      restaurantProfile
    );

    const crmStrat = buildDeterministicStrategyFallback({ subject: 'CRM onboarding', profile: restaurantProfile }, {} as any, crmUnderstanding);
    const crmPost = buildDeterministicStructuredPost('Rolling out a new CRM requires structured discipline.', crmStrat, restaurantProfile);

    const okrStrat = buildDeterministicStrategyFallback({ subject: 'Customer Success OKRs', profile: restaurantProfile }, {} as any, okrUnderstanding);
    const okrPost = buildDeterministicStructuredPost('Setting effective Customer Success OKRs separates proactive teams from reactive ones.', okrStrat, restaurantProfile);

    assert.notEqual(crmPost, okrPost);
    assert.ok(crmPost.toLowerCase().includes('crm') || crmPost.toLowerCase().includes('contacts') || crmPost.toLowerCase().includes('onboarding'));
    assert.ok(okrPost.toLowerCase().includes('churn') || okrPost.toLowerCase().includes('okr') || okrPost.toLowerCase().includes('retention') || okrPost.toLowerCase().includes('revenue'));
  });

  await t.test('4. Prohibited generic formulas are NEVER present in generated posts', () => {
    const understanding = extractSourceUnderstanding(
      '5 High-Income Skills Worth Learning in 2026',
      [
        {
          title: '5 High-Income Skills Worth Learning in 2026',
          body: 'Key skills for 2026: 1. AI Context Engineering 2. Distributed Cloud Architecture 3. Data Flow Orchestration 4. Technical Product Strategy 5. Enterprise Solutions Architecture.',
        },
      ],
      restaurantProfile
    );

    const strat = buildDeterministicStrategyFallback(
      { subject: '5 High-Income Skills Worth Learning in 2026', profile: restaurantProfile },
      {} as any,
      understanding
    );

    const post = buildDeterministicStructuredPost(
      'The highest leverage skills in 2026 concentrate in a few specific capabilities.',
      strat,
      restaurantProfile
    );

    const forbiddenPhrases = [
      'the conversation around',
      'surface headlines',
      'real priority',
      'implementing adjustments',
      'transition from concept',
      'audit current baselines',
      'isolate core variables',
      'establish verification gates',
      'most reliable outcomes',
      'what has been the most challenging',
      'documented data points to consider: 100%, 55%',
    ];

    for (const phrase of forbiddenPhrases) {
      assert.ok(
        !post.toLowerCase().includes(phrase),
        `Post must NOT contain forbidden phrase: "${phrase}"`
      );
    }
  });

  await t.test('5. Zero audience leakage and zero unrelated receipt leakage', () => {
    const understanding = extractSourceUnderstanding(
      '5 High-Income Skills Worth Learning in 2026',
      [
        {
          title: '5 High-Income Skills Worth Learning in 2026',
          body: 'Key skills for 2026: AI Context Engineering, Distributed Systems, Data Flow Orchestration, Technical Product Strategy, Enterprise Architecture.',
        },
      ],
      restaurantProfile
    );

    const strat = buildDeterministicStrategyFallback(
      { subject: '5 High-Income Skills Worth Learning in 2026', profile: restaurantProfile },
      {} as any,
      understanding
    );

    const post = buildDeterministicStructuredPost(
      'The highest leverage skills in 2026 concentrate in a few specific capabilities.',
      strat,
      restaurantProfile
    );

    // 1. Raw audience list must not be mechanically dumped
    assert.ok(
      !post.includes('For Restaurant founders and general managers'),
      'Must NOT mechanically dump raw audience string into post'
    );
    assert.ok(
      !post.includes('Restaurant founders and general managers:'),
      'Must NOT mechanically prefix audience role'
    );

    // 2. Unrelated receipt must NOT be leaked
    assert.ok(
      !post.includes('45 independent bistros'),
      'Unrelated restaurant bistro receipt must NOT leak into high-income skills post'
    );
  });

  await t.test('6. Evidence Sufficiency Gate halts on empty/gibberish sources', () => {
    const emptyUnderstanding = extractSourceUnderstanding(
      'Arbitrary Tech Topic',
      [],
      restaurantProfile
    );

    const check = evaluateEvidenceSufficiency(emptyUnderstanding, 'Arbitrary Tech Topic', restaurantProfile);
    assert.equal(check.sufficient, false);
    assert.ok(check.reason && check.reason.length > 10);
  });

  await t.test('7. Source Fidelity calculation accurately reflects source grounding', () => {
    const understanding = extractSourceUnderstanding(
      '5 High-Income Skills Worth Learning in 2026',
      [
        {
          title: '5 High-Income Skills Worth Learning in 2026',
          body: 'Key skills for 2026: 1. AI Context Engineering 2. Distributed Cloud Architecture 3. Data Flow Orchestration 4. Technical Product Strategy 5. Enterprise Solutions Architecture.',
        },
      ],
      restaurantProfile
    );

    const strat = buildDeterministicStrategyFallback(
      { subject: '5 High-Income Skills Worth Learning in 2026', profile: restaurantProfile },
      {} as any,
      understanding
    );

    const post = buildDeterministicStructuredPost(
      'The highest leverage skills in 2026 concentrate in a few specific capabilities.',
      strat,
      restaurantProfile
    );

    const fidelity = calculateSourceFidelity(
      post,
      understanding,
      strat,
      { isValid: true, claims: [], unsupportedCount: 0, unsupportedClaimsCount: 0, leakageDetected: false, leakageDetails: [], validatedPost: post }
    );

    assert.ok(fidelity.fidelityScore >= 70, `Expected fidelityScore >= 70, got ${fidelity.fidelityScore}`);
    assert.equal(fidelity.subjectType, 'SKILLS_LIST');
    assert.ok(fidelity.groundedClaimsCount >= 1 || fidelity.groundedFactsCount >= 1);
  });
});
