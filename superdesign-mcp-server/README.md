# SuperDesign MCP Server Installation Guide

This guide will help you quickly install the SuperDesign MCP server into your Claude Code CLI.

## 🚀 Quick Installation

### Method 1: Using Automated Script (Recommended)

1. Ensure you are in the `superdesign-mcp-server` directory:
   ```bash
   cd path/to/superdesign-mcp-server
   ```

2. Run the installation script:
   ```bash
   ./add-mcp-into-claude-code-cli.sh
   ```

The script will automatically complete the following operations:
- ✅ Check Node.js and npm installation
- ✅ Check Claude Code CLI installation
- ✅ Install project dependencies
- ✅ Install tsx globally (if not already installed)
- ✅ Remove existing SuperDesign configuration
- ✅ Add new SuperDesign MCP server
- ✅ Verify installation and display detailed information

### Method 2: Manual Installation

If you prefer manual installation, you can follow these steps:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Install tsx** (if not already installed):
   ```bash
   npm install -g tsx
   ```

3. **Remove existing configuration** (optional):
   ```bash
   claude mcp remove superdesign -s user
   ```

4. **Add MCP server**:
   ```bash
   claude mcp add --transport stdio --scope user superdesign \
     --env AI_PROVIDER="custom-api" --env SECURITY_MODE="strict" \
     --env WORKSPACE_ROOT="$(pwd)" \
     -- \
     npx tsx ./src/index.ts
   ```

5. **Verify installation**:
   ```bash
   claude mcp list
   claude mcp get superdesign
   ```

## 📋 System Requirements

- **Node.js**: >= 18.0.0
- **npm**: Latest version
- **Claude Code CLI**: Installed and configured
- **Operating System**: macOS, Linux, Windows (WSL)

## 🔍 Verify Installation

After installation is complete, you can run the following commands to verify:

```bash
# List all MCP servers
claude mcp list

# View SuperDesign detailed configuration
claude mcp get superdesign
```

You should see output similar to this:
```
superdesign:
  Scope: User config (available in all your projects)
  Status: ✓ Connected
  Type: stdio
  Command: npx
  Args: tsx ./src/index.ts
  Environment:
    AI_PROVIDER=custom-api
    SECURITY_MODE=strict
    WORKSPACE_ROOT=/path/to/superdesign-mcp-server
```

## 🛠️ Available Tools

SuperDesign MCP server provides the following tools:

| Tool Name | Description |
|---------|------|
| `generate_design` | Generate UI designs, models and components |
| `create_layout` | Create layout designs |
| `generate_theme` | Generate design themes |
| `manage_project` | Manage design projects |
| `read_file` | Read files |
| `write_file` | Write files |
| `edit_file` | Edit files |
| `glob_tool` | File pattern search |
| `grep_tool` | Text search |
| `preview_design` | Preview designs |
| `list_designs` | List existing designs |

## 🚨 Troubleshooting

### Common Issues

1. **Node.js version too low**:
   ```bash
   # Check version
   node --version

   # If version is below 18, please upgrade Node.js
   ```

2. **Claude Code CLI not found**:
   ```bash
   # Ensure claude is in PATH
   which claude

   # If not found, please reinstall Claude Code CLI
   ```

3. **MCP server connection failed**:
   ```bash
   # Check logs
   claude mcp list

   # Re-add server
   claude mcp remove superdesign -s user
   ./add-mcp-into-claude-code-cli.sh
   ```

4. **Dependency installation failed**:
   ```bash
   # Clean and reinstall
   rm -rf node_modules package-lock.json
   npm install
   ```

### Manual Debugging

If the automatic script fails, you can manually debug each step:

```bash
# 1. Check directory
pwd
ls -la package.json src/

# 2. Check Node.js/npm
node --version
npm --version

# 3. Check Claude CLI
claude --version

# 4. Install dependencies
npm install

# 5. Test tsx
npx tsx --version

# 6. Manually add MCP
claude mcp add --transport stdio --scope user superdesign \
  --env AI_PROVIDER="custom-api" --env SECURITY_MODE="strict" \
  --env WORKSPACE_ROOT="$(pwd)" \
  -- \
  npx tsx ./src/index.ts
```

## 🔄 Update and Uninstall

### Update SuperDesign

1. Update code:
   ```bash
   git pull origin main
   ```

2. Run installation script again:
   ```bash
   ./add-mcp-into-claude-code-cli.sh
   ```

### Complete Uninstall

```bash
# Remove MCP server configuration
claude mcp remove superdesign -s user

# Optional: Delete project files
cd ..
rm -rf superdesign-mcp-server
```

## 📞 Support

If you encounter problems:

1. Check [GitHub Issues](https://github.com/superdesigndev/superdesign-mcp-server/issues)
2. Join [Discord Community](https://discord.gg/FYr49d6cQ9)
3. Check [Project Documentation](https://github.com/superdesigndev/superdesign-mcp-server)

## 🎉 Getting Started

After installation is complete, you can use SuperDesign's AI design features in any Claude Code CLI session! Try saying:

- "Generate a modern login page design"
- "Create a responsive navigation bar component"
- "Design a mobile settings interface"

## 📋 Logging and Troubleshooting

SuperDesign MCP server automatically logs all activities for debugging and monitoring:

### Log File Location
- **Default log file**: `~/.superdesign/logs/superdesign-mcp.log`
- **Log directory**: `~/.superdesign/logs/` (auto-created)

### Viewing Logs
```bash
# View live logs in real-time
tail -f ~/.superdesign/logs/superdesign-mcp.log

# View recent logs
tail -n 50 ~/.superdesign/logs/superdesign-mcp.log

# Search for errors
grep "ERROR" ~/.superdesign/logs/superdesign-mcp.log

# Search for specific operations
grep "generate_design" ~/.superdesign/logs/superdesign-mcp.log

# Check logging status with MCP tool
claude 'get_logging_status'
```

### Log Levels
Configure logging verbosity in your `.env` file:
```bash
LOG_LEVEL=debug    # Most verbose - for troubleshooting
LOG_LEVEL=info     # Normal operation information
LOG_LEVEL=warn     # Warnings and above only
LOG_LEVEL=error    # Errors only
```

### MCP Server Status
Check MCP server connection and recent activity:
```bash
claude mcp list
claude mcp get superdesign
```

### Common Log Messages
- `INFO`: Normal operation messages
- `WARN`: Non-critical issues (e.g., slow API responses)
- `ERROR`: Critical issues (e.g., API failures, file access errors)
- `DEBUG`: Detailed troubleshooting information

Happy designing! 🎨