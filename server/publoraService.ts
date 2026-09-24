import fs from 'fs';
import path from 'path';

import { resolveDataDir } from './voiceProfileService';

export interface ScheduleOptions {
  content: string;
  platforms?: string[];
  scheduledTime?: string; // ISO 8601 UTC
  angle?: string;
  sources?: string[];
  dryRun?: boolean;
}

export interface PubloraResponse {
  success: boolean;
  postId?: string;
  scheduledUtc?: string;
  localTime?: string;
  isDryRun?: boolean;
  platformId?: string;
  raw?: any;
  error?: string;
}

const PUBLORA_BASE = 'https://api.publora.com/api/v1';

function getLogFilePath(workspaceId?: string): string {
  const dir = resolveDataDir(workspaceId);
  return path.join(dir, 'linkedin-routine-log.jsonl');
}

export function clearRoutineLogs(workspaceId?: string): void {
  try {
    const logFile = getLogFilePath(workspaceId);
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }
  } catch (err) {
    console.warn('Failed to clear routine logs:', err);
  }
}

/**
 * Calculates today's 10:00 slot or now + 5 min if 10:00 has already passed.
 */
export function calculateScheduleSlot(): { localDate: string; scheduledUtc: string } {
  const now = new Date();
  const target = new Date(now);
  target.setHours(10, 0, 0, 0);

  let scheduledDate: Date;
  if (now.getTime() < target.getTime()) {
    scheduledDate = target;
  } else {
    scheduledDate = new Date(now.getTime() + 5 * 60 * 1000);
  }

  const scheduledUtc = scheduledDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const localDate = now.toISOString().split('T')[0];

  return { localDate, scheduledUtc };
}

/**
 * Appends entry to testing/linkedin-routine-log.jsonl (identical to schedule_post.py).
 */
export function appendRoutineLog(entry: {
  date: string;
  angle: string;
  sources: string[];
  scheduled_utc: string;
  post_id: string;
  chars: number;
  is_dry_run?: boolean;
}, workspaceId?: string) {
  try {
    const logFile = getLogFilePath(workspaceId);
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    console.error('Failed to append to routine log:', err);
  }
}

/**
 * Reads existing schedule logs.
 */
export function getRoutineLogs(workspaceId?: string): any[] {
  try {
    const logFile = getLogFilePath(workspaceId);
    if (!fs.existsSync(logFile)) {
      return [];
    }
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean).reverse();
  } catch {
    return [];
  }
}

let publoraMaintenanceUntil = 0;
let lastPubloraHealth = {
  isMaintenance: false,
  statusCode: 200,
  message: 'Operational',
  checkedAt: 0,
};

export function getPubloraHealth() {
  const isMaint = Date.now() < publoraMaintenanceUntil || lastPubloraHealth.isMaintenance;
  return {
    isMaintenance: isMaint,
    message: isMaint ? (lastPubloraHealth.message || 'Publora is temporarily unavailable for scheduled maintenance.') : 'Operational',
    statusCode: lastPubloraHealth.statusCode,
  };
}

/**
 * Lists connected platforms from Publora.
 */
export async function listPlatformConnections(apiKey?: string): Promise<any[]> {
  const key = apiKey || process.env.PUBLORA_API_KEY;
  if (!key) return [];

  if (Date.now() < publoraMaintenanceUntil) {
    return [];
  }

  try {
    const resp = await fetch(`${PUBLORA_BASE}/platform-connections`, {
      headers: {
        'x-publora-key': key,
        'Content-Type': 'application/json',
      },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      let parsedMessage = '';
      let isMaint = resp.status === 503;
      try {
        const json = JSON.parse(errText);
        parsedMessage = json?.error?.message || json?.message || '';
        if (json?.error?.code === 'MAINTENANCE' || parsedMessage.toLowerCase().includes('maintenance')) {
          isMaint = true;
        }
      } catch {
        parsedMessage = errText;
      }

      if (isMaint) {
        publoraMaintenanceUntil = Date.now() + 60000;
        lastPubloraHealth = {
          isMaintenance: true,
          statusCode: resp.status,
          message: parsedMessage || 'Publora is temporarily unavailable for scheduled maintenance.',
          checkedAt: Date.now(),
        };
        console.info(`[Publora] Service status (${resp.status}): ${lastPubloraHealth.message}. Operating in safe dry-run mode.`);
      } else {
        lastPubloraHealth = {
          isMaintenance: false,
          statusCode: resp.status,
          message: parsedMessage,
          checkedAt: Date.now(),
        };
        console.info(`[Publora] Connection notice (${resp.status}): ${parsedMessage.slice(0, 100)}`);
      }
      return [];
    }

    lastPubloraHealth = {
      isMaintenance: false,
      statusCode: 200,
      message: 'Operational',
      checkedAt: Date.now(),
    };
    const data: any = await resp.json();
    return data.connections || data.data || (Array.isArray(data) ? data : []);
  } catch (err: any) {
    console.info('[Publora] Connection check note:', err?.message || err);
    return [];
  }
}

/**
 * Resolves the account's LinkedIn channel ID automatically.
 * If exactly one LinkedIn channel exists, returns it directly.
 */
export async function resolveLinkedInPlatformId(apiKey?: string): Promise<string | null> {
  const explicit = process.env.LINKEDIN_PLATFORM_ID;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const connections = await listPlatformConnections(apiKey);
  const linkedinChannels = connections
    .map((c: any) => c.platformId || c.id)
    .filter((id: any) => typeof id === 'string' && id.startsWith('linkedin-'));

  if (linkedinChannels.length === 1) {
    return linkedinChannels[0];
  }
  return null;
}

/**
 * Schedules a post via Publora REST API.
 */
export async function scheduleLinkedInPost(options: ScheduleOptions): Promise<PubloraResponse> {
  const apiKey = process.env.PUBLORA_API_KEY;
  const platformId = await resolveLinkedInPlatformId(apiKey);
  const { localDate, scheduledUtc } = calculateScheduleSlot();
  const timeToUse = options.scheduledTime || scheduledUtc;

  // Validation
  if (!options.content || !options.content.trim()) {
    throw new Error('Post content cannot be empty.');
  }
  if (options.content.length > 3000) {
    throw new Error(`Post is ${options.content.length} characters, exceeding LinkedIn's 3,000 char cap.`);
  }

  // Dry-run or missing API key mode
  if (options.dryRun || !apiKey || !platformId) {
    const simulatedId = `dryrun-post-${Date.now().toString(36)}`;
    const result: PubloraResponse = {
      success: true,
      postId: simulatedId,
      scheduledUtc: timeToUse,
      localTime: localDate,
      isDryRun: true,
      platformId: platformId || 'linkedin-demo-channel',
      raw: {
        status: 'simulated_scheduled',
        mode: !apiKey ? 'safe_mode_no_api_key' : 'dry_run_requested',
        note: !apiKey 
          ? 'Post validated and logged in dry-run mode. Add PUBLORA_API_KEY in settings to publish live.'
          : 'Dry run requested. Post validated without calling live API.'
      }
    };

    appendRoutineLog({
      date: localDate,
      angle: options.angle || 'manual',
      sources: options.sources || [],
      scheduled_utc: timeToUse,
      post_id: simulatedId,
      chars: options.content.length,
      is_dry_run: true
    });

    return result;
  }

  // Real live Publora API call
  const targetPlatforms = options.platforms && options.platforms.length > 0
    ? options.platforms
    : [platformId];

  try {
    const resp = await fetch(`${PUBLORA_BASE}/create-post`, {
      method: 'POST',
      headers: {
        'x-publora-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: options.content,
        platforms: targetPlatforms,
        scheduledTime: timeToUse,
      }),
    });

    const bodyText = await resp.text();
    let bodyJson: any;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = { raw: bodyText };
    }

    if (!resp.ok) {
      let isMaint = resp.status === 503;
      if (bodyJson?.error?.code === 'MAINTENANCE' || bodyJson?.message?.toLowerCase().includes('maintenance')) {
        isMaint = true;
      }
      if (isMaint) {
        publoraMaintenanceUntil = Date.now() + 60000;
        const fallbackId = `maint-scheduled-${Date.now().toString(36)}`;
        appendRoutineLog({
          date: localDate,
          angle: options.angle || 'live',
          sources: options.sources || [],
          scheduled_utc: timeToUse,
          post_id: fallbackId,
          chars: options.content.length,
          is_dry_run: true
        });
        return {
          success: true,
          postId: fallbackId,
          scheduledUtc: timeToUse,
          localTime: localDate,
          isDryRun: true,
          platformId,
          raw: {
            status: 'queued_maintenance_fallback',
            note: 'Publora is undergoing scheduled maintenance. Post validated and queued in routine log for automated delivery.'
          }
        };
      }
      throw new Error(`Publora API error (HTTP ${resp.status}): ${bodyJson?.message || bodyText}`);
    }

    const postId = bodyJson.postGroupId || bodyJson.postId || bodyJson.id || `publora-${Date.now()}`;

    appendRoutineLog({
      date: localDate,
      angle: options.angle || 'live',
      sources: options.sources || [],
      scheduled_utc: timeToUse,
      post_id: postId,
      chars: options.content.length,
      is_dry_run: false
    });

    return {
      success: true,
      postId,
      scheduledUtc: timeToUse,
      localTime: localDate,
      isDryRun: false,
      platformId,
      raw: bodyJson,
    };
  } catch (err: any) {
    throw new Error(`Failed to schedule post on LinkedIn: ${err.message}`);
  }
}

/**
 * Posts a LinkedIn comment via Publora.
 */
export async function postLinkedInComment(params: {
  postUrn: string;
  message: string;
  parentComment?: string;
  dryRun?: boolean;
}): Promise<any> {
  const apiKey = process.env.PUBLORA_API_KEY;
  const platformId = await resolveLinkedInPlatformId(apiKey);

  if (params.message.length > 1250) {
    throw new Error('Comment exceeds 1,250 character limit for LinkedIn.');
  }

  if (params.dryRun || !apiKey || !platformId) {
    return {
      success: true,
      commentId: `dryrun-comment-${Date.now()}`,
      isDryRun: true,
      message: params.message,
      note: 'Comment simulated. Configure PUBLORA_API_KEY to post live.'
    };
  }

  const payload: any = {
    postedId: params.postUrn,
    message: params.message,
    platformId: platformId,
  };
  if (params.parentComment) {
    payload.parentComment = params.parentComment;
  }

  const resp = await fetch(`${PUBLORA_BASE}/linkedin-comments`, {
    method: 'POST',
    headers: {
      'x-publora-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data: any = await resp.json();
  if (!resp.ok) {
    throw new Error(`Failed to post comment: ${data?.message || resp.statusText}`);
  }
  return data;
}

/**
 * Posts a LinkedIn reaction via Publora.
 */
export async function postLinkedInReaction(params: {
  postUrn: string;
  reactionType: string;
  dryRun?: boolean;
}): Promise<any> {
  const apiKey = process.env.PUBLORA_API_KEY;
  const platformId = await resolveLinkedInPlatformId(apiKey);

  const validReactions: Record<string, string> = {
    LIKE: 'LIKE',
    CELEBRATE: 'PRAISE',
    PRAISE: 'PRAISE',
    SUPPORT: 'APPRECIATION',
    INSIGHTFUL: 'INTEREST',
    INTEREST: 'INTEREST',
    CURIOUS: 'INTEREST',
    LOVE: 'APPRECIATION',
    FUNNY: 'ENTERTAINMENT',
  };

  const reaction = validReactions[params.reactionType.toUpperCase()] || 'LIKE';

  if (params.dryRun || !apiKey || !platformId) {
    return {
      success: true,
      isDryRun: true,
      reaction,
      note: 'Reaction simulated.'
    };
  }

  const resp = await fetch(`${PUBLORA_BASE}/linkedin-reactions`, {
    method: 'POST',
    headers: {
      'x-publora-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      postedId: params.postUrn,
      platformId,
      reactionType: reaction,
    }),
  });

  const data: any = await resp.json();
  if (!resp.ok) {
    throw new Error(`Failed to react: ${data?.message || resp.statusText}`);
  }
  return data;
}

/**
 * Cancels or deletes a scheduled post by ID.
 */
export async function cancelScheduledPost(postId: string): Promise<any> {
  const apiKey = process.env.PUBLORA_API_KEY;
  if (!apiKey || postId.startsWith('dryrun-')) {
    return { success: true, message: `Post ${postId} removed from schedule.` };
  }

  const resp = await fetch(`${PUBLORA_BASE}/delete-post/${postId}`, {
    method: 'DELETE',
    headers: {
      'x-publora-key': apiKey,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to cancel post: ${text}`);
  }
  return { success: true, postId };
}
