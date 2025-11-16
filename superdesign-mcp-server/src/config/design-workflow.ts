export interface DesignWorkflowConfig {
    variations: number;
    outputDirectory: string;
    namingConvention: 'sequential' | 'timestamp' | 'custom';
    fileExtensions: string[];
    supportedFormats: string[];
    parallelAgents: boolean;
    maxTurns: number;
    allowedTools: string[];
}

export const DEFAULT_DESIGN_WORKFLOW_CONFIG: DesignWorkflowConfig = {
    variations: 3,
    outputDirectory: '.superdesign/design_iterations',
    namingConvention: 'sequential',
    fileExtensions: ['.html', '.svg'],
    supportedFormats: ['html', 'svg', 'json'],
    parallelAgents: true,
    maxTurns: 10,
    allowedTools: ['Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'LS', 'Grep', 'Glob']
};

export const DESIGN_SYSTEM_PROMPT = `# Role
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
* Use consistent **margin spacing above/below headings** (e.g., margin-top: 1.2× line-height) .`;

export class DesignWorkflowManager {
    private config: DesignWorkflowConfig;

    constructor(config: Partial<DesignWorkflowConfig> = {}) {
        this.config = { ...DEFAULT_DESIGN_WORKFLOW_CONFIG, ...config };
    }

    /**
     * Generate the appropriate system prompt based on the task type
     */
    generateSystemPrompt(taskType: 'design' | 'ui' | 'component' | 'wireframe' | 'logo' | 'design-system' = 'design'): string {
        const basePrompt = DESIGN_SYSTEM_PROMPT;

        switch (taskType) {
            case 'component':
                return basePrompt + '\n\n## Special Instructions for Component Design\nFocus on creating a single, reusable component with proper props interface and minimal styling.';

            case 'wireframe':
                return basePrompt + '\n\n## Special Instructions for Wireframe Design\nUse only black and white, minimal lines, no colors. Focus on layout structure and user flow.';

            case 'logo':
                return basePrompt + '\n\n## Special Instructions for Logo Design\nCreate scalable vector graphics, focus on simplicity and brand recognition.';

            case 'design-system':
                return basePrompt + '\n\n## Special Instructions for Design System\nExtract reusable design tokens, components, and patterns that can be consistently applied.';

            default:
                return basePrompt;
        }
    }

    /**
     * Generate a unique filename based on the naming convention
     */
    generateFilename(baseName: string, iteration: number = 1, extension: string = '.html'): string {
        const timestamp = Date.now();

        switch (this.config.namingConvention) {
            case 'sequential':
                return `${baseName}_${iteration}${extension}`;

            case 'timestamp':
                return `${baseName}_${timestamp}${extension}`;

            case 'custom':
                return `${baseName}_v${iteration}_${timestamp}${extension}`;

            default:
                return `${baseName}_${iteration}${extension}`;
        }
    }

    /**
     * Get the full output path for a design file
     */
    getOutputPath(filename: string): string {
        return `${this.config.outputDirectory}/${filename}`;
    }

    /**
     * Parse AI response to extract multiple design variations
     */
    parseDesignVariations(response: string): string[] {
        const designs: string[] = [];

        // Try to split by common variation separators
        const separators = [
            /---\s*VARIATION\s*\d+/gi,
            /===\s*VARIATION\s*\d+/gi,
            /###\s*VARIATION\s*\d+/gi,
            /##\s*VARIATION\s*\d+/gi,
            /VARIATION\s*\d+:/gi,
            /---\s*VERSION\s*\d+/gi,
            /===\s*VERSION\s*\d+/gi
        ];

        // Try each separator
        for (const separator of separators) {
            const parts = response.split(separator).filter(part => part.trim().length > 0);
            if (parts.length > 1) {
                designs.push(...parts.slice(0, this.config.variations));
                break;
            }
        }

        // If no variations found, try to extract HTML blocks
        if (designs.length === 0) {
            const htmlBlocks = response.match(/<!DOCTYPE html>[\s\S]*?<\/html>/gi);
            if (htmlBlocks && htmlBlocks.length > 1) {
                designs.push(...htmlBlocks.slice(0, this.config.variations));
            }
        }

        // If still no variations, return the whole response as one variation
        if (designs.length === 0) {
            designs.push(response);
        }

        // Ensure we have exactly the requested number of variations
        while (designs.length < this.config.variations) {
            designs.push(designs[0] || ''); // Duplicate first design if needed
        }

        return designs.slice(0, this.config.variations);
    }

    /**
     * Clean and format design HTML
     */
    cleanDesignHTML(html: string): string {
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
     * Get the current configuration
     */
    getConfig(): DesignWorkflowConfig {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<DesignWorkflowConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }
}