import { z, ZodSchema, ZodError } from 'zod';

export interface AIValidationError {
  ok: false;
  errorType: 'SCHEMA_VALIDATION' | 'PARSE_ERROR' | 'MARKDOWN_EXTRACTION' | 'NORMALIZATION';
  field?: string;
  expected?: string;
  received?: string;
  message: string;
  details?: unknown;
  timestamp: string;
}

export interface AIValidationSuccess<T> {
  ok: true;
  data: T;
  normalizedFields?: string[];
  timestamp: string;
}

export type AIValidationResult<T> = AIValidationSuccess<T> | AIValidationError;

export interface AIValidationContext {
  workspaceId?: string;
  stage: string;
  provider?: string;
  model?: string;
  schemaName?: string;
}

export function extractJsonFromMarkdown(content: string): { json: string; hadMarkdown: boolean } {
  const trimmed = content.trim();
  const markdownMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (markdownMatch?.[1]) {
    return { json: markdownMatch[1].trim(), hadMarkdown: true };
  }
  return { json: trimmed, hadMarkdown: false };
}

export function parseJsonSafely(jsonString: string): { data: unknown; error?: string } {
  try {
    return { data: JSON.parse(jsonString) };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown parse error' };
  }
}

export function normalizeArrayField<T>(value: unknown, fieldName: string): { normalized: T[]; wasNormalized: boolean } {
  if (Array.isArray(value)) {
    return { normalized: value as T[], wasNormalized: false };
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return { normalized: [value.trim()] as T[], wasNormalized: true };
  }
  return { normalized: [], wasNormalized: false };
}

export function normalizeToArray<T>(value: unknown, fieldName: string): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'string') {
    return [value] as T[];
  }
  if (typeof value === 'object') {
    return [JSON.stringify(value)] as T[];
  }
  return [String(value)] as T[];
}

export function validateAndNormalize<T>(
  schema: ZodSchema<T>,
  rawResponse: string,
  context: AIValidationContext
): AIValidationResult<T> {
  const timestamp = new Date().toISOString();

  const { json: extractedJson, hadMarkdown } = extractJsonFromMarkdown(rawResponse);

  const parseResult = parseJsonSafely(extractedJson);
  if (parseResult.error) {
    const error: AIValidationError = {
      ok: false,
      errorType: 'PARSE_ERROR',
      message: `Failed to parse JSON: ${parseResult.error}`,
      details: { rawResponse: rawResponse.slice(0, 500), hadMarkdown },
      timestamp,
    };
    logAIValidationFailure(context, error);
    return error;
  }

  const parsed = parseResult.data;

  const safeParseResult = schema.safeParse(parsed);
  if (safeParseResult.success) {
    return {
      ok: true,
      data: safeParseResult.data,
      normalizedFields: [],
      timestamp,
    };
  }

  const zodError = safeParseResult.error;
  const issues = zodError.issues;

  for (const issue of issues) {
    const fieldPath = issue.path.join('.');
    const expectedType = getExpectedTypeDescription(issue);
    const receivedType = getReceivedTypeDescription(parsed, issue.path);

    if (isArrayExpected(issue) && (isStringReceived(parsed, issue.path) || isNullOrUndefinedReceived(parsed, issue.path))) {
      const normalized = normalizeToArray(getValueAtPath(parsed, issue.path), fieldPath);
      const mutated = setValueAtPath(parsed, issue.path, normalized);
      const retryResult = schema.safeParse(mutated);
      if (retryResult.success) {
        return {
          ok: true,
          data: retryResult.data,
          normalizedFields: [fieldPath],
          timestamp,
        };
      }
    }
  }

  if (issues.length === 0) {
    return {
      ok: false,
      errorType: 'SCHEMA_VALIDATION',
      message: 'Schema validation failed with no issues',
      timestamp,
    };
  }

  // TypeScript knows issues is non-empty here
  const firstIssue = issues[0] as z.ZodIssue;
  const fieldPath = firstIssue.path.join('.');
  const expectedType = getExpectedTypeDescription(firstIssue);
  const receivedType = getReceivedTypeDescription(parsed, firstIssue.path);

  const error: AIValidationError = {
    ok: false,
    errorType: 'SCHEMA_VALIDATION',
    field: fieldPath,
    expected: expectedType,
    received: receivedType,
    message: `Schema validation failed at ${fieldPath}: expected ${expectedType}, received ${receivedType}`,
    details: {
      issues: issues.map(i => ({
        path: i.path.join('.'),
        code: i.code,
        message: i.message,
        expected: getExpectedTypeDescription(i),
        received: getReceivedTypeDescription(parsed, i.path),
      })),
      hadMarkdown,
    },
    timestamp,
  };

  logAIValidationFailure(context, error);
  return error;
}

function isArrayExpected(issue: z.ZodIssue): boolean {
  return issue.code === 'invalid_type' && issue.expected === 'array';
}

function isStringReceived(parsed: unknown, path: (string | number)[]): boolean {
  const value = getValueAtPath(parsed, path);
  return typeof value === 'string';
}

function isNullOrUndefinedReceived(parsed: unknown, path: (string | number)[]): boolean {
  const value = getValueAtPath(parsed, path);
  return value === null || value === undefined;
}

function getValueAtPath(obj: unknown, path: (string | number)[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function setValueAtPath(obj: unknown, path: (string | number)[], value: unknown): unknown {
  if (path.length === 0) return value;
  if (!obj || typeof obj !== 'object') return obj;

  const cloned = Array.isArray(obj) ? [...obj] : { ...obj };
  const key = path[0];
  const rest = path.slice(1);

  if (rest.length === 0) {
    (cloned as Record<string, unknown>)[String(key)] = value;
  } else {
    const current = (cloned as Record<string, unknown>)[String(key)];
    (cloned as Record<string, unknown>)[String(key)] = setValueAtPath(current, rest, value);
  }
  return cloned;
}

function getExpectedTypeDescription(issue: z.ZodIssue): string {
  const anyIssue = issue as { expected?: unknown };
  if (anyIssue.expected) return String(anyIssue.expected);
  if (issue.code === 'invalid_type') return issue.received || 'unknown';
  if (issue.code === 'invalid_enum_value') return `enum: ${issue.options?.join(' | ') || 'unknown'}`;
  if (issue.code === 'too_small') return `min ${issue.minimum} (${issue.type})`;
  if (issue.code === 'too_big') return `max ${issue.maximum} (${issue.type})`;
  return issue.code;
}

function getReceivedTypeDescription(obj: unknown, path: (string | number)[]): string {
  const value = getValueAtPath(obj, path);
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `array[${value.length}]`;
  return typeof value;
}

function logAIValidationFailure(context: AIValidationContext, error: AIValidationError): void {
  const logEntry = {
    timestamp: error.timestamp,
    workspaceId: context.workspaceId || 'unknown',
    stage: context.stage,
    provider: context.provider || 'unknown',
    model: context.model || 'unknown',
    schema: context.schemaName || 'unknown',
    errorType: error.errorType,
    field: error.field,
    expected: error.expected,
    received: error.received,
    message: error.message,
  };
  console.error('[AI_VALIDATION_FAILURE]', JSON.stringify(logEntry));
}

export function createStrictPrompt(schema: ZodSchema, basePrompt: string, fieldDescriptions?: Record<string, string>): string {
  const shape = (schema as z.ZodObject<any>)?.shape;
  if (!shape) return basePrompt;

  let schemaDescription = '\n\nRETURN ONLY VALID JSON MATCHING THIS EXACT SCHEMA:\n';
  schemaDescription += '{\n';

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    const description = fieldDescriptions?.[key] || '';
    const typeDesc = getZodTypeDescription(zodType);
    const required = !zodType.isOptional?.();
    schemaDescription += `  "${key}": ${typeDesc}${required ? ' (REQUIRED)' : ' (optional)'}${description ? ` - ${description}` : ''},\n`;
  }

  schemaDescription += '}\n';
  schemaDescription += '\nCRITICAL: All array fields MUST be arrays (e.g., "field": ["item1", "item2"]), NOT strings.\n';
  schemaDescription += 'All numeric fields MUST be numbers, NOT strings.\n';
  schemaDescription += 'All boolean fields MUST be booleans, NOT strings.\n';
  schemaDescription += 'Do not include markdown formatting, comments, or extra text.\n';

  return basePrompt + schemaDescription;
}

function getZodTypeDescription(zodType: z.ZodTypeAny): string {
  const typeName = zodType._def?.typeName || 'unknown';

  switch (typeName) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodArray':
      const elementType = getZodTypeDescription((zodType as z.ZodArray<any>)._def.type);
      return `${elementType}[]`;
    case 'ZodObject':
      return 'object';
    case 'ZodEnum':
      const values = (zodType as z.ZodEnum<any>)._def.values;
      return `enum: ${values.join(' | ')}`;
    case 'ZodOptional':
      return getZodTypeDescription((zodType as z.ZodOptional<any>)._def.innerType);
    case 'ZodNullable':
      return getZodTypeDescription((zodType as z.ZodNullable<any>)._def.innerType) + ' | null';
    case 'ZodDefault':
      return getZodTypeDescription((zodType as z.ZodDefault<any>)._def.innerType);
    default:
      return typeName.toLowerCase().replace('zod', '');
  }
}

export const AI_OUTPUT_SCHEMAS = {
  sourceUnderstanding: z.object({
    thesis: z.string().max(2000),
    mainProblem: z.string().max(2000),
    observations: z.array(z.string().max(1000)).max(20),
    claims: z.array(z.object({
      text: z.string().max(2000),
      type: z.enum(['FACT', 'OPINION', 'PREDICTION', 'RECOMMENDATION', 'OBSERVATION', 'STATISTIC']),
      evidence: z.string().max(3000),
      evidenceLocation: z.string().max(500).optional(),
      confidence: z.number().min(0).max(1),
    })).max(50),
    evidence: z.array(z.string().max(3000)).max(30),
    implications: z.array(z.string().max(1000)).max(20),
    uncertainties: z.array(z.string().max(1000)).max(20),
    contradictions: z.array(z.object({
      claim1: z.string().max(2000),
      claim2: z.string().max(2000),
      evidence1: z.string().max(3000),
      evidence2: z.string().max(3000),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    })).max(20),
    audienceRelevance: z.array(z.string().max(500)).max(10),
    possibleAngles: z.array(z.string().max(500)).max(10),
  }),
  
  topicClustering: z.array(z.object({
    canonicalName: z.string(),
    name: z.string(),
    description: z.string(),
    aliases: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  })),
  
  contentOpportunity: z.object({
    title: z.string().max(300),
    thesis: z.string().max(2000),
    problem: z.string().max(2000),
    audience: z.string().max(2000),
    angle: z.string().max(2000),
    objective: z.string().max(2000),
    contentFormat: z.enum(['POST', 'ARTICLE', 'CAROUSEL', 'VIDEO', 'POLL']),
    reasoning: z.string().max(3000),
    evidenceSummary: z.string().max(3000),
  }),
  
  contentGap: z.array(z.object({
    gapType: z.enum(['AUDIENCE', 'TOPIC', 'FORMAT', 'ANGLE', 'DEPTH', 'EVIDENCE']),
    description: z.string().max(1000),
    importanceScore: z.number().min(0).max(1),
    evidence: z.string().max(1000),
  })),
  
  audienceProblems: z.object({
    groups: z.array(z.object({
      id: z.string(),
      problem: z.string().max(500),
      audience: z.string().max(200),
      evidence: z.array(z.object({
        sourceId: z.string(),
        sourceTitle: z.string().nullable(),
        sourceUrl: z.string(),
        sourceType: z.string(),
        quote: z.string().max(500),
        publishedAt: z.string().nullable(),
      })),
      frequency: z.number(),
      suggestedContent: z.object({
        angle: z.string().max(500),
        format: z.enum(['TUTORIAL', 'EXPLAINER', 'CAROUSEL', 'FRAMEWORK', 'CASE_STUDY', 'TOOL_BREAKDOWN', 'PROJECT_WALKTHROUGH', 'MYTH_VS_FACT']),
        hook: z.string().max(300),
        educationalValue: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      }),
      yfpRelevance: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      businessAlignment: z.string().max(500),
      confidence: z.number().min(0).max(1),
    })),
  }),
};

export type SourceUnderstanding = z.infer<typeof AI_OUTPUT_SCHEMAS.sourceUnderstanding>;
export type TopicClusteringOutput = z.infer<typeof AI_OUTPUT_SCHEMAS.topicClustering>;
export type ContentOpportunityOutput = z.infer<typeof AI_OUTPUT_SCHEMAS.contentOpportunity>;
export type ContentGapOutput = z.infer<typeof AI_OUTPUT_SCHEMAS.contentGap>;
export type AudienceProblemsOutput = z.infer<typeof AI_OUTPUT_SCHEMAS.audienceProblems>;