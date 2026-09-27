import { PrismaClient } from '@prisma/client';
import { SourceUnderstanding } from './sourceUnderstanding';

export interface ClaimLedgerEntry {
  id: string;
  claimText: string;
  claimType: 'FACT' | 'OPINION' | 'PREDICTION' | 'RECOMMENDATION' | 'OBSERVATION' | 'STATISTIC';
  evidenceText: string;
  evidenceLocation: string | null;
  confidence: number;
  status: 'SUPPORTED' | 'CONTRADICTED' | 'UNCERTAIN';
  provenance: Record<string, unknown>;
}

export class ClaimLedgerService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async persistClaims(
    workspaceId: string,
    sourceId: string,
    documentId: string,
    understanding: SourceUnderstanding
  ): Promise<ClaimLedgerEntry[]> {
    const entries: ClaimLedgerEntry[] = [];

    for (const claim of understanding.claims) {
      const existingClaims = await this.prisma.sourceClaim.findMany({
        where: {
          workspaceId,
          sourceId,
          claimText: claim.text,
        },
      });

      let status: 'SUPPORTED' | 'CONTRADICTED' | 'UNCERTAIN' = 'UNCERTAIN';

      if (claim.confidence >= 0.7) {
        status = 'SUPPORTED';
      } else if (claim.confidence < 0.4) {
        status = 'UNCERTAIN';
      }

      const created = await this.prisma.sourceClaim.create({
        data: {
          workspaceId,
          sourceId,
          documentId,
          claimText: claim.text,
          claimType: claim.type,
          evidenceText: claim.evidence,
          evidenceLocation: claim.evidenceLocation || null,
          confidence: claim.confidence,
          status,
          provenance: {
            sourceUrl: '',
            extractedAt: new Date().toISOString(),
            evidence: claim.evidence,
            evidenceLocation: claim.evidenceLocation,
          },
        },
      });

      entries.push({
        id: created.id,
        claimText: created.claimText,
        claimType: created.claimType as any,
        evidenceText: created.evidenceText,
        evidenceLocation: created.evidenceLocation,
        confidence: created.confidence,
        status: created.status as any,
        provenance: created.provenance as Record<string, unknown>,
      });
    }

    return entries;
  }

  async detectContradictions(
    workspaceId: string,
    sourceId: string
  ): Promise<Array<{
    claim1: ClaimLedgerEntry;
    claim2: ClaimLedgerEntry;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }>> {
    const claims = await this.prisma.sourceClaim.findMany({
      where: {
        workspaceId,
        sourceId,
      },
    });

    const contradictions: Array<{
      claim1: ClaimLedgerEntry;
      claim2: ClaimLedgerEntry;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    }> = [];

    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const claim1 = claims[i];
        const claim2 = claims[j];

        if (this.areContradictory(claim1.claimText, claim2.claimText)) {
          const severity = this.assessSeverity(claim1, claim2);
          contradictions.push({
            claim1: {
              id: claim1.id,
              claimText: claim1.claimText,
              claimType: claim1.claimType as any,
              evidenceText: claim1.evidenceText,
              evidenceLocation: claim1.evidenceLocation,
              confidence: claim1.confidence,
              status: claim1.status as any,
              provenance: claim1.provenance as Record<string, unknown>,
            },
            claim2: {
              id: claim2.id,
              claimText: claim2.claimText,
              claimType: claim2.claimType as any,
              evidenceText: claim2.evidenceText,
              evidenceLocation: claim2.evidenceLocation,
              confidence: claim2.confidence,
              status: claim2.status as any,
              provenance: claim2.provenance as Record<string, unknown>,
            },
            severity,
          });
        }
      }
    }

    return contradictions;
  }

  private areContradictory(text1: string, text2: string): boolean {
    const normalized1 = text1.toLowerCase().replace(/[^\w\s]/g, '');
    const normalized2 = text2.toLowerCase().replace(/[^\w\s]/g, '');

    const words1 = new Set(normalized1.split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(normalized2.split(/\s+/).filter(w => w.length > 3));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (intersection.size === 0) return false;

    const similarity = intersection.size / union.size;
    if (similarity < 0.3) return false;

    const negationPatterns = [
      { pos: /\b(is|are|was|were|has|have|had|can|could|will|would|should|must)\b/, neg: /\b(is not|are not|was not|were not|has not|have not|had not|cannot|can not|could not|will not|would not|should not|must not)\b/ },
      { pos: /\b(all|every|always|never|none)\b/, neg: /\b(not all|not every|not always|some)\b/ },
      { pos: /\b(increase|increases|increased|grow|grows|grew|rise|rises|rose)\b/, neg: /\b(decrease|decreases|decreased|decline|declines|declined|fall|falls|fell|drop|drops|dropped)\b/ },
      { pos: /\b(more|higher|greater|larger|better)\b/, neg: /\b(less|lower|smaller|worse|fewer)\b/ },
      { pos: /\b(yes|true|correct|right)\b/, neg: /\b(no|false|incorrect|wrong)\b/ },
    ];

    for (const pattern of negationPatterns) {
      const hasPositive = pattern.pos.test(normalized1) || pattern.pos.test(normalized2);
      const hasNegative = pattern.neg.test(normalized1) || pattern.neg.test(normalized2);
      if (hasPositive && hasNegative) return true;
    }

    const numberMatches1 = text1.match(/\d+(?:\.\d+)?/g) || [];
    const numberMatches2 = text2.match(/\d+(?:\.\d+)?/g) || [];

    for (const num1 of numberMatches1) {
      for (const num2 of numberMatches2) {
        if (num1 !== num2) {
          const context1 = this.getNumberContext(text1, num1);
          const context2 = this.getNumberContext(text2, num2);
          if (this.contextsAreSimilar(context1, context2)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private getNumberContext(text: string, number: string): string {
    const index = text.indexOf(number);
    if (index === -1) return '';
    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + number.length + 50);
    return text.slice(start, end).toLowerCase();
  }

  private contextsAreSimilar(context1: string, context2: string): boolean {
    const words1 = new Set(context1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(context2.split(/\s+/).filter(w => w.length > 2));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return union.size > 0 && intersection.size / union.size > 0.4;
  }

  private assessSeverity(
    claim1: { claimText: string; claimType: string; confidence: number },
    claim2: { claimText: string; claimType: string; confidence: number }
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (claim1.claimType === 'STATISTIC' && claim2.claimType === 'STATISTIC') {
      return 'CRITICAL';
    }
    if ((claim1.claimType === 'FACT' || claim1.claimType === 'STATISTIC') &&
        (claim2.claimType === 'FACT' || claim2.claimType === 'STATISTIC')) {
      return 'HIGH';
    }
    if (claim1.confidence > 0.7 && claim2.confidence > 0.7) {
      return 'HIGH';
    }
    if (claim1.claimType === 'RECOMMENDATION' || claim2.claimType === 'RECOMMENDATION') {
      return 'MEDIUM';
    }
    return 'MEDIUM';
  }

  async getClaimsForSource(workspaceId: string, sourceId: string): Promise<ClaimLedgerEntry[]> {
    const claims = await this.prisma.sourceClaim.findMany({
      where: {
        workspaceId,
        sourceId,
      },
      orderBy: { createdAt: 'asc' },
    });

    return claims.map((c: typeof claims[0]) => ({
      id: c.id,
      claimText: c.claimText,
      claimType: c.claimType as any,
      evidenceText: c.evidenceText,
      evidenceLocation: c.evidenceLocation,
      confidence: c.confidence,
      status: c.status as any,
      provenance: c.provenance as Record<string, unknown>,
    }));
  }

  async updateClaimStatus(
    workspaceId: string,
    claimId: string,
    status: 'SUPPORTED' | 'CONTRADICTED' | 'UNCERTAIN'
  ): Promise<void> {
    await this.prisma.sourceClaim.update({
      where: { id: claimId },
      data: { status },
    });
  }
}