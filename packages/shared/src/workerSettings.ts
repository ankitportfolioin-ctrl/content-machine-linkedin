/**
 * Worker settings - shared between api and decision packages.
 * Only depends on Prisma, no circular dependencies.
 */

import { prisma } from '@growth-operator/db';

export interface RunGate {
  allowed: boolean;
  /** Machine-readable reason recorded on the DailyRun when blocked. */
  reason: 'OK' | 'KILL_SWITCH' | 'PAUSED';
}

/**
 * Workspace settings with safe defaults. Created on first use so the loop
 * never requires manual setup to run conservatively (Tier 0, unpaused).
 */
export async function getWorkspaceSettings(workspaceId: string) {
  const existing = await prisma.workspaceSettings.findUnique({
    where: { workspaceId },
  });
  if (existing) return existing;
  return prisma.workspaceSettings.create({
    data: { workspaceId },
  });
}

/**
 * Kill switch and pause are honored at the start of the run AND at the
 * start of every stage (callers re-check via this helper). Kill switch
 * wins over pause when both are set.
 */
export async function assertRunAllowed(workspaceId: string): Promise<RunGate> {
  const settings = await getWorkspaceSettings(workspaceId);
  if (settings.killSwitch) return { allowed: false, reason: 'KILL_SWITCH' };
  if (settings.paused) return { allowed: false, reason: 'PAUSED' };
  return { allowed: true, reason: 'OK' };
}

/**
 * Calendar day (YYYY-MM-DD) in the workspace's timezone. Invalid timezone
 * strings fall back to UTC and are reported, never thrown.
 */
export function workspaceLocalDate(
  timezone: string,
  now: Date = new Date()
): { date: string; timezoneUsed: string; fallback: boolean } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      timezoneUsed: timezone,
      fallback: false,
    };
  } catch {
    const fallback = now.toISOString().slice(0, 10);
    return { date: fallback, timezoneUsed: 'UTC', fallback: true };
  }
}

/**
 * Whether the workspace's local time has reached its configured daily run
 * time (HH:mm). Same invalid-input discipline: unparseable run time means
 * "not due" rather than a crash.
 */
export function isRunDue(
  timezone: string,
  dailyRunTime: string,
  now: Date = new Date()
): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(dailyRunTime);
  if (!match) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const current = `${get('hour')}:${get('minute')}`;
    return current >= (match[0] as string);
  } catch {
    return false;
  }
}