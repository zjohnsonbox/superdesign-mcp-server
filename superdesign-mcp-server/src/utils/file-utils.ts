import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import { FileInfo, FileContent } from '../types/mcp-types.js';

export class FileUtils {
  /**
   * Get MIME type based on file extension
   */
  static getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Check if a file or directory exists
   */
  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file information
   */
  static async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const stats = await fs.stat(filePath);
      return {
        path: filePath,
        name: path.basename(filePath),
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        lastModified: stats.mtime,
        exists: true
      };
    } catch (error) {
      return {
        path: filePath,
        name: path.basename(filePath),
        type: 'file',
        size: 0,
        lastModified: new Date(),
        exists: false
      };
    }
  }

  /**
   * Read file content
   */
  static async readFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<FileContent> {
    try {
      const content = await fs.readFile(filePath, encoding);
      const stats = await fs.stat(filePath);

      // Try to detect MIME type
      const mimeType = this.detectMimeType(filePath);

      return {
        content,
        encoding,
        size: stats.size,
        mimeType
      };
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  /**
   * Write file content (creates directories if needed)
   */
  static async writeFile(filePath: string, content: string, encoding: BufferEncoding = 'utf8'): Promise<void> {
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, content, encoding);
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error}`);
    }
  }

  /**
   * Edit file content with precise string replacement
   */
  static async editFile(filePath: string, oldText: string, newText: string): Promise<void> {
    try {
      const content = await this.readFile(filePath);
      const updatedContent = content.content.replace(oldText, newText);

      if (content.content === updatedContent) {
        throw new Error(`Text not found in file: "${oldText}"`);
      }

      await this.writeFile(filePath, updatedContent, content.encoding as BufferEncoding);
    } catch (error) {
      throw new Error(`Failed to edit file ${filePath}: ${error}`);
    }
  }

  /**
   * List directory contents
   */
  static async listDirectory(dirPath: string, recursive: boolean = false): Promise<FileInfo[]> {
    try {
      const entries: FileInfo[] = await this._listDirectoryRecursive(dirPath, recursive);
      return entries.sort((a, b) => {
        // Directories first, then files
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        // Then alphabetically
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      throw new Error(`Failed to list directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Recursively list directory contents
   */
  private static async _listDirectoryRecursive(dirPath: string, recursive: boolean): Promise<FileInfo[]> {
    const entries: FileInfo[] = [];
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      const stats = await fs.stat(fullPath);

      entries.push({
        path: fullPath,
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        lastModified: stats.mtime,
        exists: true
      });

      // Recursively process subdirectories
      if (recursive && item.isDirectory()) {
        const subEntries = await this._listDirectoryRecursive(fullPath, true);
        entries.push(...subEntries);
      }
    }

    return entries;
  }

  /**
   * Delete file or directory
   */
  static async deletePath(targetPath: string): Promise<void> {
    try {
      const stats = await fs.stat(targetPath);

      if (stats.isDirectory()) {
        await fs.rmdir(targetPath, { recursive: true });
      } else {
        await fs.unlink(targetPath);
      }
    } catch (error) {
      throw new Error(`Failed to delete ${targetPath}: ${error}`);
    }
  }

  /**
   * Create directory
   */
  static async createDirectory(dirPath: string, recursive: boolean = true): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive });
    } catch (error) {
      throw new Error(`Failed to create directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Copy file or directory
   */
  static async copyPath(source: string, destination: string): Promise<void> {
    try {
      const stats = await fs.stat(source);

      if (stats.isDirectory()) {
        await this._copyDirectory(source, destination);
      } else {
        await fs.copyFile(source, destination);
      }
    } catch (error) {
      throw new Error(`Failed to copy ${source} to ${destination}: ${error}`);
    }
  }

  /**
   * Recursively copy directory
   */
  private static async _copyDirectory(source: string, destination: string): Promise<void> {
    await fs.mkdir(destination, { recursive: true });
    const items = await fs.readdir(source, { withFileTypes: true });

    for (const item of items) {
      const sourcePath = path.join(source, item.name);
      const destPath = path.join(destination, item.name);

      if (item.isDirectory()) {
        await this._copyDirectory(sourcePath, destPath);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }

  /**
   * Move file or directory
   */
  static async movePath(source: string, destination: string): Promise<void> {
    try {
      await fs.rename(source, destination);
    } catch (error) {
      // If rename fails (cross-device), try copy and delete
      try {
        await this.copyPath(source, destination);
        await this.deletePath(source);
      } catch (copyError) {
        throw new Error(`Failed to move ${source} to ${destination}: ${error}`);
      }
    }
  }

  /**
   * Detect MIME type based on file extension
   */
  static detectMimeType(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.ts': 'text/typescript',
      '.tsx': 'text/typescript',
      '.jsx': 'text/javascript',
      '.vue': 'text/vue',
      '.svelte': 'text/svelte'
    };

    return mimeTypes[ext] || 'text/plain';
  }

  /**
   * Check if file is likely binary
   */
  static async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      // Read first 512 bytes to check for binary content
      const fileHandle = await fs.open(filePath, 'r');
      const buffer = new Uint8Array(512);
      const { bytesRead } = await fileHandle.read(buffer, 0, 512);
      await fileHandle.close();

      if (bytesRead === 0) return false;

      // Check for null bytes
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) return true;
      }

      // Count non-printable characters
      let nonPrintableCount = 0;
      for (let i = 0; i < bytesRead; i++) {
        const byte = buffer[i];
        if (byte < 32 || byte > 126) {
          nonPrintableCount++;
        }
      }

      // If >30% non-printable, consider binary
      return (nonPrintableCount / bytesRead) > 0.3;
    } catch {
      return false;
    }
  }

  /**
   * Get file size in human readable format
   */
  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Ensure path is within workspace
   */
  static resolveSafePath(basePath: string, targetPath: string): string {
    const resolved = path.resolve(basePath, targetPath);
    const normalizedBase = path.resolve(basePath);

    if (!resolved.startsWith(normalizedBase)) {
      throw new Error(`Path "${targetPath}" resolves outside of base directory`);
    }

    return resolved;
  }
}