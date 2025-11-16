import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MCPToolResult } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { FileUtils } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export function createListDesignsTool(
  validator: SecurityValidator,
  workspaceRoot: string
): Tool {
  return {
    name: 'list_designs',
    description: 'List, search, and browse all generated designs in the project',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Project directory path (defaults to current workspace)'
        },
        filter: {
          type: 'string',
          description: 'Filter designs by name or type (e.g., "dashboard", "component", "wireframe")'
        },
        sort_by: {
          type: 'string',
          enum: ['name', 'date_created', 'date_modified', 'size'],
          description: 'Sort designs by specified field',
          default: 'date_modified'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of designs to return',
          default: 50,
          minimum: 1,
          maximum: 100
        },
        include_themes: {
          type: 'boolean',
          description: 'Include CSS themes in the results',
          default: false
        }
      },
      required: [],
      additionalProperties: false
    },
    async execute(params): Promise<MCPToolResult> {
      return logger.time('info', 'Listing designs', async () => {
        try {
          const {
            project_path = workspaceRoot,
            filter,
            sort_by = 'date_modified',
            limit = 50,
            include_themes = false
          } = params;

          logger.info('Design list request', { project_path, filter, sort_by }, 'list_designs');

          // Validate and resolve project path
          const validatedPath = validator.validatePath(project_path, workspaceRoot);

          // Look for designs in .superdesign/design_iterations
          const designsDir = path.join(validatedPath, '.superdesign', 'design_iterations');
          const themesDir = path.join(validatedPath, '.superdesign', 'themes');

          const designs: Array<{
            name: string;
            path: string;
            type: 'html' | 'css' | 'theme';
            size: number;
            created: Date;
            modified: Date;
            variation?: number;
          }> = [];

          // Scan for HTML designs
          try {
            await fs.access(designsDir);
            const entries = await fs.readdir(designsDir, { withFileTypes: true });

            for (const entry of entries) {
              if (entry.isFile()) {
                const filePath = path.join(designsDir, entry.name);
                const stats = await fs.stat(filePath);
                const ext = path.extname(entry.name).toLowerCase();

                // Apply filter if specified
                if (filter && !entry.name.toLowerCase().includes(filter.toLowerCase())) {
                  continue;
                }

                designs.push({
                  name: entry.name,
                  path: filePath,
                  type: ext === '.css' ? 'css' : 'html',
                  size: stats.size,
                  created: stats.birthtime,
                  modified: stats.mtime,
                  variation: extractVariationNumber(entry.name)
                });
              }
            }
          } catch {
            // Directory doesn't exist, continue
          }

          // Include themes if requested
          if (include_themes) {
            try {
              await fs.access(themesDir);
              const themeEntries = await fs.readdir(themesDir, { withFileTypes: true });

              for (const entry of themeEntries) {
                if (entry.isFile() && entry.name.endsWith('.css')) {
                  const filePath = path.join(themesDir, entry.name);
                  const stats = await fs.stat(filePath);

                  designs.push({
                    name: entry.name,
                    path: filePath,
                    type: 'theme',
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                  });
                }
              }
            } catch {
              // Directory doesn't exist, continue
            }
          }

          // Sort designs
          designs.sort((a, b) => {
            switch (sort_by) {
              case 'name':
                return a.name.localeCompare(b.name);
              case 'date_created':
                return b.created.getTime() - a.created.getTime();
              case 'size':
                return b.size - a.size;
              case 'date_modified':
              default:
                return b.modified.getTime() - a.modified.getTime();
            }
          });

          // Apply limit
          const limitedDesigns = designs.slice(0, limit);

          // Format response
          let responseText = `🎨 **Design Library**\n\n`;

          if (limitedDesigns.length === 0) {
            responseText += `No designs found in this project.\n\n`;
            responseText += `💡 **Tip:** Use the 'generate_design' tool to create your first design!`;
          } else {
            responseText += `Found ${limitedDesigns.length} design${limitedDesigns.length === 1 ? '' : 's'} (showing most recent)\n\n`;

            // Group by type
            const htmlDesigns = limitedDesigns.filter(d => d.type === 'html');
            const cssDesigns = limitedDesigns.filter(d => d.type === 'css');
            const themes = limitedDesigns.filter(d => d.type === 'theme');

            if (htmlDesigns.length > 0) {
              responseText += `**📄 HTML Designs (${htmlDesigns.length}):**\n`;
              for (const design of htmlDesigns) {
                const variation = design.variation ? ` (v${design.variation})` : '';
                responseText += `• \`${design.name}\`${variation} - ${FileUtils.formatFileSize(design.size)} - ${formatDate(design.modified)}\n`;
              }
              responseText += '\n';
            }

            if (cssDesigns.length > 0) {
              responseText += `**🎨 CSS Files (${cssDesigns.length}):**\n`;
              for (const design of cssDesigns) {
                responseText += `• \`${design.name}\` - ${FileUtils.formatFileSize(design.size)} - ${formatDate(design.modified)}\n`;
              }
              responseText += '\n';
            }

            if (themes.length > 0) {
              responseText += `**🎭 Themes (${themes.length}):**\n`;
              for (const theme of themes) {
                responseText += `• \`${theme.name}\` - ${FileUtils.formatFileSize(theme.size)} - ${formatDate(theme.modified)}\n`;
              }
              responseText += '\n';
            }

            if (designs.length > limit) {
              responseText += `... and ${designs.length - limit} more designs (use limit parameter to see more)\n\n`;
            }

            responseText += `💡 **Usage Tips:**\n`;
            responseText += `• Use 'preview_design' to see any design\n`;
            responseText += `• Use 'generate_design' to create new designs\n`;
            responseText += `• Use 'read_file' to examine design code`;
          }

          return {
            content: [{
              type: 'text',
              text: responseText
            }]
          };

        } catch (error) {
          logger.error('Design listing failed', { error: (error as Error).message }, 'list_designs');

          return {
            content: [{
              type: 'text',
              text: `❌ Failed to list designs: ${(error as Error).message}`
            }],
            isError: true
          };
        }
      }, undefined, 'list_designs');
    }
  };
}

function extractVariationNumber(filename: string): number | undefined {
  const match = filename.match(/_(\d+)\.(html|css)$/);
  return match ? parseInt(match[1], 10) : undefined;
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 1 ? 'just now' : `${minutes} minutes ago`;
    }
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  } else if (days === 1) {
    return 'yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}