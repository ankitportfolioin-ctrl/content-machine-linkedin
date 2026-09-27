export interface DiscoveryInput {
  name?: string;
  title?: string;
  company?: string;
  companyDomain?: string;
  location?: string;
  publicSourceUrls?: string[];
  leadId?: string;
}

export interface ProspectCandidate {
  name: string | null;
  title: string | null;
  company: string | null;
  companyDomain: string | null;
  location: string | null;
  publicSourceUrls: string[];
  evidence: string[];
  confidence: number;
  unknownFields: string[];
  leadId?: string;
}

const TRACKED_FIELDS = ['name', 'title', 'company', 'companyDomain', 'location'] as const;

/**
 * Builds a prospect candidate from caller-supplied data only. Every absent
 * field is recorded in unknownFields with provenance in evidence — nothing
 * is inferred or invented.
 */
export function buildProspectCandidate(input: DiscoveryInput): ProspectCandidate {
  const get = (key: (typeof TRACKED_FIELDS)[number]): string | null => {
    const value = input[key]?.trim();
    return value && value.length > 0 ? value : null;
  };

  const evidence: string[] = [];
  const unknownFields: string[] = [];
  for (const field of TRACKED_FIELDS) {
    const value = get(field);
    if (value) {
      evidence.push(`${field}: "${value}" (caller-supplied, unverified).`);
    } else {
      unknownFields.push(field);
    }
  }

  const urls = (input.publicSourceUrls ?? []).map((u) => u.trim()).filter((u) => u.length > 0);
  if (urls.length > 0) {
    evidence.push(`${urls.length} public source URL(s) supplied for verification.`);
  } else {
    unknownFields.push('publicSourceUrls');
  }

  const knownCount = TRACKED_FIELDS.length + 1 - unknownFields.length;
  return {
    name: get('name'),
    title: get('title'),
    company: get('company'),
    companyDomain: get('companyDomain'),
    location: get('location'),
    publicSourceUrls: urls,
    evidence,
    confidence: knownCount / (TRACKED_FIELDS.length + 1),
    unknownFields,
    leadId: input.leadId,
  };
}
