import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MCPToolResult, DesignOptions, DesignResult } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { FileUtils } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import { AIProvider } from '../providers/ai-provider.js';

export function createGenerateDesignTool(
  aiProvider: AIProvider,
  validator: SecurityValidator,
  workspaceRoot: string
): Tool {
  return {
    name: 'generate_design',
    description: 'Generate UI designs, mockups, and components using AI with parallel variations',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Natural language description of the UI to design',
          minLength: 5,
          maxLength: 1000
        },
        variations: {
          type: 'number',
          description: 'Number of design variations to generate (1-3)',
          default: 3,
          minimum: 1,
          maximum: 3,
          integer: true
        },
        design_type: {
          type: 'string',
          enum: ['mockup', 'component', 'wireframe', 'full_page'],
          description: 'Type of design to generate',
          default: 'mockup'
        },
        output_format: {
          type: 'string',
          enum: ['html', 'react', 'vue', 'svelte'],
          description: 'Output format for generated designs',
          default: 'html'
        },
        theme: {
          type: 'string',
          description: 'Theme name or "auto" for automatic theme generation'
        },
        responsive: {
          type: 'boolean',
          description: 'Generate responsive designs for mobile/tablet/desktop',
          default: true
        },
        project_path: {
          type: 'string',
          description: 'Project directory path (defaults to current workspace)'
        }
      },
      required: ['prompt'],
      additionalProperties: false
    },
    async execute(params): Promise<MCPToolResult> {
      return logger.time('info', 'Generating design', async () => {
        try {
          // Validate input
          const inputSchema = {
            type: 'object',
            properties: {
              prompt: { type: 'string', minLength: 5, maxLength: 1000 },
              variations: { type: 'number', default: 3, minimum: 1, maximum: 3 },
              design_type: { type: 'string', enum: ['mockup', 'component', 'wireframe', 'full_page'], default: 'mockup' },
              output_format: { type: 'string', enum: ['html', 'react', 'vue', 'svelte'], default: 'html' },
              theme: { type: 'string' },
              responsive: { type: 'boolean', default: true },
              project_path: { type: 'string' }
            },
            required: ['prompt'],
            additionalProperties: false
          };
          validator.validateInput(params, inputSchema);

          const {
            prompt,
            variations = 3,
            design_type = 'mockup',
            output_format = 'html',
            theme,
            responsive = true,
            project_path = workspaceRoot
          } = params;

          logger.info('Design generation request', { prompt, variations, design_type, output_format }, 'generate_design');

          // Validate project path
          const validatedProjectPath = validator.validatePath(project_path, workspaceRoot);

          // Create output directory
          const outputDir = path.join(validatedProjectPath, '.superdesign', 'design_iterations');
          await FileUtils.createDirectory(outputDir, true);

          // Prepare design options
          const designOptions: DesignOptions = {
            variations,
            designType: design_type,
            outputFormat: output_format,
            theme,
            responsive,
            projectPath: validatedProjectPath
          };

          // Generate designs using AI provider
          const results = await aiProvider.generateDesign(prompt, designOptions);

          // Save designs to files
          const savedDesigns: DesignResult[] = [];
          for (const result of results) {
            const fileName = `${result.name}_${result.variation}.${output_format}`;
            const filePath = path.join(outputDir, fileName);

            await FileUtils.writeFile(filePath, result.content);

            const savedDesign: DesignResult = {
              ...result,
              metadata: {
                ...result.metadata,
                filePath
              }
            };

            savedDesigns.push(savedDesign);

            logger.info(`Design saved: ${filePath}`, { variation: result.variation }, 'generate_design');
          }

          // Format response
          const responseContent = savedDesigns.map(design =>
            `## Design Variation ${design.variation}\n\n` +
            `**File:** \`.superdesign/design_iterations/${design.name}_${design.variation}.${output_format}\`\n\n` +
            `**Type:** ${design.type}\n\n` +
            `**Generated:** ${design.metadata.generatedAt.toISOString()}\n\n` +
            `**Responsive:** ${design.metadata.responsive ? 'Yes' : 'No'}\n\n` +
            `${design.metadata.theme ? `**Theme:** ${design.metadata.theme}\n\n` : ''}` +
            `**Preview:**\n\`\`\`${output_format}\n${design.content.substring(0, 500)}${design.content.length > 500 ? '...' : ''}\n\`\`\``
          ).join('\n\n---\n\n');

          return {
            content: [{
              type: 'text',
              text: `✅ Successfully generated ${savedDesigns.length} design variations!\n\n${responseContent}`
            }]
          };

        } catch (error) {
          logger.error('Design generation failed', { error: error.message }, 'generate_design');

          return {
            content: [{
              type: 'text',
              text: `❌ Design generation failed: ${error.message}`
            }],
            isError: true
          };
        }
      }, undefined, 'generate_design');
    }
  };
}