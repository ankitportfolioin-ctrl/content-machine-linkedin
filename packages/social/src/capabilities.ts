import type { SocialPlatform } from './types';
import { getCapability } from '@growth-operator/capabilities';

/**
 * Platform capability descriptors — DERIVED VIEW over the capability registry.
 *
 * Single-source rule: the research/publishing supported+wired booleans are
 * owned by `@growth-operator/capabilities` (research.* + execution.*
 * entries). This module keeps the descriptor SHAPE (consumed by the social
 * connections endpoint and its tests) and derives those booleans; server
 * setup facts, readiness notes, and account support stay here because they
 * describe the OAuth plumbing, not product capability. The research `wired`
 * flags mirror the registry `workerAttempt`: a connected account never
 * implies research or publishing availability.
 */

export interface PlatformServerSetup {
  /** Env vars the administrator must set (client ID/secret level only). */
  requiredEnvVars: string[];
  /** Official provider page where the administrator creates the app/credentials. */
  docsUrl: string;
  docsLabel: string;
}

export interface PlatformReadiness {
  /** OAuth start/callback/exchange code paths exist and are tested. */
  oauthImplemented: boolean;
  /** The provider issues refresh tokens this app can use silently. */
  supportsRefresh: boolean;
  /** The provider must allow-list the application redirect URI. */
  externalAllowListRequired: boolean;
  /**
   * End-to-end account connection cannot be asserted from code: it needs a
   * configured server, an allow-listed redirect URI, and a real provider
   * grant. This flag stays false until a real callback completes — it must
   * never be set from a button existing or a URL being built.
   */
  endToEndVerified: false;
  readinessNote: string;
}

export interface PlatformCapabilityDescriptor {
  platform: SocialPlatform;
  displayName: string;
  /** Account (OAuth) connection is implemented for this platform. */
  accountSupported: boolean;
  serverSetup: PlatformServerSetup;
  research: { supported: boolean; wired: boolean; note: string };
  publishing: { supported: boolean; wired: boolean; note: string };
  readiness: PlatformReadiness;
}

const RESEARCH_NOT_WIRED =
  'Account connection does not enable research. Registry research is not wired to workspace tokens in this version.';

function researchEntryId(platform: SocialPlatform): string {
  return `research.${platform}`;
}

function publishEntryId(platform: SocialPlatform): string {
  return `execution.${platform}_publish`;
}

/** True when backend code capable of research exists for the platform. */
function researchSupported(platform: SocialPlatform): boolean {
  const entry = getCapability(researchEntryId(platform));
  return entry?.domain === 'RESEARCH' && 'fields' in entry && entry.fields.researchCodeExists;
}

/** True when the worker may attempt registry research for the platform. */
function researchWired(platform: SocialPlatform): boolean {
  const entry = getCapability(researchEntryId(platform));
  return entry?.domain === 'RESEARCH' && 'fields' in entry && entry.fields.workerAttempt;
}

/** True when a publishing execution path exists for the platform. */
function publishingSupported(platform: SocialPlatform): boolean {
  const entry = getCapability(publishEntryId(platform));
  if (!entry) return false;
  return entry.state !== 'NOT_IMPLEMENTED' && entry.state !== 'UNKNOWN';
}

const PUBLISHING_NOTE = 'Publishing is not implemented for any platform.';

export const PLATFORM_CAPABILITIES: Record<SocialPlatform, PlatformCapabilityDescriptor> = {
  instagram: {
    platform: 'instagram',
    displayName: 'Instagram',
    accountSupported: true,
    serverSetup: {
      requiredEnvVars: ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
      docsUrl: 'https://developers.facebook.com/apps/',
      docsLabel: 'Meta for Developers — create an app, add Instagram Graph API (business/creator account required)',
    },
    research: { supported: researchSupported('instagram'), wired: researchWired('instagram'), note: RESEARCH_NOT_WIRED },
    publishing: { supported: publishingSupported('instagram'), wired: false, note: PUBLISHING_NOTE },
    readiness: {
      oauthImplemented: true,
      supportsRefresh: false,
      externalAllowListRequired: true,
      endToEndVerified: false,
      readinessNote: 'Business/creator accounts only; long-lived tokens are exchanged once, then reconnect.',
    },
  },
  facebook: {
    platform: 'facebook',
    displayName: 'Facebook',
    accountSupported: true,
    serverSetup: {
      requiredEnvVars: ['FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET'],
      docsUrl: 'https://developers.facebook.com/apps/',
      docsLabel: 'Meta for Developers — create an app, request pages_show_list + pages_read_engagement (administered Pages only)',
    },
    research: { supported: researchSupported('facebook'), wired: researchWired('facebook'), note: 'No runnable research path exists for Facebook in this version.' },
    publishing: { supported: publishingSupported('facebook'), wired: false, note: PUBLISHING_NOTE },
    readiness: {
      oauthImplemented: true,
      supportsRefresh: false,
      externalAllowListRequired: true,
      endToEndVerified: false,
      readinessNote: 'Administered Pages only; tokens do not refresh silently, then reconnect.',
    },
  },
  linkedin: {
    platform: 'linkedin',
    displayName: 'LinkedIn',
    accountSupported: true,
    serverSetup: {
      requiredEnvVars: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
      docsUrl: 'https://developer.linkedin.com/product-catalog',
      docsLabel: 'LinkedIn Developer Portal — create an app and add the Sign In with LinkedIn using OpenID Connect product',
    },
    research: { supported: researchSupported('linkedin'), wired: researchWired('linkedin'), note: 'Reading member posts requires LinkedIn access that is not available to this application.' },
    publishing: { supported: publishingSupported('linkedin'), wired: false, note: PUBLISHING_NOTE },
    readiness: {
      oauthImplemented: true,
      supportsRefresh: false,
      externalAllowListRequired: true,
      endToEndVerified: false,
      readinessNote: 'Short-lived tokens with no silent refresh; connects identity only — member-post reading is unavailable to this application.',
    },
  },
  youtube: {
    platform: 'youtube',
    displayName: 'YouTube',
    accountSupported: true,
    serverSetup: {
      requiredEnvVars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
      docsUrl: 'https://console.cloud.google.com/apis/credentials',
      docsLabel: 'Google Cloud Console — create OAuth credentials, enable YouTube Data API v3 (youtube.readonly)',
    },
    research: {
      supported: researchSupported('youtube'),
      wired: researchWired('youtube'),
      note: 'Registry research runs only when the server holds a YouTube Data API key or token — separate from account connection.',
    },
    publishing: { supported: publishingSupported('youtube'), wired: false, note: PUBLISHING_NOTE },
    readiness: {
      oauthImplemented: true,
      supportsRefresh: true,
      externalAllowListRequired: true,
      endToEndVerified: false,
      readinessNote: 'Offline access with consent prompt; silent refresh supported.',
    },
  },
  x: {
    platform: 'x',
    displayName: 'X',
    accountSupported: true,
    serverSetup: {
      requiredEnvVars: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
      docsUrl: 'https://developer.x.com/en/portal/dashboard',
      docsLabel: 'X Developer Portal — create a project/app, enable OAuth 2.0 (tweet.read, users.read, offline.access)',
    },
    research: { supported: researchSupported('x'), wired: researchWired('x'), note: RESEARCH_NOT_WIRED },
    publishing: { supported: publishingSupported('x'), wired: false, note: PUBLISHING_NOTE },
    readiness: {
      oauthImplemented: true,
      supportsRefresh: true,
      externalAllowListRequired: true,
      endToEndVerified: false,
      readinessNote: 'PKCE flow with offline.access; silent refresh supported.',
    },
  },
};

export function getPlatformCapability(platform: SocialPlatform): PlatformCapabilityDescriptor {
  return PLATFORM_CAPABILITIES[platform];
}
