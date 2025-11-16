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

    override async generateDesign(prompt: string, options: DesignOptions): Promise<DesignResult[]> {
        if (!this.isInitialized) {
            throw new Error('Provider not initialized');
        }

        try {
            logger.info(`Generating ${options.designType} design`, {
                provider: 'custom-api',
                variations: options.variations,
                outputFormat: options.outputFormat
            });

            // Build design prompt
            const designPrompt = this.buildDesignPrompt(prompt, options);

            // Prepare request for your custom API
            const requestBody = {
                model: this.model,
                max_tokens: Math.min(this.maxTokens, 4000),
                temperature: this.temperature,
                messages: [
                    {
                        role: 'user',
                        content: `You are a UI/UX design expert. Generate complete, working HTML/CSS designs based on the user's requirements.

${designPrompt}`
                    }
                ]
            };

            // Make request to your custom API
            const url = `${this.baseUrl}/v1/messages`;
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`,
                'User-Agent': 'SuperDesign-MCP-Server/1.0.0'
            };

            logger.info('Making API request', {
                url,
                headers: {
                    ...headers,
                    Authorization: 'Bearer ***' // Mask the token for security
                },
                requestBody
            }, 'custom-api');

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(this.timeout)
            });

            logger.info('API response received', {
                status: response.status,
                statusText: response.statusText,
                url
            }, 'custom-api');

            if (!response.ok) {
                // Try to get error details from response
                let errorDetails = '';
                try {
                    const errorText = await response.text();
                    errorDetails = `. Response body: ${errorText.substring(0, 200)}`;
                } catch (e) {
                    errorDetails = `. Could not read response body: ${e.message}`;
                }

                throw new Error(`Design generation failed: ${response.status} ${response.statusText}${errorDetails}`);
            }

            const data = await response.json() as any;
            const content = data.content?.[0]?.text || '';

            logger.info(`Design generation completed`, {
                provider: 'custom-api',
                model: this.model
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

    override async query(prompt: string, options?: Partial<AIProviderOptions>): Promise<string> {
        if (!this.isInitialized) {
            throw new Error('Provider not initialized');
        }

        try {
            logger.info(`Processing query request`, { provider: 'custom-api' });

            // For general queries, just use the base implementation
            const requestBody = {
                model: this.model,
                max_tokens: Math.min(this.maxTokens, 4000),
                temperature: this.temperature,
                messages: [
                    {
                        role: 'user',
                        content: `You are a helpful AI assistant specializing in UI/UX design and development.

${prompt}`
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
                throw new Error(`Query failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as any;
            const content = data.content?.[0]?.text || '';
            const usage = data.usage || {};

            logger.info(`Query completed`, {
                provider: 'custom-api',
                model: this.model,
                promptTokens: usage.prompt_tokens || 0,
                completionTokens: usage.completion_tokens || 0,
                totalTokens: usage.total_tokens || 0
            });

            return content;

        } catch (error) {
            logger.error('Query failed', {
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

            const url = `${this.baseUrl}/v1/messages`;
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`,
                'User-Agent': 'SuperDesign-MCP-Server/1.0.0'
            };

            logger.info('Making API request for theme generation', {
                url,
                headers: {
                    ...headers,
                    Authorization: 'Bearer ***' // Mask the token for security
                }
            }, 'custom-api');

            const response = await fetch(url, {
                method: 'POST',
                headers,
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

            logger.info('API response received for theme generation', {
                status: response.status,
                statusText: response.statusText,
                url
            }, 'custom-api');

            if (!response.ok) {
                // Try to get error details from response
                let errorDetails = '';
                try {
                    const errorText = await response.text();
                    errorDetails = `. Response body: ${errorText.substring(0, 200)}`;
                } catch (e) {
                    errorDetails = `. Could not read response body: ${e.message}`;
                }

                throw new Error(`Theme generation failed: ${response.status} ${response.statusText}${errorDetails}`);
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

            const url = `${this.baseUrl}/v1/messages`;
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`,
                'User-Agent': 'SuperDesign-MCP-Server/1.0.0'
            };

            logger.info('Making API request for layout generation', {
                url,
                headers: {
                    ...headers,
                    Authorization: 'Bearer ***' // Mask the token for security
                }
            }, 'custom-api');

            const response = await fetch(url, {
                method: 'POST',
                headers,
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

            logger.info('API response received for layout generation', {
                status: response.status,
                statusText: response.statusText,
                url
            }, 'custom-api');

            if (!response.ok) {
                // Try to get error details from response
                let errorDetails = '';
                try {
                    const errorText = await response.text();
                    errorDetails = `. Response body: ${errorText.substring(0, 200)}`;
                } catch (e) {
                    errorDetails = `. Could not read response body: ${e.message}`;
                }

                throw new Error(`Layout generation failed: ${response.status} ${response.statusText}${errorDetails}`);
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

    override isReady(): boolean {
        return this.isInitialized;
    }

    private buildDesignPrompt(prompt: string, options: DesignOptions): string {
        let designPrompt = `Create a ${options.designType} design for: ${prompt}\n\n`;

        designPrompt += `Requirements:\n`;
        designPrompt += `- Generate exactly ${options.variations} distinct variations\n`;
        designPrompt += `- Output format: ${options.outputFormat}\n`;
        designPrompt += `- Design type: ${options.designType}\n`;

        if (options.theme) {
            designPrompt += `- Theme: ${options.theme}\n`;
        }

        if (options.responsive) {
            designPrompt += `- Must be responsive (mobile, tablet, desktop)\n`;
        }

        designPrompt += `\nFor each variation, provide:\n`;
        designPrompt += `1. Complete ${options.outputFormat} code\n`;
        designPrompt += `2. Embedded styling\n`;
        designPrompt += `3. Semantic structure\n`;
        designPrompt += `4. Accessibility attributes\n`;

        if (options.outputFormat === 'html') {
            designPrompt += `\nReturn the response formatted as:\n`;
            designPrompt += `### Variation 1:\n\`\`\`html\n[complete HTML code]\n\`\`\`\n\n`;
            designPrompt += `### Variation 2:\n\`\`\`html\n[complete HTML code]\n\`\`\`\n\n`;
            designPrompt += `### Variation 3:\n\`\`\`html\n[complete HTML code]\n\`\`\`\n`;
        }

        return designPrompt;
    }

    private parseDesignsFromResponse(response: string, options: DesignOptions, timestamp: string): DesignResult[] {
        const designs: DesignResult[] = [];

        // Try to extract design variations from the response
        const sections = response.split(/### Variation \d+:/);

        for (let i = 1; i < Math.min(sections.length, options.variations + 1); i++) {
            const section = sections[i];
            if (!section.trim()) continue;

            // Extract HTML
            const htmlMatch = section.match(/```html\n([\s\S]*?)\n```/);
            const cssMatch = section.match(/```css\n([\s\S]*?)\n```/);

            let content = '';
            if (htmlMatch) {
                content = htmlMatch[1].trim();
                if (cssMatch) {
                    // If CSS is separate, embed it in the HTML
                    content = content.replace('</head>', `  <style>\n${cssMatch[1].trim()}\n  </style>\n</head>`);
                }
            } else {
                // Fallback: extract any code block
                const codeMatch = section.match(/```\w*\n([\s\S]*?)\n```/);
                if (codeMatch) {
                    content = codeMatch[1].trim();
                } else {
                    // Last resort: use the entire section
                    content = section.trim();
                }
            }

            const design: DesignResult = {
                id: `design_${i}_${Date.now()}`,
                name: `${options.designType}_${i}`,
                content: content,
                type: options.outputFormat,
                variation: i,
                metadata: {
                    generatedAt: new Date(timestamp),
                    prompt: '', // Will be filled by caller
                    theme: options.theme || 'default',
                    responsive: options.responsive
                }
            };

            // Only add design if we have content
            if (design.content) {
                designs.push(design);
            }
        }

        // Fallback: if no variations found, create a single design from the entire response
        if (designs.length === 0) {
            const htmlMatch = response.match(/```html\n([\s\S]*?)\n```/);
            const cssMatch = response.match(/```css\n([\s\S]*?)\n```/);

            let content = '';
            if (htmlMatch) {
                content = htmlMatch[1].trim();
                if (cssMatch) {
                    // If CSS is separate, embed it in the HTML
                    content = content.replace('</head>', `  <style>\n${cssMatch[1].trim()}\n  </style>\n</head>`);
                }
            } else {
                // Fallback: extract any code block
                const codeMatch = response.match(/```\w*\n([\s\S]*?)\n```/);
                if (codeMatch) {
                    content = codeMatch[1].trim();
                } else {
                    // Last resort: use the entire response
                    content = response.trim();
                }
            }

            const design: DesignResult = {
                id: `design_1_${Date.now()}`,
                name: `${options.designType}_1`,
                content: content,
                type: options.outputFormat,
                variation: 1,
                metadata: {
                    generatedAt: new Date(timestamp),
                    prompt: '', // Will be filled by caller
                    theme: options.theme || 'default',
                    responsive: options.responsive
                }
            };

            // Only add design if we have content
            if (design.content) {
                designs.push(design);
            }
        }

        return designs;
    }

    private buildThemePrompt(options: ThemeOptions): string {
        let prompt = `Create a professional CSS theme called "${options.themeName}" with the following specifications:\n\n`;

        if (options.styleReference) {
            prompt += `Style Reference: ${options.styleReference}\n`;
        }

        if (options.colorPalette && options.colorPalette.length > 0) {
            prompt += `Color Palette: ${options.colorPalette.join(', ')}\n`;
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