import { AIProvider, AIProviderOptions } from './ai-provider.js';
import { logger } from '../utils/logger.js';
import { DesignOptions, DesignResult, ThemeOptions, LayoutOptions } from '../types/mcp-types.js';
import { DesignWorkflowManager } from '../config/design-workflow.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
// import { createQuery } from '@anthropic-ai/claude-code'; // Uncomment when claude-code is available

// Claude Code SDK types
type ClaudeCodeMessage = any;
type ClaudeCodeOptions = any;
type QueryFunction = (params: {
    prompt: string;
    abortController?: AbortController;
    options?: any;
}) => AsyncGenerator<ClaudeCodeMessage>;

export interface ClaudeApiConfig {
    apiKey?: string;
    workspaceRoot?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
}

export class ClaudeApiProvider extends AIProvider {
    private workingDirectory: string = '';
    private currentSessionId: string | null = null;
    private claudeCodeQuery: QueryFunction | null = null;
    private config: ClaudeApiConfig;

    constructor(config: ClaudeApiConfig = {}) {
        super();
        this.config = config;
        this.initializationPromise = this.initialize();
    }

    override async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            logger.info('Starting Claude API provider initialization...', { provider: 'claude-api' });

            // Setup working directory first
            await this.setupWorkingDirectory();

            // Enhanced API key validation
            const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;

            // Validate API key properly
            if (!apiKey) {
                const errorMsg = 'No API key found. Please set ANTHROPIC_API_KEY environment variable or provide apiKey in config.';
                logger.error(errorMsg, { provider: 'claude-api' });
                throw new Error(errorMsg);
            }

            if (typeof apiKey !== 'string') {
                const errorMsg = 'API key must be a string.';
                logger.error(errorMsg, { provider: 'claude-api', apiKeyType: typeof apiKey });
                throw new Error(errorMsg);
            }

            const trimmedApiKey = apiKey.trim();
            if (trimmedApiKey.length === 0) {
                const errorMsg = 'API key cannot be empty.';
                logger.error(errorMsg, { provider: 'claude-api', keyLength: apiKey.length });
                throw new Error(errorMsg);
            }

            // Basic format validation for API keys (support custom providers)
            // Only validate format if it looks like an Anthropic key
            if (trimmedApiKey.startsWith('sk-') && !trimmedApiKey.startsWith('sk-ant-') && !trimmedApiKey.startsWith('sk-ori-')) {
                const errorMsg = 'Invalid Anthropic API key format. Expected key to start with sk-ant- or sk-ori- for Anthropic API.';
                logger.warn(errorMsg, {
                    provider: 'claude-api',
                    keyPrefix: trimmedApiKey.substring(0, 10) + '...',
                    keyLength: trimmedApiKey.length
                });
                // For custom API providers, allow non-standard keys but log warning
                const baseUrl = process.env.ANTHROPIC_BASE_URL;
                if (baseUrl && baseUrl !== 'https://api.anthropic.com') {
                    logger.info('Using custom API provider with non-standard key format', { provider: 'claude-api', baseUrl });
                } else {
                    throw new Error(errorMsg);
                }
            }

            // Set the environment variable for Claude Code SDK
            process.env.ANTHROPIC_API_KEY = trimmedApiKey;

            // Import Claude Code SDK
            logger.info('Importing Claude Code SDK...', { provider: 'claude-api' });
            try {
                // const claudeCodeModule = await import('@anthropic-ai/claude-code'); // TODO: Fix when claude-code is available
                // this.claudeCodeQuery = claudeCodeModule.query;
                this.claudeCodeQuery = null; // Disabled until claude-code is available

                // Claude Code integration temporarily disabled
                logger.warn('Claude Code SDK integration temporarily disabled', { provider: 'claude-api' });

                logger.info('Claude Code SDK imported successfully', { provider: 'claude-api' });
            } catch (importError) {
                logger.error(`Failed to import Claude Code SDK: ${importError}`, { provider: 'claude-api' });
                throw new Error(`Claude Code SDK import failed: ${importError}`);
            }

            this.isInitialized = true;
            logger.info('Claude API provider initialized successfully', { provider: 'claude-api' });
        } catch (error) {
            logger.error(`Failed to initialize Claude API provider: ${error}`, { provider: 'claude-api' });

            // Reset initialization promise so it can be retried
            this.initializationPromise = null;
            this.isInitialized = false;
            throw error;
        }
    }

    private async setupWorkingDirectory(): Promise<void> {
        try {
            // Try workspace root from config first
            const workspaceRoot = this.config.workspaceRoot || process.cwd();

            if (workspaceRoot) {
                // Create .superdesign folder in workspace root
                const superdesignDir = path.join(workspaceRoot, '.superdesign');

                // Create directory if it doesn't exist
                try {
                    await fs.access(superdesignDir);
                } catch {
                    await fs.mkdir(superdesignDir, { recursive: true });
                    logger.info(`Created .superdesign directory: ${superdesignDir}`, { provider: 'claude-api' });
                }

                // Create design_iterations subdirectory
                const designIterationsDir = path.join(superdesignDir, 'design_iterations');
                try {
                    await fs.access(designIterationsDir);
                } catch {
                    await fs.mkdir(designIterationsDir, { recursive: true });
                    logger.info(`Created design_iterations directory: ${designIterationsDir}`, { provider: 'claude-api' });
                }

                this.workingDirectory = superdesignDir;
            } else {
                logger.warn('No workspace root found, using temporary directory', { provider: 'claude-api' });
                // Fallback to OS temp directory if no workspace
                const tempDir = path.join(os.tmpdir(), 'superdesign-claude');

                try {
                    await fs.access(tempDir);
                } catch {
                    await fs.mkdir(tempDir, { recursive: true });
                    logger.info(`Created temporary directory: ${tempDir}`, { provider: 'claude-api' });
                }

                this.workingDirectory = tempDir;
            }
        } catch (error) {
            logger.error(`Failed to setup working directory: ${error}`, { provider: 'claude-api' });
            // Final fallback to current working directory
            this.workingDirectory = process.cwd();
            logger.warn(`Using current working directory as fallback: ${this.workingDirectory}`, { provider: 'claude-api' });
        }
    }

    async query(
        prompt: string,
        options?: Partial<AIProviderOptions>
    ): Promise<string> {
        logger.info('Starting Claude API query', { provider: 'claude-api' });

        await this.ensureInitialized();

        // Default system prompt for design tasks
        const systemPrompt = options?.customSystemPrompt || await this.getDefaultSystemPrompt();

        try {
            const finalOptions: Partial<ClaudeCodeOptions> = {
                maxTurns: options?.maxTurns || 10,
                allowedTools: options?.allowedTools || [
                    'Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'LS', 'Grep', 'Glob'
                ],
                permissionMode: options?.permissionMode || 'acceptEdits',
                cwd: this.workingDirectory,
                customSystemPrompt: systemPrompt,
                model: this.config.model || 'claude-3-5-sonnet-20241022',
                ...options
            };

            if (this.currentSessionId) {
                finalOptions.resume = this.currentSessionId;
            }

            const queryParams = {
                prompt,
                abortController: new AbortController(),
                options: finalOptions
            };

            if (!this.claudeCodeQuery) {
                throw new Error('Claude Code SDK not properly initialized - query function not available');
            }

            let fullResponse = '';
            const messages: ClaudeCodeMessage[] = [];

            for await (const message of this.claudeCodeQuery(queryParams)) {
                messages.push(message);

                // Extract text content from message
                if (message.type === 'text' && message.text) {
                    fullResponse += message.text;
                }
            }

            // Extract session ID from messages
            const lastMessageWithSessionId = [...messages].reverse().find(m => m.session_id);
            if (lastMessageWithSessionId?.session_id) {
                this.currentSessionId = lastMessageWithSessionId.session_id;
            }

            logger.info(`Claude API query completed successfully. Received ${messages.length} messages`, { provider: 'claude-api' });
            return fullResponse;
        } catch (error) {
            logger.error(`Claude API query failed: ${error}`, { provider: 'claude-api' });
            throw error;
        }
    }

    private async getDefaultSystemPrompt(): Promise<string> {
        return `# Role
You are a **senior front-end designer**.
You pay close attention to every pixel, spacing, font, color;
Whenever there are UI implementation task, think deeply of the design style first, and then implement UI bit by bit

# When asked to create design:
1. You ALWAYS spin up 3 parallel sub agents concurrently to implement one design with variations, so it's faster for user to iterate (Unless specifically asked to create only one version)

<task_for_each_sub_agent>
1. Build one single html page of just one screen to build a design based on users' feedback/task
2. You ALWAYS output design files in '.superdesign/design_iterations' folder as {design_name}_{n}.html (Where n needs to be unique like table_1.html, table_2.html, etc.) or svg file
3. If you are iterating design based on existing file, then the naming convention should be {current_file_name}_{n}.html, e.g. if we are iterating ui_1.html, then each version should be ui_1_1.html, ui_1_2.html, etc.
</task_for_each_sub_agent>

## When asked to design UI:
1. Similar process as normal design task, but refer to 'UI design & implementation guidelines' for guidelines

## When asked to update or iterate design:
1. Don't edit the existing design, just create a new html file with the same name but with _n.html appended to the end, e.g. if we are iterating ui_1.html, then each version should be ui_1_1.html, ui_1_2.html, etc.
2. At default you should spin up 3 parallel sub agents concurrently to try implement the design, so it's faster for user to iterate

## When asked to design logo or icon:
1. Copy/duplicate existing svg file but name it based on our naming convention in design_iterations folder, and then make edits to the copied svg file (So we can avoid lots of mistakes), like 'original_filename.svg .superdesign/design_iterations/new_filename.svg'
2. Very important sub agent copy first, and Each agent just copy & edit a single svg file with svg code
3. you should focus on the the correctness of the svg code

## When asked to design a component:
1. Similar process as normal design task, and each agent just create a single html page with component inside;
2. Focus just on just one component itself, and don't add any other elements or text
3. Each HTML just have one component with mock data inside

## When asked to design wireframes:
1. Focus on minimal line style black and white wireframes, no colors, and never include any images, just try to use css to make some placeholder images. (Don't use service like placehold.co too, we can't render it)
2. Don't add any annotation of styles, just basic wireframes like Balsamiq style
3. Focus on building out the flow of the wireframes

# When asked to extract design system from images:
Your goal is to extract a generalized and reusable design system from the screenshots provided, **without including specific image content**, so that frontend developers or AI agents can reference the JSON as a style foundation for building consistent UIs.

1. Analyze the screenshots provided:
   * Color palette
   * Typography rules
   * Spacing guidelines
   * Layout structure (grids, cards, containers, etc.)
   * UI components (buttons, inputs, tables, etc.)
   * Border radius, shadows, and other visual styling patterns
2. Create a design-system.json file in 'design_system' folder that clearly defines these rules and can be used to replicate the visual language in a consistent way.
3. if design-system.json already exist, then create a new file with the name design-system_{n}.json (Where n needs to be unique like design-system_1.json, design-system_2.json, etc.)

**Constraints**
* Do **not** extract specific content from the screenshots (no text, logos, icons).
* Focus purely on *design principles*, *structure*, and *styles*.

--------

# UI design & implementation guidelines:

## Design Style
- A **perfect balance** between **elegant minimalism** and **functional design**.
- **Soft, refreshing gradient colors** that seamlessly integrate with the brand palette.
- **Well-proportioned white space** for a clean layout.
- **Light and immersive** user experience.
- **Clear information hierarchy** using **subtle shadows and modular card layouts**.
- **Natural focus on core functionalities**.
- **Refined rounded corners**.
- **Delicate micro-interactions**.
- **Comfortable visual proportions**.
- **Responsive design** You only output responsive design, it needs to look perfect on both mobile, tablet and desktop.
    - If its a mobile app, also make sure you have responsive design OR make the center the mobile UI

## Technical Specifications
1. **Images**: do NEVER include any images, we can't render images in webview, just try to use css to make some placeholder images. (Don't use service like placehold.co too, we can't render it)
2. **Styles**: Use **Tailwind CSS** via **CDN** for styling. (Use !important declarations for critical design tokens that must not be overridden, Load order management - ensure custom styles load after framework CSS, CSS-in-JS or scoped styles to avoid global conflicts, Use utility-first approach - define styles using Tailwind classes instead of custom CSS when possible)
3. **Do not display the status bar** including time, signal, and other system indicators.
4. **All text should be only black or white**.
5. Choose a **4 pt or 8 pt spacing system**—all margins, padding, line-heights, and element sizes must be exact multiples.
6. Use **consistent spacing tokens** (e.g., 4, 8, 16, 24, 32px) — never arbitrary values like 5 px or 13 px.
7. Apply **visual grouping** ("spacing friendship"): tighter gaps (4–8px) for related items, larger gaps (16–24px) for distinct groups.
8. Ensure **typographic rhythm**: font‑sizes, line‑heights, and spacing aligned to the grid (e.g., 16 px text with 24 px line-height).
9. Maintain **touch-area accessibility**: buttons and controls should meet or exceed 48×48 px, padded using grid units.

## Color Style
* Use a **minimal palette**: default to **black, white, and neutrals**—no flashy gradients or mismatched hues .
* Follow a **60‑30‑10 ratio**: ~60% background (white/light gray), ~30% surface (white/medium gray), ~10% accents (charcoal/black) .
* Accent colors limited to **one subtle tint** (e.g., charcoal black or very soft beige). Interactive elements like links or buttons use this tone sparingly.
* Always check **contrast** for text vs background via WCAG (≥4.5:1)

## Typography & Hierarchy

### 1. Hierarchy Levels & Structure
* Always define at least **three typographic levels**: **Heading (H1)**, **Subheading (H2)**, and **Body**.
* Use **size, weight, color**, and **spacing** to create clear differences between them.
* H1 should stand out clearly (largest & boldest), H2 should be distinctly smaller/medium-weight, and body remains readable and lighter.

### 2. Size & Scale
* Follow a modular scale: e.g., **H1: 36px**, **H2: 28px**, **Body: 16px** (min). Adjust for mobile if needed .
* Maintain strong contrast—don't use size differences of only 2px; aim for at least **6–8px difference** between levels .

### 3. Weight, Style & Color
* Use **bold or medium weight** for headings, **regular** for body.
* Utilize **color contrast** (e.g., darker headings, neutral body) to support hierarchy.
* Avoid excessive styles like italics or uppercase—unless used sparingly for emphasis or subheadings.

### 4. Spacing & Rhythm
* Add **0.8×–1.5× line-height** for body and headings to improve legibility.
* Use consistent **margin spacing above/below headings** (e.g., margin-top: 1.2× line-height) .
`;
    }

    override isReady(): boolean {
        return this.isInitialized;
    }

    async waitForInitialization(): Promise<boolean> {
        try {
            await this.ensureInitialized();
            return true;
        } catch (error) {
            logger.error(`Claude API provider initialization failed: ${error}`, { provider: 'claude-api' });
            return false;
        }
    }

    getWorkingDirectory(): string {
        return this.workingDirectory;
    }

    hasValidConfiguration(): boolean {
        const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
        return !!apiKey && apiKey.trim().length > 0;
    }

    async refreshConfiguration(): Promise<boolean> {
        try {
            const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;

            if (!apiKey) {
                logger.warn('No API key found during refresh', { provider: 'claude-api' });
                return false;
            }

            // Update environment variable
            process.env.ANTHROPIC_API_KEY = apiKey;
            logger.info('API key refreshed', { provider: 'claude-api' });

            // If not initialized yet, try to initialize
            if (!this.isInitialized) {
                try {
                    await this.initialize();
                    return true;
                } catch (error) {
                    logger.error(`Failed to initialize after API key refresh: ${error}`, { provider: 'claude-api' });
                    return false;
                }
            }

            return true;
        } catch (error) {
            logger.error(`Failed to refresh API key: ${error}`, { provider: 'claude-api' });
            return false;
        }
    }

    isAuthError(errorMessage: string): boolean {
        const authErrorPatterns = [
            'authentication failed',
            'invalid api key',
            'unauthorized',
            'api key',
            'authentication error',
            'invalid token',
            'access denied',
            '401',
            'ANTHROPIC_API_KEY',
            'process exited with code 1',
            'claude code process exited',
            'exit code 1'
        ];

        const lowercaseMessage = errorMessage.toLowerCase();
        const isAuthError = authErrorPatterns.some(pattern => lowercaseMessage.includes(pattern));

        logger.info(`Checking if error is auth-related: "${errorMessage}" -> ${isAuthError}`, { provider: 'claude-api' });
        if (isAuthError) {
            const matchedPattern = authErrorPatterns.find(pattern => lowercaseMessage.includes(pattern));
            logger.info(`Matched pattern: "${matchedPattern}"`, { provider: 'claude-api' });
        }

        return isAuthError;
    }

    getProviderName(): string {
        return 'Claude API';
    }

    getProviderType(): 'api' | 'binary' {
        return 'api';
    }

    getModel(): string {
        return this.config.model || 'claude-3-5-sonnet-20241022';
    }

    getMaxTokens(): number {
        return this.config.maxTokens || 8192;
    }

    getTemperature(): number {
        return this.config.temperature || 0.7;
    }

    /**
     * Generate design variations - Core SuperDesign functionality
     */
    async generateDesign(prompt: string, options: DesignOptions): Promise<DesignResult[]> {
        logger.info(`Starting design generation with ${options.variations} variations`, { provider: 'claude-api' });

        await this.ensureInitialized();

        const designWorkflow = new DesignWorkflowManager();
        const systemPrompt = designWorkflow.generateSystemPrompt('design');

        // Create the 3-parallel design generation prompt
        const designPrompt = `Create ${options.variations} design variations for: ${prompt}

Requirements:
- Type: ${options.designType}
- Format: ${options.outputFormat}
- Responsive: ${options.responsive ? 'Yes' : 'No'}
- Theme: ${options.theme || 'Auto-generated'}

IMPORTANT: Generate exactly ${options.variations} complete, distinct designs. Mark each variation clearly with "VARIATION 1:", "VARIATION 2:", etc. Each variation should be a complete, standalone HTML file.`;

        try {
            const response = await this.query(designPrompt, {
                customSystemPrompt: systemPrompt,
                maxTokens: options.variations * 4000 // More tokens for multiple designs
            });

            // Parse the response to extract individual design variations
            const variations = designWorkflow.parseDesignVariations(response);
            const results: DesignResult[] = [];

            for (let i = 0; i < variations.length; i++) {
                const variation = variations[i];
                const cleanedHTML = designWorkflow.cleanDesignHTML(variation);

                // Generate filename
                const baseName = this.generateDesignName(prompt);
                const filename = designWorkflow.generateFilename(baseName, i + 1, '.html');
                const filePath = designWorkflow.getOutputPath(filename);

                // Save the design file
                await fs.writeFile(path.join(this.workingDirectory, filePath), cleanedHTML, 'utf8');

                // Create design result
                const designResult: DesignResult = {
                    id: this.generateDesignId(),
                    name: filename,
                    content: cleanedHTML,
                    type: options.designType,
                    variation: i + 1,
                    metadata: {
                        generatedAt: new Date(),
                        prompt,
                        theme: options.theme,
                        responsive: options.responsive
                    }
                };

                results.push(designResult);
            }

            logger.info(`Successfully generated ${results.length} design variations`, { provider: 'claude-api' });
            return results;

        } catch (error) {
            logger.error(`Design generation failed: ${error}`, { provider: 'claude-api' });
            throw error;
        }
    }

    /**
     * Generate CSS theme
     */
    async generateTheme(options: ThemeOptions): Promise<string> {
        logger.info(`Generating theme: ${options.themeName}`, { provider: 'claude-api' });

        await this.ensureInitialized();

        const themePrompt = `Create a comprehensive CSS theme named "${options.themeName}".

Requirements:
${options.styleReference ? `- Style Reference: ${options.styleReference}` : ''}
${options.colorPalette ? `- Color Palette: ${options.colorPalette.join(', ')}` : ''}
${options.typography ? `- Typography: Font family ${options.typography.fontFamily}, scale ${options.typography.scale}` : ''}

Generate a complete CSS theme with:
- CSS custom properties for colors, typography, spacing
- Component styles for buttons, forms, cards, navigation
- Responsive design utilities
- Dark/light mode support if applicable`;

        try {
            const response = await this.query(themePrompt, {
                maxTokens: 3000
            });

            // Format the CSS
            const formattedCSS = this.formatCSSTheme(response, options.themeName);

            // Save theme file
            const themePath = path.join(this.workingDirectory, 'themes', `${options.themeName}.css`);
            await fs.mkdir(path.dirname(themePath), { recursive: true });
            await fs.writeFile(themePath, formattedCSS, 'utf8');

            logger.info(`Theme generated and saved: ${themePath}`, { provider: 'claude-api' });
            return formattedCSS;

        } catch (error) {
            logger.error(`Theme generation failed: ${error}`, { provider: 'claude-api' });
            throw error;
        }
    }

    /**
     * Generate layout wireframe
     */
    async generateLayout(options: LayoutOptions): Promise<string> {
        logger.info(`Generating ${options.layoutType} layout`, { provider: 'claude-api' });

        await this.ensureInitialized();

        const layoutPrompt = `Create a ${options.layoutType} layout wireframe for: ${options.description}

Requirements:
- Layout Type: ${options.layoutType}
- Components: ${options.components?.join(', ') || 'Auto-determined'}
- Output Format: ${options.outputFormat}
- Style: Minimal black and white wireframe, no colors, Balsamiq style

Create a clean, structural wireframe that shows the layout hierarchy and user flow.`;

        try {
            const response = await this.query(layoutPrompt, {
                maxTokens: 2000
            });

            // Save layout file
            const layoutName = this.generateDesignName(options.description);
            const filename = `${layoutName}_wireframe.${options.outputFormat === 'html_wireframe' ? 'html' : 'txt'}`;
            const layoutPath = path.join(this.workingDirectory, filename);

            await fs.writeFile(layoutPath, response, 'utf8');

            logger.info(`Layout generated and saved: ${layoutPath}`, { provider: 'claude-api' });
            return response;

        } catch (error) {
            logger.error(`Layout generation failed: ${error}`, { provider: 'claude-api' });
            throw error;
        }
    }

    /**
     * Generate a unique design ID
     */
    protected override generateDesignId(): string {
        return `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate a design name from prompt
     */
    private generateDesignName(prompt: string): string {
        // Extract key words from prompt and create a concise name
        const words = prompt.toLowerCase().split(/\s+/).filter(word =>
            word.length > 2 && !['the', 'and', 'for', 'with', 'that', 'this', 'from'].includes(word)
        );

        return words.slice(0, 3).join('_') || 'design';
    }

    /**
     * Format CSS theme with proper structure
     */
    protected override formatCSSTheme(css: string, themeName: string): string {
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