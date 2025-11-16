import { MCPTool, MCPToolResult, ThemeOptions } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { FileUtils } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import { AIProvider } from '../providers/ai-provider.js';

export function createGenerateThemeTool(
  aiProvider: AIProvider,
  validator: SecurityValidator,
  workspaceRoot: string
): MCPTool {
  return {
    name: 'generate_theme',
    description: 'Generate design themes with colors, typography, spacing, and design tokens',
    inputSchema: {
      type: 'object',
      properties: {
        theme_name: {
          type: 'string',
          description: 'Name for the theme'
        },
        style_reference: {
          type: 'string',
          description: 'Style reference (e.g., "modern-dark", "neobrutalism", "minimal")'
        },
        color_palette: {
          type: 'array',
          items: { type: 'string' },
          description: 'Preferred color palette (hex codes)'
        },
        typography: {
          type: 'object',
          properties: {
            font_family: { type: 'string' },
            scale: { type: 'string', enum: ['minor-second', 'major-second', 'minor-third'] }
          }
        },
        output_path: {
          type: 'string',
          description: 'CSS file output path',
          default: '.superdesign/themes/theme.css'
        }
      },
      required: ['theme_name']
    },
    async execute(params): Promise<MCPToolResult> {
      return logger.time('info', 'Generating theme', async () => {
        try {
          // Validate input
          const inputSchema = {
            type: 'object',
            properties: {
              theme_name: { type: 'string' },
              style_reference: { type: 'string' },
              color_palette: { type: 'array', items: { type: 'string' } },
              typography: { type: 'object' },
              output_path: { type: 'string' }
            },
            required: ['theme_name']
          };
          validator.validateInput(params, inputSchema);

          const {
            theme_name,
            style_reference,
            color_palette,
            typography,
            output_path = '.superdesign/themes/theme.css'
          } = params;

          logger.info('Theme generation request', { theme_name, style_reference }, 'generate_theme');

          // Validate and sanitize theme name
          const sanitizedName = validator.validateFileName(theme_name);

          // Validate output path
          const validatedPath = validator.validatePath(output_path, workspaceRoot);

          // Ensure file has .css extension
          const finalPath = validatedPath.endsWith('.css') ? validatedPath : `${validatedPath}.css`;

          // Create directory if needed
          await FileUtils.createDirectory(path.dirname(finalPath), true);

          // Prepare theme options
          const themeOptions: ThemeOptions = {
            themeName: sanitizedName,
            styleReference: style_reference,
            colorPalette: color_palette,
            typography,
            outputPath: finalPath
          };

          // Generate theme using AI provider
          const cssContent = await aiProvider.generateTheme(themeOptions);

          // Save theme to file
          await FileUtils.writeFile(finalPath, cssContent);

          logger.info(`Theme saved: ${finalPath}`, { themeName: sanitizedName }, 'generate_theme');

          // Format response
          const preview = cssContent.length > 1000
            ? cssContent.substring(0, 1000) + '...'
            : cssContent;

          return {
            content: [{
              type: 'text',
              text: `✅ Successfully generated theme "${sanitizedName}"!\n\n` +
                    `**File:** ${finalPath}\n\n` +
                    `**Style Reference:** ${style_reference || 'Auto-generated'}\n\n` +
                    `${color_palette ? `**Color Palette:** ${color_palette.join(', ')}\n\n` : ''}` +
                    `${typography ? `**Typography:** ${typography.font_family || 'Default'} (${typography.scale || 'Default scale'})\n\n` : ''}` +
                    `**Preview:**\n\`\`\`css\n${preview}\n\`\`\`\n\n` +
                    `You can now use this theme in your designs by referencing: \`${finalPath}\``
            }]
          };

        } catch (error) {
          logger.error('Theme generation failed', { error: error.message }, 'generate_theme');

          return {
            content: [{
              type: 'text',
              text: `❌ Theme generation failed: ${error.message}`
            }],
            isError: true
          };
        }
      }, undefined, 'generate_theme');
    }
  };
}