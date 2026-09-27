import { PrismaClient } from '@prisma/client';
import { ContentError } from './errors';
import { EvidenceStatus } from './types';

export interface ClaimBindingInput {
  span: string;
  sourceClaimId?: string;
  confidence?: number;
}

export interface SourceClaimRef {
  id: string;
  claimText: string;
  claimType: string;
  evidenceText: string;
  confidence: number;
  status: string;
}

const ABSOLUTES = ['guarantees', 'always', 'never', 'proves', 'prove', 'everyone', 'no one', 'impossible', 'certain'];
const HEDGES = ['may', 'might', 'could', 'suggests', 'suggest', 'sometimes', 'often', 'potentially', 'can improve', 'may improve', 'indicates'];
const CAUSAL_MARKERS = ['because', 'causes', 'leads to', 'results in', 'drives', 'proves', 'guarantees'];
const COMPARATIVES = ['better than', 'worse than', 'more than', 'less than', 'best', 'worst', 'versus', ' vs '];

function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

function extractNumbers(text: string): string[] {
  return text.match(/\d+(\.\d+)?/g) ?? [];
}

export interface DraftValidationFinding {
  span: string;
  kind: 'UNSUPPORTED_FACT' | 'UNSUPPORTED_STATISTIC' | 'OVERREACH' | 'UNSUPPORTED_CAUSAL' | 'UNSUPPORTED_COMPARISON' | 'CONTRADICTED_CLAIM';
  severity: 'REVIEW_REQUIRED' | 'BLOCKED';
  message: string;
}

export class EvidenceService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createBindings(
    workspaceId: string,
    draftId: string,
    bindings: ClaimBindingInput[]
  ): Promise<Array<{ id: string; span: string; sourceClaimId: string | null; evidenceStatus: EvidenceStatus }>> {
    const draft = await this.prisma.contentDraft.findFirst({ where: { id: draftId, workspaceId } });
    if (!draft) {
      throw new ContentError('EVIDENCE_MISSING', 'Draft not found in this workspace.');
    }

    const created: Array<{ id: string; span: string; sourceClaimId: string | null; evidenceStatus: EvidenceStatus }> = [];
    for (const binding of bindings) {
      let status: EvidenceStatus = 'REVIEW_REQUIRED';
      let sourceClaim: SourceClaimRef | null = null;
      if (binding.sourceClaimId) {
        sourceClaim = await this.prisma.sourceClaim.findFirst({
          where: { id: binding.sourceClaimId, workspaceId },
        }) as unknown as SourceClaimRef | null;
        if (!sourceClaim) {
          throw new ContentError('EVIDENCE_MISSING', `Source claim ${binding.sourceClaimId} not found in this workspace.`);
        }
        status = sourceClaim.status === 'CONTRADICTED' ? 'CONTRADICTED' : 'SUPPORTED';
      }
      const row = await this.prisma.draftClaimBinding.create({
        data: {
          workspaceId,
          draftId,
          span: binding.span,
          sourceClaimId: sourceClaim?.id ?? null,
          evidenceStatus: status,
          confidence: binding.confidence ?? sourceClaim?.confidence ?? null,
          contradictionState: status === 'CONTRADICTED' ? 'PRESENT' : 'NONE',
        },
      });
      created.push({ id: row.id, span: row.span, sourceClaimId: row.sourceClaimId, evidenceStatus: row.evidenceStatus as EvidenceStatus });
    }
    return created;
  }

  async getBindings(workspaceId: string, draftId: string) {
    return this.prisma.draftClaimBinding.findMany({ where: { workspaceId, draftId }, orderBy: { createdAt: 'asc' } });
  }

  /**
   * Validates draft text against bound evidence. Deterministic; no AI needed.
   * Findings use REVIEW_REQUIRED for gaps and BLOCKED for overreach,
   * invented statistics, and contradicted claims.
   */
  validateDraftText(
    draftBody: string,
    bindings: Array<{ span: string; evidenceStatus: EvidenceStatus | string; sourceClaim?: SourceClaimRef | null; evidenceText?: string | null; claimType?: string | null }>
  ): DraftValidationFinding[] {
    const findings: DraftValidationFinding[] = [];
    const sentences = draftBody.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);

    const supportedSpans = bindings
      .filter((b) => b.evidenceStatus === 'SUPPORTED')
      .map((b) => ({ span: b.span.toLowerCase(), claimType: b.claimType ?? b.sourceClaim?.claimType ?? null, evidence: (b.evidenceText ?? b.sourceClaim?.evidenceText ?? '').toLowerCase() }));

    const contradictedInputs = bindings.filter((b) => b.evidenceStatus === 'CONTRADICTED');
    for (const binding of contradictedInputs) {
      findings.push({
        span: binding.span,
        kind: 'CONTRADICTED_CLAIM',
        severity: 'BLOCKED',
        message: 'Draft relies on a contradicted claim. Resolve the contradiction before approval.',
      });
    }

    for (const sentence of sentences) {
      if (sentence.length < 25) continue;
      const numbers = extractNumbers(sentence);
      const hasSupport = supportedSpans.some((s) => {
        const key = s.span.slice(0, 60);
        return key.length >= 10 && sentence.toLowerCase().includes(key);
      });

      if (numbers.length > 0 && !hasSupport) {
        const statSupport = supportedSpans.some((s) => s.claimType === 'STATISTIC');
        findings.push({
          span: sentence,
          kind: 'UNSUPPORTED_STATISTIC',
          severity: 'BLOCKED',
          message: statSupport
            ? `Sentence contains numbers (${numbers.join(', ')}) with no supporting STATISTIC binding.`
            : `Sentence contains numbers (${numbers.join(', ')}) but no STATISTIC evidence exists. Fabricated statistics are not allowed.`,
        });
        continue;
      }

      if ((containsAny(sentence, CAUSAL_MARKERS) || containsAny(sentence, COMPARATIVES)) && !hasSupport) {
        findings.push({
          span: sentence,
          kind: containsAny(sentence, CAUSAL_MARKERS) ? 'UNSUPPORTED_CAUSAL' : 'UNSUPPORTED_COMPARISON',
          severity: 'REVIEW_REQUIRED',
          message: 'Causal or comparative claim has no supporting evidence binding.',
        });
        continue;
      }

      if (containsAny(sentence, ABSOLUTES) && !hasSupport) {
        findings.push({
          span: sentence,
          kind: 'UNSUPPORTED_FACT',
          severity: 'REVIEW_REQUIRED',
          message: 'Absolute claim has no supporting evidence binding.',
        });
      }
    }

    // Overreach: absolute draft language bound to hedged evidence.
    for (const binding of bindings) {
      if (binding.evidenceStatus !== 'SUPPORTED') continue;
      const evidence = (binding.evidenceText ?? binding.sourceClaim?.evidenceText ?? '').toLowerCase();
      if (!evidence) continue;
      const draftAbsolute = containsAny(binding.span, ABSOLUTES);
      const evidenceHedged = containsAny(evidence, HEDGES);
      if (draftAbsolute && evidenceHedged) {
        findings.push({
          span: binding.span,
          kind: 'OVERREACH',
          severity: 'BLOCKED',
          message: 'Draft states an absolute ("guarantees", "always", ...) while the bound evidence is hedged ("may", "suggests", ...). Soften the claim to match the evidence.',
        });
      }
    }

    return findings;
  }

  evidenceCoverage(bindings: Array<{ evidenceStatus: string }>): number {
    if (bindings.length === 0) return 0;
    const supported = bindings.filter((b) => b.evidenceStatus === 'SUPPORTED').length;
    return supported / bindings.length;
  }
}
