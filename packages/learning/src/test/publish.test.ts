import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PublishService } from '../publish';

const mockPrisma = {
  contentVersion: { findFirst: vi.fn() },
  outreachDraft: { findFirst: vi.fn() },
  pipelineOpportunity: { findFirst: vi.fn() },
  outreachReview: { findFirst: vi.fn() },
  publishRecord: { create: vi.fn() },
} as unknown as PrismaClient;

describe('PublishService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records publication against a final version with provenance', async () => {
    mockPrisma.contentVersion.findFirst.mockResolvedValue({ id: 'v-1', isFinal: true });
    mockPrisma.publishRecord.create.mockImplementation(({ data }: never) => Promise.resolve({ id: 'p-1', ...(data as object) }));
    const service = new PublishService(mockPrisma);
    const record = await service.recordPublication('workspace-1', 'user-1', {
      contentVersionId: 'v-1',
      channel: 'LinkedIn manual post',
      externalRef: 'https://linkedin.com/posts/example',
    }) as { channel: string; externalRef: string };
    expect(record.channel).toBe('LinkedIn manual post');
    expect(record.externalRef).toBe('https://linkedin.com/posts/example');
  });

  it('rejects records without any subject', async () => {
    const service = new PublishService(mockPrisma);
    await expect(service.recordPublication('workspace-1', 'user-1', { channel: 'Manual' }))
      .rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });

  it('rejects unapproved content versions', async () => {
    mockPrisma.contentVersion.findFirst.mockResolvedValue({ id: 'v-1', isFinal: false });
    const service = new PublishService(mockPrisma);
    await expect(service.recordPublication('workspace-1', 'user-1', { contentVersionId: 'v-1', channel: 'Manual' }))
      .rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });

  it('rejects nonexistent subjects instead of recording', async () => {
    mockPrisma.contentVersion.findFirst.mockResolvedValue(null);
    const service = new PublishService(mockPrisma);
    await expect(service.recordPublication('workspace-1', 'user-1', { contentVersionId: 'missing', channel: 'Manual' }))
      .rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });

  it('rejects outreach drafts without valid approval', async () => {
    mockPrisma.outreachDraft.findFirst.mockResolvedValue({ id: 'd-1' });
    mockPrisma.outreachReview.findFirst.mockResolvedValue(null);
    const service = new PublishService(mockPrisma);
    await expect(service.recordPublication('workspace-1', 'user-1', { outreachDraftId: 'd-1', channel: 'Manual' }))
      .rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });
});
