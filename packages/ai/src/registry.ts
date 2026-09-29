import { AIProvider, AIProviderType, AIProviderUnavailableError, ChatCompletionRequest, ChatCompletionResponse, EmbeddingRequest, EmbeddingResponse } from './types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { OpenRouterProvider } from './openrouter';

export class AIProviderRegistry {
  private providers: Map<AIProviderType, AIProvider> = new Map();

  register(provider: AIProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: AIProviderType): AIProvider | undefined {
    return this.providers.get(type);
  }

  getAll(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  getAvailable(): AIProvider[] {
    return this.getAll().filter((p) => p.isAvailable());
  }

  async chatCompletion(
    request: ChatCompletionRequest,
    preferredProvider?: AIProviderType
  ): Promise<ChatCompletionResponse> {
    const provider = preferredProvider
      ? this.get(preferredProvider)
      : this.getAvailable()[0];

    if (!provider) {
      throw new AIProviderUnavailableError(
        preferredProvider ?? 'openai',
        'No AI provider available'
      );
    }

    if (!provider.isAvailable()) {
      throw new AIProviderUnavailableError(provider.type);
    }

    return provider.chatCompletion(request);
  }

  async createEmbedding(
    request: EmbeddingRequest,
    preferredProvider?: AIProviderType
  ): Promise<EmbeddingResponse> {
    const provider = preferredProvider
      ? this.get(preferredProvider)
      : this.getAvailable().find((p) => p.getModels().some((m) => m.includes('embedding')));

    if (!provider) {
      throw new AIProviderUnavailableError(
        preferredProvider ?? 'openai',
        'No embedding provider available'
      );
    }

    if (!provider.isAvailable()) {
      throw new AIProviderUnavailableError(provider.type);
    }

    return provider.createEmbedding(request);
  }
}

export function createDefaultRegistry(
  openaiKey?: string,
  anthropicKey?: string,
  openrouterKey?: string,
  openrouterModel?: string
): AIProviderRegistry {
  const registry = new AIProviderRegistry();
  registry.register(new OpenAIProvider(openaiKey));
  registry.register(new AnthropicProvider(anthropicKey));
  registry.register(new OpenRouterProvider(openrouterKey, openrouterModel));
  return registry;
}