import { getStoredResearch } from './researchJob';
import { runSalesApi } from './salesBridge';
import { getVoiceProfile } from './voiceProfileService';
import { getLearningStore, deriveContentOpportunitiesFromSales, listGrowthExperiments } from './learningEngine';

export type AutomationMode = 'MANUAL' | 'ASSISTED' | 'AUTOPILOT';

export interface DailyGrowthBriefing {
  greeting: string;
  generatedAt: string;
  automationMode: AutomationMode;
  metrics: {
    newIndustrySignals: number;
    contentOpportunities: number;
    prospectsWithSignals: number;
    followupsDue: number;
    conversationsNeedingAttention: number;
    experimentsReady: number;
  };
  recommendedFocus: {
    headline: string;
    whyNow: string;
    actionType: 'PUBLISH_CONTENT' | 'REACH_OUT_PROSPECT' | 'REPLY_INBOX' | 'ADVANCE_PIPELINE' | 'REVIEW_EXPERIMENT';
    targetActionUrl?: string;
  };
  todayContentRecommendation: {
    topic: string;
    targetAudience: string;
    recommendedFormat: string;
    businessObjective: string;
    rationale: string;
    originSource: string;
  };
  todaySalesFocus: {
    topProspectName: string;
    company: string;
    signalType: string;
    whyContactNow: string;
    suggestedAngle: string;
  };
  recentLearnings: string[];
}

function determineFormatForTopic(title: string, summary: string = ''): string {
  const text = `${title} ${summary}`.toLowerCase();
  if (text.includes('benchmark') || text.includes('survey') || text.includes('report') || text.includes('data') || /\b\d+%\b/.test(text)) {
    return 'TEXT_PLUS_CHART';
  }
  if (text.includes('guide') || text.includes('how to') || text.includes('tutorial') || text.includes('step') || text.includes('framework') || text.includes('checklist')) {
    return 'CAROUSEL_DOCUMENT';
  }
  if (text.includes('compare') || text.includes('versus') || text.includes('vs.') || text.includes('difference between')) {
    return 'TEXT_PLUS_DIAGRAM';
  }
  if (text.includes('releases') || text.includes('launches') || text.includes('announces') || text.includes('news') || text.includes('breaking')) {
    return 'TEXT_POST';
  }
  return 'TEXT_POST';
}

export async function generateDailyBriefing(workspaceId?: string): Promise<DailyGrowthBriefing> {
  const wsId = workspaceId || 'default';
  const profile = getVoiceProfile(wsId);
  const isConfigured = Boolean(profile.filled || profile.role || (profile.contentPillars && profile.contentPillars.length > 0));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  // If workspace is unconfigured, return honest empty state rather than inventing recommendations
  if (!isConfigured) {
    return {
      greeting,
      generatedAt: new Date().toISOString(),
      automationMode: 'MANUAL',
      metrics: {
        newIndustrySignals: 0,
        contentOpportunities: 0,
        prospectsWithSignals: 0,
        followupsDue: 0,
        conversationsNeedingAttention: 0,
        experimentsReady: 0,
      },
      recommendedFocus: {
        headline: 'Set up your growth profile and content pillars',
        whyNow: 'The Growth Operator requires your target audience and core expertise pillars to research grounded trends and generate high-impact suggestions.',
        actionType: 'PUBLISH_CONTENT',
        targetActionUrl: '/settings',
      },
      todayContentRecommendation: {
        topic: 'No profile configured yet',
        targetAudience: 'Define audience in Settings',
        recommendedFormat: 'AWAITING_SETUP',
        businessObjective: 'EDUCATION',
        rationale: 'Enter your role, target ICP, and content pillars in Settings to activate daily context-aware recommendations.',
        originSource: 'Unconfigured Workspace',
      },
      todaySalesFocus: {
        topProspectName: 'No active prospects',
        company: 'Awaiting ICP configuration',
        signalType: 'PIPELINE_INITIATION',
        whyContactNow: 'Configure your target ICP in Settings and discover matching accounts in Leads.',
        suggestedAngle: 'Add target roles and industries before initiating outreach.',
      },
      recentLearnings: [],
    };
  }

  const research = getStoredResearch(wsId);
  const learningStore = getLearningStore(wsId);
  const sharedOpps = deriveContentOpportunitiesFromSales(wsId);
  const experiments = listGrowthExperiments(wsId);

  // Retrieve sales data safely
  let prospects: any[] = [];
  let inboxItems: any[] = [];
  let pendingApprovals: any[] = [];

  try {
    const pRes = await runSalesApi('list-prospects', {}, wsId);
    prospects = Array.isArray(pRes) ? pRes : (pRes.prospects || []);
  } catch {}

  try {
    const inbRes = await runSalesApi('inbox-list', {}, wsId);
    inboxItems = Array.isArray(inbRes) ? inbRes : (inbRes.items || inbRes.actions || []);
  } catch {}

  try {
    const appRes = await runSalesApi('list-pending', {}, wsId);
    pendingApprovals = Array.isArray(appRes) ? appRes : (appRes.approvals || []);
  } catch {}

  // Filter opportunities & trends strictly for the current persona to prevent cross-contamination
  const userPillars = (profile.contentPillars || []).map((p) => p.toLowerCase());
  const userAudience = (profile.audience || '').toLowerCase();

  const relevantOpps = sharedOpps.filter((opp) => {
    const text = `${opp.suggestedTopic} ${opp.targetAudience} ${opp.originContext}`.toLowerCase();
    return userPillars.some((p) => text.includes(p)) || (userAudience && text.includes(userAudience.split(',')[0].trim()));
  });

  const relevantTrends = (research.trends || []).filter((trend) => {
    const text = `${trend.title} ${trend.summary || ''}`.toLowerCase();
    return userPillars.some((p) => text.includes(p));
  });

  // Calculate actual signal counts
  const trendsCount = relevantTrends.length;
  const oppsCount = relevantOpps.length + trendsCount;
  const prospectsWithSignals = prospects.filter(p => p.buying_signals && p.buying_signals.length > 0).length;
  const followupsDue = inboxItems.filter(i => i.is_followup_due || i.type === 'FOLLOW_UP').length;
  const attentionItems = inboxItems.filter(i => i.status === 'PENDING' || !i.replied).length;
  const readyExperiments = experiments.filter(e => e.status === 'RUNNING' || e.status === 'PROPOSED').length;

  // Determine today's content recommendation
  const topOpp = relevantOpps[0];
  const topTrend = relevantTrends[0];
  const primaryPillar = profile.contentPillars?.[0] || 'Technical Architecture';

  const contentRec = topOpp
    ? {
        topic: topOpp.suggestedTopic,
        targetAudience: topOpp.targetAudience,
        recommendedFormat: topOpp.recommendedFormat,
        businessObjective: topOpp.businessObjective,
        rationale: `Directly answers frequent customer pain: "${topOpp.originContext}"`,
        originSource: 'CRM & Sales Intelligence',
      }
    : topTrend
    ? {
        topic: topTrend.title,
        targetAudience: profile.audience || 'Target Decision Makers',
        recommendedFormat: determineFormatForTopic(topTrend.title, topTrend.summary),
        businessObjective: 'AUTHORITY',
        rationale: `Emerging industry discussion across ${topTrend.sources?.length || 1} verified sources`,
        originSource: 'Web Trend Intelligence',
      }
    : {
        topic: `Key trade-offs and operational lessons in ${primaryPillar}`,
        targetAudience: profile.audience || 'Industry Peers',
        recommendedFormat: determineFormatForTopic(primaryPillar),
        businessObjective: 'AUTHORITY',
        rationale: `Derived from your primary content pillar "${primaryPillar}" and audience context.`,
        originSource: 'Voice Profile Knowledge Graph',
      };

  // Determine top prospect honestly
  const topProspect = prospects.find(p => p.buying_signals && p.buying_signals.length > 0) || prospects[0];

  const salesFocus = topProspect
    ? {
        topProspectName: topProspect.name || 'Key Prospect',
        company: topProspect.company || 'Growth Target',
        signalType: topProspect.buying_signals?.[0]?.type || 'ICP Role Match',
        whyContactNow: topProspect.buying_signals?.[0]?.description || 'Matches primary target criteria with high buying relevance.',
        suggestedAngle: 'Low-pressure observation referencing recent public signal.',
      }
    : {
        topProspectName: 'No active prospects',
        company: 'Pipeline Empty',
        signalType: 'DISCOVERY_REQUIRED',
        whyContactNow: 'No prospects in current workspace pipeline. Discover target accounts matching your ICP in Leads.',
        suggestedAngle: 'Add target accounts in Leads to initiate qualification and outreach drafting.',
      };

  // Priority focus rule
  let recommendedFocus: DailyGrowthBriefing['recommendedFocus'];
  if (attentionItems > 0) {
    recommendedFocus = {
      headline: `${attentionItems} inbound conversation${attentionItems > 1 ? 's' : ''} require attention`,
      whyNow: 'Timely responses within business hours yield the highest conversion into qualified meetings.',
      actionType: 'REPLY_INBOX',
      targetActionUrl: '/inbox',
    };
  } else if (pendingApprovals.length > 0) {
    recommendedFocus = {
      headline: `${pendingApprovals.length} vetted outreach draft${pendingApprovals.length > 1 ? 's' : ''} ready for review`,
      whyNow: 'Human review guarantees zero unvetted messages leave your account.',
      actionType: 'REACH_OUT_PROSPECT',
      targetActionUrl: '/pipeline',
    };
  } else {
    recommendedFocus = {
      headline: `Publish authoritative content on: "${contentRec.topic.slice(0, 50)}..."`,
      whyNow: 'Consistent, evidence-grounded content creates the inbound attention that powers your sales loop.',
      actionType: 'PUBLISH_CONTENT',
      targetActionUrl: '/content',
    };
  }

  return {
    greeting,
    generatedAt: new Date().toISOString(),
    automationMode: 'ASSISTED', // Safe default: Assisted mode (human reviews external actions)
    metrics: {
      newIndustrySignals: trendsCount,
      contentOpportunities: oppsCount,
      prospectsWithSignals,
      followupsDue,
      conversationsNeedingAttention: attentionItems,
      experimentsReady: readyExperiments,
    },
    recommendedFocus,
    todayContentRecommendation: contentRec,
    todaySalesFocus: salesFocus,
    recentLearnings: learningStore.memory.successfulPatterns.slice(0, 3),
  };
}
