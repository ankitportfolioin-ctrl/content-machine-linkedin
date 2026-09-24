import fs from 'fs';
import path from 'path';
import { resolveDataDir, VoiceProfile, getVoiceProfile } from './voiceProfileService';
import { ContentFormat, ContentType, VisualType, ContentStrategy } from './contentStrategyEngine';

// ============================================================================
// DOMAIN MODELS & TYPES
// ============================================================================

export type MetricProvenance = 
  | 'VERIFIED_PLATFORM_DATA' 
  | 'VERIFIED_INTERNAL_DATA' 
  | 'USER_ENTERED' 
  | 'ESTIMATED' 
  | 'UNAVAILABLE';

export interface ContentMemory {
  recentTopics: string[];
  recentHooks: string[];
  recentNarratives: string[];
  recentFormats: ContentFormat[];
  recentVisualTypes: VisualType[];
  recentCTAs: string[];
  successfulPatterns: string[];
  weakPatterns: string[];
}

export interface UserEditRecord {
  id: string;
  contentId: string;
  originalText: string;
  editedText: string;
  timestamp: string;
  differences: {
    originalLength: number;
    editedLength: number;
    lengthDeltaPercent: number;
    removedPhrases: string[];
    addedPhrases: string[];
    sentenceCountBefore: number;
    sentenceCountAfter: number;
    detectedStyleShift: string;
  };
  observedPreferences: string[];
  approvedByUser: boolean;
}

export type FeedbackType =
  | 'useful'
  | 'not_useful'
  | 'rewrite'
  | 'change_angle'
  | 'change_format'
  | 'simpler'
  | 'deeper'
  | 'more_personal'
  | 'more_technical'
  | 'more_opinionated'
  | 'remove_fluff';

export interface UserFeedbackRecord {
  id: string;
  contentId: string;
  feedbackType: FeedbackType;
  topic?: string;
  format?: ContentFormat;
  hook?: string;
  notes?: string;
  timestamp: string;
}

export interface SalesLearningRecord {
  id: string;
  topicOrPillar: string;
  icpSegment: string;
  signalType: string;
  conversionStageReached: string;
  keyObjection?: string;
  effectiveAngle?: string;
  insight: string;
  timestamp: string;
}

export interface SharedContentOpportunity {
  id: string;
  sourceType: 'SALES_OBJECTION' | 'CUSTOMER_QUESTION' | 'PROSPECT_PAIN' | 'CONTENT_ENGAGEMENT' | 'TREND_SIGNAL';
  originContext: string;
  suggestedTopic: string;
  suggestedAngle?: string;
  targetAudience: string;
  businessObjective: 'AWARENESS' | 'AUTHORITY' | 'EDUCATION' | 'TRUST' | 'LEAD_GENERATION' | 'CONVERSATION';
  recommendedFormat: ContentFormat;
  recommendedContentType?: ContentType;
  urgency?: 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt: string;
}

export interface ExperimentVariant {
  id: string;
  label: string;
  format?: ContentFormat;
  hookStrategy?: string;
  narrativeAngle?: string;
  ctaType?: string;
  draftText?: string;
  provenance?: MetricProvenance;
  impressions?: number;
  reactions?: number;
  comments?: number;
  qualifiedLeads?: number;
}

export interface GrowthExperiment {
  id: string;
  name: string;
  hypothesis: string;
  topic: string;
  variable: 'FORMAT' | 'HOOK' | 'NARRATIVE' | 'AUDIENCE' | 'CTA';
  variants: ExperimentVariant[];
  status: 'PROPOSED' | 'RUNNING' | 'CONCLUDED';
  winningVariantId?: string;
  concludedAt?: string;
  learningTakeaway?: string;
}

export interface KnowledgeGraphNode {
  id: string;
  type: 'SOURCE' | 'TOPIC' | 'AUDIENCE' | 'PILLAR' | 'CONTENT' | 'FORMAT' | 'ENGAGEMENT' | 'PROSPECT' | 'PAIN' | 'SIGNAL' | 'CONVERSATION' | 'OPPORTUNITY';
  label: string;
  metadata: Record<string, any>;
}

export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  relationship: string;
  weight: number;
}

export interface LearningStore {
  personaFingerprint?: string;
  memory: ContentMemory;
  edits: UserEditRecord[];
  feedback: UserFeedbackRecord[];
  salesLearnings: SalesLearningRecord[];
  sharedOpportunities: SharedContentOpportunity[];
  experiments: GrowthExperiment[];
  graphNodes: KnowledgeGraphNode[];
  graphEdges: KnowledgeGraphEdge[];
  updatedAt: string;
}

// ============================================================================
// STORAGE & PERSISTENCE
// ============================================================================

function getLearningFilePath(workspaceId?: string): string {
  const dir = resolveDataDir(workspaceId);
  return path.join(dir, 'learning-system.json');
}

export function getPersonaFingerprint(profile?: VoiceProfile): string {
  if (!profile || !profile.role) return 'unconfigured';
  const role = (profile.role || '').toLowerCase().trim();
  const audience = (profile.audience || '').toLowerCase().trim();
  const pillars = (profile.contentPillars || []).map((p) => p.toLowerCase().trim()).sort().join(',');
  return `${role}:::${audience}:::${pillars}`;
}

export function getDefaultLearningStore(profile?: VoiceProfile): LearningStore {
  const fingerprint = getPersonaFingerprint(profile);
  const isTech = fingerprint.includes('tech') || fingerprint.includes('developer') || fingerprint.includes('software') || fingerprint.includes('engineer') || fingerprint.includes('educator');
  const isD2C = fingerprint.includes('d2c') || fingerprint.includes('retail') || fingerprint.includes('commerce');
  const isUnconfigured = fingerprint === 'unconfigured';

  let successfulPatterns: string[] = [];
  let weakPatterns: string[] = [];

  if (isUnconfigured) {
    successfulPatterns = [];
    weakPatterns = [];
  } else if (isD2C) {
    successfulPatterns = [
      'Unit economics and margin preservation breakdowns receive high engagement from retail operators',
      'Direct observations on inventory turnover and supply chain friction provoke discussion',
      'Realistic customer acquisition trade-offs outperform generic branding platitudes'
    ];
    weakPatterns = [
      'Generic e-commerce hype without concrete margin numbers degrades founder credibility',
      'Vague advice on "omnichannel scaling" without channel-specific cost structures',
      'Over-promising customer retention without factoring return rates'
    ];
  } else if (isTech) {
    successfulPatterns = [
      'Architecture breakdowns with trade-off tables outperform generic checklists',
      'Direct concrete examples without buzzwords receive higher comment quality',
      'Framing contrarian lessons around operational bottlenecks generates qualified conversations'
    ];
    weakPatterns = [
      'Generic motivational intros ("In today\'s fast-paced world...") result in low dwell time',
      'Over-hyped titles without grounded source proof provoke negative reactions',
      'Forcing step-by-step numbers onto simple observations degrades authority'
    ];
  } else {
    successfulPatterns = [
      'Direct practical observations with concrete trade-offs outperform high-level platitudes',
      'Grounding every claim in observable workflow facts generates higher authority'
    ];
    weakPatterns = [
      'Generic opening hooks without clear tension or relevance',
      'Vague advice without actionable recommendations'
    ];
  }

  return {
    personaFingerprint: fingerprint,
    memory: {
      recentTopics: [],
      recentHooks: [],
      recentNarratives: [],
      recentFormats: [],
      recentVisualTypes: [],
      recentCTAs: [],
      successfulPatterns,
      weakPatterns,
    },
    edits: [],
    feedback: [],
    salesLearnings: [],
    sharedOpportunities: [],
    experiments: [],
    graphNodes: [],
    graphEdges: [],
    updatedAt: new Date().toISOString(),
  };
}

export function getLearningStore(workspaceId?: string): LearningStore {
  const profile = getVoiceProfile(workspaceId);
  const currentFingerprint = getPersonaFingerprint(profile);
  const file = getLearningFilePath(workspaceId);

  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8').trim();
      if (raw.length > 0) {
        const parsed = JSON.parse(raw);
        // Persona Isolation: if the stored learning belongs to a different persona, isolate it!
        if (parsed.personaFingerprint && parsed.personaFingerprint !== currentFingerprint && currentFingerprint !== 'unconfigured') {
          console.log(`[LearningEngine] Persona switch detected (${parsed.personaFingerprint} -> ${currentFingerprint}). Resetting learning context to prevent contamination.`);
          const freshStore = getDefaultLearningStore(profile);
          saveLearningStore(freshStore, workspaceId);
          return freshStore;
        }

        const defaultStore = getDefaultLearningStore(profile);

        // Clean any legacy contaminated or fake items that might have been saved in older runs
        const sanitizedStore: LearningStore = {
          personaFingerprint: currentFingerprint,
          memory: {
            recentTopics: parsed.memory?.recentTopics || [],
            recentHooks: parsed.memory?.recentHooks || [],
            recentNarratives: parsed.memory?.recentNarratives || [],
            recentFormats: parsed.memory?.recentFormats || [],
            recentVisualTypes: parsed.memory?.recentVisualTypes || [],
            recentCTAs: parsed.memory?.recentCTAs || [],
            successfulPatterns: (parsed.memory?.successfulPatterns && parsed.memory.successfulPatterns.length > 0)
              ? parsed.memory.successfulPatterns
              : defaultStore.memory.successfulPatterns,
            weakPatterns: (parsed.memory?.weakPatterns && parsed.memory.weakPatterns.length > 0)
              ? parsed.memory.weakPatterns
              : defaultStore.memory.weakPatterns,
          },
          edits: parsed.edits || [],
          feedback: parsed.feedback || [],
          salesLearnings: (parsed.salesLearnings || []).filter((sl: any) => {
            // Drop legacy D2C demo items if user is not in D2C
            if (currentFingerprint.includes('tech') && (sl.icpSegment?.toLowerCase().includes('d2c') || sl.topicOrPillar?.toLowerCase().includes('support'))) return false;
            if (currentFingerprint.includes('d2c') && sl.icpSegment?.toLowerCase().includes('engineer')) return false;
            return true;
          }),
          sharedOpportunities: (parsed.sharedOpportunities || []).filter((so: any) => {
            // Drop legacy demo tickets
            if (so.id === 'opp-001' || so.id === 'opp-002') return false;
            if (currentFingerprint.includes('tech') && (so.targetAudience?.toLowerCase().includes('d2c') || so.suggestedTopic?.toLowerCase().includes('seasonal surges'))) return false;
            if (currentFingerprint.includes('d2c') && so.targetAudience?.toLowerCase().includes('engineer')) return false;
            return true;
          }),
          experiments: (parsed.experiments || []).filter((exp: any) => exp.id !== 'exp-001').map((exp: any) => ({
            ...exp,
            variants: (exp.variants || []).map((v: any) => ({
              ...v,
              provenance: v.provenance || 'UNAVAILABLE',
            })),
          })),
          graphNodes: (parsed.graphNodes || []).filter((n: any) => {
            if (currentFingerprint.includes('tech') && (n.id?.includes('whatsapp') || n.id?.includes('d2c') || n.id?.includes('ticket_backlog'))) return false;
            return true;
          }),
          graphEdges: (parsed.graphEdges || []).filter((e: any) => {
            if (currentFingerprint.includes('tech') && (e.from?.includes('whatsapp') || e.to?.includes('d2c'))) return false;
            return true;
          }),
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };

        return sanitizedStore;
      }
    }
  } catch (err) {
    console.warn(`Could not read learning file for [${workspaceId || 'default'}]:`, err);
  }

  const defaultStore = getDefaultLearningStore(profile);
  saveLearningStore(defaultStore, workspaceId);
  return defaultStore;
}

export function saveLearningStore(store: LearningStore, workspaceId?: string): void {
  const file = getLearningFilePath(workspaceId);
  const dir = path.dirname(file);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    store.updatedAt = new Date().toISOString();
    const tempFile = `${file}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tempFile, file);
  } catch (err) {
    console.error(`Failed to save learning store for [${workspaceId || 'default'}]:`, err);
  }
}

// ============================================================================
// CONTENT MEMORY & REPETITION DETECTION
// ============================================================================

export interface RepetitionCheckResult {
  isRepeated: boolean;
  confidence: number;
  repetitionReason?: string;
  matchedItem?: string;
  dimension: 'TOPIC' | 'HOOK' | 'FORMAT' | 'CTA' | 'NONE';
}

export function checkContentRepetition(
  params: {
    topic: string;
    hook?: string;
    format?: ContentFormat;
    cta?: string;
  },
  workspaceId?: string
): RepetitionCheckResult {
  const store = getLearningStore(workspaceId);
  const { recentTopics, recentHooks, recentFormats, recentCTAs } = store.memory;

  // 1. Topic repetition check (exact or fuzzy normalized)
  const normTopic = params.topic.toLowerCase().trim();
  for (const prev of recentTopics.slice(-5)) {
    const normPrev = prev.toLowerCase().trim();
    if (normTopic === normPrev) {
      return {
        isRepeated: true,
        confidence: 0.95,
        dimension: 'TOPIC',
        repetitionReason: `Topic was already published recently: "${prev}". Vary the angle or choose an adjacent subject.`,
        matchedItem: prev,
      };
    }
  }

  // 2. Hook repetition check
  if (params.hook) {
    const normHook = params.hook.toLowerCase().trim();
    for (const prevHook of recentHooks.slice(-7)) {
      const normPrevHook = prevHook.toLowerCase().trim();
      if (normHook === normPrevHook || (normHook.length > 25 && normPrevHook.includes(normHook.slice(0, 30)))) {
        return {
          isRepeated: true,
          confidence: 0.9,
          dimension: 'HOOK',
          repetitionReason: `Opening hook is identical or overly similar to a recent post. Craft a fresh, subject-derived opening.`,
          matchedItem: prevHook,
        };
      }
    }
  }

  // 3. Excessive Format repetition warning (e.g. 4 identical formats in a row)
  if (params.format && recentFormats.length >= 4) {
    const last4 = recentFormats.slice(-4);
    if (last4.every(f => f === params.format)) {
      return {
        isRepeated: false, // Not a hard blocker, but high warning
        confidence: 0.7,
        dimension: 'FORMAT',
        repetitionReason: `Format "${params.format}" has been used 4 times in a row. Consider diversifying format portfolio (e.g. Carousel, Text + Diagram).`,
        matchedItem: params.format,
      };
    }
  }

  return {
    isRepeated: false,
    confidence: 0.1,
    dimension: 'NONE',
  };
}

export function recordPublishedContent(
  publication: {
    contentId: string;
    topic: string;
    hook?: string;
    format: ContentFormat;
    visualType?: VisualType;
    cta?: string;
    strategyId?: string;
    metrics?: Record<string, any>;
  },
  workspaceId?: string
): void {
  const store = getLearningStore(workspaceId);
  const mem = store.memory;

  // Keep sliding window of recent items (max 20)
  if (publication.topic && !mem.recentTopics.includes(publication.topic)) {
    mem.recentTopics.push(publication.topic);
    if (mem.recentTopics.length > 20) mem.recentTopics.shift();
  }

  if (publication.hook && !mem.recentHooks.includes(publication.hook)) {
    mem.recentHooks.push(publication.hook);
    if (mem.recentHooks.length > 25) mem.recentHooks.shift();
  }

  mem.recentFormats.push(publication.format);
  if (mem.recentFormats.length > 20) mem.recentFormats.shift();

  if (publication.visualType) {
    mem.recentVisualTypes.push(publication.visualType);
    if (mem.recentVisualTypes.length > 20) mem.recentVisualTypes.shift();
  }

  if (publication.cta && !mem.recentCTAs.includes(publication.cta)) {
    mem.recentCTAs.push(publication.cta);
    if (mem.recentCTAs.length > 20) mem.recentCTAs.shift();
  }

  saveLearningStore(store, workspaceId);
}

// ============================================================================
// LEARNING FROM USER EDITS & FEEDBACK
// ============================================================================

export function analyzeAndRecordUserEdit(
  originalText: string,
  editedText: string,
  contentId: string,
  workspaceId?: string
): UserEditRecord {
  const origTrimmed = originalText.trim();
  const editTrimmed = editedText.trim();

  const origSentences = origTrimmed.split(/(?<=[.?!])\s+/).filter(Boolean);
  const editSentences = editTrimmed.split(/(?<=[.?!])\s+/).filter(Boolean);

  const lengthDeltaPercent = origTrimmed.length > 0
    ? Math.round(((editTrimmed.length - origTrimmed.length) / origTrimmed.length) * 100)
    : 0;

  // Detect removed and added words/phrases
  const origWords = new Set(origTrimmed.toLowerCase().split(/\s+/));
  const editWords = new Set(editTrimmed.toLowerCase().split(/\s+/));

  const removedPhrases: string[] = [];
  const addedPhrases: string[] = [];

  for (const w of origWords) {
    if (!editWords.has(w) && w.length > 4) {
      removedPhrases.push(w);
    }
  }

  for (const w of editWords) {
    if (!origWords.has(w) && w.length > 4) {
      addedPhrases.push(w);
    }
  }

  // Derive observed stylistic preferences
  const observedPreferences: string[] = [];
  let detectedStyleShift = 'Minor refinement';

  if (lengthDeltaPercent <= -20) {
    observedPreferences.push('Prefers punchier, tighter prose with fewer transitional sentences.');
    detectedStyleShift = 'Tightened & condensed';
  } else if (lengthDeltaPercent >= 20) {
    observedPreferences.push('Prefers deeper context, additional technical nuances, or richer examples.');
    detectedStyleShift = 'Expanded with detail';
  }

  if (editSentences.length > origSentences.length && lengthDeltaPercent < 0) {
    observedPreferences.push('Prefers shorter sentence rhythm with frequent line-breaks.');
  }

  // Check if fluff/buzzwords were pruned
  const commonFluff = ['supercharge', 'tapestry', 'synergy', 'game-changer', 'delve', 'moreover', 'testament'];
  const prunedFluff = removedPhrases.filter(w => commonFluff.includes(w));
  if (prunedFluff.length > 0) {
    observedPreferences.push(`Strong aversion to buzzwords: prune terms like ${prunedFluff.join(', ')}.`);
  }

  const record: UserEditRecord = {
    id: `edit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    contentId,
    originalText: origTrimmed,
    editedText: editTrimmed,
    timestamp: new Date().toISOString(),
    differences: {
      originalLength: origTrimmed.length,
      editedLength: editTrimmed.length,
      lengthDeltaPercent,
      removedPhrases: removedPhrases.slice(0, 10),
      addedPhrases: addedPhrases.slice(0, 10),
      sentenceCountBefore: origSentences.length,
      sentenceCountAfter: editSentences.length,
      detectedStyleShift,
    },
    observedPreferences,
    approvedByUser: false, // Requires user review before modifying voice profile
  };

  const store = getLearningStore(workspaceId);
  store.edits.unshift(record);
  if (store.edits.length > 50) store.edits.pop();
  saveLearningStore(store, workspaceId);

  return record;
}

export function recordUserFeedback(
  feedback: {
    contentId: string;
    feedbackType: FeedbackType;
    topic?: string;
    format?: ContentFormat;
    hook?: string;
    notes?: string;
  },
  workspaceId?: string
): UserFeedbackRecord {
  const record: UserFeedbackRecord = {
    id: `fb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...feedback,
    timestamp: new Date().toISOString(),
  };

  const store = getLearningStore(workspaceId);
  store.feedback.unshift(record);
  if (store.feedback.length > 100) store.feedback.pop();

  // Adjust learning patterns based on feedback
  if (feedback.feedbackType === 'useful' && feedback.hook) {
    const pattern = `Effective hook approach: "${feedback.hook.slice(0, 70)}..."`;
    if (!store.memory.successfulPatterns.includes(pattern)) {
      store.memory.successfulPatterns.unshift(pattern);
      if (store.memory.successfulPatterns.length > 20) store.memory.successfulPatterns.pop();
    }
  } else if (feedback.feedbackType === 'not_useful' || feedback.feedbackType === 'remove_fluff') {
    const pattern = `Ineffective or overly generic framing for topic: "${feedback.topic || 'General'}"`;
    if (!store.memory.weakPatterns.includes(pattern)) {
      store.memory.weakPatterns.unshift(pattern);
      if (store.memory.weakPatterns.length > 20) store.memory.weakPatterns.pop();
    }
  }

  saveLearningStore(store, workspaceId);
  return record;
}

// ============================================================================
// SHARED INTELLIGENCE: SALES <-> CONTENT LOOPS
// ============================================================================

/**
 * Derives content opportunities from real sales conversations, objections, and CRM data.
 */
export function deriveContentOpportunitiesFromSales(workspaceId?: string): SharedContentOpportunity[] {
  const store = getLearningStore(workspaceId);
  return store.sharedOpportunities;
}

export function addSharedContentOpportunity(
  opp: Omit<SharedContentOpportunity, 'id' | 'createdAt'>,
  workspaceId?: string
): SharedContentOpportunity {
  const store = getLearningStore(workspaceId);
  const newOpp: SharedContentOpportunity = {
    id: `opp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...opp,
    createdAt: new Date().toISOString(),
  };
  store.sharedOpportunities.unshift(newOpp);
  if (store.sharedOpportunities.length > 30) store.sharedOpportunities.pop();
  saveLearningStore(store, workspaceId);
  return newOpp;
}

// ============================================================================
// EXPERIMENTATION ENGINE
// ============================================================================

export function listGrowthExperiments(workspaceId?: string): GrowthExperiment[] {
  const store = getLearningStore(workspaceId);
  return store.experiments;
}

export function createGrowthExperiment(
  exp: Omit<GrowthExperiment, 'id' | 'status'>,
  workspaceId?: string
): GrowthExperiment {
  const store = getLearningStore(workspaceId);
  const newExp: GrowthExperiment = {
    id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...exp,
    status: 'PROPOSED',
  };
  store.experiments.unshift(newExp);
  saveLearningStore(store, workspaceId);
  return newExp;
}

export function concludeGrowthExperiment(
  experimentId: string,
  winningVariantId: string,
  learningTakeaway: string,
  workspaceId?: string
): GrowthExperiment | null {
  const store = getLearningStore(workspaceId);
  const exp = store.experiments.find(e => e.id === experimentId);
  if (!exp) return null;

  exp.status = 'CONCLUDED';
  exp.winningVariantId = winningVariantId;
  exp.concludedAt = new Date().toISOString();
  exp.learningTakeaway = learningTakeaway;

  // Add learning to verified principles
  if (learningTakeaway && !store.memory.successfulPatterns.includes(learningTakeaway)) {
    store.memory.successfulPatterns.unshift(learningTakeaway);
  }

  saveLearningStore(store, workspaceId);
  return exp;
}
