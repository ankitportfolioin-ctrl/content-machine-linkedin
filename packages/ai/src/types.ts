import { z } from 'zod';

export const AIProviderType = z.enum(['openai', 'anthropic', 'openrouter']);
export type AIProviderType = z.infer<typeof AIProviderType>;

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  toolCalls: z.array(z.unknown()).optional(),
  toolCallId: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatCompletionRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  responseFormat: z.object({ type: z.enum(['text', 'json_object']) }).optional(),
  tools: z.array(z.unknown()).optional(),
  toolChoice: z.unknown().optional(),
});
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number(),
      message: ChatMessageSchema,
      finishReason: z.enum(['stop', 'length', 'tool_calls', 'content_filter', 'function_call']),
    })
  ),
  usage: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
    })
    .optional(),
});
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;

export const EmbeddingRequestSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  model: z.string(),
});
export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;

export const EmbeddingResponseSchema = z.object({
  object: z.string(),
  data: z.array(
    z.object({
      object: z.string(),
      embedding: z.array(z.number()),
      index: z.number(),
    })
  ),
  model: z.string(),
  usage: z.object({
    promptTokens: z.number(),
    totalTokens: z.number(),
  }),
});
export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;

export interface AIProvider {
  readonly type: AIProviderType;
  readonly name: string;

  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  createEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  isAvailable(): boolean;
  getModels(): string[];
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: AIProviderType,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export class AIProviderUnavailableError extends AIProviderError {
  constructor(provider: AIProviderType, message = 'Provider is not available') {
    super(message, provider, 'UNAVAILABLE', 503);
    this.name = 'AIProviderUnavailableError';
  }
}

export class AIProviderRateLimitError extends AIProviderError {
  constructor(provider: AIProviderType, retryAfter?: number) {
    super('Rate limit exceeded', provider, 'RATE_LIMIT', 429);
    this.name = 'AIProviderRateLimitError';
    this.retryAfter = retryAfter;
  }
  readonly retryAfter?: number;
}

export class AIProviderAuthError extends AIProviderError {
  constructor(provider: AIProviderType) {
    super('Authentication failed', provider, 'AUTH_ERROR', 401);
    this.name = 'AIProviderAuthError';
  }
}