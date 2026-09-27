import { AudienceContext } from './types';

export interface ProfileInput {
  role?: string | null;
  headline?: string | null;
  summary?: string | null;
  professionalContext?: string | null;
  industry?: string | null;
}

export interface IcpInput {
  id?: string;
  name?: string | null;
  description?: string | null;
  criteria?: unknown;
  targetRoles?: string[];
  industries?: string[];
  companySize?: string | null;
  problems?: string | null;
  exclusions?: string | null;
}

function hasIcpSignal(icp: IcpInput | null | undefined): boolean {
  if (!icp) return false;
  if (icp.description && icp.description.trim().length >= 10) return true;
  if (icp.targetRoles && icp.targetRoles.length > 0) return true;
  if (icp.industries && icp.industries.length > 0) return true;
  if (icp.problems && icp.problems.trim().length >= 10) return true;
  if (icp.criteria && typeof icp.criteria === 'object' && Object.keys(icp.criteria as object).length > 0) return true;
  return false;
}

/**
 * Resolves a structured audience context from workspace profile + ICP.
 * Returns insufficientContext=true (never invented) when no usable ICP signal
 * exists and no explicit audience override was supplied.
 */
export function resolveAudience(
  profile: ProfileInput | null | undefined,
  icp: IcpInput | null | undefined,
  audienceOverride?: string
): AudienceContext {
  if (audienceOverride && audienceOverride.trim().length > 0) {
    return {
      primaryAudience: audienceOverride.trim(),
      matchReason: 'Explicit audience override supplied by the user.',
      assumedKnowledge: profile?.professionalContext?.trim() || 'Professional audience; prior knowledge unknown.',
      relevantNeeds: icp?.problems ? [icp.problems.trim()] : [],
      appropriateLanguage: profile?.industry ? `Professional language appropriate for ${profile.industry}.` : 'Clear professional language.',
      exclusionsConsidered: icp?.exclusions ? [icp.exclusions.trim()] : [],
      icpId: icp?.id ?? null,
      insufficientContext: false,
    };
  }

  if (!hasIcpSignal(icp)) {
    return {
      primaryAudience: '',
      matchReason: '',
      assumedKnowledge: '',
      relevantNeeds: [],
      appropriateLanguage: '',
      exclusionsConsidered: [],
      icpId: null,
      insufficientContext: true,
    };
  }

  const parts: string[] = [];
  if (icp?.targetRoles && icp.targetRoles.length > 0) parts.push(icp.targetRoles.join(', '));
  if (icp?.industries && icp.industries.length > 0) parts.push(`in ${icp.industries.join(', ')}`);
  if (icp?.companySize) parts.push(`(${icp.companySize})`);
  const primaryAudience = parts.length > 0
    ? parts.join(' ')
    : (icp?.description?.trim() || icp?.name?.trim() || 'Target audience');

  const relevantNeeds = icp?.problems ? [icp.problems.trim()] : [];

  return {
    primaryAudience,
    matchReason: `Derived from ICP "${icp?.name ?? 'workspace ICP'}": ${icp?.description?.trim() || 'structured ICP fields'}.`,
    assumedKnowledge: profile?.professionalContext?.trim()
      || (profile?.role ? `Working professional context: ${profile.role}.` : 'Working professional audience; prior knowledge unknown.'),
    relevantNeeds,
    appropriateLanguage: profile?.industry
      ? `Professional language appropriate for ${profile.industry}.`
      : 'Clear professional language.',
    exclusionsConsidered: icp?.exclusions ? [icp.exclusions.trim()] : [],
    icpId: icp?.id ?? null,
    insufficientContext: false,
  };
}
