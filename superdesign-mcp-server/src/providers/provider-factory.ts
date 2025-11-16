import { AIProvider } from './ai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { ClaudeApiProvider } from './claude-api-provider.js';
import { CustomApiProvider, CustomApiConfig } from './custom-api-provider.js';
import { MCPServerConfig } from '../types/mcp-types.js';
import { AIProviderError } from '../types/mcp-types.js';
import { logger } from '../utils/logger.js';

export class ProviderFactory {
  private providers: Map<string, AIProvider> = new Map();
  private currentProvider: AIProvider | null = null;

  constructor(private config: MCPServerConfig) {}

  async initialize(): Promise<void> {
    logger.info('Initializing AI providers...', undefined, 'provider-factory');

    try {
      // Initialize the configured provider
      const provider = await this.createProvider(this.config.aiProvider);
      await provider.initialize();

      this.providers.set(this.config.aiProvider, provider);
      this.currentProvider = provider;

      logger.info(`AI provider initialized: ${this.config.aiProvider}`, undefined, 'provider-factory');
    } catch (error) {
      logger.error('Failed to initialize AI provider', { error: (error as Error).message, provider: this.config.aiProvider }, 'provider-factory');
      throw new AIProviderError(
        `Failed to initialize AI provider: ${(error as Error).message}`,
        this.config.aiProvider,
        error
      );
    }
  }

  async createProvider(providerType: string): Promise<AIProvider> {
    switch (providerType) {
      case 'claude-api':
        if (!this.config.anthropicApiKey) {
          throw new AIProviderError('Anthropic API key is required for Claude API provider', 'claude-api');
        }
        return new ClaudeApiProvider({
          apiKey: this.config.anthropicApiKey,
          workspaceRoot: this.config.workspaceRoot,
          model: this.config.defaultModel,
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature
        });

      case 'anthropic':
        if (!this.config.anthropicApiKey) {
          throw new AIProviderError('Anthropic API key is required', 'anthropic');
        }
        return new AnthropicProvider(
          this.config.anthropicApiKey,
          this.config.defaultModel
        );

      case 'custom-api':
        // Check for auth token in environment (for Claude Code CLI compatibility)
        const authToken = process.env.ANTHROPIC_AUTH_TOKEN || this.config.anthropicApiKey;
        if (!authToken) {
          throw new AIProviderError('Authentication token is required for custom API provider', 'custom-api');
        }
        const customConfig: CustomApiConfig = {
          authToken,
          baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://open.bigmodel.cn/api/anthropic',
          model: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'glm-4.6',
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature,
          timeout: 30000
        };
        return new CustomApiProvider(customConfig);

      case 'openai':
        // TODO: Implement OpenAI provider
        throw new AIProviderError('OpenAI provider not yet implemented', 'openai');

      case 'openrouter':
        // TODO: Implement OpenRouter provider
        throw new AIProviderError('OpenRouter provider not yet implemented', 'openrouter');

      case 'claude-code':
        // TODO: Implement Claude Code provider
        throw new AIProviderError('Claude Code provider not yet implemented', 'claude-code');

      default:
        throw new AIProviderError(`Unknown provider type: ${providerType}`, providerType);
    }
  }

  getCurrentProvider(): AIProvider {
    if (!this.currentProvider) {
      throw new AIProviderError('No AI provider initialized', 'unknown');
    }
    return this.currentProvider;
  }

  async switchProvider(providerType: string): Promise<void> {
    if (providerType === this.config.aiProvider && this.currentProvider) {
      return; // Already using this provider
    }

    logger.info(`Switching AI provider from ${this.config.aiProvider} to ${providerType}`, undefined, 'provider-factory');

    try {
      const newProvider = await this.createProvider(providerType);
      await newProvider.initialize();

      // Store old provider
      const oldProviderType = this.config.aiProvider;

      // Update current provider
      this.providers.set(providerType, newProvider);
      this.currentProvider = newProvider;
      this.config.aiProvider = providerType as 'claude-api' | 'claude-code' | 'openai' | 'openrouter';

      logger.info(`Successfully switched to ${providerType}`, { oldProvider: oldProviderType }, 'provider-factory');
    } catch (error) {
      logger.error('Failed to switch provider', { error: (error as Error).message, newProvider: providerType }, 'provider-factory');
      throw new AIProviderError(
        `Failed to switch to ${providerType}: ${(error as Error).message}`,
        providerType,
        error
      );
    }
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  isProviderReady(providerType?: string): boolean {
    const provider = providerType
      ? this.providers.get(providerType)
      : this.currentProvider;

    return provider ? provider.isReady() : false;
  }

  async refreshProvider(providerType?: string): Promise<boolean> {
    try {
      const targetProvider = providerType || this.config.aiProvider;
      const provider = await this.createProvider(targetProvider);
      await provider.initialize();

      this.providers.set(targetProvider, provider);

      if (!providerType || targetProvider === this.config.aiProvider) {
        this.currentProvider = provider;
      }

      logger.info(`Provider refreshed: ${targetProvider}`, undefined, 'provider-factory');
      return true;
    } catch (error) {
      logger.error('Failed to refresh provider', { error: (error as Error).message, provider: providerType }, 'provider-factory');
      return false;
    }
  }

  getProviderInfo(): Record<string, any> {
    const info: Record<string, any> = {
      current: this.config.aiProvider,
      available: this.getAvailableProviders(),
      ready: this.isProviderReady()
    };

    if (this.currentProvider) {
      info.currentProvider = {
        name: this.currentProvider.getName(),
        ready: this.currentProvider.isReady()
      };
    }

    return info;
  }
}