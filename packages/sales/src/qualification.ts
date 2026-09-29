import { PrismaClient } from '@prisma/client';
import { SalesError } from './errors';
import { QualificationDimension, QualificationStatus } from './types';
import { resolveIcpMatch, IcpInput, LeadInput } from './icp';

export interface QualificationInputs {
  icp: IcpInput | null | undefined;
  lead: LeadInput & { id?: string };
  problemEvidence?: string[];
  timingEvidence?: string[];
  researchFactCount?: number;
  researchConfidence?: number | null;
}

export interface QualificationResult {
  status: QualificationStatus;
  dimensions: QualificationDimension[];
  missingData: string[];
  reasoning: string;
  confidence: number;
}

function dim(
  name: string,
  score: number,
  reason: string,
  evidence: string[] = [],
  missing = false
): QualificationDimension {
  return { name, score, reason, evidence, missing };
}

/**
 * Fully deterministic qualification. No LLM involved: every dimension shows
 * its score, reason, evidence, and whether data was missing.
 */
export function qualifyProspect(inputs: QualificationInputs): QualificationResult {
  const match = resolveIcpMatch(inputs.icp, inputs.lead);
  const missingData = [...match.missingSignals];

  const dimensions: QualificationDimension[] = [];

  dimensions.push(dim(
    'icp_fit',
    match.matched ? 0.9 : match.mismatchReasons.length > 0 ? 0.2 : 0.4,
    match.matched
      ? `ICP match: ${match.fitReasons.join(' ')}`
      : match.mismatchReasons.length > 0
        ? `ICP mismatch: ${match.mismatchReasons.join(' ')}`
        : 'ICP fit unknown: insufficient ICP or prospect data.',
    [...match.fitReasons, ...match.mismatchReasons],
    !match.matched && match.fitReasons.length === 0
  ));

  const roleKnown = Boolean(inputs.lead.title || inputs.lead.headline);
  dimensions.push(dim(
    'role_fit',
    !roleKnown ? 0.3 : match.fitReasons.some((r) => r.startsWith('Role matches')) ? 0.9 : match.mismatchReasons.some((r) => r.startsWith('Role does not')) ? 0.2 : 0.5,
    !roleKnown ? 'Prospect role unknown.' : 'Role assessed against ICP target roles.',
    roleKnown ? [`${inputs.lead.title ?? ''} ${inputs.lead.headline ?? ''}`.trim()] : [],
    !roleKnown
  ));
  if (!roleKnown) missingData.push('Prospect role/title unknown.');

  const industryKnown = Boolean(inputs.lead.company || inputs.lead.headline);
  dimensions.push(dim(
    'industry_fit',
    !industryKnown ? 0.3 : match.fitReasons.some((r) => r.startsWith('Industry matches')) ? 0.85 : match.mismatchReasons.some((r) => r.startsWith('Industry does not')) ? 0.25 : 0.5,
    !industryKnown ? 'Company/industry unknown.' : 'Industry assessed against ICP industries.',
    industryKnown ? [`${inputs.lead.company ?? ''}`.trim()].filter(Boolean) : [],
    !industryKnown
  ));
  if (!industryKnown) missingData.push('Company/industry unknown.');

  const companyKnown = Boolean(inputs.lead.company);
  dimensions.push(dim(
    'company_fit',
    !companyKnown ? 0.3 : 0.6,
    !companyKnown ? 'Company unknown; company fit cannot be assessed.' : 'Company known; size/revenue unverified — fit is provisional.',
    companyKnown ? [inputs.lead.company as string] : [],
    !companyKnown
  ));
  if (!companyKnown) missingData.push('Company unknown.');

  const problemEvidence = inputs.problemEvidence ?? [];
  dimensions.push(dim(
    'problem_relevance',
    problemEvidence.length === 0 ? 0.3 : Math.min(1, 0.5 + problemEvidence.length * 0.15),
    problemEvidence.length === 0 ? 'No problem evidence supplied.' : `${problemEvidence.length} problem evidence item(s) supplied.`,
    problemEvidence.slice(0, 5),
    problemEvidence.length === 0
  ));
  if (problemEvidence.length === 0) missingData.push('No problem-relevance evidence.');

  const factCount = inputs.researchFactCount ?? 0;
  dimensions.push(dim(
    'evidence_strength',
    factCount === 0 ? 0.2 : Math.min(1, 0.4 + factCount * 0.1),
    factCount === 0 ? 'No verified research facts.' : `${factCount} verified research fact(s).`,
    [],
    factCount === 0
  ));
  if (factCount === 0) missingData.push('No verified research facts.');

  const timing = inputs.timingEvidence ?? [];
  dimensions.push(dim(
    'timing_signal',
    timing.length === 0 ? 0.4 : Math.min(1, 0.6 + timing.length * 0.15),
    timing.length === 0 ? 'No timing signals observed (neutral, not negative).' : `${timing.length} timing signal(s) observed.`,
    timing.slice(0, 5),
    timing.length === 0
  ));

  const researchCompleteness = [roleKnown, industryKnown, companyKnown, factCount > 0].filter(Boolean).length / 4;
  dimensions.push(dim(
    'research_completeness',
    researchCompleteness,
    `${Math.round(researchCompleteness * 100)}% of core research fields present.`,
    [],
    researchCompleteness < 1
  ));

  const avg = dimensions.reduce((a, d) => a + d.score, 0) / dimensions.length;
  const missingCritical = !roleKnown && !companyKnown && factCount === 0;

  let status: QualificationStatus;
  let reasoning: string;
  if (missingCritical) {
    status = 'INSUFFICIENT_DATA';
    reasoning = 'Role, company, and verified facts are all unknown. Qualification is impossible without inventing data.';
  } else if (match.mismatchReasons.length > 0 && avg < 0.45) {
    status = 'UNQUALIFIED';
    reasoning = `Disqualified on evidence: ${match.mismatchReasons.join(' ')} (average dimension score ${avg.toFixed(2)}).`;
  } else if (avg >= 0.65 && match.matched) {
    status = 'QUALIFIED';
    reasoning = `Qualified on evidence: ${match.fitReasons.join(' ')} (average dimension score ${avg.toFixed(2)}).`;
  } else {
    status = 'POSSIBLE_FIT';
    reasoning = `Possible fit (average dimension score ${avg.toFixed(2)}). Missing: ${missingData.slice(0, 3).join('; ') || 'nothing critical'}.`;
  }

  return { status, dimensions, missingData, reasoning, confidence: Math.round(avg * 100) / 100 };
}

export class QualificationService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async qualifyAndPersist(
    workspaceId: string,
    leadId: string,
    inputs: Omit<QualificationInputs, 'lead' | 'icp'> & { problemEvidence?: string[]; timingEvidence?: string[]; researchFactCount?: number }
  ): Promise<QualificationResult & { id: string }> {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) {
      throw new SalesError('INSUFFICIENT_DATA', 'Lead not found in this workspace.');
    }
    const icp = await this.prisma.iCP.findFirst({ where: { workspaceId }, orderBy: { updatedAt: 'desc' } });
    const result = qualifyProspect({
      icp: icp ? {
        id: icp.id, name: icp.name, description: icp.description, targetRoles: icp.targetRoles,
        industries: icp.industries, companySize: icp.companySize, problems: icp.problems, exclusions: icp.exclusions,
      } : null,
      // Lead has no `title` column: role assessment reads `headline` only.
      // Passing a phantom title would silently degrade role_fit.
      lead: { headline: lead.headline, company: lead.company, location: lead.location },
      problemEvidence: inputs.problemEvidence,
      timingEvidence: inputs.timingEvidence,
      researchFactCount: inputs.researchFactCount,
    });
    const row = await this.prisma.qualificationResult.upsert({
      where: { workspaceId_leadId: { workspaceId, leadId } },
      create: {
        workspaceId, leadId, status: result.status,
        dimensions: result.dimensions as object,
        evidence: { fitReasons: result.dimensions.flatMap((d) => d.evidence) } as object,
        missingData: result.missingData,
        reasoning: result.reasoning,
        confidence: result.confidence,
      },
      update: {
        status: result.status,
        dimensions: result.dimensions as object,
        evidence: { fitReasons: result.dimensions.flatMap((d) => d.evidence) } as object,
        missingData: result.missingData,
        reasoning: result.reasoning,
        confidence: result.confidence,
      },
    });
    return { ...result, id: row.id };
  }
}
