import { ICPMatchContext } from './types';

export interface IcpInput {
  id?: string;
  name?: string | null;
  description?: string | null;
  targetRoles?: string[];
  industries?: string[];
  companySize?: string | null;
  problems?: string | null;
  exclusions?: string | null;
}

export interface LeadInput {
  title?: string | null;
  headline?: string | null;
  company?: string | null;
  location?: string | null;
}

function includesToken(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase().trim());
}

/**
 * Structured ICP resolution. Compares only supplied fields; anything absent
 * becomes a missing signal — never an invented match or mismatch.
 */
export function resolveIcpMatch(
  icp: IcpInput | null | undefined,
  lead: LeadInput | null | undefined
): ICPMatchContext {
  const missingSignals: string[] = [];
  if (!icp) {
    return { matched: false, fitReasons: [], mismatchReasons: [], missingSignals: ['No ICP configured for this workspace.'], confidence: 0, icpId: null };
  }

  const fitReasons: string[] = [];
  const mismatchReasons: string[] = [];
  const leadText = [lead?.title, lead?.headline, lead?.company, lead?.location].filter(Boolean).join(' | ');

  if (icp.targetRoles && icp.targetRoles.length > 0) {
    if (!lead?.title && !lead?.headline) {
      missingSignals.push('Prospect role/title unknown; cannot assess role fit.');
    } else if (icp.targetRoles.some((r) => includesToken(leadText, r))) {
      fitReasons.push(`Role matches ICP target roles (${icp.targetRoles.join(', ')}).`);
    } else {
      mismatchReasons.push(`Role does not match ICP target roles (${icp.targetRoles.join(', ')}).`);
    }
  } else {
    missingSignals.push('ICP defines no target roles.');
  }

  if (icp.industries && icp.industries.length > 0) {
    if (!lead?.company && !lead?.headline) {
      missingSignals.push('Company/industry unknown; cannot assess industry fit.');
    } else if (icp.industries.some((i) => includesToken(leadText, i))) {
      fitReasons.push(`Industry matches (${icp.industries.join(', ')}).`);
    } else {
      mismatchReasons.push(`Industry does not match (${icp.industries.join(', ')}).`);
    }
  } else {
    missingSignals.push('ICP defines no industries.');
  }

  if (icp.exclusions && leadText && icp.exclusions.split(/[,;]/).map((s) => s.trim()).filter(Boolean).some((e) => includesToken(leadText, e))) {
    mismatchReasons.push('Prospect matches an ICP exclusion.');
  }

  const assessed = fitReasons.length + mismatchReasons.length;
  const confidence = assessed === 0 ? 0 : fitReasons.length / assessed;
  const matched = mismatchReasons.length === 0 && fitReasons.length > 0;

  return { matched, fitReasons, mismatchReasons, missingSignals, confidence, icpId: icp.id ?? null };
}
