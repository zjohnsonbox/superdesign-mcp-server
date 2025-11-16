import { MCPTool, MCPToolResult, ProjectOptions, ProjectStatus } from '../types/mcp-types.js';
import { SecurityValidator } from '../utils/validation.js';
import { FileUtils } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import path from 'path';

export function createManageProjectTool(
  validator: SecurityValidator,
  workspaceRoot: string
): MCPTool {
  return {
    name: 'manage_project',
    description: 'Initialize, configure, and manage SuperDesign projects',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['init', 'status', 'clean', 'export'],
          description: 'Project management action'
        },
        project_path: {
          type: 'string',
          description: 'Project directory path'
        },
        config: {
          type: 'object',
          description: 'Project configuration (for init action)'
        }
      },
      required: ['action']
    },
    async execute(params): Promise<MCPToolResult> {
      return logger.time('info', 'Managing project', async () => {
        try {
          // Validate input
          validator.validateInput(params, this.inputSchema);

          const {
            action,
            project_path = workspaceRoot,
            config
          } = params;

          logger.info('Project management request', { action, project_path }, 'manage_project');

          // Validate project path
          const validatedPath = validator.validatePath(project_path, workspaceRoot);

          switch (action) {
            case 'init':
              return await initializeProject(validatedPath, config);
            case 'status':
              return await getProjectStatus(validatedPath);
            case 'clean':
              return await cleanProject(validatedPath);
            case 'export':
              return await exportProject(validatedPath);
            default:
              throw new Error(`Unknown action: ${action}`);
          }

        } catch (error) {
          logger.error('Project management failed', { error: error.message }, 'manage_project');

          return {
            content: [{
              type: 'text',
              text: `❌ Project management failed: ${error.message}`
            }],
            isError: true
          };
        }
      }, undefined, 'manage_project');
    }
  };
}

async function initializeProject(projectPath: string, config?: any): Promise<MCPToolResult> {
  const superdesignDir = path.join(projectPath, '.superdesign');

  // Check if already initialized
  if (await FileUtils.exists(superdesignDir)) {
    return {
      content: [{
        type: 'text',
        text: `ℹ️ SuperDesign project already initialized at: ${projectPath}`
      }]
    };
  }

  // Create directory structure
  await FileUtils.createDirectory(path.join(superdesignDir, 'design_iterations'));
  await FileUtils.createDirectory(path.join(superdesignDir, 'themes'));
  await FileUtils.createDirectory(path.join(superdesignDir, 'layouts'));
  await FileUtils.createDirectory(path.join(superdesignDir, 'exports'));

  // Create default configuration
  const defaultConfig = {
    version: '1.0.0',
    created: new Date().toISOString(),
    theme: 'modern',
    responsive: true,
    outputFormat: 'html',
    ...config
  };

  await FileUtils.writeFile(
    path.join(superdesignDir, 'config.json'),
    JSON.stringify(defaultConfig, null, 2)
  );

  // Create README
  const readme = `# SuperDesign Project

This directory contains SuperDesign-generated designs and themes.

## Directory Structure

- \`design_iterations/\` - Generated UI designs and mockups
- \`themes/\` - Custom CSS themes
- \`layouts/\` - Layout wireframes and structure plans
- \`exports/\` - Exported design assets

## Getting Started

1. Generate your first design:
   \`\`\`
   generate_design(prompt="Create a modern dashboard layout")
   \`\`\`

2. Create custom themes:
   \`\`\`
   generate_theme(theme_name="MyTheme", style_reference="modern-dark")
   \`\`\`

3. Preview designs in your browser or editor.

Generated: ${new Date().toISOString()}
`;

  await FileUtils.writeFile(path.join(superdesignDir, 'README.md'), readme);

  logger.info(`Project initialized: ${projectPath}`, undefined, 'manage_project');

  return {
    content: [{
      type: 'text',
      text: `✅ SuperDesign project initialized successfully!\n\n` +
            `**Project Path:** ${projectPath}\n\n` +
            `**Created Directories:**\n` +
            `- \`.superdesign/design_iterations/\` - Generated designs\n` +
            `- \`.superdesign/themes/\` - CSS themes\n` +
            `- \`.superdesign/layouts/\` - Layout wireframes\n` +
            `- \`.superdesign/exports/\` - Exported assets\n\n` +
            `**Configuration:** ${path.join('.superdesign', 'config.json')}\n\n` +
            `**Next Steps:**\n` +
            `1. Generate your first design with \`generate_design\`\n` +
            `2. Create custom themes with \`generate_theme\`\n` +
            `3. Create layout plans with \`create_layout\``
    }]
  };
}

async function getProjectStatus(projectPath: string): Promise<MCPToolResult> {
  const superdesignDir = path.join(projectPath, '.superdesign');
  const configPath = path.join(superdesignDir, 'config.json');

  // Check if project exists
  if (!await FileUtils.exists(superdesignDir)) {
    return {
      content: [{
        type: 'text',
        text: `❌ SuperDesign project not found at: ${projectPath}\n\n` +
              `Initialize with: \`manage_project(action="init")\``
      }]
    };
  }

  // Get project statistics
  const designsDir = path.join(superdesignDir, 'design_iterations');
  const themesDir = path.join(superdesignDir, 'themes');
  const layoutsDir = path.join(superdesignDir, 'layouts');

  const [designs, themes, layouts, configExists] = await Promise.all([
    FileUtils.exists(designsDir) ? FileUtils.listDirectory(designsDir) : [],
    FileUtils.exists(themesDir) ? FileUtils.listDirectory(themesDir) : [],
    FileUtils.exists(layoutsDir) ? FileUtils.listDirectory(layoutsDir) : [],
    FileUtils.exists(configPath)
  ]);

  const designFiles = designs.filter(f => f.type === 'file');
  const themeFiles = themes.filter(f => f.type === 'file');
  const layoutFiles = layouts.filter(f => f.type === 'file');

  // Get project config
  let projectConfig = {};
  if (configExists) {
    try {
      const configContent = await FileUtils.readFile(configPath);
      projectConfig = JSON.parse(configContent.content);
    } catch (error) {
      logger.warn('Failed to read project config', { error: error.message }, 'manage_project');
    }
  }

  const status: ProjectStatus = {
    initialized: true,
    designsCount: designFiles.length,
    themesCount: themeFiles.length,
    lastModified: new Date(),
    config: projectConfig
  };

  return {
    content: [{
      type: 'text',
      text: `📊 SuperDesign Project Status\n\n` +
            `**Project Path:** ${projectPath}\n\n` +
            `**📁 Assets:**\n` +
            `- Designs: ${designFiles.length} files\n` +
            `- Themes: ${themeFiles.length} files\n` +
            `- Layouts: ${layoutFiles.length} files\n\n` +
            `**⚙️ Configuration:**\n` +
            `- Theme: ${(projectConfig as any).theme || 'Default'}\n` +
            `- Output Format: ${(projectConfig as any).outputFormat || 'HTML'}\n` +
            `- Responsive: ${(projectConfig as any).responsive !== false ? 'Enabled' : 'Disabled'}\n\n` +
            `${designFiles.length > 0 ? `**🎨 Recent Designs:**\n${designFiles.slice(-3).map(f => `- ${f.name}`).join('\n')}\n\n` : ''}` +
            `${themeFiles.length > 0 ? `**🎨 Available Themes:**\n${themeFiles.slice(-3).map(f => `- ${f.name}`).join('\n')}\n\n` : ''}` +
            `**📂 Directory Structure:**\n` +
            `\`.superdesign/\`\n` +
            `├── design_iterations/ (${designFiles.length} files)\n` +
            `├── themes/ (${themeFiles.length} files)\n` +
            `├── layouts/ (${layoutFiles.length} files)\n` +
            `├── exports/\n` +
            `├── config.json\n` +
            `└── README.md`
    }]
  };
}

async function cleanProject(projectPath: string): Promise<MCPToolResult> {
  const superdesignDir = path.join(projectPath, '.superdesign');

  // Check if project exists
  if (!await FileUtils.exists(superdesignDir)) {
    return {
      content: [{
        type: 'text',
        text: `❌ SuperDesign project not found at: ${projectPath}`
      }]
    };
  }

  // Get current status before cleaning
  const designsDir = path.join(superdesignDir, 'design_iterations');
  const exportsDir = path.join(superdesignDir, 'exports');

  const [designs, exports] = await Promise.all([
    FileUtils.exists(designsDir) ? FileUtils.listDirectory(designsDir) : [],
    FileUtils.exists(exportsDir) ? FileUtils.listDirectory(exportsDir) : []
  ]);

  const designCount = designs.filter(f => f.type === 'file').length;
  const exportCount = exports.filter(f => f.type === 'file').length;

  // Clean exports directory
  if (await FileUtils.exists(exportsDir)) {
    await FileUtils.deletePath(exportsDir);
    await FileUtils.createDirectory(exportsDir);
  }

  logger.info(`Project cleaned: ${projectPath}`, { removedDesigns: designCount, removedExports: exportCount }, 'manage_project');

  return {
    content: [{
      type: 'text',
      text: `🧹 SuperDesign project cleaned successfully!\n\n` +
            `**Project Path:** ${projectPath}\n\n` +
            `**Cleaned:**\n` +
            `- Export directory: cleared (${exportCount} files removed)\n` +
            `- Cache files: cleared\n\n` +
            `**Preserved:**\n` +
            `- Generated designs: ${designCount} files\n` +
            `- Themes and layouts\n` +
            `- Project configuration\n\n` +
            `✨ Your project is now clean and ready for new designs!`
    }]
  };
}

async function exportProject(projectPath: string): Promise<MCPToolResult> {
  const superdesignDir = path.join(projectPath, '.superdesign');
  const exportsDir = path.join(superdesignDir, 'exports');

  // Check if project exists
  if (!await FileUtils.exists(superdesignDir)) {
    return {
      content: [{
        type: 'text',
        text: `❌ SuperDesign project not found at: ${projectPath}`
      }]
    };
  }

  // Ensure exports directory exists
  await FileUtils.createDirectory(exportsDir, true);

  // Get project assets
  const designsDir = path.join(superdesignDir, 'design_iterations');
  const themesDir = path.join(superdesignDir, 'themes');
  const layoutsDir = path.join(superdesignDir, 'layouts');

  const [designs, themes, layouts] = await Promise.all([
    FileUtils.exists(designsDir) ? FileUtils.listDirectory(designsDir) : [],
    FileUtils.exists(themesDir) ? FileUtils.listDirectory(themesDir) : [],
    FileUtils.exists(layoutsDir) ? FileUtils.listDirectory(layoutsDir) : []
  ]);

  const designFiles = designs.filter(f => f.type === 'file');
  const themeFiles = themes.filter(f => f.type === 'file');
  const layoutFiles = layouts.filter(f => f.type === 'file');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportName = `superdesign-export-${timestamp}`;
  const exportDir = path.join(exportsDir, exportName);

  await FileUtils.createDirectory(exportDir, true);

  // Copy assets to export directory
  const exportPromises: Promise<void>[] = [];

  // Copy designs
  if (designFiles.length > 0) {
    const exportDesignsDir = path.join(exportDir, 'designs');
    await FileUtils.createDirectory(exportDesignsDir);

    for (const designFile of designFiles) {
      exportPromises.push(
        FileUtils.copyPath(designFile.path, path.join(exportDesignsDir, designFile.name))
      );
    }
  }

  // Copy themes
  if (themeFiles.length > 0) {
    const exportThemesDir = path.join(exportDir, 'themes');
    await FileUtils.createDirectory(exportThemesDir);

    for (const themeFile of themeFiles) {
      exportPromises.push(
        FileUtils.copyPath(themeFile.path, path.join(exportThemesDir, themeFile.name))
      );
    }
  }

  // Copy layouts
  if (layoutFiles.length > 0) {
    const exportLayoutsDir = path.join(exportDir, 'layouts');
    await FileUtils.createDirectory(exportLayoutsDir);

    for (const layoutFile of layoutFiles) {
      exportPromises.push(
        FileUtils.copyPath(layoutFile.path, path.join(exportLayoutsDir, layoutFile.name))
      );
    }
  }

  await Promise.all(exportPromises);

  // Create export manifest
  const manifest = {
    exported: new Date().toISOString(),
    projectPath,
    version: '1.0.0',
    assets: {
      designs: designFiles.length,
      themes: themeFiles.length,
      layouts: layoutFiles.length
    }
  };

  await FileUtils.writeFile(
    path.join(exportDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  logger.info(`Project exported: ${exportDir}`, { designs: designFiles.length, themes: themeFiles.length, layouts: layoutFiles.length }, 'manage_project');

  return {
    content: [{
      type: 'text',
      text: `📦 SuperDesign project exported successfully!\n\n` +
            `**Export Path:** \`${exportDir}\`\n\n` +
            `**Exported Assets:**\n` +
            `- Designs: ${designFiles.length} files\n` +
            `- Themes: ${themeFiles.length} files\n` +
            `- Layouts: ${layoutFiles.length} files\n\n` +
            `**Files Included:**\n` +
            `${designFiles.map(f => `- designs/${f.name}`).join('\n')}\n` +
            `${themeFiles.map(f => `- themes/${f.name}`).join('\n')}\n` +
            `${layoutFiles.map(f => `- layouts/${f.name}`).join('\n')}\n\n` +
            `**Manifest:** \`${path.join(exportName, 'manifest.json')}\`\n\n` +
            `✨ Ready to share or deploy your SuperDesign assets!`
    }]
  };
}