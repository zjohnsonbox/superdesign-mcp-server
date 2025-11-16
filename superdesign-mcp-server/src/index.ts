#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from './config/server-config.js';
import { SecurityValidator } from './utils/validation.js';
import { logger } from './utils/logger.js';
import { ProviderFactory } from './providers/provider-factory.js';

// Tool imports
import { createGenerateDesignTool } from './tools/generate-design.js';
import { createGenerateThemeTool } from './tools/generate-theme.js';
import { createCreateLayoutTool } from './tools/create-layout.js';
import { createManageProjectTool } from './tools/manage-project.js';
import { createReadFileTool } from './tools/read-file.js';
import { createWriteFileTool } from './tools/write-file.js';
import { createEditFileTool } from './tools/edit-file.js';
import { createGlobTool } from './tools/glob-tool.js';
import { createGrepTool } from './tools/grep-tool.js';
import { createBashTool } from './tools/bash-tool.js';
import { createPreviewDesignTool } from './tools/preview-design.js';
import { createListDesignsTool } from './tools/list-designs.js';

class SuperDesignMCPServer {
  private server: Server;
  private config: any;
  private validator!: SecurityValidator;
  private providerFactory!: ProviderFactory;
  private workspaceRoot!: string;

  constructor() {
    this.server = new Server({
      name: 'superdesign-mcp-server',
      version: '1.0.0',
      capabilities: {
        tools: {},
      },
    });

    this.setupHandlers();
  }

  /**
   * Initialize the server asynchronously
   */
  async initialize(): Promise<void> {
    // Load configuration
    this.config = await loadConfig();
    this.workspaceRoot = this.config.workspaceRoot;

    // Initialize utilities
    this.validator = new SecurityValidator(this.config);
    this.providerFactory = new ProviderFactory(this.config);
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        console.error('[SUPERDESIGN-MCP] Tools list requested');

        const tools = [
          createGenerateDesignTool(
            this.providerFactory.getCurrentProvider(),
            this.validator,
            this.workspaceRoot
          ),
          createGenerateThemeTool(
            this.providerFactory.getCurrentProvider(),
            this.validator,
            this.workspaceRoot
          ),
          createCreateLayoutTool(
            this.providerFactory.getCurrentProvider(),
            this.validator,
            this.workspaceRoot
          ),
          createManageProjectTool(
            this.validator,
            this.workspaceRoot
          ),
          createPreviewDesignTool(
            this.validator,
            this.workspaceRoot
          ),
          createListDesignsTool(
            this.validator,
            this.workspaceRoot
          ),
          createReadFileTool(
            this.validator,
            this.workspaceRoot
          ),
          createWriteFileTool(
            this.validator,
            this.workspaceRoot
          ),
          createEditFileTool(
            this.validator,
            this.workspaceRoot
          ),
          createGlobTool(
            this.validator,
            this.workspaceRoot
          ),
          createGrepTool(
            this.validator,
            this.workspaceRoot
          ),
          createBashTool(
            this.validator
          ),
        ];

        console.error('[SUPERDESIGN-MCP] Returning tools list:', { toolCount: tools.length });
        return { tools };
      } catch (error) {
        console.error('[SUPERDESIGN-MCP] ERROR: Failed to list tools:', (error as Error).message);
        logger.error('Failed to list tools', { error: (error as Error).message }, 'server');
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to list tools: ${(error as Error).message}`
        );
      }
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        // Enhanced tool call logging
        console.error('[SUPERDESIGN-MCP] Tool call received:', {
          tool: name,
          args: args,
          timestamp: new Date().toISOString(),
          requestId: request.id
        });

        logger.info('Tool call received', { name, args }, 'server');

        // Get current provider and ensure it's ready
        const provider = this.providerFactory.getCurrentProvider();
        if (!provider.isReady()) {
          throw new McpError(
            ErrorCode.InternalError,
            'AI provider is not ready. Please check configuration and API keys.'
          );
        }

        // Create tools map
        const tools = {
          generate_design: createGenerateDesignTool(
            provider,
            this.validator,
            this.workspaceRoot
          ),
          generate_theme: createGenerateThemeTool(
            provider,
            this.validator,
            this.workspaceRoot
          ),
          create_layout: createCreateLayoutTool(
            provider,
            this.validator,
            this.workspaceRoot
          ),
          manage_project: createManageProjectTool(
            this.validator,
            this.workspaceRoot
          ),
          preview_design: createPreviewDesignTool(
            this.validator,
            this.workspaceRoot
          ),
          list_designs: createListDesignsTool(
            this.validator,
            this.workspaceRoot
          ),
          read_file: createReadFileTool(
            this.validator,
            this.workspaceRoot
          ),
          write_file: createWriteFileTool(
            this.validator,
            this.workspaceRoot
          ),
          edit_file: createEditFileTool(
            this.validator,
            this.workspaceRoot
          ),
          glob: createGlobTool(
            this.validator,
            this.workspaceRoot
          ),
          grep: createGrepTool(
            this.validator,
            this.workspaceRoot
          ),
          bash: createBashTool(
            this.validator
          ),
        };

        // Get the requested tool
        const tool = tools[name as keyof typeof tools];
        if (!tool) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}. Available tools: ${Object.keys(tools).join(', ')}`
          );
        }

        // Execute the tool
        console.error('[SUPERDESIGN-MCP] Executing tool:', name);
        const startTime = Date.now();
        const result = await (tool as any).execute(args);
        const executionTime = Date.now() - startTime;

        console.error('[SUPERDESIGN-MCP] Tool execution completed:', {
          tool: name,
          success: !result.isError,
          executionTime: `${executionTime}ms`,
          hasContent: !!result.content,
          contentLength: result.content ? result.content.length : 0
        });

        // Log the response content being returned to Claude
        if (result.content) {
          console.error('[SUPERDESIGN-MCP] Response to Claude:', {
            tool: name,
            contentType: Array.isArray(result.content) ? 'array' : typeof result.content,
            contentPreview: Array.isArray(result.content)
              ? result.content.slice(0, 2).map(item => ({
                  type: item.type,
                  textLength: item.text ? item.text.length : 0,
                  preview: item.text ? (item.text.length > 200 ? item.text.substring(0, 200) + '...' : item.text) : null
                }))
              : (typeof result.content === 'string' && result.content.length > 200
                ? result.content.substring(0, 200) + '...'
                : result.content)
          });

          logger.info('Response sent to Claude', {
            tool: name,
            contentSize: result.content.length,
            contentType: Array.isArray(result.content) ? 'array' : 'single',
            preview: Array.isArray(result.content)
              ? result.content.slice(0, 1).map(item => item.type).join(', ')
              : 'text'
          }, 'server');
        }

        logger.info('Tool call completed', { name, success: !result.isError, executionTime }, 'server');

        return result;

      } catch (error) {
        console.error('[SUPERDESIGN-MCP] ERROR: Tool call failed:', {
          tool: request.params.name,
          error: (error as Error).message,
          stack: (error as Error).stack,
          timestamp: new Date().toISOString()
        });

        logger.error('Tool call failed', {
          error: (error as Error).message,
          tool: request.params.name
        }, 'server');

        if (error instanceof McpError) {
          throw error;
        }

        // Use more specific error codes based on error type
        const errorMessage = error instanceof Error ? error.message : String(error);
        let errorCode = ErrorCode.InternalError;

        if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
          errorCode = ErrorCode.InvalidParams;
        } else if (errorMessage.includes('permission') || errorMessage.includes('access')) {
          errorCode = ErrorCode.InvalidRequest;
        } else if (errorMessage.includes('not found')) {
          errorCode = ErrorCode.InvalidParams;
        }

        throw new McpError(
          errorCode,
          `Tool execution failed: ${errorMessage}`
        );
      }
    });

    // Handle errors
    this.server.onerror = (error) => {
      console.error('[SUPERDESIGN-MCP] Server error:', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        timestamp: new Date().toISOString()
      });
      logger.error('Server error', { error: (error as Error).message, stack: (error as Error).stack }, 'server');
    };

  
    // Handle cleanup
    process.on('SIGINT', async () => {
      console.error('[SUPERDESIGN-MCP] Received SIGINT, shutting down gracefully...');
      logger.info('Received SIGINT, shutting down gracefully...', undefined, 'server');
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('[SUPERDESIGN-MCP] Received SIGTERM, shutting down gracefully...');
      logger.info('Received SIGTERM, shutting down gracefully...', undefined, 'server');
      await this.cleanup();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    try {
      // Enhanced startup logging
      console.error('[SUPERDESIGN-MCP] Starting SuperDesign MCP Server...');
      console.error('[SUPERDESIGN-MCP] Process ID:', process.pid);
      console.error('[SUPERDESIGN-MCP] Working Directory:', process.cwd());
      console.error('[SUPERDESIGN-MCP] Environment Variables:', {
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ? '***-SET' : 'NOT-SET',
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
        ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
        AI_PROVIDER: process.env.AI_PROVIDER,
        WORKSPACE_ROOT: process.env.WORKSPACE_ROOT
      });

      logger.info('Starting SuperDesign MCP Server...', undefined, 'server');

      // Initialize server configuration
      await this.initialize();

      // Initialize AI provider
      await this.providerFactory.initialize();

      logger.info('AI provider initialized', {
        provider: this.providerFactory.getProviderInfo()
      }, 'server');

      // Start the server
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error('[SUPERDESIGN-MCP] Server connected via stdio transport');
      console.error('[SUPERDESIGN-MCP] MCP Server ready to receive requests!');

      logger.info('SuperDesign MCP Server started successfully!', {
        version: '1.0.0',
        workspaceRoot: this.workspaceRoot,
        provider: this.config.aiProvider
      }, 'server');

    } catch (error) {
      console.error('[SUPERDESIGN-MCP] ERROR: Failed to start server:', (error as Error).message);
      console.error('[SUPERDESIGN-MCP] Stack trace:', (error as Error).stack);
      logger.error('Failed to start server', { error: (error as Error).message }, 'server');
      process.exit(1);
    }
  }

  async cleanup(): Promise<void> {
    try {
      logger.info('Cleaning up...', undefined, 'server');

      // Get final statistics
      const stats = logger.getStats();
      logger.info('Final server statistics', stats, 'server');

      // Close server connection if open
      if (this.server) {
        // Note: MCP SDK doesn't seem to have an explicit close method
        logger.info('Server connection closed', undefined, 'server');
      }

    } catch (error) {
      logger.error('Error during cleanup', { error: (error as Error).message }, 'server');
    }
  }
}

// Start the server
async function main() {
  const server = new SuperDesignMCPServer();
  await server.start();
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: (error as Error).message, stack: (error as Error).stack }, 'server');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise }, 'server');
  process.exit(1);
});

// Start the application
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Application startup failed', { error: error.message }, 'server');
    process.exit(1);
  });
}