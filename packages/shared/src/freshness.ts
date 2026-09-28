export type FreshnessBand = 'FRESH' | 'RECENT' | 'AGING' | 'STALE' | 'UNKNOWN';

export interface FreshnessResult {
  factor: number;
  band: FreshnessBand;
  ageDays: number | null;
  reason: string;
}

const FRESHNESS_HALF_LIFE_DAYS = 14;
const CRITICAL_EVIDENCE_THRESHOLD = 0.8;

export function calculateFreshness(
  createdAt: Date | string | number | null,
  now: number = Date.now(),
  options?: {
    halfLifeDays?: number;
    isCriticalEvidence?: boolean;
    evidenceStrength?: number;
  }
): FreshnessResult {
  const halfLife = options?.halfLifeDays ?? FRESHNESS_HALF_LIFE_DAYS;
  const isCritical = options?.isCriticalEvidence ?? false;
  const evidenceStrength = options?.evidenceStrength ?? 0;

  if (!createdAt) {
    return {
      factor: 1.0,
      band: 'UNKNOWN',
      ageDays: null,
      reason: 'Timestamp unavailable; freshness not applied.',
    };
  }

  const timestamp = createdAt instanceof Date ? createdAt.getTime() : 
                    typeof createdAt === 'string' ? new Date(createdAt).getTime() : 
                    createdAt;
  
  if (isNaN(timestamp)) {
    return {
      factor: 1.0,
      band: 'UNKNOWN',
      ageDays: null,
      reason: 'Invalid timestamp; freshness not applied.',
    };
  }

  const ageMs = now - timestamp;
  const ageDays = Math.max(0, Math.floor(ageMs / 86400000));

  let band: FreshnessBand;
  let baseFactor: number;

  if (ageDays <= 7) {
    band = 'FRESH';
    baseFactor = 1.0;
  } else if (ageDays <= 30) {
    band = 'RECENT';
    baseFactor = 0.85;
  } else if (ageDays <= 90) {
    band = 'AGING';
    baseFactor = 0.6;
  } else {
    band = 'STALE';
    baseFactor = 0.35;
  }

  let factor = baseFactor;

  // Exponential decay based on half-life
  factor = Math.exp(-ageDays / halfLife);

  // Critical evidence protection: don't let freshness erase strong evidence
  if (isCritical && evidenceStrength >= CRITICAL_EVIDENCE_THRESHOLD) {
    const protectedFactor = 0.5 + factor * 0.5;
    factor = Math.max(factor, protectedFactor);
    if (band === 'STALE' || band === 'AGING') {
      return {
        factor,
        band,
        ageDays,
        reason: `Critical evidence (strength ${(evidenceStrength * 100).toFixed(0)}%) protects against full freshness decay.`,
      };
    }
  }

  let reason: string;
  switch (band) {
    case 'FRESH':
      reason = 'Created within the last 7 days.';
      break;
    case 'RECENT':
      reason = `Created ${ageDays} days ago; recent but not fresh.`;
      break;
    case 'AGING':
      reason = `Created ${ageDays} days ago; signal is aging.`;
      break;
    case 'STALE':
      reason = `Created ${ageDays} days ago; signal is stale.`;
      break;
    default:
      reason = 'Timestamp unavailable; freshness not applied.';
  }

  return { factor, band, ageDays, reason };
}

export function freshnessAdjustedScore(
  baseScore: number,
  freshnessResult: FreshnessResult,
  maxFreshnessPoints: number = 10
): { adjustedScore: number; freshnessPoints: number } {
  const freshnessPoints = Math.round(freshnessResult.factor * maxFreshnessPoints);
  const adjustedScore = baseScore + freshnessPoints;
  return { adjustedScore: Math.min(100, Math.max(0, adjustedScore)), freshnessPoints };
}

export function getFreshnessBandLabel(band: FreshnessBand): string {
  switch (band) {
    case 'FRESH': return 'Fresh';
    case 'RECENT': return 'Recent';
    case 'AGING': return 'Aging';
    case 'STALE': return 'Stale';
    case 'UNKNOWN': return 'Unknown';
  }
}