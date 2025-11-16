import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MCPToolResult } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { FileUtils } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

/**
 * Enhanced file read result with comprehensive metadata
 */
export interface FileReadResult {
  content: string;
  filePath: string;
  fileType: 'text' | 'image' | 'pdf' | 'binary';
  mimeType?: string;
  lineCount?: number;
  isTruncated?: boolean;
  linesShown?: [number, number];
  size: number;
  encoding?: string;
  checksum?: string;
  lastModified?: string;
}

// Constants for enhanced file processing
const DEFAULT_MAX_LINES = 1000;
const MAX_LINE_LENGTH = 2000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Check if a file is likely binary by sampling content
 */
function isBinaryFile(filePath: string): boolean {
  try {
    const file = require('fs').openSync(filePath, 'r');
    const fileSize = require('fs').fstatSync(file).size;

    if (fileSize === 0) {
      require('fs').closeSync(file);
      return false;
    }

    const bufferSize = Math.min(4096, fileSize);
    const buffer = Buffer.alloc(bufferSize);
    const bytesRead = require('fs').readSync(file, buffer, 0, buffer.length, 0);
    require('fs').closeSync(file);

    if (bytesRead === 0) {
      return false;
    }

    // Check for null bytes (strong binary indicator)
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }

    // Count non-printable characters
    let nonPrintableCount = 0;
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] < 9 || (buffer[i] > 13 && buffer[i] < 32)) {
        nonPrintableCount++;
      }
    }

    // If >30% non-printable characters, consider binary
    return nonPrintableCount / bytesRead > 0.3;
  } catch {
    return false;
  }
}

/**
 * Detect file type based on extension and content
 */
function detectFileType(filePath: string): 'text' | 'image' | 'pdf' | 'binary' {
  const ext = path.extname(filePath).toLowerCase();

  // Check for images
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico'];
  if (imageExtensions.includes(ext)) {
    return 'image';
  }

  // Check for PDF
  if (ext === '.pdf') {
    return 'pdf';
  }

  // Known binary extensions
  const binaryExtensions = [
    '.exe', '.dll', '.so', '.dylib', '.zip', '.tar', '.gz', '.7z',
    '.bin', '.dat', '.class', '.jar', '.war', '.pyc', '.pyo',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.odt', '.ods', '.odp', '.wasm', '.obj', '.o', '.a', '.lib'
  ];

  if (binaryExtensions.includes(ext)) {
    return 'binary';
  }

  // Content-based binary detection
  if (isBinaryFile(filePath)) {
    return 'binary';
  }

  return 'text';
}

/**
 * Process text file with advanced line handling and truncation
 */
async function processTextFile(
  filePath: string,
  startLine?: number,
  lineCount?: number,
  encoding: string = 'utf8'
): Promise<{ content: string; metadata: Partial<FileReadResult> }> {
  const content = await fs.readFile(filePath, encoding as BufferEncoding);
  const lines = content.split('\n');
  const originalLineCount = lines.length;

  // Handle line range
  const actualStartLine = Math.max((startLine || 1) - 1, 0); // Convert to 0-based
  const actualLineCount = lineCount || Math.min(DEFAULT_MAX_LINES, originalLineCount);
  const endLine = Math.min(actualStartLine + actualLineCount, originalLineCount);

  const selectedLines = lines.slice(actualStartLine, endLine);

  // Truncate long lines
  let linesWereTruncated = false;
  const processedLines = selectedLines.map(line => {
    if (line.length > MAX_LINE_LENGTH) {
      linesWereTruncated = true;
      return line.substring(0, MAX_LINE_LENGTH) + '... [line truncated]';
    }
    return line;
  });

  const contentWasTruncated = endLine < originalLineCount;
  const isTruncated = contentWasTruncated || linesWereTruncated;

  let processedContent = processedLines.join('\n');

  // Add truncation notice
  if (contentWasTruncated) {
    processedContent = `[Content truncated: showing lines ${actualStartLine + 1}-${endLine} of ${originalLineCount} total lines]\n\n` + processedContent;
  } else if (linesWereTruncated) {
    processedContent = `[Some lines truncated due to length (max ${MAX_LINE_LENGTH} chars)]\n\n` + processedContent;
  }

  return {
    content: processedContent,
    metadata: {
      lineCount: originalLineCount,
      isTruncated,
      linesShown: [actualStartLine + 1, endLine],
      encoding
    }
  };
}

/**
 * Process image files with base64 encoding for display
 */
async function processImageFile(filePath: string): Promise<{ content: string; metadata: Partial<FileReadResult> }> {
  const buffer = await fs.readFile(filePath);
  const base64Data = buffer.toString('base64');
  const mimeType = FileUtils.getMimeType(filePath);
  const fileName = path.basename(filePath);
  const fileSize = (buffer.length / 1024).toFixed(1);
  const checksum = createHash('md5').update(buffer).digest('hex');

  // Create data URI for image display
  const dataUri = `data:${mimeType};base64,${base64Data}`;

  return {
    content: `[IMAGE FILE: ${fileName}]\nFile size: ${fileSize} KB\nMIME type: ${mimeType}\nData URI available for display\nChecksum: ${checksum}`,
    metadata: {
      mimeType,
      checksum
    }
  };
}

/**
 * Process PDF files with metadata extraction
 */
async function processPDFFile(filePath: string): Promise<{ content: string; metadata: Partial<FileReadResult> }> {
  const buffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  const fileSize = (buffer.length / 1024).toFixed(1);
  const checksum = createHash('md5').update(buffer).digest('hex');

  return {
    content: `[PDF FILE: ${fileName}]\nFile size: ${fileSize} KB\nContent: Text extraction available with PDF processing tools\nChecksum: ${checksum}`,
    metadata: {
      mimeType: 'application/pdf',
      checksum
    }
  };
}

export function createReadFileTool(
  validator: SecurityValidator,
  workspaceRoot: string
): Tool {
  return {
    name: 'read_file',
    description: 'Read file contents with content type detection and format handling',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to read (relative to workspace root or absolute)'
        },
        encoding: {
          type: 'string',
          description: 'File encoding (utf-8, ascii, etc.)',
          default: 'utf8'
        },
        max_lines: {
          type: 'number',
          description: 'Maximum number of lines to read (for large files)',
          minimum: 1,
          maximum: 10000
        },
        start_line: {
          type: 'number',
          description: 'Starting line number (1-based)',
          minimum: 1,
          default: 1
        }
      },
      required: ['file_path']
    },
    async execute(params): Promise<MCPToolResult> {
      return logger.time('info', 'Reading file', async () => {
        try {
          // Validate input
          validator.validateInput(params, this.inputSchema);

          const {
            file_path,
            encoding = 'utf8' as BufferEncoding,
            max_lines,
            start_line = 1
          } = params;

          logger.info('File read request', { file_path, encoding }, 'read_file');

          // Validate and resolve file path
          const validatedPath = validator.validatePath(file_path, workspaceRoot);

          // Validate file type
          validator.validateFileType(validatedPath);

          // Check if file exists
          const fileInfo = await FileUtils.getFileInfo(validatedPath);
          if (!fileInfo.exists) {
            throw new Error(`File not found: ${file_path}`);
          }

          if (fileInfo.type === 'directory') {
            throw new Error(`Path is a directory, not a file: ${file_path}`);
          }

          // Validate file size
          validator.validateFileSize(fileInfo.size);

          // Read file content
          const fileContent = await FileUtils.readFile(validatedPath, encoding);

          // Handle line limits
          let content = fileContent.content;
          let lineInfo = '';

          if (max_lines || start_line > 1) {
            const lines = content.split('\n');
            const totalLines = lines.length;
            const actualStartLine = Math.max(1, start_line);
            const actualEndLine = max_lines ? Math.min(actualStartLine + max_lines - 1, totalLines) : totalLines;

            content = lines.slice(actualStartLine - 1, actualEndLine).join('\n');

            if (actualStartLine > 1 || actualEndLine < totalLines) {
              lineInfo = `\n\n**Showing lines ${actualStartLine}-${actualEndLine} of ${totalLines}**`;
            }
          }

          // Format response based on file type
          let formattedContent = '';
          const mimeType = fileContent.mimeType || 'text/plain';

          if (mimeType.startsWith('image/')) {
            formattedContent = `📷 **Image File**\n\n**Type:** ${mimeType}\n**Size:** ${FileUtils.formatFileSize(fileInfo.size)}\n**Path:** ${validatedPath}`;
          } else if (mimeType === 'application/json') {
            try {
              const parsed = JSON.parse(content);
              formattedContent = `📄 **JSON File**\n\n**Path:** ${validatedPath}\n**Size:** ${FileUtils.formatFileSize(fileInfo.size)}\n\n**Content:**\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
            } catch {
              formattedContent = `📄 **JSON File** (Invalid JSON)\n\n**Path:** ${validatedPath}\n**Size:** ${FileUtils.formatFileSize(fileInfo.size)}\n\n**Content:**\n\`\`\`${mimeType === 'application/json' ? 'json' : 'text'}\n${content}\n\`\`\``;
            }
          } else if (mimeType.includes('html')) {
            formattedContent = `🌐 **HTML File**\n\n**Path:** ${validatedPath}\n**Size:** ${FileUtils.formatFileSize(fileInfo.size)}\n\n**Content:**\n\`\`\`html\n${content}\n\`\`\``;
          } else if (mimeType.includes('css')) {
            formattedContent = `🎨 **CSS File**\n\n**Path:** ${validatedPath}\n**Size:** ${FileUtils.formatFileSize(fileInfo.size)}\n\n**Content:**\n\`\`\`css\n${content}\n\`\`\``;
          } else if (mimeType.includes('javascript')) {
            formattedContent = `⚡ **JavaScript File**\n\n**Path:** ${validatedPath}\n**Size:** ${FileUtils.formatFileSize(fileInfo.size)}\n\n**Content:**\n\`\`\`javascript\n${content}\n\`\`\``;
          } else if (mimeType.includes('typescript')) {
            formattedContent = `📘 **TypeScript File**\n\n**Path:** ${validatedPath}\n**Size:** ${FileUtils.formatFileSize(fileInfo.size)}\n\n**Content:**\n\`\`\`typescript\n${content}\n\`\`\``;
          } else {
            formattedContent = `📄 **Text File**\n\n**Path:** ${validatedPath}\n**Type:** ${mimeType}\n**Size:** ${FileUtils.formatFileSize(fileInfo.size)}\n\n**Content:**\n\`\`\`text\n${content}\n\`\`\``;
          }

          return {
            content: [{
              type: 'text',
              text: formattedContent + lineInfo
            }]
          };

        } catch (error) {
          logger.error('File read failed', { error: error.message, file_path: params.file_path }, 'read_file');

          return {
            content: [{
              type: 'text',
              text: `❌ Failed to read file: ${error.message}`
            }],
            isError: true
          };
        }
      }, undefined, 'read_file');
    }
  };
}