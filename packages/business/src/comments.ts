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

export class CommentBrainService {
  private prisma: PrismaClient;
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
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

    let audienceInsight: string | null = null;
    if (c.isRequest || c.type === 'TECHNICAL_QUESTION') {
      audienceInsight = 'Audience wants implementation, not just explanation.';
      await this.prisma.audienceSignal.create({
        data: {
          workspaceId,
          signalType: 'COMMENT_REQUEST',
          source: 'comments',
          description: `Request signal: "${validated.text.slice(0, 200)}"`,
          evidence: { commentId: created.id, type: c.type },
          strength: 1.0,
        },
      });
    }

    return { comment: created, classification: c, suggestedResponse: suggestResponse(c.type, validated.text), audienceInsight };
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
}
