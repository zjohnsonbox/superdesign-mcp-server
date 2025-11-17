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
          enum: ['init', 'status', 'clean', 'export', 'validate', 'setup_rules'],
          description: 'Project management action'
        },
        project_path: {
          type: 'string',
          description: 'Project directory path'
        },
        config: {
          type: 'object',
          description: 'Project configuration (for init action)'
        },
        setup_type: {
          type: 'string',
          enum: ['basic', 'full', 'rules_only'],
          description: 'Setup type for initialization',
          default: 'basic'
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
            config,
            setup_type = 'basic'
          } = params;

          logger.info('Project management request', { action, project_path }, 'manage_project');

          // Validate project path
          const validatedPath = validator.validatePath(project_path, workspaceRoot);

          switch (action) {
            case 'init':
              return await initializeProject(validatedPath, config, setup_type);
            case 'status':
              return await getProjectStatus(validatedPath);
            case 'clean':
              return await cleanProject(validatedPath);
            case 'export':
              return await exportProject(validatedPath);
            case 'validate':
              return await validateProject(validatedPath);
            case 'setup_rules':
              return await setupDesignRules(validatedPath);
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

async function initializeProject(projectPath: string, config?: any, setupType: string = 'basic'): Promise<MCPToolResult> {
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

  // Enhanced initialization based on setup type
  let additionalSetup = '';

  if (setupType === 'full' || setupType === 'rules_only') {
    await setupDesignRules(projectPath);
    additionalSetup += '✅ Design rules configured\n';
  }

  if (setupType === 'full') {
    await setupCSSFramework(projectPath);
    additionalSetup += '✅ CSS framework initialized\n';
  }

  logger.info(`Project initialized: ${projectPath}`, { setupType }, 'manage_project');

  return {
    content: [{
      type: 'text',
      text: `✅ SuperDesign project initialized successfully!\n\n` +
            `**Project Path:** ${projectPath}\n` +
            `**Setup Type:** ${setupType}\n\n` +
            `**Created Directories:**\n` +
            `- \`.superdesign/design_iterations/\` - Generated designs\n` +
            `- \`.superdesign/themes/\` - CSS themes\n` +
            `- \`.superdesign/layouts/\` - Layout wireframes\n` +
            `- \`.superdesign/exports/\` - Exported assets\n\n` +
            `${additionalSetup ? `**Additional Setup:**\n${additionalSetup}\n` : ''}` +
            `**Configuration:** ${path.join('.superdesign', 'config.json')}\n\n` +
            `**Next Steps:**\n` +
            `1. Generate your first design with \`generate_design\`\n` +
            `2. Create custom themes with \`generate_theme\`\n` +
            `3. Create layout plans with \`create_layout\`\n` +
            `${setupType === 'full' ? '4. Check design rules in `SUPERDESIGN_RULES.md`\n' : ''}` +
            `${setupType === 'full' ? '5. Use CSS framework from `.superdesign/default.css`\n' : ''}`
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

async function setupDesignRules(projectPath: string): Promise<MCPToolResult> {
  const rulesContent = `# SuperDesign Design Rules

## 🎨 Design Workflow

### 1. Layout Planning
- Start with layout wireframes using \`create_layout\`
- Define component structure and hierarchy
- Plan responsive breakpoints

### 2. Theme Design
- Generate color schemes with \`generate_theme\`
- Define typography and spacing
- Create consistent design tokens

### 3. Component Generation
- Generate UI components with \`generate_design\`
- Use consistent naming conventions
- Follow accessibility standards

### 4. Responsive Design
- Design for mobile-first approach
- Use CSS Grid and Flexbox
- Test across multiple screen sizes

## 🧩 Component Design Principles

### Atomic Design Approach
- **Atoms**: Basic elements (buttons, inputs, labels)
- **Molecules**: Simple component groups (search bars, cards)
- **Organisms**: Complex components (headers, navigation)
- **Templates**: Page layouts
- **Pages**: Final implementations

### Accessibility Standards
- Use semantic HTML elements
- Ensure proper color contrast (WCAG AA)
- Provide keyboard navigation
- Include ARIA labels where needed
- Test with screen readers

### Performance Guidelines
- Optimize images and assets
- Minimize CSS and JavaScript
- Use lazy loading for heavy components
- Implement proper caching strategies

## 🎯 Design System Guidelines

### Color System
- Primary, secondary, and accent colors
- Semantic colors (success, warning, error, info)
- Neutral palette for backgrounds and text
- Consistent naming convention

### Typography Scale
- Headings (h1-h6) with consistent hierarchy
- Body text with optimal readability
- Monospace for code and technical content
- Responsive font sizing

### Spacing System
- Consistent spacing scale (4px, 8px, 16px, 24px, etc.)
- Vertical rhythm for typography
- Consistent margins and padding

## 🔧 MCP Integration

### Available Tools
- \`generate_design\` - Create UI designs and components
- \`generate_theme\` - Generate CSS themes and design tokens
- \`create_layout\` - Plan layout structures
- \`manage_project\` - Initialize and manage projects
- \`preview_design\` - Preview generated designs

### Best Practices
1. Start with layout planning before detailed design
2. Use consistent naming for generated files
3. Validate designs across multiple viewports
4. Follow accessibility guidelines
5. Document design decisions

## 📝 File Organization

### Generated Files Structure
\`\`\`
.superdesign/
├── design_iterations/     # Generated UI designs
├── themes/               # CSS themes and design tokens
├── layouts/              # Layout wireframes
├── exports/              # Exported assets
├── config.json           # Project configuration
└── README.md            # Project documentation
\`\`\`

### Naming Conventions
- Use kebab-case for file names
- Include date and version in iteration names
- Group related components in directories
- Use descriptive names that reflect purpose

---

*Generated by SuperDesign MCP Server - ${new Date().toISOString()}*`;

  await FileUtils.writeFile(path.join(projectPath, 'SUPERDESIGN_RULES.md'), rulesContent);
  logger.info('Design rules configured', { projectPath }, 'manage_project');

  return {
    content: [{
      type: 'text',
      text: `✅ Design rules configured successfully!\n\n` +
            `**File Created:** \`SUPERDESIGN_RULES.md\`\n\n` +
            `**Contents:**\n` +
            `- Design workflow and principles\n` +
            `- Component design guidelines\n` +
            `- Accessibility standards\n` +
            `- MCP tool integration\n` +
            `- File organization best practices\n\n` +
            `✨ Your project now has comprehensive design guidelines!`
    }]
  };
}

async function setupCSSFramework(projectPath: string): Promise<void> {
  const cssContent = `/* SuperDesign CSS Framework */
/* Generated: ${new Date().toISOString()} */

/* Reset and Base Styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: #1a1a1a;
  background-color: #ffffff;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Color System */
:root {
  /* Primary Colors */
  --color-primary-50: #f0f9ff;
  --color-primary-100: #e0f2fe;
  --color-primary-500: #0ea5e9;
  --color-primary-600: #0284c7;
  --color-primary-700: #0369a1;

  /* Semantic Colors */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;

  /* Neutral Colors */
  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-300: #d1d5db;
  --color-gray-400: #9ca3af;
  --color-gray-500: #6b7280;
  --color-gray-600: #4b5563;
  --color-gray-700: #374151;
  --color-gray-800: #1f2937;
  --color-gray-900: #111827;

  /* Spacing Scale */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;

  /* Typography Scale */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --text-4xl: 2.25rem;
  --text-5xl: 3rem;

  /* Border Radius */
  --radius-sm: 0.125rem;
  --radius: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-2xl: 1rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
}

/* Utility Classes */
.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-4);
}

.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }

.grid { display: grid; }
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

.gap-2 { gap: var(--space-2); }
.gap-4 { gap: var(--space-4); }
.gap-6 { gap: var(--space-6); }

.p-2 { padding: var(--space-2); }
.p-4 { padding: var(--space-4); }
.p-6 { padding: var(--space-6); }

.m-2 { margin: var(--space-2); }
.m-4 { margin: var(--space-4); }
.m-6 { margin: var(--space-6); }

/* Typography Classes */
.text-xs { font-size: var(--text-xs); }
.text-sm { font-size: var(--text-sm); }
.text-base { font-size: var(--text-base); }
.text-lg { font-size: var(--text-lg); }
.text-xl { font-size: var(--text-xl); }
.text-2xl { font-size: var(--text-2xl); }
.text-3xl { font-size: var(--text-3xl); }
.text-4xl { font-size: var(--text-4xl); }
.text-5xl { font-size: var(--text-5xl); }

.font-bold { font-weight: 700; }
.font-semibold { font-weight: 600; }
.font-medium { font-weight: 500; }

/* Color Classes */
.bg-primary { background-color: var(--color-primary-500); }
.bg-success { background-color: var(--color-success); }
.bg-warning { background-color: var(--color-warning); }
.bg-error { background-color: var(--color-error); }
.bg-gray-100 { background-color: var(--color-gray-100); }

.text-primary { color: var(--color-primary-500); }
.text-success { color: var(--color-success); }
.text-warning { color: var(--color-warning); }
.text-error { color: var(--color-error); }
.text-gray-600 { color: var(--color-gray-600); }
.text-gray-800 { color: var(--color-gray-800); }

/* Component Styles */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2) var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.25;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  user-select: none;
}

.btn-primary {
  background-color: var(--color-primary-500);
  color: white;
}

.btn-primary:hover {
  background-color: var(--color-primary-600);
}

.card {
  background: white;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
}

.card:hover {
  box-shadow: var(--shadow);
}

/* Form Elements */
.input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius);
  font-size: var(--text-sm);
  transition: border-color 0.15s ease-in-out;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 3px rgb(14 165 233 / 0.1);
}

/* Responsive Design */
@media (min-width: 640px) {
  .container {
    padding: 0 var(--space-6);
  }

  .sm\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sm\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (min-width: 768px) {
  .md\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .md\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .md\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (min-width: 1024px) {
  .lg\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lg\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .lg\:grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
}

/* Accessibility */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.focus\:ring:focus {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}

/* Print Styles */
@media print {
  * {
    background: transparent !important;
    color: black !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  a, a:visited { text-decoration: underline; }

  img { max-width: 100% !important; }

  p, h2, h3 { orphans: 3; widows: 3; }

  h2, h3 { page-break-after: avoid; }
}`;

  await FileUtils.writeFile(path.join(projectPath, '.superdesign', 'default.css'), cssContent);
  logger.info('CSS framework initialized', { projectPath }, 'manage_project');
}

async function validateProject(projectPath: string): Promise<MCPToolResult> {
  const superdesignDir = path.join(projectPath, '.superdesign');

  // Check if project exists
  if (!await FileUtils.exists(superdesignDir)) {
    return {
      content: [{
        type: 'text',
        text: `❌ SuperDesign project not found at: ${projectPath}\n\n` +
              `Initialize with: \`manage_project(action=\"init\", setup_type=\"full\")\``
      }]
    };
  }

  // Validate project structure
  const requiredDirs = [
    'design_iterations',
    'themes',
    'layouts',
    'exports'
  ];

  const requiredFiles = [
    'config.json',
    'README.md'
  ];

  const optionalFiles = [
    'SUPERDESIGN_RULES.md',
    'default.css'
  ];

  const validationResults: string[] = [];
  const issues: string[] = [];

  // Check required directories
  for (const dir of requiredDirs) {
    const dirPath = path.join(superdesignDir, dir);
    if (await FileUtils.exists(dirPath)) {
      validationResults.push(`✅ ${dir}/ directory exists`);
    } else {
      issues.push(`❌ Missing required directory: ${dir}/`);
    }
  }

  // Check required files
  for (const file of requiredFiles) {
    const filePath = path.join(superdesignDir, file);
    if (await FileUtils.exists(filePath)) {
      validationResults.push(`✅ ${file} exists`);
    } else {
      issues.push(`❌ Missing required file: ${file}`);
    }
  }

  // Check optional files
  for (const file of optionalFiles) {
    const filePath = file === 'SUPERDESIGN_RULES.md'
      ? path.join(projectPath, file)
      : path.join(superdesignDir, file);

    if (await FileUtils.exists(filePath)) {
      validationResults.push(`✅ ${file} exists`);
    } else {
      validationResults.push(`⚠️ Optional file missing: ${file}`);
    }
  }

  // Get project statistics
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

  const stats = [
    `📊 **Project Statistics:**`,
    `- Generated Designs: ${designFiles.length}`,
    `- Available Themes: ${themeFiles.length}`,
    `- Layout Plans: ${layoutFiles.length}`
  ];

  // Overall validation status
  const isValid = issues.length === 0;
  const status = isValid ? '✅ **VALID** - Project structure is complete' : '❌ **INVALID** - Project has issues';

  return {
    content: [{
      type: 'text',
      text: `🔍 SuperDesign Project Validation\n\n` +
            `${status}\n\n` +
            `**Project Path:** ${projectPath}\n\n` +
            `**Validation Results:**\n` +
            validationResults.join('\n') + '\n\n' +
            (issues.length > 0 ? `**Issues Found:**\n${issues.join('\n')}\n\n` : '') +
            stats.join('\n') + '\n\n' +
            (isValid
              ? `✨ Your SuperDesign project is properly configured and ready for use!`
              : `💡 Fix the issues above or run: \`manage_project(action=\"setup_rules\")\` to add missing components`)
    }]
  };
}