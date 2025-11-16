import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MCPToolResult } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { FileUtils } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';

export function createWriteFileTool(
  validator: SecurityValidator,
  workspaceRoot: string
): Tool {
  return {
    name: 'write_file',
    description: 'Write content to files with automatic directory creation and validation',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to write (relative to workspace root or absolute)'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        },
        encoding: {
          type: 'string',
          description: 'File encoding (utf-8, ascii, etc.)',
          default: 'utf8'
        },
        create_dirs: {
          type: 'boolean',
          description: 'Create parent directories if they don\'t exist',
          default: true
        },
        backup: {
          type: 'boolean',
          description: 'Create backup of existing file',
          default: false
        }
      },
      required: ['file_path', 'content']
    },
    async execute(params): Promise<MCPToolResult> {
      return logger.time('info', 'Writing file', async () => {
        try {
          // Validate input
          validator.validateInput(params, this.inputSchema);

          const {
            file_path,
            content,
            encoding = 'utf8' as BufferEncoding,
            create_dirs = true,
            backup = false
          } = params;

          logger.info('File write request', { file_path, contentLength: content.length }, 'write_file');

          // Validate and resolve file path
          const validatedPath = validator.validatePath(file_path, workspaceRoot);

          // Validate file type
          validator.validateFileType(validatedPath);

          // Check if file already exists
          const fileInfo = await FileUtils.getFileInfo(validatedPath);
          const isUpdate = fileInfo.exists && fileInfo.type === 'file';

          // Create backup if requested and file exists
          if (backup && isUpdate) {
            const backupPath = `${validatedPath}.backup.${Date.now()}`;
            await FileUtils.copyPath(validatedPath, backupPath);
            logger.info(`Backup created: ${backupPath}`, undefined, 'write_file');
          }

          // Write file
          await FileUtils.writeFile(validatedPath, content, encoding);

          // Get updated file info
          const updatedInfo = await FileUtils.getFileInfo(validatedPath);

          const action = isUpdate ? 'updated' : 'created';
          logger.info(`File ${action}: ${validatedPath}`, { size: updatedInfo.size }, 'write_file');

          return {
            content: [{
              type: 'text',
              text: `✅ File ${action} successfully!\n\n` +
                    `**Path:** ${validatedPath}\n` +
                    `**Action:** ${action}\n` +
                    `**Size:** ${FileUtils.formatFileSize(updatedInfo.size)}\n` +
                    `**Encoding:** ${encoding}\n` +
                    `**Lines:** ${content.split('\n').length}\n` +
                    (backup && isUpdate ? `**Backup:** Created\n` : '') +
                    `\n📄 File is ready for use!`
            }]
          };

        } catch (error) {
          logger.error('File write failed', { error: error.message, file_path: params.file_path }, 'write_file');

          return {
            content: [{
              type: 'text',
              text: `❌ Failed to write file: ${error.message}`
            }],
            isError: true
          };
        }
      }, undefined, 'write_file');
    }
  };
}