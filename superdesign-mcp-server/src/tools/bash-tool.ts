import { MCPTool, MCPToolResult } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { spawn, ChildProcess } from 'child_process';

/**
 * Enhanced security validation result
 */
interface SecurityValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validate command security with enhanced checks
 */
function validateCommandSecurity(command: string, workingDirectory: string): SecurityValidationResult {
  // Check for empty command
  if (!command || command.trim().length === 0) {
    return { isValid: false, reason: 'Command cannot be empty' };
  }

  // Strictly forbid dangerous commands and patterns
  const dangerousPatterns = [
    // File system destruction
    /rm\s+-rf?\s+[\/~]/,
    />\s*\/dev\/(sd[a-z]|null)/,
    /mkfs/,
    /dd\s+if=/,

    // System control
    /shutdown/,
    /reboot/,
    /halt/,
    /poweroff/,
    /systemctl/,
    /service\s+.*\s+(start|stop|restart|enable|disable)/,

    // User management
    /passwd/,
    /su\s/,
    /sudo\s+su/,
    /sudo\s+[\/]/,
    /chown\s+root/,
    /chmod\s+[0-9]{3,4}\s+[\/~]/,

    // Network and services
    /iptables/,
    /ufw/,
    /firewalld/,
    /nc\s+-l/,
    /netcat/,

    // Download and execute
    /wget.*\|\s*(sh|bash|python|perl|ruby)/,
    /curl.*\|\s*(sh|bash|python|perl|ruby)/,

    // Configuration files
    />\s*\/etc\//,
    /echo.*>\s*\/etc\//,
    /crontab/,

    // Process manipulation
    /kill\s+-9/,
    /pkill/,
    /killall/,

    // Package management
    /apt-get\s+(install|remove|purge)/,
    /yum\s+(install|remove|erase)/,
    /pip\s+install.*--user/,
    /npm\s+install\s+-g/,

    // Script execution with network
    /python.*-c.*import.*(socket|urllib|requests)/,
    /perl.*-e.*socket/,
    /ruby.*-e.*socket/,
    /node.*-e.*require.*(http|https|net)/,

    // Environment manipulation
    /export\s+PATH.*[\/~]/,
    /export\s+LD_PRELOAD/,

    // Device access
    /\/dev\/(mem|kmem|port)/,
    /mknod/,

    // Backup and compression attacks
    /tar\s+.*\/[\/~]/,
    /rsync\s+.*\/[\/~]/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return {
        isValid: false,
        reason: `Dangerous command pattern detected: ${pattern.source}`
      };
    }
  }

  // Check for command chaining and injection attempts
  const injectionPatterns = [
    /[;&|`$()]/,  // Command separators and substitutions
    /\$\{[^}]*\}/,  // Variable expansion
    /`[^`]*`/,  // Backtick command substitution
    /\$\([^)]*\)/,  // Command substitution
    /<<\s*EOF/,  // Here document
    /\*\*/,  // Recursive glob that could escape
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(command)) {
      return {
        isValid: false,
        reason: `Command injection attempt detected: ${pattern.source}`
      };
    }
  }

  // Check for suspicious file paths
  const pathPatterns = [
    /\.\.[\/\\]/,  // Directory traversal
    /[\/\\]\.\.[\/\\]/,  // Hidden directory traversal
    /^\/etc\//,  // System config
    /^\/root\//,  // Root directory
    /^\/boot\//,  // Boot directory
    /^\/sys\//,   // System directory
    /^\/proc\//,  // Process directory
  ];

  for (const pattern of pathPatterns) {
    if (pattern.test(command) || pattern.test(workingDirectory)) {
      return {
        isValid: false,
        reason: `Suspicious path access detected: ${pattern.source}`
      };
    }
  }

  // Length limits to prevent command buffer overflow
  if (command.length > 1000) {
    return { isValid: false, reason: 'Command too long (max 1000 characters)' };
  }

  return { isValid: true };
}

/**
 * Parse command arguments safely (handle quoted strings)
 */
function parseCommandArgs(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let i = 0;

  while (i < command.length) {
    const char = command[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }

    i++;
  }

  if (current) {
    args.push(current);
  }

  if (args.length === 0) {
    throw new Error('No valid command found');
  }

  return args;
}

/**
 * Sanitize environment variables
 */
function sanitizeEnvironment(env: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const allowedEnvVars = [
    'PATH',
    'HOME',
    'USER',
    'SHELL',
    'LANG',
    'LC_ALL',
    'TERM',
    'PWD',
    'NODE_ENV',
    'ANTHROPIC_AUTH_TOKEN',  // Already masked by MCP
    'AI_PROVIDER',
    'WORKSPACE_ROOT'
  ];

  for (const [key, value] of Object.entries(env)) {
    if (allowedEnvVars.includes(key) && value && typeof value === 'string') {
      // Remove dangerous characters from environment values
      const sanitizedValue = value
        .replace(/[;&|`$()<>]/g, '')
        .replace(/\n|\r/g, '')
        .substring(0, 500); // Limit value length

      sanitized[key] = sanitizedValue;
    }
  }

  return sanitized;
}

/**
 * Bash command execution result
 */
export interface BashResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTime: number;
  workingDirectory: string;
  success: boolean;
}

/**
 * Create enhanced bash tool for MCP server
 */
export function createBashTool(
  validator: SecurityValidator
): MCPTool {
  return {
    name: 'bash',
    description: 'Execute bash commands with security validation, timeout handling, and comprehensive output capture',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Bash command to execute'
        },
        working_directory: {
          type: 'string',
          description: 'Working directory for command execution (relative to workspace or absolute)',
          default: '.'
        },
        timeout: {
          type: 'number',
          description: 'Command timeout in seconds',
          minimum: 1,
          maximum: 300,
          default: 30
        },
        capture_output: {
          type: 'boolean',
          description: 'Whether to capture stdout and stderr',
          default: true
        },
        shell: {
          type: 'string',
          description: 'Shell to use for execution',
          enum: ['bash', 'sh', 'zsh'],
          default: 'bash'
        },
        environment: {
          type: 'object',
          description: 'Additional environment variables for the command',
          additionalProperties: { type: 'string' },
          default: {}
        }
      },
      required: ['command']
    },
    async execute(params: any): Promise<MCPToolResult> {
      return logger.time('info', 'Bash command execution', async () => {
        try {
          // Validate input
          validator.validateInput(params, this.inputSchema);

          const {
            command,
            working_directory = '.',
            timeout = 30,
            capture_output = true,
            shell = 'bash',
            environment = {}
          } = params;

          logger.info('Bash command request', {
            command,
            working_directory,
            timeout,
            shell
          }, 'bash');

          // Security validation for command
          validator.validateCommand(command);

          // Validate and resolve working directory
          const resolvedWorkingDir = validator.validatePath(working_directory || process.cwd(), process.cwd());

          // Ensure working directory exists
          try {
            await require('fs').promises.access(resolvedWorkingDir);
          } catch {
            throw new Error(`Working directory does not exist: ${resolvedWorkingDir}`);
          }

          // Execute command
          const result = await executeBashCommand(
            command,
            resolvedWorkingDir,
            timeout * 1000, // Convert to milliseconds
            capture_output,
            shell,
            environment
          );

          logger.info('Bash command completed', {
            command,
            exit_code: result.exitCode,
            execution_time: result.executionTime,
            success: result.success
          }, 'bash');

          // Format results
          let resultText = `🖥️ **Bash Command Execution**\n\n`;
          resultText += `**Command:** \`${command}\`\n`;
          resultText += `**Working directory:** ${result.workingDirectory}\n`;
          resultText += `**Exit code:** ${result.exitCode}\n`;
          resultText += `**Execution time:** ${result.executionTime}ms\n`;
          resultText += `**Status:** ${result.success ? '✅ Success' : '❌ Failed'}\n\n`;

          if (result.stdout && capture_output) {
            resultText += `**Stdout:**\n\`\`\`\n${result.stdout}\n\`\`\`\n\n`;
          }

          if (result.stderr && capture_output) {
            resultText += `**Stderr:**\n\`\`\`\n${result.stderr}\n\`\`\`\n\n`;
          }

          if (!result.success && !capture_output) {
            resultText += `**Error:** Command failed with exit code ${result.exitCode}\n\n`;
          }

          return {
            content: [{
              type: 'text',
              text: resultText
            }],
            isError: !result.success
          };

        } catch (error) {
          logger.error('Bash command failed', {
            error: (error as Error).message,
            command: params.command
          }, 'bash');

          return {
            content: [{
              type: 'text',
              text: `❌ Bash command failed: ${(error as Error).message}`
            }],
            isError: true
          };
        }
      }, undefined, 'bash');
    }
  };
}

/**
 * Execute bash command with timeout and output capture
 */
async function executeBashCommand(
  command: string,
  workingDirectory: string,
  timeoutMs: number,
  captureOutput: boolean,
  shell: string,
  environment: Record<string, string>
): Promise<BashResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let child: ChildProcess;

    // Prepare environment
    const env = { ...process.env, ...environment };

    try {
      // Enhanced security validation before execution
      const validationResult = validateCommandSecurity(command, workingDirectory);
      if (!validationResult.isValid) {
        throw new Error(`Command validation failed: ${validationResult.reason}`);
      }

      // Parse command safely - split by spaces but respect quoted arguments
      const args = parseCommandArgs(command);

      // Spawn child process with enhanced security
      child = spawn(args[0], args.slice(1), {
        shell: false,  // Disable shell to prevent injection
        cwd: workingDirectory,
        env: sanitizeEnvironment(env),
        stdio: captureOutput ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
        detached: false,
        uid: process.getuid(),  // Run as current user
        gid: process.getgid()   // Run as current group
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (child && !child.killed) {
          child.kill('SIGTERM');
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      // Capture output if requested
      if (captureOutput && child.stdout && child.stderr) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      // Handle process completion
      child.on('close', (code) => {
        clearTimeout(timeoutId);

        const executionTime = Date.now() - startTime;
        const success = code === 0;

        const result: BashResult = {
          command,
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          executionTime,
          workingDirectory,
          success
        };

        resolve(result);
      });

      // Handle process error
      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to execute command: ${(error as Error).message}`));
      });

    } catch (error) {
      reject(new Error(`Failed to spawn process: ${error instanceof Error ? (error as Error).message : String(error)}`));
    }
  });
}

/**
 * Validate bash command for security
 */
export function validateBashCommand(command: string): { isValid: boolean; error?: string } {
  // List of dangerous commands and patterns
  const dangerousPatterns = [
    /rm\s+-rf?\s+\//,                    // rm -rf /
    />\s*\/dev\/sd/,                      // Writing to disk devices
    /mkfs/,                              // Filesystem formatting
    /dd\s+if=/,                          // Disk imaging
    /shutdown/,                          // System shutdown
    /reboot/,                            // System reboot
    /halt/,                              // System halt
    /poweroff/,                          // Power off
    /passwd/,                            // Password changes
    /su\s/,                              // Switch user
    /sudo\s+su/,                         // sudo to root
    /chmod\s+777/,                       // Dangerous permissions
    /chown\s+root/,                      // Change ownership to root
    /crontab/,                           // Cron jobs
    /systemctl/,                         // System services
    /service\s+.*\s+(start|stop|restart)/, // Service control
    /iptables/,                          // Firewall rules
    /ufw/,                               // Firewall
    /firewalld/,                         // Firewall
    /wget.*\|\s*sh/,                     // Download and execute
    /curl.*\|\s*sh/,                     // Download and execute
    />\s*\/etc\//,                       // Writing to system config
    /echo.*>\s*\/etc\//,                 // Writing to system config
    /nc\s+-l/,                           // Netcat listener
    /python.*-c.*import.*socket/,        // Python socket
    /perl.*-e.*socket/,                  // Perl socket
    /ruby.*-e.*socket/,                  // Ruby socket
  ];

  // Check for dangerous patterns
  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return {
        isValid: false,
        error: `Command contains potentially dangerous operation: ${pattern.source}`
      };
    }
  }

  // Check for suspicious characters (basic protection)
  const suspiciousChars = /[;&|`$(){}[\]]/;
  if (suspiciousChars.test(command) && !isAllowedComplexCommand(command)) {
    return {
      isValid: false,
      error: 'Command contains suspicious characters that may be unsafe'
    };
  }

  return { isValid: true };
}

/**
 * Check if complex command characters are allowed in this context
 */
function isAllowedComplexCommand(command: string): boolean {
  // Allow common safe patterns
  const allowedPatterns = [
    /git\s+.*\|/,                        // Git pipes
    /ls\s+.*\|/,                         // ls with pipes
    /find\s+.*\|/,                       // find with pipes
    /grep\s+.*\|/,                       // grep with pipes
    /cat\s+.*\|/,                        // cat with pipes
    /echo\s+.*>\s*[^\/]/,                // echo to non-system files
    /&&\s*(ls|cat|echo|grep|find|git)/,  // Safe command chaining
    /\|\|\s*(ls|cat|echo|grep|find|git)/, // Safe OR operations
  ];

  return allowedPatterns.some(pattern => pattern.test(command));
}