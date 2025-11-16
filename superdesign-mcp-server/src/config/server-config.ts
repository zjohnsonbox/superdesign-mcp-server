import { MCPServerConfig } from '../types/mcp-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger.js';

export const DEFAULT_CONFIG: MCPServerConfig = {
  // AI Provider Configuration
  aiProvider: (process.env.AI_PROVIDER as any) || 'claude-api',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
  claudeCodePath: process.env.CLAUDE_CODE_PATH || 'claude',

  // AI Model Configuration
  defaultModel: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'claude-3-5-sonnet-20241022',
  maxTokens: 8192,
  temperature: 0.7,

  // Design Configuration
  defaultOutputFormat: 'html',
  defaultTheme: 'modern',
  enableResponsiveDesign: true,
  maxDesignVariations: 3,
  parallelAgents: true,
  designIterationsDir: '.superdesign/design_iterations',
  designsOutputDir: '.superdesign/design_iterations',

  // Project Configuration
  workspaceRoot: process.cwd(),
  superdesignDir: '.superdesign',
  themesOutputDir: '.superdesign/themes',
  designSystemOutputDir: '.superdesign/design_system',

  // Security Configuration
  securityMode: 'strict',
  allowedFileTypes: [
    '.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
    '.json', '.md', '.txt', '.yml', '.yaml', '.xml', '.svg', '.png', '.jpg', '.jpeg',
    '.gif', '.webp', '.ico', '.pdf'
  ],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedCommands: [
    'ls', 'cat', 'find', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq',
    'git', 'npm', 'yarn', 'pnpm', 'node', 'python', 'python3',
    'mkdir', 'cp', 'mv', 'rm', 'touch', 'echo', 'date', 'whoami'
  ],

  // Performance Configuration
  enableCaching: true,
  cacheTimeout: 3600000, // 1 hour
  maxConcurrentRequests: 5,
  requestTimeout: 300000, // 5 minutes

  // Logging Configuration
  logLevel: 'info',
  enableFileLogging: true,
  logDir: '.superdesign/logs',

  // Development Configuration
  enableDebugMode: process.env.NODE_ENV === 'development',
  enableHotReload: process.env.NODE_ENV === 'development'
};

/**
 * Load configuration from file and environment variables
 */
export async function loadConfig(configPath?: string, overrides?: Partial<MCPServerConfig>): Promise<MCPServerConfig> {
  try {
    // Determine config file path
    const defaultConfigPath = path.join(process.cwd(), '.superdesign', 'config.json');
    const finalConfigPath = configPath || defaultConfigPath;

    // Load config file if it exists
    let fileConfig: Partial<MCPServerConfig> = {};
    try {
      const configData = await fs.readFile(finalConfigPath, 'utf8');
      fileConfig = JSON.parse(configData);
      logger.info(`Configuration loaded from: ${finalConfigPath}`, { source: 'config' });
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logger.warn(`Failed to load config file: ${(error as Error).message}`, { source: 'config' });
      }
    }

    // Merge configurations
    const config: MCPServerConfig = {
      ...DEFAULT_CONFIG,
      ...fileConfig,
      ...overrides
    };

    // Validate required configuration
    validateConfig(config);

    // Ensure workspace exists
    await ensureWorkspace(config);

    logger.info('Configuration loaded successfully', {
      aiProvider: config.aiProvider,
      workspaceRoot: config.workspaceRoot,
      securityMode: config.securityMode
    }, 'config');

    return config;

  } catch (error) {
    logger.error(`Configuration loading failed: ${(error as Error).message}`, { source: 'config' });
    throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate configuration values
 */
function validateConfig(config: MCPServerConfig): void {
  // Validate AI provider
  const validProviders = ['claude-api', 'custom-api', 'claude-code', 'openai', 'openrouter'];
  if (!validProviders.includes(config.aiProvider)) {
    throw new Error(`Invalid AI provider: ${config.aiProvider}. Must be one of: ${validProviders.join(', ')}`);
  }

  // Validate API key based on provider
  switch (config.aiProvider) {
    case 'claude-api':
    case 'custom-api':
      if (!config.anthropicApiKey) {
        throw new Error('ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is required for Claude API provider');
      }
      break;
    case 'openai':
      if (!config.openaiApiKey) {
        throw new Error('OPENAI_API_KEY is required for OpenAI provider');
      }
      break;
    case 'openrouter':
      if (!config.openrouterApiKey) {
        throw new Error('OPENROUTER_API_KEY is required for OpenRouter provider');
      }
      break;
  }

  // Validate workspace root
  if (!config.workspaceRoot || typeof config.workspaceRoot !== 'string') {
    throw new Error('Valid workspaceRoot is required');
  }

  // Validate numeric values
  if (config.maxTokens <= 0 || config.maxTokens > 200000) {
    throw new Error('maxTokens must be between 1 and 200000');
  }

  if (config.temperature < 0 || config.temperature > 2) {
    throw new Error('temperature must be between 0 and 2');
  }

  if (config.maxDesignVariations < 1 || config.maxDesignVariations > 10) {
    throw new Error('maxDesignVariations must be between 1 and 10');
  }

  // Validate file size
  if (config.maxFileSize <= 0 || config.maxFileSize > 100 * 1024 * 1024) {
    throw new Error('maxFileSize must be between 1 byte and 100MB');
  }
}

/**
 * Ensure workspace directories exist
 */
async function ensureWorkspace(config: MCPServerConfig): Promise<void> {
  const directories = [
    path.join(config.workspaceRoot, config.superdesignDir),
    path.join(config.workspaceRoot, config.designIterationsDir),
    path.join(config.workspaceRoot, config.themesOutputDir),
    path.join(config.workspaceRoot, config.designSystemOutputDir)
  ];

  if (config.enableFileLogging) {
    directories.push(path.join(config.workspaceRoot, config.logDir));
  }

  for (const dir of directories) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      logger.info(`Created directory: ${dir}`, { action: 'create_directory', path: dir });
    }
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: MCPServerConfig, configPath?: string): Promise<void> {
  try {
    const defaultConfigPath = path.join(process.cwd(), '.superdesign', 'config.json');
    const finalConfigPath = configPath || defaultConfigPath;

    // Ensure directory exists
    const configDir = path.dirname(finalConfigPath);
    await fs.mkdir(configDir, { recursive: true });

    // Write config file (excluding sensitive data)
    const configToSave = { ...config };
    delete configToSave.anthropicApiKey;
    delete configToSave.openaiApiKey;
    delete configToSave.openrouterApiKey;

    await fs.writeFile(finalConfigPath, JSON.stringify(configToSave, null, 2));
    logger.info(`Configuration saved to: ${finalConfigPath}`, { action: 'save_config', path: finalConfigPath });

  } catch (error) {
    logger.error(`Failed to save configuration: ${(error as Error).message}`, { action: 'save_config', error: error });
    throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(): Partial<MCPServerConfig> {
  const env: Partial<MCPServerConfig> = {};

  // Map environment variables to config
  if (process.env.SUPERDESIGN_AI_PROVIDER) {
    env.aiProvider = process.env.SUPERDESIGN_AI_PROVIDER as any;
  }

  if (process.env.SUPERDESIGN_WORKSPACE_ROOT) {
    env.workspaceRoot = process.env.SUPERDESIGN_WORKSPACE_ROOT;
  }

  if (process.env.SUPERDESIGN_OUTPUT_DIR) {
    env.designIterationsDir = process.env.SUPERDESIGN_OUTPUT_DIR;
  }

  if (process.env.SUPERDESIGN_SECURITY_MODE) {
    env.securityMode = process.env.SUPERDESIGN_SECURITY_MODE as any;
  }

  if (process.env.SUPERDESIGN_LOG_LEVEL) {
    env.logLevel = process.env.SUPERDESIGN_LOG_LEVEL as any;
  }

  if (process.env.SUPERDESIGN_MAX_VARIATIONS) {
    const variations = parseInt(process.env.SUPERDESIGN_MAX_VARIATIONS, 10);
    if (!isNaN(variations)) {
      env.maxDesignVariations = variations;
    }
  }

  return env;
}