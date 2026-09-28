import { PrismaClient } from '@prisma/client';

export const CONTENT_STAGES = [
  'RESEARCH',
  'OPPORTUNITY',
  'IDEA',
  'ANGLE',
  'HOOK',
  'SCRIPT',
  'VISUAL_CONCEPT',
  'CAPTION',
  'HASHTAGS',
  'FACT_CHECK',
  'ORIGINALITY_CHECK',
  'QUALITY_CHECK',
  'HUMAN_APPROVAL',
  'PUBLISHING',
] as const;

export type ContentStageName = (typeof CONTENT_STAGES)[number];

const ORDER: Record<ContentStageName, number> = Object.fromEntries(
  CONTENT_STAGES.map((s, i) => [s, i]),
) as Record<ContentStageName, number>;

export function validateStageTransition(from: ContentStageName, to: ContentStageName): { valid: boolean; reason: string | null } {
  if (!(to in ORDER)) return { valid: false, reason: `Unknown stage: ${to}.` };
  if (!(from in ORDER)) return { valid: false, reason: `Unknown stage: ${from}.` };
  const diff = ORDER[to]! - ORDER[from]!;
  if (diff === 1) return { valid: true, reason: null };
  if (diff === 0) return { valid: false, reason: 'Already at this stage.' };
  if (diff < 0) {
    return { valid: true, reason: 'Backward transition allowed for rework; recorded in history.' };
  }
  return { valid: false, reason: `Cannot skip stages: ${from} -> ${to}. Advance one stage at a time.` };
}

export class ContentFactoryService {
  private prisma: PrismaClient;
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async advanceStage(workspaceId: string, dnaId: string, toStage: ContentStageName, actorId?: string, notes?: string) {
    const dna = await (this.prisma as any).contentDNA.findFirst({ where: { id: dnaId, workspaceId } });
    if (!dna) throw new Error('ContentDNA not found in this workspace.');
    const verdict = validateStageTransition(dna.stage as ContentStageName, toStage);
    if (!verdict.valid) throw new Error(verdict.reason ?? 'Invalid stage transition.');
    const updated = await (this.prisma as any).contentDNA.update({ where: { id: dnaId }, data: { stage: toStage } });
    await (this.prisma as any).contentStageHistory.create({
      data: { workspaceId, contentDNAId: dnaId, fromStage: dna.stage, toStage, actorId: actorId ?? null, notes: notes ?? verdict.reason ?? null },
    });
    return updated;
  }

  async history(workspaceId: string, dnaId: string) {
    return (this.prisma as any).contentStageHistory.findMany({
      where: { workspaceId, contentDNAId: dnaId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
