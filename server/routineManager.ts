import { getRoutineLogs, scheduleLinkedInPost } from './publoraService';
import { generateAiPost } from './geminiService';
import { getVoiceProfile } from './voiceProfileService';
import { discoverLatestContent, formatDiscoveryContext, DiscoveredItem } from './discoveryService';

export const FOUNDER_ANGLE_SLUGS = [
  { slug: 'contrarian-architecture', code: 'A1', name: 'Contrarian Approach', tension: 'Why standard conventional playbooks fail in practice.' },
  { slug: 'concrete-cashflow', code: 'A2', name: 'Concrete Unit Economics', tension: 'Exact breakdown of revenue, churn, or margin metrics.' },
  { slug: 'dead-metric', code: 'A3', name: 'The Dead Metric', tension: 'A vanity metric everyone brags about that actually predicts failure.' },
  { slug: 'hiring-antipattern', code: 'A4', name: 'Hiring Anti-Pattern', tension: 'The interview technique or qualification that misled us.' },
  { slug: 'customer-discovery-friction', code: 'A5', name: 'Uncomfortable Customer Discovery', tension: 'What users actually do versus what they claim.' },
  { slug: 'tech-debt-payoff', code: 'A6', name: 'Operational Overhaul Payoff', tension: 'The simplification we postponed that proved simpler than expected.' },
  { slug: 'pricing-courage', code: 'A7', name: 'Pricing Courage', tension: 'Changing prices or packaging and observing what happened to retention.' },
  { slug: 'zero-meeting-cadence', code: 'A8', name: 'Zero-Meeting Cadence', tension: 'How removing recurring meetings changed delivery.' },
  { slug: 'first-million-scars', code: 'A9', name: 'The Early Scars', tension: 'The mistakes that cost time, money, or trust.' },
  { slug: 'unbundled-stack', code: 'A10', name: 'The Unbundled Stack', tension: 'The tools we removed and the workflow we kept.' },
];

export function getNextRoutineAngle() {
  const history = getRoutineLogs();
  const lastAngle = history[0]?.angle;
  const lastIndex = FOUNDER_ANGLE_SLUGS.findIndex(a => a.slug === lastAngle || a.code === lastAngle);
  const nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % FOUNDER_ANGLE_SLUGS.length;
  return { ...FOUNDER_ANGLE_SLUGS[nextIndex], pillarIndex: nextIndex };
}

function validatePost(post: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const trimmed = post.trim();
  if (!trimmed) return { valid: false, warnings: ['Generated post is empty.'] };
  if (trimmed.length > 3000) return { valid: false, warnings: [`Post is ${trimmed.length} characters; LinkedIn allows up to 3,000.`] };
  const firstLine = trimmed.split(/\r?\n/)[0] || '';
  if (firstLine.length > 210) warnings.push('Opening line is longer than the recommended mobile fold.');
  if (/^\s*https?:\/\//im.test(trimmed)) warnings.push('Post contains a URL; move sources to the first comment or source panel.');
  return { valid: true, warnings };
}

export async function runAutomatedDailyRoutine(params?: {
  topic?: string;
  pillar?: string;
  receipts?: string;
  dryRun?: boolean;
  scheduledTime?: string;
}) {
  const angle = getNextRoutineAngle();
  const profile = getVoiceProfile();
  const discovery = await discoverLatestContent({ pillars: profile.contentPillars, limit: 18 });
  const topItem: DiscoveredItem | undefined = discovery.items[0];
  const activePillar = params?.pillar || topItem?.matchedPillar || (profile.contentPillars && profile.contentPillars.length > 0 ? profile.contentPillars[angle.pillarIndex % profile.contentPillars.length] : (profile.role || 'Industry Insights'));
  const chosenTopic = params?.topic || topItem?.title || `Practical lessons on: ${activePillar}.`;
  const chosenReceipts = params?.receipts || (profile.keyReceipts && profile.keyReceipts.length > 0 ? profile.keyReceipts.slice(0, 2).join('; ') : 'Use a verified current source and one concrete operational observation.');
  const sourceContext = formatDiscoveryContext(discovery.items.filter(item => item.matchedPillar === activePillar || item === topItem), 5);
  const draftResult = await generateAiPost({ topic: chosenTopic, angleCode: angle.code, angleName: angle.name, receipts: chosenReceipts, sourceContext, voiceProfile: profile });
  const validation = validatePost(draftResult.post);
  if (!validation.valid) throw new Error(validation.warnings.join(' '));
  const scheduleResult = await scheduleLinkedInPost({
    content: draftResult.post,
    angle: angle.slug,
    scheduledTime: params?.scheduledTime,
    dryRun: params?.dryRun ?? (!process.env.PUBLORA_API_KEY),
    sources: discovery.items.slice(0, 5).map(item => item.url).concat([`pillar:${activePillar}`, 'latest-content-discovery']),
  });
  return {
    success: true,
    angle,
    pillar: activePillar,
    topic: chosenTopic,
    draft: draftResult.post,
    scheduledPost: draftResult.post,
    modelUsed: draftResult.modelUsed,
    validation,
    discovery: { fetchedAt: discovery.fetchedAt, sourcesChecked: discovery.sourcesChecked, warnings: discovery.warnings, items: discovery.items },
    scheduleResult,
  };
}
