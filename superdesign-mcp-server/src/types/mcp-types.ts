import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Re-export Tool as MCPTool for compatibility
export type MCPTool = Tool;

// MCP Protocol Types - Use SDK types directly for compliance
export type MCPToolResult = {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
};

// Configuration Types
export interface MCPServerConfig {
  // AI Provider Configuration
  aiProvider: 'claude-api' | 'claude-code' | 'openai' | 'openrouter' | 'custom-api';
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  claudeCodePath?: string;

  // AI Model Configuration
  defaultModel: string;
  maxTokens: number;
  temperature: number;

  // Design Configuration
  defaultOutputFormat: 'html' | 'react' | 'vue' | 'svelte';
  defaultTheme: string;
  enableResponsiveDesign: boolean;
  maxDesignVariations: number;
  parallelAgents: boolean;
  designIterationsDir: string;

  // Project Configuration
  workspaceRoot: string;
  superdesignDir: string;
  designsOutputDir: string;
  themesOutputDir: string;
  designSystemOutputDir: string;

  // Security Configuration
  securityMode: 'strict' | 'permissive';
  allowedFileTypes: string[];
  maxFileSize: number;
  allowedCommands: string[];

  // Performance Configuration
  enableCaching: boolean;
  cacheTimeout: number;
  maxConcurrentRequests: number;
  requestTimeout: number;

  // Logging Configuration
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enableFileLogging: boolean;
  logDir: string;

  // Development Configuration
  enableDebugMode: boolean;
  enableHotReload: boolean;
}

// Design Generation Types
export interface DesignOptions {
  variations: number;
  designType: 'mockup' | 'component' | 'wireframe' | 'full_page';
  outputFormat: 'html' | 'react' | 'vue' | 'svelte';
  theme?: string;
  responsive: boolean;
  projectPath?: string;
}

export interface DesignResult {
  id: string;
  name: string;
  content: string;
  type: string;
  variation: number;
  metadata: {
    generatedAt: Date;
    prompt: string;
    theme?: string;
    responsive: boolean;
  };
}

export interface ThemeOptions {
  themeName: string;
  styleReference?: string;
  colorPalette?: string[];
  typography?: {
    fontFamily?: string;
    scale?: string;
  };
  outputPath?: string;
}

export interface LayoutOptions {
  description: string;
  layoutType: 'web_app' | 'mobile_app' | 'dashboard' | 'landing_page' | 'form';
  components?: string[];
  outputFormat: 'ascii' | 'mermaid' | 'html_wireframe';
}

// Project Management Types
export interface ProjectOptions {
  action: 'init' | 'status' | 'clean' | 'export';
  projectPath?: string;
  config?: Record<string, any>;
}

export interface ProjectStatus {
  initialized: boolean;
  designsCount: number;
  themesCount: number;
  lastModified: Date;
  config: Record<string, any>;
}

// Error Types
export class DesignError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'DesignError';
  }
}

export class ValidationError extends DesignError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class SecurityError extends DesignError {
  constructor(message: string, details?: any) {
    super(message, 'SECURITY_ERROR', details);
    this.name = 'SecurityError';
  }
}

export class AIProviderError extends DesignError {
  constructor(message: string, public provider: string, details?: any) {
    super(message, 'AI_PROVIDER_ERROR', details);
    this.name = 'AIProviderError';
  }
}

// File System Types
export interface FileInfo {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  lastModified: Date;
  exists: boolean;
}

export interface FileContent {
  content: string;
  encoding: string;
  size: number;
  mimeType?: string;
}

// AI Provider Types
export interface AIProvider {
  name: string;
  initialize(): Promise<void>;
  isReady(): boolean;
  generateDesign(prompt: string, options: DesignOptions): Promise<DesignResult[]>;
  generateTheme(options: ThemeOptions): Promise<string>;
  generateLayout(options: LayoutOptions): Promise<string>;
}

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}

// Logging Types
export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
  toolName?: string;
  duration?: number;
}

// Cache Types
export interface CacheEntry<T = any> {
  key: string;
  value: T;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessed: Date;
}

// Security Types
export interface SecurityValidation {
  isValidPath: boolean;
  isValidCommand: boolean;
  allowedFileTypes: string[];
  maxFileSize: number;
  workspaceBoundary: string;
}