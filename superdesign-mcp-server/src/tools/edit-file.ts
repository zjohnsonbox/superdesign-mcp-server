import { MCPTool, MCPToolResult } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { FileUtils } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';

/**
 * File edit operation types
 */
export type EditOperation =
  | { type: 'replace'; oldText: string; newText: string }
  | { type: 'insert'; position: number; text: string }
  | { type: 'delete'; start: number; end: number }
  | { type: 'replaceLine'; lineNumber: number; text: string };

/**
 * File edit result with operation details
 */
export interface FileEditResult {
  success: boolean;
  filePath: string;
  operations: EditOperation[];
  linesChanged: number;
  checksum?: string;
  timestamp: string;
}

/**
 * Create enhanced edit file tool for MCP server
 */
export function createEditFileTool(
  validator: SecurityValidator,
  workspaceRoot: string
): MCPTool {
  return {
    name: 'edit_file',
    description: 'Edit files with precise text operations, line-based editing, and automatic backup creation',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to edit (relative to workspace root or absolute)'
        },
        operations: {
          type: 'array',
          description: 'Array of edit operations to perform',
          items: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['replace'] },
                  oldText: { type: 'string', description: 'Text to replace' },
                  newText: { type: 'string', description: 'Replacement text' }
                },
                required: ['type', 'oldText', 'newText']
              },
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['insert'] },
                  position: { type: 'number', description: 'Character position to insert at' },
                  text: { type: 'string', description: 'Text to insert' }
                },
                required: ['type', 'position', 'text']
              },
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['delete'] },
                  start: { type: 'number', description: 'Start character position' },
                  end: { type: 'number', description: 'End character position' }
                },
                required: ['type', 'start', 'end']
              },
              {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['replaceLine'] },
                  lineNumber: { type: 'number', description: 'Line number (1-based)' },
                  text: { type: 'string', description: 'New line content' }
                },
                required: ['type', 'lineNumber', 'text']
              }
            ]
          }
        },
        create_backup: {
          type: 'boolean',
          description: 'Create backup of original file',
          default: true
        },
        encoding: {
          type: 'string',
          description: 'File encoding',
          default: 'utf8'
        }
      },
      required: ['file_path', 'operations']
    },
    async execute(params): Promise<MCPToolResult> {
      return logger.time('info', 'Editing file', async () => {
        try {
          // Validate input
          validator.validateInput(params, this.inputSchema);

          const {
            file_path,
            operations,
            create_backup = true,
            encoding = 'utf8' as BufferEncoding
          } = params;

          logger.info('File edit request', {
            file_path,
            operationCount: operations.length,
            create_backup
          }, 'edit_file');

          // Validate and resolve file path
          const validatedPath = validator.validatePath(file_path, workspaceRoot);

          // Check if file exists
          const fileInfo = await FileUtils.getFileInfo(validatedPath);
          if (!fileInfo.exists || fileInfo.type !== 'file') {
            throw new Error(`File not found: ${file_path}`);
          }

          // Create backup if requested
          if (create_backup) {
            const backupPath = `${validatedPath}.backup.${Date.now()}`;
            await FileUtils.copyPath(validatedPath, backupPath);
            logger.info(`Created backup: ${backupPath}`, 'edit_file');
          }

          // Read current file content
          const currentContent = await FileUtils.readFile(validatedPath, encoding);
          let editedContent = currentContent.content;

          // Apply operations in order
          let totalLinesChanged = 0;
          const appliedOperations: EditOperation[] = [];

          for (const op of operations) {
            const result = await applyEditOperation(editedContent, op);
            editedContent = result.content;
            totalLinesChanged += result.linesChanged;
            appliedOperations.push(op);
          }

          // Write edited content back to file
          await FileUtils.writeFile(validatedPath, editedContent, encoding);

          // Get updated file info
          const updatedInfo = await FileUtils.getFileInfo(validatedPath);

          const result: FileEditResult = {
            success: true,
            filePath: validatedPath,
            operations: appliedOperations,
            linesChanged: totalLinesChanged,
            timestamp: new Date().toISOString()
          };

          logger.info('File edited successfully', {
            file_path: validatedPath,
            operations_applied: operations.length,
            lines_changed: totalLinesChanged
          }, 'edit_file');

          return {
            content: [{
              type: 'text',
              text: `✅ **File edited successfully**\n\n` +
                    `**Path:** ${validatedPath}\n` +
                    `**Operations applied:** ${operations.length}\n` +
                    `**Lines changed:** ${totalLinesChanged}\n` +
                    `**New size:** ${FileUtils.formatFileSize(updatedInfo.size)}\n` +
                    `**Backup created:** ${create_backup ? 'Yes' : 'No'}\n\n` +
                    `📝 Edit operations completed successfully!`
            }]
          };

        } catch (error) {
          logger.error('File edit failed', {
            error: error.message,
            file_path: params.file_path
          }, 'edit_file');

          return {
            content: [{
              type: 'text',
              text: `❌ Failed to edit file: ${error.message}`
            }],
            isError: true
          };
        }
      }, undefined, 'edit_file');
    }
  };
}

/**
 * Apply a single edit operation to content
 */
async function applyEditOperation(
  content: string,
  operation: EditOperation
): Promise<{ content: string; linesChanged: number }> {
  const originalLines = content.split('\n');
  let newContent = content;
  let linesChanged = 0;

  switch (operation.type) {
    case 'replace':
      if (!newContent.includes(operation.oldText)) {
        throw new Error(`Text to replace not found: "${operation.oldText.substring(0, 50)}..."`);
      }
      newContent = newContent.replace(operation.oldText, operation.newText);
      linesChanged = Math.abs(operation.newText.split('\n').length - operation.oldText.split('\n').length);
      break;

    case 'insert':
      if (operation.position < 0 || operation.position > newContent.length) {
        throw new Error(`Invalid insert position: ${operation.position}`);
      }
      newContent = newContent.slice(0, operation.position) + operation.text + newContent.slice(operation.position);
      linesChanged = operation.text.split('\n').length;
      break;

    case 'delete':
      if (operation.start < 0 || operation.end > newContent.length || operation.start > operation.end) {
        throw new Error(`Invalid delete range: ${operation.start}-${operation.end}`);
      }
      const deletedText = newContent.slice(operation.start, operation.end);
      newContent = newContent.slice(0, operation.start) + newContent.slice(operation.end);
      linesChanged = deletedText.split('\n').length;
      break;

    case 'replaceLine':
      const lines = newContent.split('\n');
      if (operation.lineNumber < 1 || operation.lineNumber > lines.length) {
        throw new Error(`Invalid line number: ${operation.lineNumber}. File has ${lines.length} lines.`);
      }
      lines[operation.lineNumber - 1] = operation.text;
      newContent = lines.join('\n');
      linesChanged = 1;
      break;

    default:
      throw new Error(`Unknown operation type: ${(operation as any).type}`);
  }

  return { content: newContent, linesChanged };
}