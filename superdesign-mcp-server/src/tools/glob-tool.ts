import { MCPTool, MCPToolResult } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { FileUtils } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import { glob } from 'glob';

/**
 * Glob search result with file information
 */
export interface GlobResult {
  pattern: string;
  matches: Array<{
    path: string;
    type: 'file' | 'directory';
    size: number;
    lastModified: string;
  }>;
  totalMatches: number;
  searchTime: number;
}

/**
 * Create enhanced glob tool for MCP server
 */
export function createGlobTool(
  validator: SecurityValidator,
  workspaceRoot: string
): MCPTool {
  return {
    name: 'glob',
    description: 'Search for files and directories using glob patterns with advanced filtering and metadata',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to match files (e.g., "**/*.ts", "src/**/*.{js,jsx}", "*.json")'
        },
        base_path: {
          type: 'string',
          description: 'Base directory for search (relative to workspace root or absolute)',
          default: '.'
        },
        include_files: {
          type: 'boolean',
          description: 'Include files in results',
          default: true
        },
        include_directories: {
          type: 'boolean',
          description: 'Include directories in results',
          default: false
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return',
          minimum: 1,
          maximum: 1000,
          default: 100
        },
        exclude_patterns: {
          type: 'array',
          description: 'Patterns to exclude from results',
          items: { type: 'string' },
          default: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Whether the pattern should be case sensitive',
          default: false
        }
      },
      required: ['pattern']
    },
    async execute(params): Promise<MCPToolResult> {
      return logger.time('info', 'Glob search', async () => {
        try {
          // Validate input
          validator.validateInput(params, this.inputSchema);

          const {
            pattern,
            base_path = '.',
            include_files = true,
            include_directories = false,
            max_results = 100,
            exclude_patterns = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
            case_sensitive = false
          } = params;

          logger.info('Glob search request', {
            pattern,
            base_path,
            include_files,
            include_directories,
            max_results
          }, 'glob');

          // Validate and resolve base path
          const validatedBasePath = validator.validatePath(base_path, workspaceRoot);

          // Construct glob options
          const globOptions: any = {
            cwd: validatedBasePath,
            nodir: !include_directories,
            nosort: false,
            absolute: false,
            ignore: exclude_patterns,
            maxResults: max_results,
            withFileTypes: true
          };

          // Make pattern case-insensitive if requested
          const searchPattern = case_sensitive ? pattern : pattern.toLowerCase();

          // Perform glob search
          const startTime = Date.now();
          const matches = await glob(searchPattern, globOptions);
          const searchTime = Date.now() - startTime;

          // Process matches and get file info
          const processedMatches = [];
          for (const match of matches) {
            try {
              const fullPath = validator.resolvePath(match.relative(), validatedBasePath);
              const fileInfo = await FileUtils.getFileInfo(fullPath);

              // Filter by file/directory type
              if (fileInfo.type === 'file' && !include_files) continue;
              if (fileInfo.type === 'directory' && !include_directories) continue;

              processedMatches.push({
                path: match.relative(),
                type: fileInfo.type as 'file' | 'directory',
                size: fileInfo.size || 0,
                lastModified: fileInfo.lastModified || new Date().toISOString()
              });
            } catch (error) {
              logger.warn(`Failed to get info for ${match.relative()}: ${error.message}`, 'glob');
            }
          }

          const result: GlobResult = {
            pattern,
            matches: processedMatches.slice(0, max_results),
            totalMatches: processedMatches.length,
            searchTime
          };

          logger.info('Glob search completed', {
            pattern,
            matches_found: result.totalMatches,
            search_time: searchTime
          }, 'glob');

          // Format results for display
          let resultText = `🔍 **Glob Search Results**\n\n`;
          resultText += `**Pattern:** \`${pattern}\`\n`;
          resultText += `**Base path:** ${validatedBasePath}\n`;
          resultText += `**Matches found:** ${result.totalMatches}\n`;
          resultText += `**Search time:** ${searchTime}ms\n\n`;

          if (result.matches.length === 0) {
            resultText += `No files or directories matched the pattern.`;
          } else {
            resultText += `**Results:**\n\n`;

            for (const match of result.matches) {
              const icon = match.type === 'directory' ? '📁' : '📄';
              const size = match.type === 'file' ? ` (${FileUtils.formatFileSize(match.size)})` : '';
              const modified = new Date(match.lastModified).toLocaleDateString();

              resultText += `${icon} \`${match.path}\`${size}\n`;
              resultText += `   └─ Modified: ${modified}\n\n`;
            }

            if (result.totalMatches > max_results) {
              resultText += `... and ${result.totalMatches - max_results} more results (limited to ${max_results})\n\n`;
            }
          }

          return {
            content: [{
              type: 'text',
              text: resultText
            }]
          };

        } catch (error) {
          logger.error('Glob search failed', {
            error: error.message,
            pattern: params.pattern
          }, 'glob');

          return {
            content: [{
              type: 'text',
              text: `❌ Glob search failed: ${error.message}`
            }],
            isError: true
          };
        }
      }, undefined, 'glob');
    }
  };
}