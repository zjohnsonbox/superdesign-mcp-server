import { AIProvider, AIProviderOptions } from './ai-provider.js';
import { logger } from '../utils/logger.js';
import { DesignOptions, DesignResult, ThemeOptions, LayoutOptions } from '../types/mcp-types.js';
import { DesignWorkflowManager } from '../config/design-workflow.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface CustomApiConfig {
    authToken?: string;
    baseUrl?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeout?: number;
}

export class CustomApiProvider extends AIProvider {
    private authToken: string;
    private baseUrl: string;
    private model: string;
    private maxTokens: number;
    private temperature: number;
    private timeout: number;
    private workingDirectory: string = '';
    private currentSessionId: string | null = null;

    constructor(config: CustomApiConfig) {
        super('custom-api');
        this.authToken = config.authToken || '';
        this.baseUrl = config.baseUrl || 'https://open.bigmodel.cn/api/anthropic';
        this.model = config.model || 'glm-4.6';
        this.maxTokens = config.maxTokens || 4000;
        this.temperature = config.temperature || 0.7;
        this.timeout = config.timeout || 30000;
    }

    async initialize(): Promise<void> {
        if (!this.authToken) {
            throw new Error('Authentication token is required for custom API provider');
        }

        // For MCP usage, we'll skip connection test during startup
        // The API will be tested when actually making requests
        logger.info('Custom API provider initialized (connection will be tested on first use)', {
            provider: 'custom-api',
            model: this.model,
            baseUrl: this.baseUrl
        });
        this.isInitialized = true;
    }

    async generateDesign(prompt: string, options: DesignOptions): Promise<DesignResult[]> {
        if (!this.isInitialized) {
            throw new Error('Provider not initialized');
        }

        try {
            logger.info(`Starting design generation with ${options.variations} variations`, { provider: 'custom-api' });

            // Prepare the SuperDesign system prompt
            const designWorkflow = new DesignWorkflowManager();
            const systemPrompt = designWorkflow.generateSystemPrompt('design');

            // Generate the 3-parallel design generation prompt
            const designPrompt = `Create ${options.variations} design variations for: ${prompt}

IMPORTANT: Generate exactly ${options.variations} complete, distinct designs.
Each design should be self-contained with:
- Complete HTML structure
- Embedded CSS styling using modern practices
- Responsive design for mobile, tablet, and desktop
- Semantic HTML5 markup
- Proper accessibility attributes

Use the ${options.framework || 'html'} framework with ${options.theme || 'modern'} styling.

Return the results as valid JSON array with each design having:
- html: string (complete HTML)
- css: string (complete CSS)
- description: string (brief description)
- variation: number (1-${options.variations})
- framework: string
- timestamp: string (ISO format)
- theme: string (if applicable)`;

            // Prepare request for your custom API
            const requestBody = {
                model: this.model,
                max_tokens: Math.min(this.maxTokens, 4000),
                temperature: this.temperature,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: designPrompt
                    }
                ]
            };

            // Make request to your custom API
            const response = await fetch(`${this.baseUrl}/v1/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`,
                    'User-Agent': 'SuperDesign-MCP-Server/1.0.0'
                },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                throw new Error(`Design generation failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as any;
            const content = data.content?.[0]?.text || '';
            const usage = data.usage || {};

            logger.info(`Design generation completed`, {
                provider: 'custom-api',
                model: this.model,
                promptTokens: usage.prompt_tokens || 0,
                completionTokens: usage.completion_tokens || 0,
                totalTokens: usage.total_tokens || 0
            });

            // Parse the response to extract design results
            return this.parseDesignsFromResponse(content, options, new Date().toISOString());

        } catch (error) {
            logger.error('Design generation failed', {
                error: (error as Error).message,
                provider: 'custom-api'
            });
            throw error;
        }
    }

    async generateTheme(options: ThemeOptions): Promise<string> {
        if (!this.isInitialized) {
            throw new Error('Provider not initialized');
        }

        try {
            logger.info(`Generating theme: ${options.themeName}`, { provider: 'custom-api' });

            const themePrompt = this.buildThemePrompt(options);

            const response = await fetch(`${this.baseUrl}/v1/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`,
                    'User-Agent': 'SuperDesign-MCP-Server/1.0.0'
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 2000,
                    temperature: 0.3,
                    messages: [
                        {
                            role: 'user',
                            content: themePrompt
                        }
                    ]
                }),
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                throw new Error(`Theme generation failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as any;
            const themeContent = data.content?.[0]?.text || '';

            // Save theme to file
            const themePath = options.outputPath || path.join(this.workingDirectory, '.superdesign', 'themes', `${options.themeName.toLowerCase()}.css`);
            await fs.mkdir(path.dirname(themePath), { recursive: true });
            await fs.writeFile(themePath, themeContent);

            logger.info(`Theme saved to: ${themePath}`, { provider: 'custom-api' });
            return themeContent;

        } catch (error) {
            logger.error('Theme generation failed', {
                error: (error as Error).message,
                provider: 'custom-api'
            });
            throw error;
        }
    }

    async generateLayout(options: LayoutOptions): Promise<string> {
        if (!this.isInitialized) {
            throw new Error('Provider not initialized');
        }

        try {
            logger.info(`Generating ${options.layoutType} layout`, { provider: 'custom-api' });

            const layoutPrompt = this.buildLayoutPrompt(options);

            const response = await fetch(`${this.baseUrl}/v1/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`,
                    'User-Agent': 'SuperDesign-MCP-Server/1.0.0'
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 1500,
                    temperature: 0.3,
                    messages: [
                        {
                            role: 'user',
                            content: layoutPrompt
                        }
                    ]
                }),
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                throw new Error(`Layout generation failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as any;
            const layoutContent = data.content?.[0]?.text || '';

            // Save layout to file
            const layoutPath = path.join(this.workingDirectory, '.superdesign', 'design_system', `${options.layoutType}_layout.md`);
            await fs.mkdir(path.dirname(layoutPath), { recursive: true });
            await fs.writeFile(layoutPath, layoutContent);

            logger.info(`Layout saved to: ${layoutPath}`, { provider: 'custom-api' });
            return layoutContent;

        } catch (error) {
            logger.error('Layout generation failed', {
                error: (error as Error).message,
                provider: 'custom-api'
            });
            throw error;
        }
    }

    isReady(): boolean {
        return this.isInitialized;
    }

    private parseDesignsFromResponse(response: string, options: DesignOptions, timestamp: string): DesignResult[] {
        const designs: DesignResult[] = [];

        // Try to extract design variations from the response
        const sections = response.split(/### Variation \d+:/);

        for (let i = 1; i < Math.min(sections.length, options.variations + 1); i++) {
            const section = sections[i];
            if (!section.trim()) continue;

            const design: DesignResult = {
                html: '',
                css: '',
                framework: options.framework || 'html',
                description: '',
                timestamp,
                variation: i,
                theme: options.theme || 'default'
            };

            // Extract HTML
            const htmlMatch = section.match(/```html\n([\s\S]*?)\n```/);
            if (htmlMatch) {
                design.html = htmlMatch[1].trim();
            }

            // Extract CSS
            const cssMatch = section.match(/```css\n([\s\S]*?)\n```/);
            if (cssMatch) {
                design.css = cssMatch[1].trim();
            }

            // Extract description
            const descMatch = section.match(/### Variation \d+:?\s*([^\n]+)/);
            if (descMatch) {
                design.description = descMatch[1].trim();
            }

            if (design.html || design.css) {
                designs.push(design);
            }
        }

        // Fallback: if no variations found, create a single design from the entire response
        if (designs.length === 0) {
            const design: DesignResult = {
                html: '',
                css: '',
                framework: options.framework || 'html',
                description: 'Generated design',
                timestamp,
                variation: 1,
                theme: options.theme || 'default'
            };

            const htmlMatch = response.match(/```html\n([\s\S]*?)\n```/);
            if (htmlMatch) {
                design.html = htmlMatch[1].trim();
            }

            const cssMatch = response.match(/```css\n([\s\S]*?)\n```/);
            if (cssMatch) {
                design.css = cssMatch[1].trim();
            }

            if (design.html || design.css) {
                designs.push(design);
            }
        }

        return designs;
    }

    private buildThemePrompt(options: ThemeOptions): string {
        let prompt = `Create a professional CSS theme called "${options.themeName}" with the following specifications:\n\n`;

        if (options.style_reference) {
            prompt += `Style Reference: ${options.style_reference}\n`;
        }

        if (options.color_palette && options.color_palette.length > 0) {
            prompt += `Color Palette: ${options.color_palette.join(', ')}\n`;
        }

        prompt += `\nRequirements:\n`;
        prompt += `- Use modern CSS practices and CSS custom properties\n`;
        prompt += `- Include proper color contrast for accessibility\n`;
        prompt += `- Provide hover states and transitions\n`;
        prompt += `- Make it responsive and mobile-friendly\n`;
        prompt += `- Use semantic naming conventions\n`;
        prompt += `- Include comments explaining key design decisions\n`;

        prompt += `\nGenerate complete CSS that can be directly applied to HTML elements. Include:\n`;
        prompt += `- CSS custom properties for main colors, fonts, and spacing\n`;
        prompt += `- Component styles for common UI elements\n`;
        prompt += `- Utility classes for margins, padding, and layout\n`;
        prompt += `- Media queries for responsive breakpoints\n`;

        return prompt;
    }

    private buildLayoutPrompt(options: LayoutOptions): string {
        let prompt = `Create a ${options.layoutType} layout with the following description: ${options.description}\n\n`;

        if (options.components && options.components.length > 0) {
            prompt += `Components to include: ${options.components.join(', ')}\n`;
        }

        prompt += `\nRequirements:\n`;
        prompt += `- Create clear structural outline\n`;
        prompt += `- Show information hierarchy and flow\n`;
        prompt += `- Include spacing and proportions\n`;
        prompt += `- Make it suitable for development reference\n`;

        if (options.outputFormat === 'mermaid') {
            prompt += `\nGenerate as Mermaid diagram syntax\n`;
        } else if (options.outputFormat === 'html_wireframe') {
            prompt += `\nGenerate as HTML wireframe with simple styling\n`;
        } else if (options.outputFormat === 'ascii') {
            prompt += `\nGenerate as ASCII art wireframe\n`;
        }

        return prompt;
    }

    protected override generateDesignId(): string {
        return `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}