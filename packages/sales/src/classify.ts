import { PrismaClient } from '@prisma/client';
import { AIProviderRegistry } from '@growth-operator/ai';
import { z } from 'zod';
import { SalesError } from './errors';
import { ConversationClassification, FollowUpRecommendation } from './types';

export const ClassificationSchema = z.object({
  classification: z.enum([
    'INTERESTED', 'NOT_INTERESTED', 'QUESTION', 'OBJECTION', 'NEEDS_INFO',
    'MEETING_REQUEST', 'POSITIVE', 'NEGATIVE', 'NEUTRAL', 'UNCLEAR',
  ]),
  confidence: z.number().min(0).max(1),
  evidence: z.string().max(2000),
  recommendedNextStep: z.string().max(1000),
});

const MEETING = /\b(meet|call|demo|calendar|schedule|zoom|teams|coffee|chat sometime)\b/i;
const QUESTION = /\?|^(what|how|why|when|where|which|who|can you|could you|do you|does it|is there)\b/i;
const OBJECTION = /\b(too expensive|not interested|no budget|already (use|have)|not a (fit|priority)|concern|worried|risky|doesn'?t work)\b/i;
const POSITIVE = /\b(thanks|thank you|great|love|awesome|interesting|helpful|excited|sounds good)\b/i;
const NEGATIVE = /\b(stop|unsubscribe|remove me|never contact|spam|annoying|leave me alone)\b/i;

export interface DeterministicClassification {
  classification: ConversationClassification;
  confidence: number;
  evidence: string;
  recommendedNextStep: string;
}

/**
 * Deterministic pre-classification. Ambiguous input yields UNCLEAR with low
 * confidence — meaning is never invented.
 */
export function classifyDeterministic(text: string): DeterministicClassification {
  const normalized = text.trim();
  if (!normalized) {
    return { classification: 'UNCLEAR', confidence: 0.2, evidence: 'Empty message body.', recommendedNextStep: 'Ask a clarifying question.' };
  }
  if (MEETING.test(normalized)) {
    return { classification: 'MEETING_REQUEST', confidence: 0.8, evidence: `Meeting language detected: "${normalized.slice(0, 120)}".`, recommendedNextStep: 'Propose two concrete times.' };
  }
  if (OBJECTION.test(normalized)) {
    return { classification: 'OBJECTION', confidence: 0.75, evidence: `Objection language detected: "${normalized.slice(0, 120)}".`, recommendedNextStep: 'Acknowledge the concern and ask what would change their mind.' };
  }
  if (NEGATIVE.test(normalized)) {
    const strong = /\b(stop|unsubscribe|remove me|never contact)\b/i.test(normalized);
    return {
      classification: strong ? 'NOT_INTERESTED' : 'NEGATIVE',
      confidence: strong ? 0.9 : 0.7,
      evidence: `Negative language detected: "${normalized.slice(0, 120)}".`,
      recommendedNextStep: strong ? 'Close out respectfully with no further follow-up.' : 'Acknowledge briefly and pause outreach.',
    };
  }
  if (QUESTION.test(normalized)) {
    return { classification: 'QUESTION', confidence: 0.7, evidence: `Question detected: "${normalized.slice(0, 120)}".`, recommendedNextStep: 'Answer the question directly with evidence.' };
  }
  if (POSITIVE.test(normalized)) {
    return { classification: 'POSITIVE', confidence: 0.65, evidence: `Positive language detected: "${normalized.slice(0, 120)}".`, recommendedNextStep: 'Build on the positive signal with a concrete next step.' };
  }
  return { classification: 'UNCLEAR', confidence: 0.3, evidence: 'No decisive signal words found.', recommendedNextStep: 'Ask a clarifying question.' };
}

export function recommendFollowUp(
  classification: ConversationClassification,
  input: { daysSinceLastMessage?: number; hasOpenQuestion?: boolean }
): { recommendation: FollowUpRecommendation; why: string; timing?: string } {
  switch (classification) {
    case 'MEETING_REQUEST':
      return { recommendation: 'RESPOND_TO_QUESTION', why: 'Meeting requested: respond promptly with times.', timing: 'Within 1 business day.' };
    case 'QUESTION':
    case 'NEEDS_INFO':
      return { recommendation: 'RESPOND_TO_QUESTION', why: 'Open question needs a direct, evidenced answer.', timing: 'Within 1 business day.' };
    case 'OBJECTION':
      return { recommendation: 'SEND_VALUE', why: 'Objection raised: respond with relevant evidence, not pressure.' };
    case 'INTERESTED':
    case 'POSITIVE':
      return { recommendation: 'MOVE_TO_OPPORTUNITY', why: 'Positive buying language observed; qualifies for pipeline review.', timing: 'After human confirmation.' };
    case 'NOT_INTERESTED':
      return { recommendation: 'CLOSE_OUT', why: 'Explicit disinterest; further outreach would be spam.' };
    case 'NEGATIVE':
      return { recommendation: 'NO_FOLLOW_UP', why: 'Negative sentiment; pause outreach.' };
    case 'NEUTRAL':
      return input.daysSinceLastMessage !== undefined && input.daysSinceLastMessage > 14
        ? { recommendation: 'FOLLOW_UP_LATER', why: 'Neutral thread dormant over 14 days; one light touch is acceptable.', timing: 'No sooner than 7 days from now.' }
        : { recommendation: 'NO_FOLLOW_UP', why: 'Neutral thread with no trigger for follow-up.' };
    default:
      return input.hasOpenQuestion
        ? { recommendation: 'ASK_CLARIFYING_QUESTION', why: 'Ambiguous thread with an open question.' }
        : { recommendation: 'NO_FOLLOW_UP', why: 'Ambiguous thread; no evidence supports follow-up.' };
  }
}

export class ClassificationService {
  private prisma: PrismaClient;
  private aiRegistry: AIProviderRegistry;

  constructor(prisma: PrismaClient, aiRegistry: AIProviderRegistry) {
    this.prisma = prisma;
    this.aiRegistry = aiRegistry;
  }

  async classifyConversation(workspaceId: string, conversationId: string, messageBody?: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
    if (!conversation) {
      throw new SalesError('INSUFFICIENT_DATA', 'Conversation not found in this workspace.');
    }
    let text = messageBody ?? '';
    if (!text) {
      const latest = await this.prisma.message.findFirst({
        where: { workspaceId, conversationId },
        orderBy: { sentAt: 'desc' },
      });
      text = latest?.body ?? '';
    }
    const deterministic = classifyDeterministic(text);
    const available = this.aiRegistry.getAvailable();
    let final = { ...deterministic };
    if (available.length > 0 && deterministic.classification === 'UNCLEAR') {
      try {
        const provider = available[0]!;
        const response = await provider.chatCompletion({
          messages: [
            { role: 'system', content: 'Classify this sales message. Use ONLY the message text. When ambiguous, return UNCLEAR with low confidence. Return only valid JSON: { classification, confidence, evidence, recommendedNextStep }.' },
            { role: 'user', content: `Message: ${text.slice(0, 2000)}` },
          ],
          model: 'gpt-4o-mini',
          temperature: 0.1,
          maxTokens: 500,
          responseFormat: { type: 'json_object' },
        });
        const content = response.choices[0]?.message?.content;
        if (content) {
          const parsed = ClassificationSchema.safeParse(JSON.parse(content));
          if (parsed.success && parsed.data.confidence >= 0.6) {
            final = { ...parsed.data };
          }
        }
      } catch {
        // AI failure falls back to the deterministic result; never fake.
      }
    }
    return this.prisma.conversationClassificationResult.create({
      data: {
        workspaceId,
        conversationId,
        classification: final.classification,
        confidence: final.confidence,
        evidence: final.evidence,
        recommendedNextStep: final.recommendedNextStep,
      },
    });
  }

  async recommendFollowUp(
    workspaceId: string,
    input: { conversationId?: string; leadId?: string }
  ) {
    if (!input.conversationId && !input.leadId) {
      throw new SalesError('INSUFFICIENT_DATA', 'Follow-up recommendations require a conversation or lead reference.');
    }
    let classification: ConversationClassification = 'UNCLEAR';
    let conversationId = input.conversationId ?? null;
    if (conversationId) {
      const conversation = await this.prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
      if (!conversation) {
        throw new SalesError('INSUFFICIENT_DATA', 'Conversation not found in this workspace.');
      }
      const latest = await this.prisma.conversationClassificationResult.findFirst({
        where: { workspaceId, conversationId },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) classification = latest.classification as ConversationClassification;
    } else if (input.leadId) {
      const lead = await this.prisma.lead.findFirst({ where: { id: input.leadId, workspaceId } });
      if (!lead) {
        throw new SalesError('INSUFFICIENT_DATA', 'Lead not found in this workspace.');
      }
    }
    const rec = recommendFollowUp(classification, {});
    return this.prisma.followUpRecommendation.create({
      data: {
        workspaceId,
        conversationId,
        leadId: input.leadId ?? null,
        recommendation: rec.recommendation,
        why: rec.why,
        evidence: `Based on classification ${classification}.`,
        risk: rec.recommendation === 'NO_FOLLOW_UP' || rec.recommendation === 'CLOSE_OUT'
          ? 'None: recommendation is to stop.'
          : 'Recommendation only: sending anything remains a human decision.',
        timing: rec.timing ?? null,
      },
    });
  }
}
