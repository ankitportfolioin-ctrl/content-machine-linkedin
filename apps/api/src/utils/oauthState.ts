import { prisma } from '@growth-operator/db';
import crypto from 'crypto';

type OAuthPlatform = 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE' | 'X' | 'REDDIT';

export interface OAuthState {
  stateHash: string;
  workspaceId: string;
  userId: string;
  platform: 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE' | 'X' | 'REDDIT';
  createdAt: Date;
  expiresAt: Date;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function hashState(state: string): string {
  return crypto.createHash('sha256').update(state).digest('hex');
}

export async function storeOAuthState(input: {
  state: string;
  workspaceId: string;
  userId: string;
  platform: 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE' | 'X' | 'REDDIT';
}): Promise<void> {
  const stateHash = hashState(input.state);
  const now = new Date();
  await prisma.oAuthState.upsert({
    where: { stateHash },
    update: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      platform: input.platform as 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE' | 'X' | 'REDDIT',
      createdAt: now,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
    create: {
      stateHash,
      workspaceId: input.workspaceId,
      userId: input.userId,
      platform: input.platform as 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE' | 'X' | 'REDDIT',
      createdAt: now,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });
}

export async function validateOAuthState(state: string): Promise<{ stateHash: string; workspaceId: string; userId: string; platform: 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE' | 'X' | 'REDDIT'; createdAt: Date; expiresAt: Date } | null> {
  const stateHash = hashState(state);
  const record = await prisma.oAuthState.findUnique({
    where: { stateHash },
  });
  if (!record) return null;
  if (record.expiresAt < new Date()) {
    await prisma.oAuthState.delete({ where: { stateHash } });
    return null;
  }
  return record;
}

export async function consumeOAuthState(state: string): Promise<{ stateHash: string; workspaceId: string; userId: string; platform: 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE' | 'X' | 'REDDIT'; createdAt: Date; expiresAt: Date } | null> {
  const record = await validateOAuthState(state);
  if (!record) return null;
  await prisma.oAuthState.delete({ where: { stateHash: record.stateHash } });
  return record;
}