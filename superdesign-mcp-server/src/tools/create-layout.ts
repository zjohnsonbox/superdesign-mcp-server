import { MCPTool, MCPToolResult, LayoutOptions } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { FileUtils } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import { AIProvider } from '../providers/ai-provider.js';

export function createCreateLayoutTool(
  aiProvider: AIProvider,
  validator: SecurityValidator,
  workspaceRoot: string
): MCPTool {
  return {
    name: 'create_layout',
    description: 'Create layout wireframes and structural plans for UI designs',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of the layout structure and components'
        },
        layout_type: {
          type: 'string',
          enum: ['web_app', 'mobile_app', 'dashboard', 'landing_page', 'form'],
          description: 'Type of layout to create'
        },
        components: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of components to include in layout'
        },
        output_format: {
          type: 'string',
          enum: ['ascii', 'mermaid', 'html_wireframe'],
          description: 'Output format for layout',
          default: 'ascii'
        },
        save_to_file: {
          type: 'boolean',
          description: 'Save layout to file',
          default: false
        },
        file_path: {
          type: 'string',
          description: 'File path to save layout (if save_to_file is true)'
        }
      },
      required: ['description']
    },
    async execute(params): Promise<MCPToolResult> {
      return logger.time('info', 'Creating layout', async () => {
        try {
          // Validate input
          validator.validateInput(params, this.inputSchema);

          const {
            description,
            layout_type = 'web_app',
            components = [],
            output_format = 'ascii',
            save_to_file = false,
            file_path
          } = params;

          logger.info('Layout creation request', { description: description.substring(0, 100), layout_type, output_format }, 'create_layout');

          // Prepare layout options
          const layoutOptions: LayoutOptions = {
            description,
            layoutType: layout_type,
            components,
            outputFormat: output_format
          };

          // Generate layout using AI provider
          const layoutContent = await aiProvider.generateLayout(layoutOptions);

          // Save to file if requested
          let savedPath = '';
          if (save_to_file) {
            const defaultPath = `.superdesign/layouts/layout_${Date.now()}.${output_format === 'html_wireframe' ? 'html' : output_format}`;
            const targetPath = file_path || defaultPath;
            const validatedPath = validator.validatePath(targetPath, workspaceRoot);

            await FileUtils.createDirectory(path.dirname(validatedPath), true);
            await FileUtils.writeFile(validatedPath, layoutContent);

            savedPath = validatedPath;
            logger.info(`Layout saved: ${savedPath}`, { format: output_format }, 'create_layout');
          }

          // Format response based on output format
          let formattedResponse = '';

          switch (output_format) {
            case 'ascii':
              formattedResponse = `**ASCII Layout Wireframe**\n\n\`\`\`\n${layoutContent}\n\`\`\``;
              break;
            case 'mermaid':
              formattedResponse = `**Mermaid Diagram**\n\n\`\`\`mermaid\n${layoutContent}\n\`\`\``;
              break;
            case 'html_wireframe':
              formattedResponse = `**HTML Wireframe**\n\n\`\`\`html\n${layoutContent}\n\`\`\``;
              break;
          }

          return {
            content: [{
              type: 'text',
              text: `✅ Successfully created ${layout_type} layout!\n\n` +
                    `**Description:** ${description}\n\n` +
                    `**Components:** ${components.length > 0 ? components.join(', ') : 'Auto-generated'}\n\n` +
                    `**Format:** ${output_format}\n\n` +
                    formattedResponse +
                    (savedPath ? `\n\n**Saved to:** ${savedPath}` : '') +
                    `\n\n**Next Steps:**\n` +
                    `1. Review the layout structure\n` +
                    `2. Use \`generate_design\` with this layout as reference\n` +
                    `3. Generate a theme with \`generate_theme\`\n` +
                    `4. Create the final design with responsive layouts`
            }]
          };

        } catch (error) {
          logger.error('Layout creation failed', { error: error.message }, 'create_layout');

          return {
            content: [{
              type: 'text',
              text: `❌ Layout creation failed: ${error.message}`
            }],
            isError: true
          };
        }
      }, undefined, 'create_layout');
    }
  };
}