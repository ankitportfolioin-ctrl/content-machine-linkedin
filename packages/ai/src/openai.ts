import { AIProvider, AIProviderType, AIProviderUnavailableError, AIProviderRateLimitError, AIProviderAuthError, AIProviderError, ChatCompletionRequest, ChatCompletionResponse, EmbeddingRequest, EmbeddingResponse } from './types';

export class OpenAIProvider implements AIProvider {
  readonly type: AIProviderType = 'openai';
  readonly name = 'OpenAI';

  private apiKey: string | undefined;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  getModels(): string[] {
    return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.isAvailable()) {
      throw new AIProviderUnavailableError(this.type);
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
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
      throw new AIProviderError(`OpenAI API error: ${response.status} ${JSON.stringify(error)}`, this.type, 'API_ERROR', response.status);
    }

    return response.json();
  }

  async createEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.isAvailable()) {
      throw new AIProviderUnavailableError(this.type);
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
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
      throw new AIProviderError(`OpenAI API error: ${response.status} ${JSON.stringify(error)}`, this.type, 'API_ERROR', response.status);
    }

    return response.json();
  }
}