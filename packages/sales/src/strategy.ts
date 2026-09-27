import { PrismaClient } from '@prisma/client';
import { SalesError } from './errors';
import { PersonalizationLevel, RelationshipStage } from './types';

const STAGES: RelationshipStage[] = ['COLD', 'AWARE', 'ENGAGED', 'CONVERSATION', 'OPPORTUNITY', 'CUSTOMER'];
const LEVELS: PersonalizationLevel[] = ['NONE', 'LIGHT', 'MODERATE', 'HIGH'];

export interface StrategyEvidence {
  statement: string;
  sourceRef?: string;
}

const FORBIDDEN_PERSONALIZATION = [
  /congrats on your recent funding/i,
  /i saw you (are|were) hiring/i,
  /i know you('| a)re struggling with/i,
  /noticed you (recently|just) raised/i,
  /love what you('| a)re doing at/i,
];

export function validatePersonalization(
  statements: string[],
  evidenceTexts: string[]
): { ok: true } | { ok: false; reason: string } {
  const evidence = evidenceTexts.join(' | ').toLowerCase();
  for (const statement of statements) {
    for (const pattern of FORBIDDEN_PERSONALIZATION) {
      if (pattern.test(statement)) {
        const grounded = evidenceTexts.some((e) => {
          const words = statement.toLowerCase().split(/\s+/).filter((w) => w.length > 4).slice(0, 6);
          return words.length > 0 && words.every((w) => e.toLowerCase().includes(w));
        });
        if (!grounded) {
          return { ok: false, reason: `Personalization requires evidence: "${statement.slice(0, 120)}" matches a high-risk template with no supporting evidence. Supply evidence or remove it.` };
        }
      }
    }
    void evidence;
  }
  return { ok: true };
}

export class OutreachStrategyService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createStrategy(input: {
    workspaceId: string;
    leadId?: string;
    briefId?: string;
    objective: string;
    audience: string;
    relationshipStage?: RelationshipStage;
    angle: string;
    reasonForContact: string;
    relevantEvidence?: StrategyEvidence[];
    personalizationLevel?: PersonalizationLevel;
    ctaType?: string;
    riskFlags?: string[];
    mustNotClaim?: string[];
    relevantContentId?: string;
    contentReason?: string;
    createdBy?: string;
  }) {
    if (input.leadId) {
      const lead = await this.prisma.lead.findFirst({ where: { id: input.leadId, workspaceId: input.workspaceId } });
      if (!lead) {
        throw new SalesError('INSUFFICIENT_DATA', 'Lead not found in this workspace.');
      }
    }
    let brief: { id: string } | null = null;
    if (input.briefId) {
      brief = await this.prisma.prospectBrief.findFirst({ where: { id: input.briefId, workspaceId: input.workspaceId } });
      if (!brief) {
        throw new SalesError('INSUFFICIENT_DATA', 'Prospect brief not found in this workspace.');
      }
    }
    if (!STAGES.includes(input.relationshipStage ?? 'COLD')) {
      throw new SalesError('EVIDENCE_MISSING', `Unknown relationship stage: ${input.relationshipStage}.`);
    }
    if (input.relationshipStage && input.relationshipStage !== 'COLD' && !brief && !input.leadId) {
      throw new SalesError('EVIDENCE_MISSING', 'Non-COLD relationship stages require a brief or lead reference. Do not assume a relationship exists.');
    }
    const level = input.personalizationLevel ?? 'LIGHT';
    if (!LEVELS.includes(level)) {
      throw new SalesError('EVIDENCE_MISSING', `Unknown personalization level: ${level}.`);
    }
    const evidenceCount = input.relevantEvidence?.length ?? 0;
    if (level === 'HIGH' && evidenceCount < 2) {
      throw new SalesError('INSUFFICIENT_DATA', 'HIGH personalization requires at least 2 evidence references. Use a lower level or supply evidence.');
    }
    if (level === 'MODERATE' && evidenceCount < 1) {
      throw new SalesError('INSUFFICIENT_DATA', 'MODERATE personalization requires at least 1 evidence reference.');
    }
    if (input.relevantContentId) {
      const idea = await this.prisma.contentIdea.findFirst({ where: { id: input.relevantContentId, workspaceId: input.workspaceId } });
      if (!idea) {
        throw new SalesError('INSUFFICIENT_DATA', 'Referenced content idea not found in this workspace. Do not fabricate content engagement.');
      }
    }
    return this.prisma.outreachStrategy.create({
      data: {
        workspaceId: input.workspaceId,
        leadId: input.leadId ?? null,
        briefId: brief?.id ?? input.briefId ?? null,
        objective: input.objective,
        audience: input.audience,
        relationshipStage: input.relationshipStage ?? 'COLD',
        angle: input.angle,
        reasonForContact: input.reasonForContact,
        relevantEvidence: (input.relevantEvidence ?? []) as object,
        personalizationLevel: level,
        ctaType: input.ctaType ?? null,
        riskFlags: input.riskFlags ?? [],
        mustNotClaim: input.mustNotClaim ?? [],
        relevantContentId: input.relevantContentId ?? null,
        contentReason: input.contentReason ?? null,
        status: 'DRAFT',
        createdBy: input.createdBy ?? null,
      },
    });
  }

  async approveStrategy(workspaceId: string, strategyId: string) {
    const strategy = await this.prisma.outreachStrategy.findFirst({ where: { id: strategyId, workspaceId } });
    if (!strategy) {
      throw new SalesError('INSUFFICIENT_DATA', 'Outreach strategy not found in this workspace.');
    }
    return this.prisma.outreachStrategy.update({ where: { id: strategyId }, data: { status: 'APPROVED' } });
  }
}
