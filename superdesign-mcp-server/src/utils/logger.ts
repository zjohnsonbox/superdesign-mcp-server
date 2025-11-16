import { LogEntry } from '../types/mcp-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class Logger {
  private entries: LogEntry[] = [];
  private maxEntries: number = 1000;
  private logFile: string | null = null;
  private logDir: string;
  private logFileName: string;
  private maxLogSizeMB: number;
  private logFileBackups: number;
  private enableConsoleLogging: boolean;
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private rotationInProgress: boolean = false;

  constructor(private minLevel: 'debug' | 'info' | 'warn' | 'error' = 'info', enableFileLogging: boolean = true) {
    // Read logging environment variables with validation
    this.logDir = this.sanitizePath(process.env.LOG_DIR || path.join(process.env.HOME || '~', '.superdesign/logs'));
    this.logFileName = this.sanitizeFileName(process.env.LOG_FILE_NAME || 'superdesign-mcp.log');
    this.maxLogSizeMB = Math.max(1, parseInt(process.env.MAX_LOG_SIZE_MB || '10', 10)); // Minimum 1MB
    this.logFileBackups = Math.max(1, Math.min(50, parseInt(process.env.LOG_FILE_BACKUPS || '5', 10))); // 1-50 backups
    this.enableConsoleLogging = process.env.ENABLE_CONSOLE_LOGGING !== 'false';

    if (enableFileLogging) {
      this.initializationPromise = this.initializeFileLogging();
    }
  }

  private sanitizePath(path: string): string {
    // Remove dangerous characters and ensure relative path
    return path.replace(/[<>:"|?*]/g, '').replace(/^\.\./, '').replace(/^\\/, '');
  }

  private sanitizeFileName(fileName: string): string {
    // Remove dangerous characters but allow basic filename chars
    return fileName.replace(/[<>:"|?*\/\\]/g, '').replace(/^\.+/, '') || 'superdesign-mcp.log';
  }

  private async initializeFileLogging(): Promise<void> {
    try {
      this.initialized = false;

      // Create log directory if it doesn't exist
      await fs.mkdir(this.logDir, { recursive: true });

      // Use custom log file name from environment
      this.logFile = path.join(this.logDir, this.logFileName);

      // Write initial log entry
      const initMessage = `[${new Date().toISOString()}] [SUPERDESIGN-MCP] Logger initialized\n` +
        `[SUPERDESIGN-MCP] Log file: ${this.logFile}\n` +
        `[SUPERDESIGN-MCP] Log level: ${this.minLevel}\n` +
        `[SUPERDESIGN-MCP] Max file size: ${this.maxLogSizeMB}MB\n` +
        `[SUPERDESIGN-MCP] Console logging: ${this.enableConsoleLogging ? 'enabled' : 'disabled'}\n`;

      await fs.writeFile(this.logFile, initMessage, 'utf8');

      this.initialized = true;

      // Also write to stderr for visibility
      console.error('[SUPERDESIGN-MCP] File logging enabled:', this.logFile);
    } catch (error) {
      console.error('[SUPERDESIGN-MCP] Failed to initialize file logging:', error);
      // Don't set initialized to true - fallback to console-only logging
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  private async rotateLogIfNeeded(): Promise<void> {
    if (!this.logFile || !this.initialized || this.rotationInProgress) {
      return;
    }

    try {
      // Set rotation flag to prevent concurrent rotations
      this.rotationInProgress = true;

      // Check if log file exists and its size
      const stats = await fs.stat(this.logFile).catch(() => null);
      if (!stats) {
        return;
      }

      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB < this.maxLogSizeMB) {
        return;
      }

      // Rotate log files
      const baseName = path.basename(this.logFile, path.extname(this.logFile));
      const ext = path.extname(this.logFile);

      // Remove oldest backup if we have too many
      const oldestBackup = path.join(this.logDir, `${baseName}.${this.logFileBackups}${ext}`);
      await fs.unlink(oldestBackup).catch(() => {}); // Ignore if file doesn't exist

      // Shift existing backups in reverse order
      for (let i = this.logFileBackups - 1; i >= 1; i--) {
        const currentBackup = path.join(this.logDir, `${baseName}.${i}${ext}`);
        const nextBackup = path.join(this.logDir, `${baseName}.${i + 1}${ext}`);
        await fs.rename(currentBackup, nextBackup).catch(() => {}); // Ignore if file doesn't exist
      }

      // Move current log file to .1
      const firstBackup = path.join(this.logDir, `${baseName}.1${ext}`);
      await fs.rename(this.logFile, firstBackup);

      console.error('[SUPERDESIGN-MCP] Log rotated, new file created');
    } catch (error) {
      console.error('[SUPERDESIGN-MCP] Failed to rotate log file:', error);
    } finally {
      this.rotationInProgress = false;
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, metadata?: Record<string, any>, toolName?: string): void {
    // Fire and forget - don't await to avoid blocking
    this.log('debug', message, metadata, toolName).catch(error => {
      console.error('[SUPERDESIGN-MCP] Debug logging failed:', error);
    });
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: Record<string, any>, toolName?: string): void {
    // Fire and forget - don't await to avoid blocking
    this.log('info', message, metadata, toolName).catch(error => {
      console.error('[SUPERDESIGN-MCP] Info logging failed:', error);
    });
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: Record<string, any>, toolName?: string): void {
    // Fire and forget - don't await to avoid blocking
    this.log('warn', message, metadata, toolName).catch(error => {
      console.error('[SUPERDESIGN-MCP] Warning logging failed:', error);
    });
  }

  /**
   * Log error message
   */
  error(message: string, metadata?: Record<string, any>, toolName?: string): void {
    // Fire and forget - don't await to avoid blocking
    this.log('error', message, metadata, toolName).catch(error => {
      console.error('[SUPERDESIGN-MCP] Error logging failed:', error);
    });
  }

  /**
   * Log with timing
   */
  time<T>(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>,
    toolName?: string
  ): Promise<T> {
    const start = Date.now();

    this.log(level, `${message} (starting)`, metadata, toolName);

    return fn().then(
      (result) => {
        const duration = Date.now() - start;
        this.log(level, `${message} (completed in ${duration}ms)`, { ...metadata, duration }, toolName);
        return result;
      },
      (error) => {
        const duration = Date.now() - start;
        this.log('error', `${message} (failed after ${duration}ms)`, { ...metadata, duration, error: error.message }, toolName);
        throw error;
      }
    );
  }

  /**
   * Internal log method
   */
  private async log(level: 'debug' | 'info' | 'warn' | 'error', message: string, metadata?: Record<string, any>, toolName?: string): Promise<void> {
    // Skip if below minimum level
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      metadata,
      toolName
    };

    // Add to memory
    this.entries.push(entry);

    // Trim if too many entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Output to console (await the async operation)
    await this.outputToConsole(entry);
  }

  /**
   * Check if message should be logged based on level
   */
  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.minLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Output log entry to console and file
   */
  private async outputToConsole(entry: LogEntry): Promise<void> {
    try {
      // Ensure logger is initialized before writing to file
      if (!this.initialized && this.initializationPromise) {
        await this.initializationPromise;
      }

      const timestamp = entry.timestamp.toISOString();
      const toolPrefix = entry.toolName ? `[${entry.toolName}]` : '';
      const metadataStr = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';

      const message = `${timestamp} ${entry.level.toUpperCase()}${toolPrefix} ${entry.message}${metadataStr}`;

      // Output to console if enabled
      if (this.enableConsoleLogging) {
        switch (entry.level) {
          case 'debug':
            console.debug(message);
            break;
          case 'info':
            console.info(message);
            break;
          case 'warn':
            console.warn(message);
            break;
          case 'error':
            console.error(message);
            break;
        }
      }

      // Write to file if enabled and initialized
      if (this.logFile && this.initialized) {
        // Check if rotation is needed before writing
        await this.rotateLogIfNeeded();

        const fileMessage = `[SUPERDESIGN-MCP] ${message}\n`;
        await fs.appendFile(this.logFile, fileMessage, 'utf8');
      }
    } catch (error) {
      // Always show file writing errors to console, even if console logging is disabled
      console.error('[SUPERDESIGN-MCP] Failed to write log entry:', error);
    }
  }

  /**
   * Get all log entries
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Get log entries for a specific tool
   */
  getEntriesForTool(toolName: string): LogEntry[] {
    return this.entries.filter(entry => entry.toolName === toolName);
  }

  /**
   * Get log entries for a specific level
   */
  getEntriesForLevel(level: 'debug' | 'info' | 'warn' | 'error'): LogEntry[] {
    return this.entries.filter(entry => entry.level === level);
  }

  /**
   * Clear all log entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get summary statistics
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {
      total: this.entries.length,
      debug: 0,
      info: 0,
      warn: 0,
      error: 0
    };

    for (const entry of this.entries) {
      stats[entry.level]++;
    }

    return stats;
  }

  /**
   * Get current log file information
   */
  getLogInfo(): {
    logFile: string | null;
    logDir: string;
    logFileName: string;
    maxLogSizeMB: number;
    logFileBackups: number;
    consoleLogging: boolean;
  } {
    return {
      logFile: this.logFile,
      logDir: this.logDir,
      logFileName: this.logFileName,
      maxLogSizeMB: this.maxLogSizeMB,
      logFileBackups: this.logFileBackups,
      consoleLogging: this.enableConsoleLogging
    };
  }

  /**
   * Get available log files (current + backups)
   */
  async getAvailableLogFiles(): Promise<string[]> {
    const files: string[] = [];

    if (!this.logDir) return files;

    try {
      const dirFiles = await fs.readdir(this.logDir);
      const baseName = path.basename(this.logFileName, path.extname(this.logFileName));
      const ext = path.extname(this.logFileName);

      // Find current log file and backups
      for (const file of dirFiles) {
        if (file === this.logFileName || file.startsWith(`${baseName}.`)) {
          files.push(path.join(this.logDir, file));
        }
      }

      // Limit to prevent memory issues with too many files
      const maxFiles = 100;
      if (files.length > maxFiles) {
        files.splice(maxFiles); // Keep only first maxFiles files
      }

      // Sort by modification time (newest first)
      const fileStats = await Promise.all(
        files.map(async file => {
          try {
            const stats = await fs.stat(file);
            return { file, mtime: stats.mtime };
          } catch (statError) {
            // Skip files that can't be stat'd
            return { file, mtime: new Date(0) };
          }
        })
      );

      return fileStats
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        .map(item => item.file);

    } catch (error) {
      console.error('[SUPERDESIGN-MCP] Failed to list log files:', error);
      return [];
    }
  }

  /**
   * Cleanup method to prevent memory leaks
   */
  cleanup(): void {
    this.entries = [];
    this.initialized = false;
    this.logFile = null;
    this.initializationPromise = null;
  }

  /**
   * Get memory usage statistics
   */
  getMemoryUsage(): {
    memoryEntries: number;
    maxEntries: number;
    memoryUsageKB: number;
  } {
    const estimatedSize = this.entries.length * 200; // Rough estimate per entry in bytes
    return {
      memoryEntries: this.entries.length,
      maxEntries: this.maxEntries,
      memoryUsageKB: Math.round(estimatedSize / 1024)
    };
  }
}

// Global logger instance
const enableFileLogging = process.env.ENABLE_FILE_LOGGING !== 'false';
export const logger = new Logger(process.env.LOG_LEVEL as any || 'info', enableFileLogging);