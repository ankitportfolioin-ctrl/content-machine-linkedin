import { AIProvider, AIProviderType, AIProviderUnavailableError, AIProviderRateLimitError, AIProviderAuthError, AIProviderError, ChatCompletionRequest, ChatCompletionResponse, EmbeddingRequest, EmbeddingResponse } from './types';

export class AnthropicProvider implements AIProvider {
  readonly type: AIProviderType = 'anthropic';
  readonly name = 'Anthropic';

  private apiKey: string | undefined;
  private baseUrl = 'https://api.anthropic.com/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  getModels(): string[] {
    return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'];
  }

  private convertMessages(request: ChatCompletionRequest) {
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const messages = request.messages.filter((m) => m.role !== 'system');

    return {
      system: systemMessage?.content,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    };
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.isAvailable()) {
      throw new AIProviderUnavailableError(this.type);
    }

    const { system, messages } = this.convertMessages(request);

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 429) {
        throw new AIProviderRateLimitError(this.type);
      }
      if (response.status === 401) {
        throw new AIProviderAuthError(this.type);
      }
      throw new AIProviderError(`Anthropic API error: ${response.status} ${JSON.stringify(error)}`, this.type, 'API_ERROR', response.status);
    }

    const data = await response.json();

    return {
      id: data.id,
      model: data.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: data.content[0]?.text ?? '',
          },
          finishReason: data.stop_reason === 'end_turn' ? 'stop' : 'length',
        },
      ],
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
    };
  }

  async createEmbedding(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error('Anthropic does not support embeddings');
  }
}