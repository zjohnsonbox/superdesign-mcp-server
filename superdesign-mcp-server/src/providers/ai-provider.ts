import { DesignOptions, DesignResult, ThemeOptions, LayoutOptions, AIResponse } from '../types/mcp-types.js';

export interface AIProviderOptions {
  maxTurns?: number;
  allowedTools?: string[];
  permissionMode?: string;
  customSystemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export abstract class AIProvider {
  protected name: string;
  protected isInitialized: boolean = false;
  protected initializationPromise: Promise<void> | null = null;

  constructor(name?: string) {
    this.name = name || 'AI Provider';
  }

  /**
   * Initialize the AI provider
   */
  abstract initialize(): Promise<void>;

  /**
   * Check if provider is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Ensure provider is initialized
   */
  protected async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Abstract query method for making AI requests
   */
  abstract query(prompt: string, options?: Partial<AIProviderOptions>): Promise<string>;

  /**
   * Get provider name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Generate design variations
   */
  abstract generateDesign(prompt: string, options: DesignOptions): Promise<DesignResult[]>;

  /**
   * Generate CSS theme
   */
  abstract generateTheme(options: ThemeOptions): Promise<string>;

  /**
   * Generate layout wireframe
   */
  abstract generateLayout(options: LayoutOptions): Promise<string>;

  /**
   * Make API call with retry logic
   */
  protected async makeAPICall<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (error instanceof Error && this.isNonRetriableError(error)) {
          throw error;
        }

        // If not the last attempt, wait and retry
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Check if error should not be retried
   */
  protected isNonRetriableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Authentication errors
    if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('authentication')) {
      return true;
    }

    // Invalid request errors
    if (message.includes('invalid request') || message.includes('bad request')) {
      return true;
    }

    // Rate limiting errors (we could retry with longer delays)
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return false;
    }

    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse and validate AI response
   */
  protected parseAIResponse(response: any): AIResponse {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid AI response: not an object');
    }

    return {
      content: response.content || response.text || '',
      usage: response.usage,
      model: response.model || 'unknown',
      finishReason: response.finishReason || 'unknown'
    };
  }

  /**
   * Generate unique ID for designs
   */
  protected generateDesignId(): string {
    return `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract design variations from response
   */
  protected extractDesignVariations(response: string, variations: number): string[] {
    const designs: string[] = [];

    // Try to split by common variation separators
    const separators = [
      /---\s*VARIATION\s*\d+/gi,
      /===\s*VARIATION\s*\d+/gi,
      /###\s*VARIATION\s*\d+/gi,
      /##\s*VARIATION\s*\d+/gi,
      /VARIATION\s*\d+:/gi
    ];

    // Try each separator
    for (const separator of separators) {
      const parts = response.split(separator).filter(part => part.trim().length > 0);
      if (parts.length > 1) {
        designs.push(...parts.slice(0, variations));
        break;
      }
    }

    // If no variations found, split by numbered sections
    if (designs.length === 0) {
      const numberedParts = response.split(/\d+\.\s*/).filter(part => part.trim().length > 0);
      if (numberedParts.length > 1) {
        designs.push(...numberedParts.slice(0, variations));
      }
    }

    // If still no variations, return the whole response as one variation
    if (designs.length === 0) {
      designs.push(response);
    }

    // Ensure we have exactly the requested number of variations
    while (designs.length < variations) {
      designs.push(designs[0] || ''); // Duplicate first design if needed
    }

    return designs.slice(0, variations);
  }

  /**
   * Clean and format design HTML
   */
  protected cleanDesignHTML(html: string): string {
    // Remove any leading/trailing whitespace
    let cleaned = html.trim();

    // Remove AI commentary
    cleaned = cleaned.replace(/Here's[^:]*:/gi, '');
    cleaned = cleaned.replace(/I've created[^:]*:/gi, '');
    cleaned = cleaned.replace(/This design[^:]*:/gi, '');

    // Remove markdown code block markers
    cleaned = cleaned.replace(/```html\s*/gi, '');
    cleaned = cleaned.replace(/```\s*$/gi, '');

    // Ensure proper HTML structure
    if (!cleaned.includes('<!DOCTYPE') && !cleaned.includes('<html')) {
      cleaned = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Design</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
    ${cleaned}
</body>
</html>`;
    }

    return cleaned;
  }

  /**
   * Format CSS theme
   */
  protected formatCSSTheme(css: string, themeName: string): string {
    let formatted = css.trim();

    // Add CSS comment header
    formatted = `/* Theme: ${themeName} */\n/* Generated by SuperDesign MCP Server */\n\n${formatted}`;

    // Ensure proper CSS structure
    if (!formatted.includes(':root')) {
      formatted = `:root {\n  ${formatted}\n}`;
    }

    return formatted;
  }
}