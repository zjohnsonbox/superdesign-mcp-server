import { MCPTool, MCPToolResult } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { spawn, ChildProcess } from 'child_process';

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
      // Spawn child process
      child = spawn(command, [], {
        shell: shell,
        cwd: workingDirectory,
        env: env,
        stdio: captureOutput ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit']
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