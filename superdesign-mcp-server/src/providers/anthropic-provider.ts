import { AIProvider } from './ai-provider.js';
import { DesignOptions, DesignResult, ThemeOptions, LayoutOptions } from '../types/mcp-types.js';
import { AIProviderError } from '../types/mcp-types.js';

export class AnthropicProvider extends AIProvider {
  private apiKey: string;
  private baseUrl: string = 'https://api.anthropic.com/v1';
  private model: string = 'claude-3-5-sonnet-20241022';

  constructor(apiKey: string, model?: string, baseUrl?: string) {
    super('anthropic');
    this.apiKey = apiKey;
    if (model) this.model = model;
    if (baseUrl) this.baseUrl = baseUrl;
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new AIProviderError('Anthropic API key is required', 'anthropic');
    }

    try {
      // Test API connection
      await this.makeAPICall(async () => {
        const response = await fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 10,
            messages: [{
              role: 'user',
              content: 'Hello'
            }]
          })
        });

        if (!response.ok) {
          throw new Error(`API test failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
      }, 1);

      this.isInitialized = true;
    } catch (error) {
      throw new AIProviderError(
        `Failed to initialize Anthropic provider: ${(error as Error).message}`,
        'anthropic',
        error
      );
    }
  }

  async generateDesign(prompt: string, options: DesignOptions): Promise<DesignResult[]> {
    if (!this.isInitialized) {
      throw new AIProviderError('Provider not initialized', 'anthropic');
    }

    const systemPrompt = this.buildDesignSystemPrompt(options);
    const userPrompt = this.buildDesignPrompt(prompt, options);

    try {
      const response = await this.makeAPICall(async () => {
        return await fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 4000,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: userPrompt
            }]
          })
        });
      });

      const data = await response.json() as any;
      const content = data.content[0]?.text || '';

      if (!content) {
        throw new Error('No content received from Anthropic API');
      }

      // Extract design variations
      const variations = this.extractDesignVariations(content, options.variations);

      // Create design results
      const results: DesignResult[] = variations.map((variation, index) => ({
        id: this.generateDesignId(),
        name: this.generateDesignName(prompt, index + 1),
        content: this.cleanDesignHTML(variation),
        type: options.designType,
        variation: index + 1,
        metadata: {
          generatedAt: new Date(),
          prompt,
          theme: options.theme,
          responsive: options.responsive
        }
      }));

      return results;
    } catch (error) {
      throw new AIProviderError(
        `Failed to generate design: ${(error as Error).message}`,
        'anthropic',
        error
      );
    }
  }

  async generateTheme(options: ThemeOptions): Promise<string> {
    if (!this.isInitialized) {
      throw new AIProviderError('Provider not initialized', 'anthropic');
    }

    const systemPrompt = `You are a senior UI/UX designer specializing in design systems and CSS theme creation. Generate comprehensive CSS themes with proper design tokens.`;

    const userPrompt = this.buildThemePrompt(options);

    try {
      const response = await this.makeAPICall(async () => {
        return await fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 2000,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: userPrompt
            }]
          })
        });
      });

      const data = await response.json() as any;
      const content = data.content[0]?.text || '';

      if (!content) {
        throw new Error('No theme content received from Anthropic API');
      }

      return this.formatCSSTheme(content, options.themeName);
    } catch (error) {
      throw new AIProviderError(
        `Failed to generate theme: ${(error as Error).message}`,
        'anthropic',
        error
      );
    }
  }

  async generateLayout(options: LayoutOptions): Promise<string> {
    if (!this.isInitialized) {
      throw new AIProviderError('Provider not initialized', 'anthropic');
    }

    const systemPrompt = `You are a senior UX designer specializing in layout design and information architecture. Create clear, structured layouts using the requested format.`;

    const userPrompt = this.buildLayoutPrompt(options);

    try {
      const response = await this.makeAPICall(async () => {
        return await fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 2000,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: userPrompt
            }]
          })
        });
      });

      const data = await response.json() as any;
      const content = data.content[0]?.text || '';

      if (!content) {
        throw new Error('No layout content received from Anthropic API');
      }

      return content.trim();
    } catch (error) {
      throw new AIProviderError(
        `Failed to generate layout: ${(error as Error).message}`,
        'anthropic',
        error
      );
    }
  }

  private buildDesignSystemPrompt(options: DesignOptions): string {
    return `You are SuperDesign, a senior frontend designer integrated into an MCP server. Your goal is to generate amazing UI designs.

Current Request:
- Design Type: ${options.designType}
- Output Format: ${options.outputFormat}
- Variations: ${options.variations}
- Responsive: ${options.responsive ? 'Yes' : 'No'}
- Theme: ${options.theme || 'Auto-generated'}

Instructions:
1. Generate exactly ${options.variations} distinct design variation(s)
2. Each variation should be a complete, functional ${options.designType}
3. Use semantic HTML and modern CSS practices
4. Include Tailwind CSS via CDN for styling
5. Make designs responsive if requested
6. Ensure all text is black or white for good contrast
7. Don't include images - use CSS for visual elements
8. Output clean, production-ready code

Output exactly ${options.variations} complete design(s) separated by clear variation markers.`;
  }

  private buildDesignPrompt(prompt: string, options: DesignOptions): string {
    return `Create ${options.variations} design variations for: ${prompt}

Requirements:
- Type: ${options.designType}
- Format: ${options.outputFormat}
- Responsive: ${options.responsive ? 'Yes' : 'No'}
- Theme: ${options.theme || 'Auto-generated'}

Please generate exactly ${options.variations} complete, distinct design(s). Mark each variation clearly with "VARIATION 1", "VARIATION 2", etc.

Each design should be:
- Complete and functional
- Visually distinct from other variations
- Following modern design principles
- Optimized for the specified format`;
  }

  private buildThemePrompt(options: ThemeOptions): string {
    let prompt = `Generate a comprehensive CSS theme named "${options.themeName}"`;

    if (options.styleReference) {
      prompt += ` with ${options.styleReference} styling`;
    }

    if (options.colorPalette && options.colorPalette.length > 0) {
      prompt += ` using this color palette: ${options.colorPalette.join(', ')}`;
    }

    if (options.typography) {
      prompt += ` with ${options.typography.fontFamily || 'modern'} typography`;
      if (options.typography.scale) {
        prompt += ` using ${options.typography.scale} scale`;
      }
    }

    prompt += `

Requirements:
- Use CSS custom properties (CSS variables)
- Include complete color system (primary, secondary, neutral, semantic colors)
- Define typography scales and spacing system
- Add shadow and border radius variables
- Include both light and dark mode support if applicable
- Follow modern design token principles

Output complete CSS that can be directly used in a project.`;

    return prompt;
  }

  private buildLayoutPrompt(options: LayoutOptions): string {
    let prompt = `Create a ${options.layoutType} layout structure for: ${options.description}`;

    if (options.components && options.components.length > 0) {
      prompt += `\n\nComponents to include: ${options.components.join(', ')}`;
    }

    prompt += `\n\nOutput format: ${options.outputFormat}

Requirements:
- Create a clear, logical layout structure
- Show hierarchy and relationships between components
- Include proper spacing and alignment
- Consider responsive behavior
- Make it easy to understand and implement`;

    if (options.outputFormat === 'ascii') {
      prompt += `\n\nUse ASCII art to represent the layout structure with clear component labels.`;
    } else if (options.outputFormat === 'mermaid') {
      prompt += `\n\nUse Mermaid diagram syntax to show the layout structure and component relationships.`;
    } else if (options.outputFormat === 'html_wireframe') {
      prompt += `\n\nCreate a simple HTML wireframe using basic div elements with clear labels and minimal styling.`;
    }

    return prompt;
  }

  private generateDesignName(prompt: string, variation: number): string {
    // Extract key words from prompt for a meaningful name
    const words = prompt.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 3);

    const baseName = words.length > 0 ? words.join('-') : 'design';
    return `${baseName}_v${variation}`;
  }

  /**
   * Abstract query method implementation
   */
  async query(prompt: string, options?: Partial<any>): Promise<string> {
    if (!this.isInitialized) {
      throw new AIProviderError('Provider not initialized', 'anthropic');
    }

    try {
      const response = await this.makeAPICall(async () => {
        return fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: options?.maxTokens || 4000,
            temperature: options?.temperature || 0.7,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
          })
        });
      });

      const data = await response.json() as any;
      return data.content[0]?.text || '';
    } catch (error) {
      throw new AIProviderError(
        `Query failed: ${(error as Error).message}`,
        'anthropic',
        error
      );
    }
  }
}