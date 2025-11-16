import { LogEntry } from '../types/mcp-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class Logger {
  private entries: LogEntry[] = [];
  private maxEntries: number = 1000;
  private logFile: string | null = null;
  private logDir: string = '.superdesign/logs';

  constructor(private minLevel: 'debug' | 'info' | 'warn' | 'error' = 'info', enableFileLogging: boolean = true) {
    if (enableFileLogging) {
      this.initializeFileLogging();
    }
  }

  private async initializeFileLogging(): Promise<void> {
    try {
      // Create log directory if it doesn't exist
      await fs.mkdir(this.logDir, { recursive: true });

      // Create log file with timestamp
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      this.logFile = path.join(this.logDir, `mcp-server-${timestamp}.log`);

      // Write initial log entry
      const initMessage = `[${new Date().toISOString()}] [SUPERDESIGN-MCP] Logger initialized - Log file: ${this.logFile}\n`;
      await fs.writeFile(this.logFile, initMessage, 'utf8');

      // Also write to stderr for visibility
      console.error('[SUPERDESIGN-MCP] File logging enabled:', this.logFile);
    } catch (error) {
      console.error('[SUPERDESIGN-MCP] Failed to initialize file logging:', error);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, metadata?: Record<string, any>, toolName?: string): void {
    this.log('debug', message, metadata, toolName);
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: Record<string, any>, toolName?: string): void {
    this.log('info', message, metadata, toolName);
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: Record<string, any>, toolName?: string): void {
    this.log('warn', message, metadata, toolName);
  }

  /**
   * Log error message
   */
  error(message: string, metadata?: Record<string, any>, toolName?: string): void {
    this.log('error', message, metadata, toolName);
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
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, metadata?: Record<string, any>, toolName?: string): void {
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

    // Output to console
    this.outputToConsole(entry);
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
    const timestamp = entry.timestamp.toISOString();
    const toolPrefix = entry.toolName ? `[${entry.toolName}]` : '';
    const metadataStr = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';

    const message = `${timestamp} ${entry.level.toUpperCase()}${toolPrefix} ${entry.message}${metadataStr}`;

    // Output to console
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

    // Write to file if enabled
    if (this.logFile) {
      try {
        const fileMessage = `[SUPERDESIGN-MCP] ${message}\n`;
        await fs.appendFile(this.logFile, fileMessage, 'utf8');
      } catch (error) {
        console.error('[SUPERDESIGN-MCP] Failed to write to log file:', error);
      }
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
}

// Global logger instance
const enableFileLogging = process.env.ENABLE_FILE_LOGGING !== 'false';
export const logger = new Logger(process.env.LOG_LEVEL as any || 'info', enableFileLogging);