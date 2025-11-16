# SuperDesign MCP Server 安装指南

这个指南将帮助你快速将 SuperDesign MCP 服务器安装到你的 Claude Code CLI 中。

## 🚀 快速安装

### 方法一：使用自动化脚本（推荐）

1. 确保你在 `superdesign-mcp-server` 目录中：
   ```bash
   cd path/to/superdesign-mcp-server
   ```

2. 运行安装脚本：
   ```bash
   ./add-mcp-into-claude-code-cli.sh
   ```

脚本会自动完成以下操作：
- ✅ 检查 Node.js 和 npm 安装
- ✅ 检查 Claude Code CLI 安装
- ✅ 安装项目依赖
- ✅ 全局安装 tsx（如果尚未安装）
- ✅ 移除现有的 SuperDesign 配置
- ✅ 添加新的 SuperDesign MCP 服务器
- ✅ 验证安装并显示详细信息

### 方法二：手动安装

如果你更喜欢手动安装，可以按以下步骤操作：

1. **安装依赖**：
   ```bash
   npm install
   ```

2. **安装 tsx**（如果尚未安装）：
   ```bash
   npm install -g tsx
   ```

3. **移除现有配置**（可选）：
   ```bash
   claude mcp remove superdesign -s user
   ```

4. **添加 MCP 服务器**：
   ```bash
   claude mcp add --transport stdio --scope user superdesign \
     --env AI_PROVIDER="custom-api" --env SECURITY_MODE="strict" \
     --env WORKSPACE_ROOT="$(pwd)" \
     -- \
     npx tsx ./src/index.ts
   ```

5. **验证安装**：
   ```bash
   claude mcp list
   claude mcp get superdesign
   ```

## 📋 系统要求

- **Node.js**: >= 18.0.0
- **npm**: 最新版本
- **Claude Code CLI**: 已安装并配置
- **操作系统**: macOS, Linux, Windows (WSL)

## 🔍 验证安装

安装完成后，你可以运行以下命令验证：

```bash
# 列出所有 MCP 服务器
claude mcp list

# 查看 SuperDesign 详细配置
claude mcp get superdesign
```

你应该看到类似这样的输出：
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

## 🛠️ 可用工具

SuperDesign MCP 服务器提供以下工具：

| 工具名称 | 描述 |
|---------|------|
| `generate_design` | 生成 UI 设计、模型和组件 |
| `create_layout` | 创建布局设计 |
| `generate_theme` | 生成设计主题 |
| `manage_project` | 管理设计项目 |
| `read_file` | 读取文件 |
| `write_file` | 写入文件 |
| `edit_file` | 编辑文件 |
| `glob_tool` | 文件模式搜索 |
| `grep_tool` | 文本搜索 |
| `preview_design` | 预览设计 |
| `list_designs` | 列出现有设计 |

## 🚨 故障排除

### 常见问题

1. **Node.js 版本过低**：
   ```bash
   # 检查版本
   node --version

   # 如果版本低于 18，请升级 Node.js
   ```

2. **Claude Code CLI 未找到**：
   ```bash
   # 确保 claude 在 PATH 中
   which claude

   # 如果未找到，请重新安装 Claude Code CLI
   ```

3. **MCP 服务器连接失败**：
   ```bash
   # 检查日志
   claude mcp list

   # 重新添加服务器
   claude mcp remove superdesign -s user
   ./add-mcp-into-claude-code-cli.sh
   ```

4. **依赖安装失败**：
   ```bash
   # 清理并重新安装
   rm -rf node_modules package-lock.json
   npm install
   ```

### 手动调试

如果自动脚本失败，你可以手动调试每个步骤：

```bash
# 1. 检查目录
pwd
ls -la package.json src/

# 2. 检查 Node.js/npm
node --version
npm --version

# 3. 检查 Claude CLI
claude --version

# 4. 安装依赖
npm install

# 5. 测试 tsx
npx tsx --version

# 6. 手动添加 MCP
claude mcp add --transport stdio --scope user superdesign \
  --env AI_PROVIDER="custom-api" --env SECURITY_MODE="strict" \
  --env WORKSPACE_ROOT="$(pwd)" \
  -- \
  npx tsx ./src/index.ts
```

## 🔄 更新和卸载

### 更新 SuperDesign

1. 更新代码：
   ```bash
   git pull origin main
   ```

2. 重新运行安装脚本：
   ```bash
   ./add-mcp-into-claude-code-cli.sh
   ```

### 完全卸载

```bash
# 移除 MCP 服务器配置
claude mcp remove superdesign -s user

# 可选：删除项目文件
cd ..
rm -rf superdesign-mcp-server
```

## 📞 支持

如果遇到问题：

1. 查看 [GitHub Issues](https://github.com/superdesigndev/superdesign-mcp-server/issues)
2. 加入 [Discord 社区](https://discord.gg/FYr49d6cQ9)
3. 检查 [项目文档](https://github.com/superdesigndev/superdesign-mcp-server)

## 🎉 开始使用

安装完成后，你就可以在任何 Claude Code CLI 会话中使用 SuperDesign 的 AI 设计功能了！试试说：

- "生成一个现代登录页面设计"
- "创建一个响应式的导航栏组件"
- "设计一个移动端的设置界面"

祝你使用愉快！🎨