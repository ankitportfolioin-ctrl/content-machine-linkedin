import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ClaimLedgerService } from '../claimLedger';
import { SourceUnderstanding } from '../sourceUnderstanding';

const mockPrisma = {
  sourceClaim: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
} as unknown as PrismaClient;

describe('ClaimLedgerService', () => {
  let service: ClaimLedgerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClaimLedgerService(mockPrisma);
  });

  describe('persistClaims', () => {
    it('creates claims with correct fields', async () => {
      const understanding: SourceUnderstanding = {
        thesis: 'Test thesis',
        mainProblem: 'Test problem',
        observations: ['Obs 1'],
        claims: [
          {
            text: 'Fact claim',
            type: 'FACT',
            evidence: 'Evidence text',
            evidenceLocation: 'Paragraph 1',
            confidence: 0.9,
          },
          {
            text: 'Opinion claim',
            type: 'OPINION',
            evidence: 'Opinion evidence',
            confidence: 0.7,
          },
          {
            text: 'Prediction claim',
            type: 'PREDICTION',
            evidence: 'Prediction evidence',
            confidence: 0.6,
          },
        ],
        evidence: ['Evidence 1'],
        implications: ['Implication 1'],
        uncertainties: ['Uncertainty 1'],
        contradictions: [],
        audienceRelevance: ['Relevance 1'],
        possibleAngles: ['Angle 1'],
      };

      mockPrisma.sourceClaim.findMany.mockResolvedValue([]);
      mockPrisma.sourceClaim.create.mockImplementation(({ data }) => Promise.resolve({ id: 'claim-id', ...data }));

      const result = await service.persistClaims('workspace-1', 'source-1', 'doc-1', understanding);

      expect(result).toHaveLength(3);
      expect(result[0].claimText).toBe('Fact claim');
      expect(result[0].claimType).toBe('FACT');
      expect(result[0].confidence).toBe(0.9);
      expect(result[0].status).toBe('SUPPORTED');
      expect(result[1].claimType).toBe('OPINION');
      expect(result[1].status).toBe('SUPPORTED');
      expect(result[2].claimType).toBe('PREDICTION');
      expect(result[2].status).toBe('UNCERTAIN');
    });

    it('sets status based on confidence', async () => {
      const understanding: SourceUnderstanding = {
        thesis: 'Test',
        mainProblem: 'Test',
        observations: [],
        claims: [
          { text: 'High confidence', type: 'FACT', evidence: 'Evidence', confidence: 0.9 },
          { text: 'Medium confidence', type: 'FACT', evidence: 'Evidence', confidence: 0.6 },
          { text: 'Low confidence', type: 'FACT', evidence: 'Evidence', confidence: 0.3 },
        ],
        evidence: [],
        implications: [],
        uncertainties: [],
        contradictions: [],
        audienceRelevance: [],
        possibleAngles: [],
      };

      mockPrisma.sourceClaim.findMany.mockResolvedValue([]);
      mockPrisma.sourceClaim.create.mockImplementation(({ data }) => Promise.resolve({ id: 'claim-id', ...data }));

      const result = await service.persistClaims('workspace-1', 'source-1', 'doc-1', understanding);

      expect(result[0].status).toBe('SUPPORTED');
      expect(result[1].status).toBe('UNCERTAIN');
      expect(result[2].status).toBe('UNCERTAIN');
    });

    it('includes provenance in created claims', async () => {
      const understanding: SourceUnderstanding = {
        thesis: 'Test',
        mainProblem: 'Test',
        observations: [],
        claims: [
          { text: 'Claim', type: 'FACT', evidence: 'Evidence', confidence: 0.8 },
        ],
        evidence: [],
        implications: [],
        uncertainties: [],
        contradictions: [],
        audienceRelevance: [],
        possibleAngles: [],
      };

      mockPrisma.sourceClaim.findMany.mockResolvedValue([]);
      mockPrisma.sourceClaim.create.mockImplementation(({ data }) => Promise.resolve({ id: 'claim-id', ...data }));

      const result = await service.persistClaims('workspace-1', 'source-1', 'doc-1', understanding);

      expect(result[0].provenance).toBeDefined();
      expect(result[0].provenance.sourceUrl).toBeDefined();
      expect(result[0].provenance.extractedAt).toBeDefined();
      expect(result[0].provenance.evidence).toBe('Evidence');
    });
  });

  describe('detectContradictions', () => {
    it('detects numeric contradictions', async () => {
      mockPrisma.sourceClaim.findMany.mockResolvedValue([
        {
          id: 'claim-1',
          claimText: 'The company has 50 employees',
          claimType: 'STATISTIC',
          evidenceText: 'The company has 50 employees',
          evidenceLocation: 'Paragraph 1',
          confidence: 0.9,
          status: 'SUPPORTED',
          provenance: { sourceUrl: 'https://example.com' },
        },
        {
          id: 'claim-2',
          claimText: 'The company has 100 employees',
          claimType: 'STATISTIC',
          evidenceText: 'The company has 100 employees',
          evidenceLocation: 'Paragraph 2',
          confidence: 0.9,
          status: 'SUPPORTED',
          provenance: { sourceUrl: 'https://example.com' },
        },
      ]);

      const result = await service.detectContradictions('workspace-1', 'source-1');

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('CRITICAL');
    });

    it('detects negation contradictions', async () => {
      mockPrisma.sourceClaim.findMany.mockResolvedValue([
        {
          id: 'claim-1',
          claimText: 'The product is available',
          claimType: 'FACT',
          evidenceText: 'The product is available',
          evidenceLocation: 'Paragraph 1',
          confidence: 0.9,
          status: 'SUPPORTED',
          provenance: {},
        },
        {
          id: 'claim-2',
          claimText: 'The product is not available',
          claimType: 'FACT',
          evidenceText: 'The product is not available',
          evidenceLocation: 'Paragraph 2',
          confidence: 0.9,
          status: 'SUPPORTED',
          provenance: {},
        },
      ]);

      const result = await service.detectContradictions('workspace-1', 'source-1');

      expect(result).toHaveLength(1);
    });

    it('detects directional contradictions', async () => {
      mockPrisma.sourceClaim.findMany.mockResolvedValue([
        {
          id: 'claim-1',
          claimText: 'Revenue increased by 20%',
          claimType: 'STATISTIC',
          evidenceText: 'Revenue increased by 20%',
          evidenceLocation: 'Paragraph 1',
          confidence: 0.9,
          status: 'SUPPORTED',
          provenance: {},
        },
        {
          id: 'claim-2',
          claimText: 'Revenue decreased by 10%',
          claimType: 'STATISTIC',
          evidenceText: 'Revenue decreased by 10%',
          evidenceLocation: 'Paragraph 2',
          confidence: 0.9,
          status: 'SUPPORTED',
          provenance: {},
        },
      ]);

      const result = await service.detectContradictions('workspace-1', 'source-1');

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('CRITICAL');
    });

    it('returns empty array for no contradictions', async () => {
      mockPrisma.sourceClaim.findMany.mockResolvedValue([
        {
          id: 'claim-1',
          claimText: 'The company has 50 employees',
          claimType: 'STATISTIC',
          evidenceText: 'The company has 50 employees',
          evidenceLocation: 'Paragraph 1',
          confidence: 0.9,
          status: 'SUPPORTED',
          provenance: {},
        },
        {
          id: 'claim-2',
          claimText: 'The company was founded in 2020',
          claimType: 'FACT',
          evidenceText: 'The company was founded in 2020',
          evidenceLocation: 'Paragraph 2',
          confidence: 0.9,
          status: 'SUPPORTED',
          provenance: {},
        },
      ]);

      const result = await service.detectContradictions('workspace-1', 'source-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('getClaimsForSource', () => {
    it('returns claims with correct mapping', async () => {
      mockPrisma.sourceClaim.findMany.mockResolvedValue([
        {
          id: 'claim-1',
          claimText: 'Test claim',
          claimType: 'FACT',
          evidenceText: 'Evidence',
          evidenceLocation: 'Location',
          confidence: 0.8,
          status: 'SUPPORTED',
          provenance: { key: 'value' },
        },
      ]);

      const result = await service.getClaimsForSource('workspace-1', 'source-1');

      expect(result).toHaveLength(1);
      expect(result[0].claimText).toBe('Test claim');
      expect(result[0].claimType).toBe('FACT');
      expect(result[0].provenance).toEqual({ key: 'value' });
    });
  });

  describe('updateClaimStatus', () => {
    it('updates claim status', async () => {
      mockPrisma.sourceClaim.update.mockResolvedValue({});

      await service.updateClaimStatus('workspace-1', 'claim-1', 'CONTRADICTED');

      expect(mockPrisma.sourceClaim.update).toHaveBeenCalledWith({
        where: { id: 'claim-1' },
        data: { status: 'CONTRADICTED' },
      });
    });
  });
});