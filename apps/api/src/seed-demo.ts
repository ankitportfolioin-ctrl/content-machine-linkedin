/**
 * Deterministic DEMO seed for the Growth Operator prototype.
 *
 * Creates (idempotently) a synthetic demo workspace with fictional identities.
 * All data is synthetic and labelled DEMO where it could be mistaken for real
 * LinkedIn activity. Nothing here posts, sends, or executes anything on
 * LinkedIn — prepared actions stay human-gated by design.
 *
 * Usage: pnpm --filter=@growth-operator/api seed:demo
 */
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import bcrypt from 'bcryptjs';
import { prisma } from '@growth-operator/db';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'DemoPass1234';
export const DEMO_WORKSPACE_SLUG = 'demo-workspace';

/** Default local login (owner of the demo workspace, recreated on every seed). */
export const DEFAULT_EMAIL = 'test@gmail.com';
export const DEFAULT_PASSWORD = 'test@123';

const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

async function main(): Promise<void> {
  // --- Demo user (upsert) -------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: 'Demo Operator', isActive: true, passwordHash },
    create: { email: DEMO_EMAIL, passwordHash, name: 'Demo Operator' },
  });

  // --- Default local login (upsert; owns the demo workspace below) ---------
  const defaultPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const defaultUser = await prisma.user.upsert({
    where: { email: DEFAULT_EMAIL },
    update: { name: 'Test User', isActive: true, passwordHash: defaultPasswordHash },
    create: { email: DEFAULT_EMAIL, passwordHash: defaultPasswordHash, name: 'Test User' },
  });

  // --- Demo workspace (reset for determinism; cascades to children) -------
  await prisma.workspace.deleteMany({ where: { slug: DEMO_WORKSPACE_SLUG } });
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Demo Workspace',
      slug: DEMO_WORKSPACE_SLUG,
      description: 'Synthetic demo workspace. All people, companies, and metrics are fictional.',
    },
  });
  const workspaceId = workspace.id;

  await prisma.workspaceMembership.create({
    data: { userId: user.id, workspaceId, role: 'OWNER' },
  });
  await prisma.workspaceMembership.create({
    data: { userId: defaultUser.id, workspaceId, role: 'OWNER' },
  });

  await prisma.profile.create({
    data: {
      userId: user.id,
      workspaceId,
      headline: 'Demo Operator — Example SaaS (synthetic demo profile)',
      role: 'Founder',
      summary: 'Synthetic demo profile used to demonstrate the Growth Operator workflow.',
      industry: 'SaaS',
      location: 'Example City',
    },
  });

  await prisma.iCP.create({
    data: {
      workspaceId,
      name: 'Example SaaS founders',
      description: 'Founders at SaaS companies.',
      targetRoles: ['Founder'],
      industries: ['SaaS'],
      companySize: '1-50',
      problems: 'Founder-led sales demos that do not convert to pipeline.',
      exclusions: 'DEMO — synthetic ICP for demonstration only.',
    },
  });

  // --- Intelligence: topics / sources / claims / trends -------------------
  const topic1 = await prisma.topic.create({
    data: {
      workspaceId,
      name: 'Founder-led sales demos',
      canonicalName: 'demo-founder-led-sales-demos',
      description: 'Founder-led sales demos for SaaS company teams',
      aliases: ['founder-led sales', 'sales demos'],
    },
  });
  const topic2 = await prisma.topic.create({
    data: {
      workspaceId,
      name: 'Onboarding checklists',
      canonicalName: 'demo-onboarding-checklists',
      description: 'Practical onboarding checklists that reduce time-to-value for SaaS teams',
      aliases: ['onboarding'],
    },
  });
  const topic3 = await prisma.topic.create({
    data: {
      workspaceId,
      name: 'Outreach personalization',
      canonicalName: 'demo-outreach-personalization',
      description: 'Personalized outreach workflows for small sales teams',
      aliases: ['personalization'],
    },
  });

  async function mkSource(url: string, title: string, body: string) {
    const canonicalUrl = url;
    const source = await prisma.intelligenceSource.create({
      data: {
        workspaceId,
        url,
        canonicalUrl,
        sourceType: 'ARTICLE',
        title,
        publisher: 'Example Publisher (DEMO)',
        publishedAtConfidence: 'UNKNOWN',
        description: 'DEMO — synthetic source summary.',
        contentHash: sha(`content:${url}`),
        urlHash: sha(`url:${url}`),
        status: 'ACTIVE',
        lastFetchedAt: new Date(),
      },
    });
    const doc = await prisma.sourceDocument.create({
      data: {
        workspaceId,
        sourceId: source.id,
        rawContent: body,
        cleanContent: body,
        contentType: 'TEXT',
        wordCount: body.split(/\s+/).length,
        extractionMethod: 'USER_PROVIDED',
        extractionStatus: 'SUCCESS',
        extractionWarnings: [],
      },
    });
    return { source, doc };
  }

  const s1 = await mkSource(
    'https://example.com/demo/founder-led-sales-notes',
    'DEMO: Founder-led sales notes (synthetic)',
    'Synthetic demo notes: founder-led sales demos work best when the founder shows one concrete workflow end to end. Keep the demo under fifteen minutes and end with a single clear next step.',
  );
  const s2 = await mkSource(
    'https://example.com/demo/saas-onboarding-guide',
    'DEMO: SaaS onboarding guide (synthetic)',
    'Synthetic demo guide: onboarding checklists reduce time-to-value when each step names an owner and a done-criterion. Review the checklist with the customer on a short call.',
  );

  async function mkClaim(sourceId: string, documentId: string, claimText: string, evidenceText: string) {
    return prisma.sourceClaim.create({
      data: {
        workspaceId,
        sourceId,
        documentId,
        claimText,
        claimType: 'OBSERVATION',
        evidenceText,
        confidence: 0.8,
        status: 'SUPPORTED',
        provenance: { demo: true, note: 'Synthetic demo claim; not a real-world assertion.' },
      },
    });
  }

  const claim1 = await mkClaim(
    s1.source.id,
    s1.doc.id,
    'DEMO (synthetic): showing one concrete workflow end to end keeps founder-led demos focused.',
    'Synthetic demo notes: founder-led sales demos work best when the founder shows one concrete workflow end to end.',
  );
  const claim2 = await mkClaim(
    s1.source.id,
    s1.doc.id,
    'DEMO (synthetic): ending a demo with a single clear next step helps pipeline follow-up.',
    'Keep the demo under fifteen minutes and end with a single clear next step.',
  );
  const claim3 = await mkClaim(
    s2.source.id,
    s2.doc.id,
    'DEMO (synthetic): onboarding checklists name an owner and a done-criterion per step.',
    'Onboarding checklists reduce time-to-value when each step names an owner and a done-criterion.',
  );

  await prisma.topicMention.create({
    data: {
      workspaceId,
      topicId: topic1.id,
      sourceId: s1.source.id,
      mentionStrength: 0.9,
      relevanceScore: 0.85,
      context: 'DEMO — synthetic mention linking founder-led demos to the demo source.',
    },
  });
  await prisma.topicMention.create({
    data: {
      workspaceId,
      topicId: topic2.id,
      sourceId: s2.source.id,
      mentionStrength: 0.85,
      relevanceScore: 0.8,
      context: 'DEMO — synthetic mention linking onboarding checklists to the demo source.',
    },
  });

  const trend1 = await prisma.trendSignal.create({
    data: {
      workspaceId,
      topicId: topic1.id,
      status: 'TRENDING',
      mentionCount: 4,
      sourceCount: 2,
      firstSeenAt: new Date(Date.now() - 6 * 86400000),
      lastSeenAt: new Date(),
      recencyScore: 0.9,
      sourceDiversityScore: 0.6,
      frequencyScore: 0.7,
      evidenceSummary: 'DEMO — synthetic trend evidence recorded for demonstration.',
    },
  });
  const trend2 = await prisma.trendSignal.create({
    data: {
      workspaceId,
      topicId: topic2.id,
      status: 'RELEVANT',
      mentionCount: 3,
      sourceCount: 1,
      firstSeenAt: new Date(Date.now() - 10 * 86400000),
      lastSeenAt: new Date(),
      recencyScore: 0.7,
      sourceDiversityScore: 0.4,
      frequencyScore: 0.5,
      evidenceSummary: 'DEMO — synthetic trend evidence recorded for demonstration.',
    },
  });

  await prisma.contentGap.create({
    data: {
      workspaceId,
      topicId: topic1.id,
      gapType: 'ANGLE',
      description: 'DEMO: missing checklist angle for founder-led demo follow-up.',
      importanceScore: 0.7,
      evidence: 'DEMO — synthetic gap recorded for demonstration.',
    },
  });
  await prisma.contentGap.create({
    data: {
      workspaceId,
      topicId: topic2.id,
      gapType: 'DEPTH',
      description: 'DEMO: onboarding checklist topic lacks a worked example.',
      importanceScore: 0.6,
      evidence: 'DEMO — synthetic gap recorded for demonstration.',
    },
  });

  // --- Content opportunities (triage states) -------------------------------
  const oppEvidence = {
    sourceIds: [s1.source.id],
    claimIds: [claim1.id, claim2.id],
    trendSignalIds: [trend1.id],
  };
  const opp1 = await prisma.contentOpportunity.create({
    data: {
      workspaceId,
      topicId: topic1.id,
      title: 'DEMO: The 15-minute founder demo checklist',
      thesis: 'Founder-led demos convert better when they follow a short, repeatable checklist.',
      problem: 'Founder demos ramble and end without a next step.',
      audience: 'Founders at small SaaS companies',
      angle: 'Practical checklist',
      objective: 'TEACH_PRACTICAL',
      contentFormat: 'CHECKLIST',
      opportunityScore: 0.82,
      ...oppEvidence,
      reasoning: 'DEMO — synthetic reasoning recorded for demonstration.',
      evidenceSummary: 'DEMO — synthetic evidence summary; claims are demo-labelled.',
    },
  });
  const opp2 = await prisma.contentOpportunity.create({
    data: {
      workspaceId,
      topicId: topic2.id,
      title: 'DEMO: Onboarding checklist teardown',
      thesis: 'A short teardown shows what makes onboarding checklists work.',
      problem: 'Onboarding checklists are vague and ownerless.',
      audience: 'Founders and customer-success leads at SaaS companies',
      angle: 'Teardown',
      objective: 'EDUCATE',
      contentFormat: 'FRAMEWORK',
      opportunityScore: 0.74,
      sourceIds: [s2.source.id],
      claimIds: [claim3.id],
      trendSignalIds: [trend2.id],
      reasoning: 'DEMO — synthetic reasoning recorded for demonstration.',
      evidenceSummary: 'DEMO — synthetic evidence summary; claims are demo-labelled.',
    },
  });
  await prisma.contentOpportunity.create({
    data: {
      workspaceId,
      topicId: topic3.id,
      title: 'DEMO: Personalization without the creep factor',
      thesis: 'Light, evidenced personalization beats deep-research outreach for small teams.',
      problem: 'Outreach personalization is time-consuming and often irrelevant.',
      audience: 'Founders doing their own outreach',
      angle: 'Contrarian',
      objective: 'CHALLENGE',
      opportunityScore: 0.68,
      status: 'REVIEWED',
      sourceIds: [],
      claimIds: [],
      trendSignalIds: [],
      reasoning: 'DEMO — synthetic reasoning recorded for demonstration.',
      evidenceSummary: 'DEMO — synthetic evidence summary.',
    },
  });
  await prisma.contentOpportunity.create({
    data: {
      workspaceId,
      topicId: topic1.id,
      title: 'DEMO: Demo metrics you can ignore (parked)',
      thesis: 'Parked demo idea kept to show the dismissed triage state.',
      problem: 'Too many vanity metrics in demo follow-up.',
      audience: 'Founders',
      angle: 'Observation',
      objective: 'ANALYZE',
      opportunityScore: 0.55,
      status: 'DISMISSED',
      sourceIds: [],
      claimIds: [],
      trendSignalIds: [],
      reasoning: 'DEMO — parked to demonstrate the DISMISSED state.',
      evidenceSummary: 'DEMO — synthetic evidence summary.',
    },
  });

  await prisma.opportunityFeedback.create({
    data: {
      workspaceId,
      opportunityId: opp1.id,
      userId: user.id,
      feedback: 'USEFUL',
      reason: 'DEMO feedback: matches the founder-led selling pillar.',
    },
  });

  // --- Content ideas / plan / draft / review -------------------------------
  const idea1 = await prisma.contentIdea.create({
    data: {
      workspaceId,
      authorId: user.id,
      title: 'DEMO: The 15-minute founder demo checklist',
      description: 'Turn the demo opportunity into a checklist post.',
      angle: 'Practical checklist',
      format: 'CHECKLIST',
      status: 'DRAFT',
      tags: ['demo', 'founder-led-sales'],
      opportunityId: opp1.id,
      topicId: topic1.id,
      thesis: 'Founder-led demos convert better with a short checklist.',
      audience: 'Founders at small SaaS companies',
      objective: 'TEACH_PRACTICAL',
      reasoning: 'DEMO — started from a seeded opportunity.',
      evidenceSnapshot: { demo: true, claimIds: [claim1.id, claim2.id] },
    },
  });
  await prisma.contentIdea.create({
    data: {
      workspaceId,
      authorId: user.id,
      title: 'DEMO: Onboarding teardown draft',
      description: 'Standalone demo idea for the onboarding pillar.',
      format: 'FRAMEWORK',
      status: 'DRAFT',
      tags: ['demo', 'onboarding'],
      topicId: topic2.id,
      thesis: 'Worked examples make onboarding advice concrete.',
      audience: 'Customer-success leads',
      objective: 'EDUCATE',
      reasoning: 'DEMO — standalone demo idea.',
    },
  });
  await prisma.contentIdea.create({
    data: {
      workspaceId,
      authorId: user.id,
      title: 'DEMO: What I would cut from my first 10 demos',
      description: 'Reflection-style demo idea (synthetic).',
      format: 'POST',
      status: 'DRAFT',
      tags: ['demo'],
      topicId: topic1.id,
      thesis: 'Cutting scope improves early demos.',
      audience: 'Founders',
      objective: 'SHARE_FRAMEWORK',
      reasoning: 'DEMO — standalone demo idea.',
    },
  });

  const plan = await prisma.contentPlan.create({
    data: {
      workspaceId,
      contentIdeaId: idea1.id,
      opportunityId: opp1.id,
      topicId: topic1.id,
      thesis: 'Founder-led demos convert better with a short checklist.',
      audience: 'Founders at small SaaS companies',
      objective: 'TEACH_PRACTICAL',
      angle: 'PRACTICAL',
      format: 'CHECKLIST',
      narrativeStructure: 'PROBLEM_WHY_SOLUTION',
      keyPoints: ['Open with the outcome', 'Show one workflow', 'End with one next step'],
      hookDirection: 'DEMO hook direction (synthetic).',
      ctaStrategy: 'DEMO: invite comments about demo checklists.',
      evidenceMap: [{ claimId: claim1.id, use: 'Supports the one-workflow rule.' }],
      mustNotClaim: ['No real engagement numbers', 'No client outcomes'],
      sourceIds: [s1.source.id],
      claimIds: [claim1.id, claim2.id],
      trendSignalIds: [trend1.id],
      reasoning: 'DEMO — synthetic plan.',
      status: 'DRAFT',
      createdBy: user.id,
    },
  });

  const draft = await prisma.contentDraft.create({
    data: {
      workspaceId,
      contentIdeaId: idea1.id,
      planId: plan.id,
      authorId: user.id,
      body: 'DEMO DRAFT (synthetic, not posted): My 15-minute founder demo checklist — 1) open with the outcome, 2) show one workflow end to end, 3) end with one clear next step. Prepared in the demo workspace; nothing was published to LinkedIn.',
      version: 1,
    },
  });
  const version = await prisma.contentVersion.create({
    data: {
      workspaceId,
      contentDraftId: draft.id,
      authorId: user.id,
      body: 'DEMO DRAFT (synthetic, not posted): My 15-minute founder demo checklist — 1) open with the outcome, 2) show one workflow end to end, 3) end with one clear next step.',
      version: 1,
      changeSummary: 'DEMO initial version.',
    },
  });
  await prisma.contentReview.create({
    data: { workspaceId, draftId: draft.id, status: 'SUBMITTED', requestedBy: user.id },
  });
  await prisma.contentQualityGateResult.create({
    data: {
      workspaceId,
      draftId: draft.id,
      gate: 'evidence',
      status: 'PASS',
      severity: 'info',
      message: 'DEMO: draft text references only demo-labelled claims.',
    },
  });
  await prisma.draftClaimBinding.create({
    data: {
      workspaceId,
      draftId: draft.id,
      span: 'show one workflow end to end',
      sourceClaimId: claim1.id,
      evidenceStatus: 'SUPPORTED',
      confidence: 0.8,
    },
  });

  // Publish record = manual recording only (NOT a LinkedIn post).
  const publishRecord = await prisma.publishRecord.create({
    data: {
      workspaceId,
      contentVersionId: version.id,
      channel: 'DEMO_MANUAL',
      externalRef: 'DEMO — recorded manually in the demo workspace; nothing was posted to LinkedIn.',
      recordedBy: user.id,
    },
  });
  const outcomeMetric = await prisma.outcomeMetric.create({
    data: {
      workspaceId,
      publishRecordId: publishRecord.id,
      contentVersionId: version.id,
      metricName: 'demo_manual_checkins',
      metricValue: 3,
      unit: 'count',
      source: 'DEMO — manually recorded sample value for demonstration only; not real engagement.',
      recordedBy: user.id,
      idempotencyKey: 'demo-seed-outcome-1',
    },
  });

  // --- Leads / research / signals / qualification / briefs -----------------
  const lead1 = await prisma.lead.create({
    data: {
      workspaceId,
      linkedinUrl: 'https://linkedin.com/in/demo-dana-example',
      name: 'Dana Example',
      headline: 'Founder at SaaS company',
      company: 'Acme AI Labs (SaaS company)',
      location: 'Example City',
      status: 'NEW',
      tags: ['demo'],
      notes: 'DEMO — fictional prospect for demonstration only.',
    },
  });
  const lead2 = await prisma.lead.create({
    data: {
      workspaceId,
      linkedinUrl: 'https://linkedin.com/in/demo-evan-sample',
      name: 'Evan Sample',
      headline: 'Head of Growth at Example SaaS Co',
      company: 'Example SaaS Co',
      location: 'Sample Town',
      status: 'NEW',
      tags: ['demo'],
      notes: 'DEMO — fictional prospect for demonstration only.',
    },
  });
  const lead3 = await prisma.lead.create({
    data: {
      workspaceId,
      linkedinUrl: 'https://linkedin.com/in/demo-priya-demo',
      name: 'Priya Demo',
      headline: 'Operations Lead at Northwind Demo Systems',
      company: 'Northwind Demo Systems',
      location: 'Demo City',
      status: 'NEW',
      tags: ['demo'],
      notes: 'DEMO — fictional prospect for demonstration only.',
    },
  });

  await prisma.prospectResearch.create({
    data: {
      workspaceId,
      leadId: lead1.id,
      name: 'Dana Example',
      title: 'Founder at SaaS company',
      company: 'Acme AI Labs (SaaS company)',
      location: 'Example City',
      publicSourceUrls: ['https://example.com/demo/dana-example'],
      facts: [
        {
          statement:
            'Dana runs founder-led sales demos for a SaaS company pipeline at Acme AI Labs.',
          sourceRef: 'demo notes',
          confidence: 0.8,
        },
      ],
      unknowns: ['DEMO: real budget and timeline are unknown.'],
      confidence: 0.6,
    },
  });
  await prisma.prospectResearch.create({
    data: {
      workspaceId,
      leadId: lead2.id,
      name: 'Evan Sample',
      title: 'Head of Growth at Example SaaS Co',
      company: 'Example SaaS Co',
      publicSourceUrls: [],
      facts: [
        {
          statement: 'Evan owns onboarding checklists for a SaaS company growth team.',
          sourceRef: 'demo notes',
          confidence: 0.7,
        },
      ],
      unknowns: ['DEMO: team size unknown.'],
      confidence: 0.5,
    },
  });
  await prisma.prospectResearch.create({
    data: {
      workspaceId,
      leadId: lead3.id,
      name: 'Priya Demo',
      facts: [{ statement: 'Priya Demo is a fictional demo prospect.', sourceRef: 'demo notes', confidence: 0.5 }],
      unknowns: ['DEMO: almost everything is unknown by design.'],
      confidence: 0.3,
    },
  });

  await prisma.prospectSignal.create({
    data: {
      workspaceId,
      leadId: lead1.id,
      signalType: 'HIRING',
      source: 'DEMO — synthetic signal recorded for demonstration.',
      confidence: 0.6,
      evidence: 'DEMO evidence: fictional hiring page mentions a sales hire.',
      interpretation: 'DEMO: may indicate growing demo load; treat as unconfirmed.',
    },
  });
  await prisma.prospectSignal.create({
    data: {
      workspaceId,
      leadId: lead2.id,
      signalType: 'PRODUCT_LAUNCH',
      source: 'DEMO — synthetic signal recorded for demonstration.',
      confidence: 0.5,
      evidence: 'DEMO evidence: fictional launch notes for an onboarding revamp.',
      interpretation: 'DEMO: onboarding content may be timely; unconfirmed.',
    },
  });

  await prisma.qualificationResult.create({
    data: {
      workspaceId,
      leadId: lead1.id,
      status: 'QUALIFIED',
      dimensions: { role: 0.8, company: 0.7, signal: 0.6 },
      evidence: { note: 'DEMO — deterministic qualification for demonstration.' },
      missingData: [],
      reasoning: 'DEMO: fictional fit recorded for demonstration.',
      confidence: 0.7,
    },
  });
  await prisma.qualificationResult.create({
    data: {
      workspaceId,
      leadId: lead2.id,
      status: 'POSSIBLE_FIT',
      dimensions: { role: 0.6, company: 0.6, signal: 0.5 },
      missingData: ['budget'],
      reasoning: 'DEMO: possible fit recorded for demonstration.',
      confidence: 0.5,
    },
  });
  await prisma.qualificationResult.create({
    data: {
      workspaceId,
      leadId: lead3.id,
      status: 'INSUFFICIENT_DATA',
      dimensions: {},
      missingData: ['role', 'company', 'signal'],
      reasoning: 'DEMO: insufficient recorded data by design.',
    },
  });

  const brief = await prisma.prospectBrief.create({
    data: {
      workspaceId,
      leadId: lead1.id,
      who: { name: 'Dana Example', title: 'Founder at SaaS company' },
      knownFacts: [{ statement: 'Runs founder-led sales demos.', sourceRef: 'demo notes' }],
      unknowns: ['DEMO: budget unknown.'],
      doNotClaim: ['No real relationship', 'No verified metrics'],
      recommendedApproach: 'FIRST_MESSAGE',
      createdBy: user.id,
    },
  });

  // --- Outreach: strategy / draft / review / prepared (human-gated) -------
  const strategy = await prisma.outreachStrategy.create({
    data: {
      workspaceId,
      leadId: lead1.id,
      briefId: brief.id,
      objective: 'Start a conversation about demo checklists',
      audience: 'Founder at a small SaaS company',
      relationshipStage: 'COLD',
      angle: 'problem-led',
      reasonForContact: 'DEMO: shared interest in founder-led sales demos.',
      relevantEvidence: [{ claimId: claim1.id, note: 'DEMO-labelled claim.' }],
      personalizationLevel: 'LIGHT',
      ctaType: 'OPEN_QUESTION',
      riskFlags: [],
      mustNotClaim: ['No prior relationship', 'No client outcomes'],
      status: 'APPROVED',
      createdBy: user.id,
    },
  });
  const outreachDraft = await prisma.outreachDraft.create({
    data: {
      workspaceId,
      strategyId: strategy.id,
      leadId: lead1.id,
      draftType: 'FIRST_MESSAGE',
      opening: 'Hi Dana — demo note (synthetic, prepared only).',
      relevance: 'Saw Acme AI Labs is a SaaS company doing founder-led demos.',
      value: 'I put together a short demo checklist from my own notes; happy to share it.',
      cta: 'Worth a quick look?',
      body: 'Hi Dana — DEMO draft (synthetic, prepared only, NOT sent): saw Acme AI Labs is doing founder-led demos. I put together a short demo checklist from my notes; happy to share it. Worth a quick look?',
      version: 1,
      createdBy: user.id,
    },
  });
  const outreachReview = await prisma.outreachReview.create({
    data: { workspaceId, draftId: outreachDraft.id, status: 'SUBMITTED', requestedBy: user.id },
  });
  await prisma.preparedAction.create({
    data: {
      workspaceId,
      actionType: 'SEND_FIRST_MESSAGE',
      target: 'Dana Example',
      draftId: outreachDraft.id,
      approvalId: outreachReview.id,
      evidence: { demo: true, note: 'Prepared for authorized execution only; nothing was sent.' },
      status: 'READY_FOR_AUTHORIZED_EXECUTION',
    },
  });
  await prisma.preparedAction.create({
    data: {
      workspaceId,
      actionType: 'SEND_FIRST_MESSAGE',
      target: 'Evan Sample',
      evidence: { demo: true, note: 'Awaiting approval; nothing was sent.' },
      status: 'REQUIRES_APPROVAL',
    },
  });

  // --- Conversation / classification / follow-up / content signal ----------
  const conversation = await prisma.conversation.create({
    data: { workspaceId, leadId: lead1.id, userId: user.id, subject: 'DEMO conversation (synthetic)' },
  });
  await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      senderId: user.id,
      body: 'DEMO (synthetic inbound, recorded manually): thanks for the demo checklist notes — can we schedule a short call next week?',
      direction: 'INBOUND',
    },
  });
  await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      senderId: user.id,
      body: 'DEMO (synthetic outbound, recorded manually): glad it helped — sharing one more checklist item here for reference.',
      direction: 'OUTBOUND',
    },
  });
  const classification = await prisma.conversationClassificationResult.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      classification: 'MEETING_REQUEST',
      confidence: 0.7,
      evidence: 'DEMO: message asks to schedule a short call.',
      recommendedNextStep: 'DEMO: propose two time slots manually.',
    },
  });
  void classification;
  await prisma.followUpRecommendation.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      leadId: lead1.id,
      recommendation: 'FOLLOW_UP_NOW',
      why: 'DEMO: fictional prospect asked for a call; timely human follow-up is appropriate.',
      evidence: 'DEMO recorded message text.',
      timing: 'Within one business day (demo suggestion).',
    },
  });
  await prisma.salesContentSignal.create({
    data: {
      workspaceId,
      signalType: 'REPEATED_QUESTION',
      sourceConversationIds: [conversation.id],
      evidence: 'DEMO: fictional prospects repeatedly ask how long a founder demo should run.',
      frequency: 2,
      recommendedAngle: 'Checklist post on demo length.',
      reasoning: 'DEMO — synthetic cross-machine signal for demonstration.',
    },
  });

  // --- Pipeline ------------------------------------------------------------
  await prisma.pipelineOpportunity.create({
    data: {
      workspaceId,
      leadId: lead1.id,
      ownerId: user.id,
      name: 'DEMO: Acme AI Labs pilot conversation',
      stage: 'PROSPECTING',
      value: 5000,
      probability: 20,
    },
  });

  // --- Learning: one proposed + one confirmed ------------------------------
  await prisma.learningProposal.create({
    data: {
      workspaceId,
      dimension: 'hook_strength',
      observedPattern: 'DEMO (synthetic): checklist hooks attracted the only recorded check-ins.',
      supportingMeasurements: { metricIds: [outcomeMetric.id] },
      sourceMetricIds: [outcomeMetric.id],
      sampleSize: 3,
      denominator: 3,
      proposedAdjustment: 0.05,
      reason: 'DEMO: synthetic proposal awaiting human confirmation.',
      confidence: 0.4,
      status: 'PROPOSED',
    },
  });
  await prisma.learningProposal.create({
    data: {
      workspaceId,
      dimension: 'cta_clarity',
      observedPattern: 'DEMO (synthetic): single-question CTAs were used in all prepared drafts.',
      supportingMeasurements: { demo: true },
      sourceMetricIds: [],
      sampleSize: 2,
      denominator: 2,
      proposedAdjustment: 0.03,
      reason: 'DEMO: confirmed by the demo operator for demonstration.',
      confidence: 0.5,
      status: 'CONFIRMED',
      confirmedBy: user.id,
      confirmedAt: new Date(),
    },
  });

  // --- Voice ----------------------------------------------------------------
  await prisma.voiceProfile.create({
    data: {
      workspaceId,
      userId: user.id,
      role: 'Founder',
      headline: 'Demo Operator — Example SaaS',
      tone: 'DEMO: plain, practical, no hype.',
      writingStyle: 'DEMO: short sentences, checklists, concrete verbs.',
      bannedWords: ['viral', '10x', 'guaranteed'],
      preferredVocabulary: ['checklist', 'workflow', 'next step'],
      contentPillars: ['founder-led sales', 'onboarding'],
    },
  });
  await prisma.voiceReceipt.create({
    data: { workspaceId, fact: 'DEMO: the operator prefers checklist-style posts.', context: 'Demo preference' },
  });
  await prisma.writingSample.create({
    data: {
      workspaceId,
      title: 'DEMO sample (synthetic)',
      content: 'DEMO sample post (synthetic, never published): three things I cut from my demos — long intros, feature tours, and vague closes.',
    },
  });

  // --- Daily loop inputs: watched feeds + one unprepared lead --------------
  // Config rows only (no metrics fabricated). The loop fetches these live;
  // each fetch is recorded on the feed row and in the run's RunLog.
  await prisma.feedSource.create({
    data: {
      workspaceId,
      url: 'https://news.ycombinator.com/rss',
      type: 'HACKERNEWS',
      name: 'DEMO: Hacker News front page (public RSS)',
      active: true,
    },
  });
  await prisma.feedSource.create({
    data: {
      workspaceId,
      url: 'https://github.com/microsoft/TypeScript/releases.atom',
      type: 'GITHUB_RELEASES',
      name: 'DEMO: TypeScript releases (public Atom)',
      active: true,
    },
  });
  // One NEW lead deliberately left without research/qualification/brief so
  // the loop's SALES stage has real preparation work to do.
  await prisma.lead.create({
    data: {
      workspaceId,
      linkedinUrl: 'https://linkedin.com/in/demo-nadia-new',
      name: 'Demo Nadia New',
      headline: 'CTO at Example Robotics (synthetic demo lead)',
      company: 'Example Robotics',
      location: 'Example City',
      status: 'NEW',
      tags: [],
      notes: 'DEMO (synthetic): fresh import awaiting loop preparation.',
    },
  });

  await prisma.analyticsEvent.create({
    data: {
      workspaceId,
      userId: user.id,
      eventType: 'demo',
      eventName: 'demo_workspace_seeded',
      properties: { demo: true },
    },
  });

  console.log(`DEMO seed complete: workspace "${workspace.slug}" (${workspace.id}), user ${user.email}`);
}

main()
  .catch((err) => {
    console.error('DEMO seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
