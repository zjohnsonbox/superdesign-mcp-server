import { MCPTool, MCPToolResult } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { FileUtils } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Grep search result with line information
 */
export interface GrepResult {
  pattern: string;
  matches: Array<{
    file: string;
    lineNumber: number;
    lineContent: string;
    matchStart: number;
    matchEnd: number;
    contextBefore?: string[];
    contextAfter?: string[];
  }>;
  totalMatches: number;
  filesSearched: number;
  searchTime: number;
}

/**
 * Create enhanced grep tool for MCP server
 */
export function createGrepTool(
  validator: SecurityValidator,
  workspaceRoot: string
): MCPTool {
  return {
    name: 'grep',
    description: 'Search for text patterns in files with regex support, context lines, and advanced filtering',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Text pattern or regex to search for (supports JavaScript regex syntax)'
        },
        file_pattern: {
          type: 'string',
          description: 'File pattern to limit search (e.g., "*.ts", "src/**/*.{js,jsx}")',
          default: '**/*'
        },
        base_path: {
          type: 'string',
          description: 'Base directory for search (relative to workspace root or absolute)',
          default: '.'
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Whether the search should be case sensitive',
          default: false
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of matches to return',
          minimum: 1,
          maximum: 500,
          default: 50
        },
        context_lines: {
          type: 'number',
          description: 'Number of context lines to show before and after each match',
          minimum: 0,
          maximum: 10,
          default: 2
        },
        include_patterns: {
          type: 'array',
          description: 'File patterns to include in search',
          items: { type: 'string' },
          default: []
        },
        exclude_patterns: {
          type: 'array',
          description: 'File patterns to exclude from search',
          items: { type: 'string' },
          default: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
        },
        whole_word: {
          type: 'boolean',
          description: 'Match whole words only',
          default: false
        }
      },
      required: ['pattern']
    },
    async execute(params): Promise<MCPToolResult> {
      return logger.time('info', 'Grep search', async () => {
        try {
          // Validate input
          validator.validateInput(params, this.inputSchema);

          const {
            pattern,
            file_pattern = '**/*',
            base_path = '.',
            case_sensitive = false,
            max_results = 50,
            context_lines = 2,
            include_patterns = [],
            exclude_patterns = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
            whole_word = false
          } = params;

          logger.info('Grep search request', {
            pattern,
            file_pattern,
            base_path,
            case_sensitive,
            max_results,
            context_lines
          }, 'grep');

          // Validate and resolve base path
          const validatedBasePath = validator.validatePath(base_path, workspaceRoot);

          // Build regex pattern
          let regexPattern = pattern;
          if (whole_word) {
            regexPattern = `\\b${pattern}\\b`;
          }

          const flags = case_sensitive ? 'g' : 'gi';
          const searchRegex = new RegExp(regexPattern, flags);

          // Get files to search (simplified - in real implementation would use glob)
          const filesToSearch = await getFilesToSearch(
            validatedBasePath,
            file_pattern,
            include_patterns,
            exclude_patterns
          );

          // Search in files
          const startTime = Date.now();
          const matches: GrepResult['matches'] = [];
          let filesSearched = 0;

          for (const filePath of filesToSearch) {
            try {
              filesSearched++;
              const fileContent = await fs.readFile(filePath, 'utf8');
              const lines = fileContent.split('\n');

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const regexMatch = searchRegex.exec(line);

                if (regexMatch) {
                  // Get context lines
                  const contextBefore = [];
                  const contextAfter = [];

                  for (let j = Math.max(0, i - context_lines); j < i; j++) {
                    contextBefore.push(lines[j]);
                  }

                  for (let j = i + 1; j < Math.min(lines.length, i + context_lines + 1); j++) {
                    contextAfter.push(lines[j]);
                  }

                  matches.push({
                    file: path.relative(workspaceRoot, filePath),
                    lineNumber: i + 1,
                    lineContent: line,
                    matchStart: regexMatch.index || 0,
                    matchEnd: (regexMatch.index || 0) + regexMatch[0].length,
                    contextBefore: contextBefore.length > 0 ? contextBefore : undefined,
                    contextAfter: contextAfter.length > 0 ? contextAfter : undefined
                  });

                  if (matches.length >= max_results) {
                    break;
                  }
                }

                // Reset regex lastIndex for global regex
                if (searchRegex.global) {
                  searchRegex.lastIndex = 0;
                }
              }

              if (matches.length >= max_results) {
                break;
              }
            } catch (error) {
              logger.warn(`Failed to search in ${filePath}: ${error.message}`, 'grep');
            }
          }

          const searchTime = Date.now() - startTime;

          const result: GrepResult = {
            pattern,
            matches,
            totalMatches: matches.length,
            filesSearched,
            searchTime
          };

          logger.info('Grep search completed', {
            pattern,
            matches_found: result.totalMatches,
            files_searched: result.filesSearched,
            search_time: searchTime
          }, 'grep');

          // Format results for display
          let resultText = `🔍 **Grep Search Results**\n\n`;
          resultText += `**Pattern:** \`${pattern}\`\n`;
          resultText += `**Files searched:** ${result.filesSearched}\n`;
          resultText += `**Matches found:** ${result.totalMatches}\n`;
          resultText += `**Search time:** ${searchTime}ms\n\n`;

          if (result.matches.length === 0) {
            resultText += `No matches found for the pattern.`;
          } else {
            resultText += `**Results:**\n\n`;

            for (const match of result.matches) {
              resultText += `📄 **${match.file}** (line ${match.lineNumber})\n`;

              // Show context before
              if (match.contextBefore) {
                for (const contextLine of match.contextBefore) {
                  resultText += `   ${contextLine}\n`;
                }
              }

              // Highlight the match
              const beforeMatch = match.lineContent.substring(0, match.matchStart);
              const matchedText = match.lineContent.substring(match.matchStart, match.matchEnd);
              const afterMatch = match.lineContent.substring(match.matchEnd);

              resultText += `   ${beforeMatch}**${matchedText}**${afterMatch}\n`;

              // Show context after
              if (match.contextAfter) {
                for (const contextLine of match.contextAfter) {
                  resultText += `   ${contextLine}\n`;
                }
              }

              resultText += '\n';
            }

            if (result.totalMatches >= max_results) {
              resultText += `... (limited to ${max_results} results)\n\n`;
            }
          }

          return {
            content: [{
              type: 'text',
              text: resultText
            }]
          };

        } catch (error) {
          logger.error('Grep search failed', {
            error: error.message,
            pattern: params.pattern
          }, 'grep');

          return {
            content: [{
              type: 'text',
              text: `❌ Grep search failed: ${error.message}`
            }],
            isError: true
          };
        }
      }, undefined, 'grep');
    }
  };
}

/**
 * Get list of files to search based on patterns
 */
async function getFilesToSearch(
  basePath: string,
  filePattern: string,
  includePatterns: string[],
  excludePatterns: string[]
): Promise<string[]> {
  // This is a simplified implementation
  // In a real implementation, you'd use the glob package like in the glob tool
  const files: string[] = [];

  async function scanDirectory(dir: string, depth = 0): Promise<void> {
    if (depth > 10) return; // Prevent infinite recursion

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        // Check exclude patterns
        if (excludePatterns.some(pattern => relativePath.includes(pattern.replace('**/', '').replace('/**', '')))) {
          continue;
        }

        if (entry.isDirectory()) {
          await scanDirectory(fullPath, depth + 1);
        } else if (entry.isFile()) {
          // Simple file pattern matching
          if (filePattern === '**/*' || relativePath.endsWith(filePattern.replace('*.', '.'))) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Ignore permission errors, etc.
    }
  }

  await scanDirectory(basePath);
  return files;
}