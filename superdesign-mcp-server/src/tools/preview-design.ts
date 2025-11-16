import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MCPToolResult } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { FileUtils } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export function createPreviewDesignTool(
  validator: SecurityValidator,
  workspaceRoot: string
): Tool {
  return {
    name: 'preview_design',
    description: 'Preview and manage generated designs with interactive viewing options',
    inputSchema: {
      type: 'object',
      properties: {
        design_path: {
          type: 'string',
          description: 'Path to the design file to preview'
        },
        viewport: {
          type: 'string',
          enum: ['mobile', 'tablet', 'desktop', 'all'],
          description: 'Viewport size for preview',
          default: 'desktop'
        },
        compare_with: {
          type: 'string',
          description: 'Optional: Path to another design file to compare with'
        },
        show_metadata: {
          type: 'boolean',
          description: 'Include design metadata and generation info',
          default: true
        }
      },
      required: ['design_path'],
      additionalProperties: false
    },
    async execute(params): Promise<MCPToolResult> {
      return logger.time('info', 'Previewing design', async () => {
        try {
          const {
            design_path,
            viewport = 'desktop',
            compare_with,
            show_metadata = true
          } = params;

          logger.info('Design preview request', { design_path, viewport }, 'preview_design');

          // Validate and resolve file path
          const validatedPath = validator.validatePath(design_path, workspaceRoot);

          // Check if design exists
          const fileInfo = await FileUtils.getFileInfo(validatedPath);
          if (!fileInfo.exists || fileInfo.type !== 'file') {
            throw new Error(`Design file not found: ${design_path}`);
          }

          // Read design content
          const designContent = await FileUtils.readFile(validatedPath, 'utf8');

          // Generate preview HTML with viewport styling
          const previewHTML = generatePreviewHTML(
            designContent.content,
            viewport,
            path.basename(validatedPath)
          );

          // Prepare comparison if requested
          let comparisonHTML = '';
          if (compare_with) {
            const comparePath = validator.validatePath(compare_with, workspaceRoot);
            const compareContent = await FileUtils.readFile(comparePath, 'utf8');
            comparisonHTML = generateComparisonHTML(
              designContent.content,
              compareContent.content,
              viewport
            );
          }

          // Build response
          let responseText = `🎨 **Design Preview**\n\n`;
          responseText += `**File:** ${design_path}\n`;
          responseText += `**Viewport:** ${viewport}\n`;
          responseText += `**Size:** ${FileUtils.formatFileSize(fileInfo.size)}\n\n`;

          if (show_metadata) {
            responseText += `**Design Content:**\n`;
            responseText += `\`\`\`html\n${previewHTML}\n\`\`\`\n\n`;
          }

          if (comparisonHTML) {
            responseText += `**Comparison View:**\n`;
            responseText += `\`\`\`html\n${comparisonHTML}\n\`\`\`\n\n`;
          }

          // Add file list suggestion
          responseText += `💡 **Tip:** Use the preview HTML above in a browser to see the design. `;
          responseText += `You can also use the 'list_designs' tool to see all available designs.`;

          return {
            content: [{
              type: 'text',
              text: responseText
            }]
          };

        } catch (error) {
          logger.error('Design preview failed', { error: (error as Error).message, design_path: params.design_path }, 'preview_design');

          return {
            content: [{
              type: 'text',
              text: `❌ Failed to preview design: ${(error as Error).message}`
            }],
            isError: true
          };
        }
      }, undefined, 'preview_design');
    }
  };
}

function generatePreviewHTML(designContent: string, viewport: string, filename: string): string {
  const viewportSizes = {
    mobile: '375px',
    tablet: '768px',
    desktop: '1200px',
    all: '100%'
  };

  const width = viewportSizes[viewport as keyof typeof viewportSizes] || '100%';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview: ${filename}</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
        }
        .preview-container {
            max-width: ${width};
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .preview-header {
            background: #1f2937;
            color: white;
            padding: 12px 16px;
            font-size: 14px;
            font-weight: 600;
        }
        .preview-viewport {
            padding: 16px;
            min-height: 400px;
        }
        .preview-footer {
            background: #f3f4f6;
            padding: 12px 16px;
            font-size: 12px;
            color: #6b7280;
            border-top: 1px solid #e5e7eb;
        }
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-header">
            📱 ${filename} (${viewport} preview)
        </div>
        <div class="preview-viewport">
            ${designContent}
        </div>
        <div class="preview-footer">
            Generated by SuperDesign MCP Server • Viewport: ${viewport}
        </div>
    </div>
</body>
</html>`;
}

function generateComparisonHTML(
  design1Content: string,
  design2Content: string,
  viewport: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Design Comparison</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
        }
        .comparison-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            max-width: 1400px;
            margin: 0 auto;
        }
        .design-panel {
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .panel-header {
            background: #1f2937;
            color: white;
            padding: 12px 16px;
            font-size: 14px;
            font-weight: 600;
        }
        .panel-content {
            padding: 16px;
            min-height: 400px;
        }
        .design-1 .panel-header {
            background: #3b82f6;
        }
        .design-2 .panel-header {
            background: #10b981;
        }
    </style>
</head>
<body>
    <div class="comparison-container">
        <div class="design-panel design-1">
            <div class="panel-header">
                Design Variation 1
            </div>
            <div class="panel-content">
                ${design1Content}
            </div>
        </div>
        <div class="design-panel design-2">
            <div class="panel-header">
                Design Variation 2
            </div>
            <div class="panel-content">
                ${design2Content}
            </div>
        </div>
    </div>
</body>
</html>`;
}