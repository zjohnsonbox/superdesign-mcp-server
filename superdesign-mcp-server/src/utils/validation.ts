import * as path from 'path';
import { SecurityError, ValidationError } from '../types/mcp-types.js';
import { MCPServerConfig } from '../types/mcp-types.js';

export class SecurityValidator {
  constructor(private config: MCPServerConfig) {}

  /**
   * Validate that a file path is within the workspace boundary
   */
  validatePath(filePath: string, workspaceRoot: string = this.config.workspaceRoot): string {
    // Input validation
    if (!filePath || typeof filePath !== 'string') {
      throw new SecurityError(
        'Invalid file path: path must be a non-empty string',
        { code: 'INVALID_PATH', requestedPath: filePath }
      );
    }

    // Sanitize input path - remove dangerous characters and patterns
    const sanitizedPath = filePath
      .replace(/[<>:"|?*]/g, '')  // Remove invalid filename chars
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();

    if (!sanitizedPath) {
      throw new SecurityError(
        'Invalid file path: path contains only invalid characters',
        { code: 'INVALID_PATH', requestedPath: filePath }
      );
    }

    // Check for obvious traversal patterns in original input
    const traversalPatterns = [
      /\.\.[\/\\]/,           // ../
      /[\/\\]\.\.[\/\\]/,      // /../ or \..
      /\.\.%2f/i,             // URL encoded ../
      /\.\.%5c/i,             // URL encoded \
      /\.\.%252f/i,           // Double URL encoded ../
      /\.\.%255c/i,           // Double URL encoded \
    ];

    for (const pattern of traversalPatterns) {
      if (pattern.test(filePath)) {
        throw new SecurityError(
          `Path traversal attempt detected in "${filePath}"`,
          { code: 'PATH_TRAVERSAL', requestedPath: filePath, pattern: pattern.source }
        );
      }
    }

    // Normalize paths using absolute resolution
    const normalizedPath = path.resolve(workspaceRoot, sanitizedPath);
    const normalizedRoot = path.resolve(workspaceRoot);

    // Additional security checks
    // Ensure the normalized path is actually within the workspace
    if (!normalizedPath.startsWith(normalizedRoot)) {
      throw new SecurityError(
        `Path "${filePath}" resolves outside workspace boundary`,
        {
          code: 'PATH_TRAVERSAL',
          requestedPath: filePath,
          sanitizedPath,
          normalizedPath,
          workspaceRoot: normalizedRoot
        }
      );
    }

    // Prevent access to sensitive system directories
    const forbiddenPaths = [
      '/etc',
      '/root',
      '/boot',
      '/sys',
      '/proc',
      '/dev',
      '/bin',
      '/sbin',
      '/usr/bin',
      '/usr/sbin',
      '/var/log',
      '/var/spool',
      '/tmp'
    ];

    const resolvedPathLower = normalizedPath.toLowerCase();
    for (const forbidden of forbiddenPaths) {
      if (resolvedPathLower.startsWith(forbidden.toLowerCase())) {
        throw new SecurityError(
          `Access to forbidden system directory "${forbidden}" denied`,
          { code: 'FORBIDDEN_PATH', requestedPath: filePath, resolvedPath: normalizedPath, forbiddenPath: forbidden }
        );
      }
    }

    return normalizedPath;
  }

  /**
   * Validate file extension against allowed types
   */
  validateFileType(filePath: string): void {
    const ext = path.extname(filePath).toLowerCase();

    if (!this.config.allowedFileTypes.includes(ext)) {
      throw new SecurityError(
        `File type "${ext}" is not allowed`,
        { code: 'INVALID_FILE_TYPE', filePath, allowedTypes: this.config.allowedFileTypes }
      );
    }
  }

  /**
   * Validate file size against maximum limit
   */
  validateFileSize(fileSize: number): void {
    if (fileSize > this.config.maxFileSize) {
      throw new SecurityError(
        `File size ${fileSize} bytes exceeds maximum allowed size ${this.config.maxFileSize} bytes`,
        { code: 'FILE_TOO_LARGE', fileSize, maxSize: this.config.maxFileSize }
      );
    }
  }

  /**
   * Validate shell command for security
   */
  validateCommand(command: string): void {
    const dangerousPatterns = [
      // System destruction
      /\brm\s+(-[rf]*\s+)?\/\s*$/i,
      /\b(format|fdisk|mkfs)\b/i,
      // Process manipulation
      /\b(kill|killall|pkill)\s+(-9\s+)?1\b/i,
      // System shutdown
      /\b(shutdown|reboot|halt|init\s+0)\b/i,
      // Privilege escalation
      /\b(sudo\s+su|sudo.*passwd|chmod\s+777)/i,
      // Directory traversal
      /\.\.(\/|\\)/,
      // Dangerous redirections
      />\s*(\/dev\/|\/proc\/|\/sys\/)/i,
      // Network commands that could be dangerous
      /\b(curl|wget)\s+.*\|\s*(bash|sh|python|ruby|perl)/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new SecurityError(
          `Command contains potentially dangerous operations`,
          { code: 'UNSAFE_COMMAND', command, pattern: pattern.source }
        );
      }
    }
  }

  /**
   * Validate input parameters for tools
   */
  validateInput(params: any, schema: any): void {
    if (!params || typeof params !== 'object') {
      throw new ValidationError('Parameters must be a valid object');
    }

    // Check required parameters
    if (schema.required) {
      for (const requiredParam of schema.required) {
        if (!(requiredParam in params)) {
          throw new ValidationError(
            `Required parameter "${requiredParam}" is missing`,
            { missingParam: requiredParam }
          );
        }
      }
    }

    // Validate parameter types
    if (schema.properties) {
      for (const [paramName, paramSchema] of Object.entries(schema.properties)) {
        if (paramName in params) {
          this.validateParameterType(params[paramName], paramName, paramSchema as any);
        }
      }
    }
  }

  /**
   * Validate individual parameter type
   */
  private validateParameterType(value: any, paramName: string, schema: any): void {
    const { type, enum: enumValues, minLength, maxLength, minimum, maximum } = schema;

    // Type validation
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new ValidationError(
            `Parameter "${paramName}" must be a string, got ${typeof value}`,
            { paramName, expectedType: 'string', actualType: typeof value }
          );
        }
        if (minLength !== undefined && value.length < minLength) {
          throw new ValidationError(
            `Parameter "${paramName}" must be at least ${minLength} characters long`,
            { paramName, minLength, actualLength: value.length }
          );
        }
        if (maxLength !== undefined && value.length > maxLength) {
          throw new ValidationError(
            `Parameter "${paramName}" must be at most ${maxLength} characters long`,
            { paramName, maxLength, actualLength: value.length }
          );
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          throw new ValidationError(
            `Parameter "${paramName}" must be a number, got ${typeof value}`,
            { paramName, expectedType: 'number', actualType: typeof value }
          );
        }
        if (minimum !== undefined && value < minimum) {
          throw new ValidationError(
            `Parameter "${paramName}" must be at least ${minimum}`,
            { paramName, minimum, actualValue: value }
          );
        }
        if (maximum !== undefined && value > maximum) {
          throw new ValidationError(
            `Parameter "${paramName}" must be at most ${maximum}`,
            { paramName, maximum, actualValue: value }
          );
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new ValidationError(
            `Parameter "${paramName}" must be a boolean, got ${typeof value}`,
            { paramName, expectedType: 'boolean', actualType: typeof value }
          );
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          throw new ValidationError(
            `Parameter "${paramName}" must be an array, got ${typeof value}`,
            { paramName, expectedType: 'array', actualType: typeof value }
          );
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new ValidationError(
            `Parameter "${paramName}" must be an object, got ${typeof value}`,
            { paramName, expectedType: 'object', actualType: typeof value }
          );
        }
        break;
    }

    // Enum validation
    if (enumValues && !enumValues.includes(value)) {
      throw new ValidationError(
        `Parameter "${paramName}" must be one of: ${enumValues.join(', ')}`,
        { paramName, allowedValues: enumValues, actualValue: value }
      );
    }
  }

  /**
   * Sanitize string input to prevent injection attacks
   */
  sanitizeString(input: string): string {
    return input
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
      .replace(/[<>]/g, '') // Remove HTML brackets
      .trim();
  }

  /**
   * Validate and sanitize file name
   */
  validateFileName(fileName: string): string {
    const sanitized = this.sanitizeString(fileName);

    // Remove path separators and other dangerous characters
    const safeFileName = sanitized.replace(/[\/\\:*?"<>|]/g, '_');

    if (!safeFileName || safeFileName.length === 0) {
      throw new ValidationError('File name cannot be empty after sanitization');
    }

    if (safeFileName.length > 255) {
      throw new ValidationError('File name is too long (max 255 characters)');
    }

    return safeFileName;
  }
}