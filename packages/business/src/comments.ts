import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const CommentClassifySchema = z.object({
  contentVersionId: z.string().uuid().optional(),
  platform: z.string().max(50).default('linkedin'),
  authorName: z.string().max(100).optional(),
  authorUrl: z.string().max(2048).optional(),
  text: z.string().min(1).max(5000),
  externalId: z.string().max(200).optional(),
  postedAt: z.string().datetime({ offset: true }).optional(),
});

export type CommentInput = z.infer<typeof CommentClassifySchema>;

export type CommentKind = 'QUESTION' | 'REQUEST' | 'PRAISE' | 'CRITICISM' | 'DISAGREEMENT' | 'TECHNICAL_QUESTION' | 'LEAD_SIGNAL' | 'SPAM' | 'CONVERSATION';

export function classifyComment(text: string): { type: CommentKind; isQuestion: boolean; isRequest: boolean; isLeadSignal: boolean; sentiment: string } {
  const t = text.toLowerCase();
  const isQuestion = /\?/.test(text) || /^(how|what|why|when|where|which|can you|could you)\b/.test(t);
  const isRequest =
    /please (show|share|explain|build|make|post)|can you show|tutorial|walkthrough|example|template|guide/.test(t);
  const isLeadSignal = /price|pricing|cost|buy|purchase|dm|message me|call|demo|client|hire|freelance|interested|sign ?up/.test(t);
  const isSpam = /(crypto|casino|buy followers|free money|click here|!!!{3,})/.test(t);
  const technical = /(error|bug|code|api|typescript|python|react|github|docker|sql|agent|prompt|rag)\b/.test(t);

  let type: CommentKind = 'CONVERSATION';
  if (isSpam) type = 'SPAM';
  else if (isLeadSignal) type = 'LEAD_SIGNAL';
  else if (isRequest && technical) type = 'TECHNICAL_QUESTION';
  else if (isRequest) type = 'REQUEST';
  else if (isQuestion && technical) type = 'TECHNICAL_QUESTION';
  else if (isQuestion) type = 'QUESTION';
  else if (/thank|great|love|awesome|helpful|insightful/.test(t)) type = 'PRAISE';
  else if (/disagree|wrong|actually|not true|myth/.test(t)) type = 'DISAGREEMENT';
  else if (/bad|terrible|worst|hate/.test(t)) type = 'CRITICISM';

  const sentiment = type === 'PRAISE' ? 'positive' : type === 'CRITICISM' || type === 'DISAGREEMENT' || type === 'SPAM' ? 'negative' : 'neutral';
  return { type, isQuestion, isRequest, isLeadSignal, sentiment };
}

export function suggestResponse(type: CommentKind, text: string): string {
  switch (type) {
    case 'QUESTION':
    case 'TECHNICAL_QUESTION':
      return `Thanks for asking — "${text.slice(0, 80)}". Here's the short answer, plus what we'd test next: ... (human: fill specifics, no invented facts).`;
    case 'REQUEST':
      return 'Noted — many readers want implementation, not just explanation. We logged this as an audience signal for a follow-up tutorial.';
    case 'LEAD_SIGNAL':
      return 'Thanks for your interest — happy to share details. What outcome are you trying to reach? (human: reply personally, no hard sell).';
    case 'PRAISE':
      return 'Thank you! What should we break down next?';
    case 'DISAGREEMENT':
    case 'CRITICISM':
      return 'Fair point — can you share what you saw? We want to correct or sharpen this.';
    case 'SPAM':
      return '';
    default:
      return 'Thanks for joining the discussion — what part resonated most?';
  }
}

/**
 * Batch 2 (F): COMMENT -> classification -> audience signal -> sales
 * intelligence bridge. Every step preserves provenance back to the exact
 * comment. A LEAD_SIGNAL comment may produce a sales intelligence signal
 * for HUMAN REVIEW — never an automatic prospect, outreach, conversation,
 * or revenue record.
 */
const COMMENT_AUDIENCE_SIGNALS: Record<string, { signalType: string; insight: string; strength: number }> = {
  QUESTION: { signalType: 'COMMENT_QUESTION', insight: 'Audience is asking questions — topic needs clearer explanation.', strength: 0.7 },
  REQUEST: { signalType: 'COMMENT_REQUEST', insight: 'Audience wants implementation, not just explanation.', strength: 1.0 },
  TECHNICAL_QUESTION: { signalType: 'COMMENT_REQUEST', insight: 'Audience wants implementation, not just explanation.', strength: 1.0 },
  PRAISE: { signalType: 'COMMENT_PRAISE', insight: 'Audience resonates with this angle — consider doubling down.', strength: 0.6 },
  CRITICISM: { signalType: 'COMMENT_CRITICISM', insight: 'Audience pushes back — address the objection explicitly.', strength: 0.8 },
  DISAGREEMENT: { signalType: 'COMMENT_CRITICISM', insight: 'Audience pushes back — address the objection explicitly.', strength: 0.8 },
  LEAD_SIGNAL: { signalType: 'COMMENT_LEAD_SIGNAL', insight: 'A reader shows buying intent — flagged for human sales review.', strength: 0.9 },
};

interface CommentSalesSignalStore {
  commentSalesSignal: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    findMany(args: unknown): Promise<unknown[]>;
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
}

export class CommentBrainService {
  private prisma: PrismaClient;
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private signalStore(): CommentSalesSignalStore {
    // CommentSalesSignal rides on the Batch 2 migration; cast until
    // generated types refresh.
    return this.prisma as unknown as CommentSalesSignalStore;
  }

  async ingest(workspaceId: string, input: CommentInput) {
    const validated = CommentClassifySchema.parse(input);
    const c = classifyComment(validated.text);
    const created = await this.prisma.comment.create({
      data: {
        workspaceId,
        contentVersionId: validated.contentVersionId ?? null,
        platform: validated.platform,
        authorName: validated.authorName ?? null,
        authorUrl: validated.authorUrl ?? null,
        text: validated.text,
        externalId: validated.externalId ?? null,
        type: c.type as any,
        sentiment: c.sentiment,
        isQuestion: c.isQuestion,
        isRequest: c.isRequest,
        isLeadSignal: c.isLeadSignal,
        postedAt: validated.postedAt ? new Date(validated.postedAt) : new Date(),
      },
    });

    // Step 2: structured audience/business signal with provenance.
    let audienceInsight: string | null = null;
    let audienceSignalId: string | null = null;
    const mapping = COMMENT_AUDIENCE_SIGNALS[c.type];
    // SPAM and plain CONVERSATION carry no business signal.
    if (mapping) {
      audienceInsight = mapping.insight;
      const signal = await this.prisma.audienceSignal.create({
        data: {
          workspaceId,
          signalType: mapping.signalType,
          source: 'comments',
          description: `${c.type} signal from ${created.authorName ?? 'a reader'}: "${validated.text.slice(0, 200)}"`,
          evidence: { commentId: created.id, type: c.type, contentVersionId: created.contentVersionId },
          strength: mapping.strength,
        },
      });
      audienceSignalId = signal.id;
    }

    // Step 3-4: LEAD_SIGNAL -> sales intelligence signal (human review).
    // LEAD_SIGNAL is not a confirmed lead: no prospect, outreach,
    // conversation, or revenue record is created here.
    let salesSignalId: string | null = null;
    if (c.type === 'LEAD_SIGNAL' && audienceSignalId) {
      const sales = await this.signalStore().commentSalesSignal.create({
        data: {
          workspaceId,
          commentId: created.id,
          audienceSignalId,
          signalType: 'COMMENT_LEAD_SIGNAL',
          evidence: validated.text.slice(0, 2000),
          reason: `Sales signal created from a comment classified as LEAD_SIGNAL (comment ${created.id}). LEAD_SIGNAL is not a confirmed lead — human review required before any prospect or sales action.`,
          status: 'PENDING_REVIEW',
        },
      });
      salesSignalId = (sales as { id: string }).id;
    }

    return {
      comment: created,
      classification: c,
      suggestedResponse: suggestResponse(c.type, validated.text),
      audienceInsight,
      audienceSignalId,
      salesSignalId,
    };
  }

  async list(workspaceId: string, filter: { type?: string; contentVersionId?: string } = {}, take = 50) {
    return this.prisma.comment.findMany({
      where: {
        workspaceId,
        ...(filter.type ? { type: filter.type as any } : {}),
        ...(filter.contentVersionId ? { contentVersionId: filter.contentVersionId } : {}),
      },
      orderBy: { postedAt: 'desc' },
      take,
    });
  }

  /** Which sales intelligence signals came from this comment? */
  async salesSignalsForComment(workspaceId: string, commentId: string) {
    const comment = await this.prisma.comment.findFirst({ where: { id: commentId, workspaceId } });
    if (!comment) return [];
    return this.signalStore().commentSalesSignal.findMany({
      where: { workspaceId, commentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listSalesSignals(workspaceId: string, status?: string, take = 50) {
    return this.signalStore().commentSalesSignal.findMany({
      where: { workspaceId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, take)),
    });
  }

  /**
   * Human review of a sales signal. REVIEWED keeps the signal as reviewed
   * intelligence; DISMISSED drops it. Neither creates a prospect — that
   * stays a separate explicit human action with its own evidence.
   */
  async reviewSalesSignal(
    workspaceId: string,
    signalId: string,
    decision: 'REVIEWED' | 'DISMISSED',
    reviewerId?: string
  ) {
    const existing = await this.signalStore().commentSalesSignal.findFirst({
      where: { id: signalId, workspaceId },
    });
    if (!existing) {
      throw new Error('Sales signal not found in this workspace.');
    }
    return this.signalStore().commentSalesSignal.update({
      where: { id: signalId },
      data: {
        status: decision === 'REVIEWED' ? 'REVIEWED' : 'DISMISSED',
        reviewedBy: reviewerId ?? null,
        reviewedAt: new Date(),
      },
    });
  }
}
