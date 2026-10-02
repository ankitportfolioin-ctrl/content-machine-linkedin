import type { SocialPlatform } from './types';

/**
 * Single source of truth for platform capability claims.
 *
 * The API connections endpoint and the web UI both render from these
 * descriptors — neither layer invents capability. The research `wired`
 * flags mirror the intelligence connector catalogue (`workerEligible`):
 * a connected account never implies research or publishing availability.
 */

export interface PlatformServerSetup {
  /** Env vars the administrator must set (client ID/secret level only). */
  requiredEnvVars: string[];
  /** Official provider page where the administrator creates the app/credentials. */
  docsUrl: string;
  docsLabel: string;
}

export interface PlatformCapabilityDescriptor {
  platform: SocialPlatform;
  displayName: string;
  /** Account (OAuth) connection is implemented for this platform. */
  accountSupported: boolean;
  serverSetup: PlatformServerSetup;
  research: { supported: boolean; wired: boolean; note: string };
  publishing: { supported: boolean; wired: boolean; note: string };
}

const RESEARCH_NOT_WIRED =
  'Account connection does not enable research. Registry research is not wired to workspace tokens in this version.';

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
    research: { supported: true, wired: false, note: RESEARCH_NOT_WIRED },
    publishing: { supported: false, wired: false, note: 'Publishing is not implemented for any platform.' },
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
    research: { supported: true, wired: false, note: 'No runnable research path exists for Facebook in this version.' },
    publishing: { supported: false, wired: false, note: 'Publishing is not implemented for any platform.' },
  },
  linkedin: {
    platform: 'linkedin',
    displayName: 'LinkedIn',
    accountSupported: true,
    serverSetup: {
      requiredEnvVars: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
      docsUrl: 'https://developer.linkedin.com/product-catalog',
      docsLabel: 'LinkedIn Developer Portal — create an app, request an approved product for post reads (Share on LinkedIn / Community Management)',
    },
    research: { supported: true, wired: false, note: RESEARCH_NOT_WIRED },
    publishing: { supported: false, wired: false, note: 'Publishing is not implemented for any platform.' },
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
      supported: true,
      wired: true,
      note: 'Registry research runs only when the server holds a YouTube Data API key or token — separate from account connection.',
    },
    publishing: { supported: false, wired: false, note: 'Publishing is not implemented for any platform.' },
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
    research: { supported: true, wired: false, note: RESEARCH_NOT_WIRED },
    publishing: { supported: false, wired: false, note: 'Publishing is not implemented for any platform.' },
  },
};

export function getPlatformCapability(platform: SocialPlatform): PlatformCapabilityDescriptor {
  return PLATFORM_CAPABILITIES[platform];
}
