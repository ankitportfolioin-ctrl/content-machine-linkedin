/**
 * Platform capability flags derived from the registry.
 *
 * Single derivation point for the per-platform booleans previously
 * copy-pasted in routes/social.ts and routes/readiness.ts. The flags answer
 * one question: does the registry say this platform supports research /
 * publishing / analytics / comments / audience? Workspace account state
 * (connected/paused/expired) is overlaid by the API on top of these flags —
 * a connected account never flips a false flag to true.
 */

import { getCapability } from './registry';

export type PlatformName = 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'x';

export interface PlatformCapabilityFlags {
  research: boolean;
  publishing: boolean;
  analytics: boolean;
  comments: boolean;
  audience: boolean;
}

const RESEARCH_ID: Record<PlatformName, string> = {
  instagram: 'research.instagram',
  facebook: 'research.facebook',
  linkedin: 'research.linkedin',
  youtube: 'research.youtube',
  x: 'research.x',
};

const PUBLISH_ID: Record<PlatformName, string> = {
  instagram: 'execution.instagram_publish',
  facebook: 'execution.facebook_publish',
  linkedin: 'execution.linkedin_publish',
  youtube: 'execution.youtube_publish',
  x: 'execution.x_publish',
};

/**
 * A registry research entry counts as "supported" when backend code capable
 * of research exists for the platform (even if the worker never attempts it,
 * e.g. account-pull inspiration). LinkedIn and Quora have no research code,
 * so they are false.
 */
function researchSupported(platform: PlatformName): boolean {
  const entry = getCapability(RESEARCH_ID[platform]);
  if (!entry || !('fields' in entry)) return false;
  return entry.fields.researchCodeExists;
}

function executionImplemented(id: string): boolean {
  const entry = getCapability(id);
  if (!entry) return false;
  return entry.state !== 'NOT_IMPLEMENTED' && entry.state !== 'UNKNOWN';
}

export function platformCapabilityFlags(platform: PlatformName): PlatformCapabilityFlags {
  return {
    research: researchSupported(platform),
    publishing: executionImplemented(PUBLISH_ID[platform]),
    analytics: executionImplemented('observation.post_metrics'),
    comments: executionImplemented('observation.comment_linkedin'),
    audience: executionImplemented('observation.follower_demographics'),
  };
}

/** Publishing readiness per platform for the readiness endpoint. */
export function platformPublishingSupported(platform: PlatformName): boolean {
  return executionImplemented(PUBLISH_ID[platform]);
}

/** Execution/publish check by registry id (for platforms without an adapter, e.g. TikTok). */
export function executionImplementedById(id: string): boolean {
  return executionImplemented(id);
}
