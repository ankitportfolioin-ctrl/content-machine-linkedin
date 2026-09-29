import { AIProvider, AIProviderType, AIProviderUnavailableError, AIProviderRateLimitError, AIProviderAuthError, AIProviderError, ChatCompletionRequest, ChatCompletionResponse, EmbeddingRequest, EmbeddingResponse } from './types';

/**
 * OpenRouter provider. OpenRouter exposes an OpenAI-compatible
 * `/chat/completions` endpoint, so requests keep the same shape as OpenAI
 * (including bare model ids like `gpt-4o-mini`, which OpenRouter routes).
 *
 * Optional `defaultModel` override: when set (via OPENROUTER_MODEL), every
 * chat request is routed through that model instead of the requested one.
 * Useful for prototyping on a free `:free` model without touching callers.
 * Unset means transparent pass-through of the requested model.
 */
export class OpenRouterProvider implements AIProvider {
  readonly type: AIProviderType = 'openrouter';
  readonly name = 'OpenRouter';

  private apiKey: string | undefined;
  private defaultModel: string | undefined;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private appTitle = 'Growth Operator';

  constructor(apiKey?: string, defaultModel?: string) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel?.trim() ? defaultModel.trim() : undefined;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  getModels(): string[] {
    if (this.defaultModel) return [this.defaultModel];
    return ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.3-70b-instruct'];
  }

  resolveModel(requested: string): string {
    if (this.defaultModel) return this.defaultModel;
    return requested;
  }

  private headers(): Record<string, string> {
    // OpenRouter requires HTTP-Referer / X-Title for attribution; key stays
    // in the Authorization header only.
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': this.appTitle,
    };
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.isAvailable()) {
      throw new AIProviderUnavailableError(this.type);
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...request, model: this.resolveModel(request.model) }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 429) {
        throw new AIProviderRateLimitError(this.type);
      }
      if (response.status === 401) {
        throw new AIProviderAuthError(this.type);
      }
      throw new AIProviderError(`OpenRouter API error: ${response.status} ${JSON.stringify(error)}`, this.type, 'API_ERROR', response.status);
    }

    return response.json();
  }

  async createEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.isAvailable()) {
      throw new AIProviderUnavailableError(this.type);
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 429) {
        throw new AIProviderRateLimitError(this.type);
      }
      if (response.status === 401) {
        throw new AIProviderAuthError(this.type);
      }
      throw new AIProviderError(`OpenRouter API error: ${response.status} ${JSON.stringify(error)}`, this.type, 'API_ERROR', response.status);
    }

    return response.json();
  }
}
