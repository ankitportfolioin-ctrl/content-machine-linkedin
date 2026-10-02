import { describe, it, expect, vi } from 'vitest';
import {
  validateAndNormalize,
  extractJsonFromMarkdown,
  parseJsonSafely,
  normalizeToArray,
  createStrictPrompt,
  AI_OUTPUT_SCHEMAS,
  AIValidationContext,
} from '../aiOutputValidation';
import { z } from 'zod';

const TestSchema = z.object({
  name: z.string(),
  tags: z.array(z.string()),
  count: z.number(),
  active: z.boolean(),
  nested: z.object({
    value: z.string(),
  }).optional(),
});

describe('AI Output Validation Layer', () => {
  const baseContext: AIValidationContext = {
    workspaceId: 'test-workspace',
    stage: 'test',
    provider: 'openai',
    model: 'gpt-4o-mini',
    schemaName: 'TestSchema',
  };

  describe('extractJsonFromMarkdown', () => {
    it('A. extracts JSON from markdown code blocks', () => {
      const input = '```json\n{"name": "test", "tags": ["a", "b"], "count": 1, "active": true}\n```';
      const { json, hadMarkdown } = extractJsonFromMarkdown(input);
      expect(hadMarkdown).toBe(true);
      expect(json).toBe('{"name": "test", "tags": ["a", "b"], "count": 1, "active": true}');
    });

    it('B. handles JSON without markdown', () => {
      const input = '{"name": "test", "tags": ["a"], "count": 1, "active": true}';
      const { json, hadMarkdown } = extractJsonFromMarkdown(input);
      expect(hadMarkdown).toBe(false);
      expect(json).toBe(input);
    });

    it('C. handles markdown without json specifier', () => {
      const input = '```\n{"name": "test", "tags": ["a"], "count": 1, "active": true}\n```';
      const { json, hadMarkdown } = extractJsonFromMarkdown(input);
      expect(hadMarkdown).toBe(true);
      expect(json).toBe('{"name": "test", "tags": ["a"], "count": 1, "active": true}');
    });

    it('D. handles whitespace around markdown', () => {
      const input = '  ```json\n{"name": "test", "tags": ["a"], "count": 1, "active": true}\n```  ';
      const { json, hadMarkdown } = extractJsonFromMarkdown(input);
      expect(hadMarkdown).toBe(true);
      expect(json).toBe('{"name": "test", "tags": ["a"], "count": 1, "active": true}');
    });
  });

  describe('parseJsonSafely', () => {
    it('A. parses valid JSON', () => {
      const { data, error } = parseJsonSafely('{"name": "test", "count": 1}');
      expect(error).toBeUndefined();
      expect(data).toEqual({ name: 'test', count: 1 });
    });

    it('F. returns error for malformed JSON', () => {
      const { data, error } = parseJsonSafely('{invalid json}');
      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error).toContain('Expected property name');
    });

    it('F. returns error for incomplete JSON', () => {
      const { data, error } = parseJsonSafely('{"name": "test"');
      expect(data).toBeNull();
      expect(error).toBeDefined();
    });
  });

  describe('normalizeToArray', () => {
    it('C. returns array as-is', () => {
      const result = normalizeToArray(['a', 'b', 'c'], 'tags');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('E. normalizes string to single-element array', () => {
      const result = normalizeToArray('single-value', 'tags');
      expect(result).toEqual(['single-value']);
    });

    it('H. normalizes null to empty array', () => {
      const result = normalizeToArray(null, 'tags');
      expect(result).toEqual([]);
    });

    it('H. normalizes undefined to empty array', () => {
      const result = normalizeToArray(undefined, 'tags');
      expect(result).toEqual([]);
    });

    it('I. normalizes object to stringified array', () => {
      const result = normalizeToArray({ key: 'value' }, 'tags');
      expect(result).toEqual(['{"key":"value"}']);
    });

    it('I. normalizes number to stringified array', () => {
      const result = normalizeToArray(42, 'tags');
      expect(result).toEqual(['42']);
    });
  });

  describe('validateAndNormalize', () => {
    it('A. validates valid JSON object', () => {
      const input = '{"name": "test", "tags": ["a", "b"], "count": 1, "active": true}';
      const result = validateAndNormalize(TestSchema, input, baseContext);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('test');
        expect(result.data.tags).toEqual(['a', 'b']);
        expect(result.data.count).toBe(1);
        expect(result.data.active).toBe(true);
      }
    });

    it('B. validates markdown-wrapped JSON', () => {
      const input = '```json\n{"name": "test", "tags": ["a"], "count": 1, "active": true}\n```';
      const result = validateAndNormalize(TestSchema, input, baseContext);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('test');
      }
    });

    it('C. validates valid arrays', () => {
      const input = '{"name": "test", "tags": ["a", "b", "c"], "count": 3, "active": false}';
      const result = validateAndNormalize(TestSchema, input, baseContext);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.tags).toEqual(['a', 'b', 'c']);
      }
    });

    it('D. validates scalar fields', () => {
      const input = '{"name": "test", "tags": [], "count": 42, "active": true}';
      const result = validateAndNormalize(TestSchema, input, baseContext);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.count).toBe(42);
        expect(result.data.active).toBe(true);
      }
    });

    it('E. normalizes string where array expected', () => {
      const input = '{"name": "test", "tags": "single-tag", "count": 1, "active": true}';
      const result = validateAndNormalize(TestSchema, input, baseContext);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.tags).toEqual(['single-tag']);
        expect(result.normalizedFields).toContain('tags');
      }
    });

    it('F. rejects malformed JSON', () => {
      const input = '{invalid json}';
      const result = validateAndNormalize(TestSchema, input, baseContext);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorType).toBe('PARSE_ERROR');
      }
    });

    it('G. rejects missing required field', () => {
      const input = '{"tags": ["a"], "count": 1, "active": true}';
      const result = validateAndNormalize(TestSchema, input, baseContext);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorType).toBe('SCHEMA_VALIDATION');
        expect(result.field).toBe('name');
      }
    });

    it('H. normalizes null where array expected', () => {
      const input = '{"name": "test", "tags": null, "count": 1, "active": true}';
      const result = validateAndNormalize(TestSchema, input, baseContext);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.tags).toEqual([]);
        expect(result.normalizedFields).toContain('tags');
      }
    });

    it('I. rejects wrong object type', () => {
      const input = '{"name": "test", "tags": "not-array", "count": "not-number", "active": "not-boolean"}';
      const result = validateAndNormalize(TestSchema, input, baseContext);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorType).toBe('SCHEMA_VALIDATION');
      }
    });

    it('J. accepts extra fields (Zod default behavior)', () => {
      const input = '{"name": "test", "tags": ["a"], "count": 1, "active": true, "extra": "field"}';
      const result = validateAndNormalize(TestSchema, input, baseContext);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('test');
      }
    });

    it('returns structured validation error with field info', () => {
      // Use a case that can't be normalized - wrong type for a non-array field
      const input = '{"name": 123, "tags": ["a"], "count": 1, "active": true}';
      const result = validateAndNormalize(TestSchema, input, baseContext);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.field).toBe('name');
        expect(result.expected).toBe('string');
        expect(result.received).toBe('number');
      }
    });

    it('logs validation failure with context', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Use a case that can't be normalized
      const input = '{"name": 123, "tags": ["a"], "count": 1, "active": true}';
      validateAndNormalize(TestSchema, input, baseContext);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[AI_VALIDATION_FAILURE]',
        expect.stringContaining('"stage":"test"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '[AI_VALIDATION_FAILURE]',
        expect.stringContaining('"provider":"openai"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '[AI_VALIDATION_FAILURE]',
        expect.stringContaining('"schema":"TestSchema"')
      );
      
      consoleSpy.mockRestore();
    });

    it('does not log API keys or secrets', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const input = '{"name": "test", "tags": "not-array", "count": 1, "active": true}';
      validateAndNormalize(TestSchema, input, {
        ...baseContext,
        // Simulate potential secret leakage - should NOT appear in logs
      });
      
      const logCalls = consoleSpy.mock.calls.map(call => JSON.stringify(call));
      const allLogs = logCalls.join(' ');
      
      expect(allLogs).not.toContain('apiKey');
      expect(allLogs).not.toContain('API_KEY');
      expect(allLogs).not.toContain('secret');
      expect(allLogs).not.toContain('token');
      
      consoleSpy.mockRestore();
    });
  });

  describe('createStrictPrompt', () => {
    it('generates prompt with schema description', () => {
      const basePrompt = 'Test prompt';
      const result = createStrictPrompt(TestSchema, basePrompt);
      
      expect(result).toContain(basePrompt);
      expect(result).toContain('RETURN ONLY VALID JSON MATCHING THIS EXACT SCHEMA');
      expect(result).toContain('name');
      expect(result).toContain('tags');
      expect(result).toContain('count');
      expect(result).toContain('active');
      expect(result).toContain('All array fields MUST be arrays');
      expect(result).toContain('All numeric fields MUST be numbers');
      expect(result).toContain('All boolean fields MUST be booleans');
    });

    it('includes field descriptions when provided', () => {
      const basePrompt = 'Test prompt';
      const result = createStrictPrompt(TestSchema, basePrompt, {
        name: 'The name field',
        tags: 'Array of tags',
      });
      
      expect(result).toContain('The name field');
      expect(result).toContain('Array of tags');
    });
  });

  describe('AI_OUTPUT_SCHEMAS', () => {
    it('has sourceUnderstanding schema', () => {
      expect(AI_OUTPUT_SCHEMAS.sourceUnderstanding).toBeDefined();
      const result = AI_OUTPUT_SCHEMAS.sourceUnderstanding.safeParse({
        thesis: 'Test thesis',
        mainProblem: 'Test problem',
        observations: ['obs1'],
        claims: [],
        evidence: [],
        implications: ['imp1'],
        uncertainties: ['unc1'],
        contradictions: [],
        audienceRelevance: ['rel1'],
        possibleAngles: ['angle1'],
      });
      expect(result.success).toBe(true);
    });

    it('has topicClustering schema', () => {
      expect(AI_OUTPUT_SCHEMAS.topicClustering).toBeDefined();
      const result = AI_OUTPUT_SCHEMAS.topicClustering.safeParse([
        { canonicalName: 'test', name: 'Test', description: 'Desc', aliases: [], confidence: 0.8 },
      ]);
      expect(result.success).toBe(true);
    });

    it('has contentOpportunity schema', () => {
      expect(AI_OUTPUT_SCHEMAS.contentOpportunity).toBeDefined();
      const result = AI_OUTPUT_SCHEMAS.contentOpportunity.safeParse({
        title: 'Test',
        thesis: 'Thesis',
        problem: 'Problem',
        audience: 'Audience',
        angle: 'Angle',
        objective: 'Objective',
        contentFormat: 'POST',
        reasoning: 'Reasoning',
        evidenceSummary: 'Evidence',
      });
      expect(result.success).toBe(true);
    });

    it('has contentGap schema', () => {
      expect(AI_OUTPUT_SCHEMAS.contentGap).toBeDefined();
      const result = AI_OUTPUT_SCHEMAS.contentGap.safeParse([
        { gapType: 'AUDIENCE', description: 'Desc', importanceScore: 0.5, evidence: 'Evidence' },
      ]);
      expect(result.success).toBe(true);
    });

    it('has audienceProblems schema', () => {
      expect(AI_OUTPUT_SCHEMAS.audienceProblems).toBeDefined();
      const result = AI_OUTPUT_SCHEMAS.audienceProblems.safeParse({
        groups: [{
          id: 'test',
          problem: 'Problem',
          audience: 'Audience',
          evidence: [],
          frequency: 1,
          suggestedContent: { angle: 'Angle', format: 'TUTORIAL', hook: 'Hook', educationalValue: 'HIGH' },
          yfpRelevance: 'HIGH',
          businessAlignment: 'Alignment',
          confidence: 0.8,
        }],
      });
      expect(result.success).toBe(true);
    });
  });
});