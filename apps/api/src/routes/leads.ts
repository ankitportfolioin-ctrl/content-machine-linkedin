import crypto from 'crypto';
import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { leadCreateSchema, leadImportSchema, leadUpdateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError, ValidationError } from '../utils/errors';
import { mapLeadRows, parseCsv } from '../utils/csv';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, status } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (status && typeof status === 'string') {
      where.status = status.toUpperCase();
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: {
          conversations: { select: { id: true, subject: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          opportunities: { select: { id: true, name: true, stage: true, value: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({ leads, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = leadCreateSchema.parse(req.body);

    const lead = await prisma.lead.create({
      data: {
        workspaceId: authReq.workspaceId,
        linkedinUrl: data.linkedinUrl,
        name: data.name,
        headline: data.headline,
        company: data.company,
        location: data.location,
        status: data.status.toUpperCase() as 'NEW' | 'CONTACTED' | 'CONNECTED' | 'RESPONDING' | 'QUALIFIED' | 'DISQUALIFIED' | 'CLOSED',
        tags: data.tags,
        notes: data.notes,
      },
    });

    res.status(201).json({ lead });
  } catch (error) {
    next(error);
  }
});

const MAX_IMPORT_ROWS = 500;

/**
 * Step D: user-supplied CSV/paste lead import. Only the user's own data
 * (their CSV or LinkedIn's official export of their own data) — no scraping.
 * Idempotent per file hash; every skipped row carries an honest reason.
 * Rows without a linkedinUrl are skipped: Lead requires a profile URL unique
 * within the workspace and we will not invent placeholder URLs.
 */
router.post('/import', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = leadImportSchema.parse(req.body);

    let rows: string[][];
    try {
      rows = parseCsv(data.csv);
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'Malformed CSV.');
    }
    let mapped: { leads: Array<{ rowNumber: number; name: string; linkedinUrl?: string; headline?: string; company?: string; location?: string }> };
    try {
      mapped = mapLeadRows(rows);
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'Unmappable CSV.');
    }
    if (mapped.leads.length > MAX_IMPORT_ROWS) {
      throw new ValidationError(
        `CSV has ${mapped.leads.length} data rows; maximum ${MAX_IMPORT_ROWS} per import. Split the file and retry.`
      );
    }

    const fileHash = crypto.createHash('sha256').update(data.csv, 'utf8').digest('hex');
    const prior = await prisma.leadImportBatch.findUnique({
      where: { workspaceId_fileHash: { workspaceId: authReq.workspaceId, fileHash } },
    });
    if (prior && prior.status !== 'PENDING') {
      return res.json({ batch: prior, deduped: true, imported: prior.importedRows, skipped: [] });
    }
    if (prior) {
      // Interrupted earlier run: drop the PENDING shell and re-process.
      // Already-created leads are caught by the duplicate check below.
      await prisma.leadImportBatch.delete({ where: { id: prior.id } });
    }

    const skipped: Array<{ rowNumber: number; reason: string }> = [];
    const candidates: typeof mapped.leads = [];
    const seenUrls = new Set<string>();
    for (const lead of mapped.leads) {
      if (lead.name.length > 100) {
        skipped.push({ rowNumber: lead.rowNumber, reason: 'name longer than 100 characters' });
        continue;
      }
      if (!lead.linkedinUrl) {
        skipped.push({ rowNumber: lead.rowNumber, reason: 'missing linkedinUrl (required; placeholders are never invented)' });
        continue;
      }
      let normalized = '';
      try {
        normalized = new URL(lead.linkedinUrl).toString();
      } catch {
        skipped.push({ rowNumber: lead.rowNumber, reason: 'invalid linkedinUrl' });
        continue;
      }
      if (seenUrls.has(normalized.toLowerCase())) {
        skipped.push({ rowNumber: lead.rowNumber, reason: 'duplicate linkedinUrl within this file' });
        continue;
      }
      seenUrls.add(normalized.toLowerCase());
      if (lead.headline && lead.headline.length > 220) {
        skipped.push({ rowNumber: lead.rowNumber, reason: 'headline longer than 220 characters' });
        continue;
      }
      if (lead.company && lead.company.length > 200) {
        skipped.push({ rowNumber: lead.rowNumber, reason: 'company longer than 200 characters' });
        continue;
      }
      if (lead.location && lead.location.length > 100) {
        skipped.push({ rowNumber: lead.rowNumber, reason: 'location longer than 100 characters' });
        continue;
      }
      candidates.push({ ...lead, linkedinUrl: normalized });
    }

    // Lead.linkedinUrl is unique per workspace (@@unique([workspaceId,
    // linkedinUrl])): pre-check within this workspace instead of catching 500s.
    const urls = candidates.map((c) => c.linkedinUrl as string);
    const existing = urls.length > 0
      ? await prisma.lead.findMany({
        where: { workspaceId: authReq.workspaceId, linkedinUrl: { in: urls } },
        select: { linkedinUrl: true },
      })
      : [];
    const existingSet = new Set(existing.map((e) => e.linkedinUrl.toLowerCase()));
    const toCreate = candidates.filter((c) => {
      if (existingSet.has((c.linkedinUrl as string).toLowerCase())) {
        skipped.push({ rowNumber: c.rowNumber, reason: 'linkedinUrl already imported' });
        return false;
      }
      return true;
    });

    const batch = await prisma.leadImportBatch.create({
      data: {
        workspaceId: authReq.workspaceId,
        filename: data.filename ?? null,
        fileHash,
        totalRows: mapped.leads.length,
        status: 'PENDING',
        importedBy: authReq.user.id,
      },
    });

    for (const c of toCreate) {
      await prisma.lead.create({
        data: {
          workspaceId: authReq.workspaceId,
          linkedinUrl: c.linkedinUrl as string,
          name: c.name,
          headline: c.headline ?? null,
          company: c.company ?? null,
          location: c.location ?? null,
          status: 'NEW',
          tags: [],
          notes: `CSV import${data.filename ? ` "${data.filename}"` : ''} row ${c.rowNumber}.`,
        },
      });
    }

    const status = skipped.length === 0
      ? 'COMPLETED'
      : toCreate.length === 0
        ? 'FAILED'
        : 'COMPLETED_WITH_SKIPS';
    const finished = await prisma.leadImportBatch.update({
      where: { id: batch.id },
      data: {
        importedRows: toCreate.length,
        skippedRows: skipped.length,
        status,
        error: toCreate.length === 0 ? 'No rows were importable; see skipped reasons.' : null,
      },
    });

    res.status(201).json({ batch: finished, deduped: false, imported: toCreate.length, skipped });
  } catch (error) {
    next(error);
  }
});

router.get('/:leadId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.params;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId: authReq.workspaceId },
      include: {
        conversations: { orderBy: { createdAt: 'desc' } },
        opportunities: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!lead) {
      throw new NotFoundError('Lead');
    }

    res.json({ lead });
  } catch (error) {
    next(error);
  }
});

router.patch('/:leadId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.params;
    const data = leadUpdateSchema.parse(req.body);

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId: authReq.workspaceId },
    });

    if (!lead) {
      throw new NotFoundError('Lead');
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        linkedinUrl: data.linkedinUrl,
        name: data.name,
        headline: data.headline,
        company: data.company,
        location: data.location,
        status: data.status?.toUpperCase() as 'NEW' | 'CONTACTED' | 'CONNECTED' | 'RESPONDING' | 'QUALIFIED' | 'DISQUALIFIED' | 'CLOSED' | undefined,
        tags: data.tags,
        notes: data.notes,
      },
    });

    res.json({ lead: updated });
  } catch (error) {
    next(error);
  }
});

router.delete('/:leadId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.params;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId: authReq.workspaceId },
    });

    if (!lead) {
      throw new NotFoundError('Lead');
    }

    await prisma.lead.delete({ where: { id: leadId } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;