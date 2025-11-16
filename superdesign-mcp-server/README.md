# 🎨 SuperDesign MCP Server

一个强大的 Model Context Protocol (MCP) 服务器，专为 Claude Code CLI 提供智能设计生成能力。支持单用户本地部署和云端部署，满足不同使用场景。

## ✨ 核心特性

- 🚀 **3-并行设计生成** - 一次提示生成多个完整的设计方案
- 🎨 **主题系统** - 智能生成 CSS 主题和设计令牌
- 📐 **布局规划** - ASCII、Mermaid、HTML 线框图生成
- 🏠 **单用户架构** - 简化的部署，易于配置
- 🔒 **安全可靠** - 工作区边界保护，输入验证
- 🤖 **多模型支持** - 智谱AI、OpenAI、Claude、本地 Ollama 等
- ☁️ **双模式部署** - 本地部署 + 云端部署选择
- ⚡ **即开即用** - 快速启动，无需复杂配置

## 📁 项目结构

```
superdesign-mcp-server/
├── 📄 README.md                   # 本文档
├── 📄 package.json               # 项目配置
├── 📄 .env.example               # 环境变量示例
├── 📄 deploy-mcp-server.sh       # 一体化部署脚本
├── 📁 src/                       # 源代码
│   ├── 📄 index.ts              # 服务器入口
│   ├── 📄 mcp-server.ts         # MCP 协议实现
│   ├── 📄 tools/                # MCP 工具集合
│   ├── 📄 providers/            # AI 提供商实现
│   └── 📄 utils/                # 工具函数
```

## 🚀 快速开始

### 部署方式选择

#### 🏠 本地部署 (推荐)
适合个人开发、测试使用，配置简单，数据私密。

#### ☁️ 云端部署
适合需要24/7运行、多设备访问、更高性能的场景。

---

### 本地部署

#### 1. 安装依赖
```bash
cd superdesign-mcp-server
npm install
```

#### 2. 配置项目 (可选)
```bash
# 使用一体化部署脚本 (推荐)
chmod +x deploy-mcp-server.sh
./deploy-mcp-server.sh
# 选择选项 1 配置环境变量

# 或手动创建环境配置
cp .env.example .env
```

#### 3. 配置 Claude Code

在 `~/.claude.json` 中添加 SuperDesign MCP 服务器：

```json
{
  "mcpServers": {
    "superdesign": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/superdesign-mcp-server",
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your-api-key-here",
        "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.6",
        "AI_PROVIDER": "custom-api",
        "WORKSPACE_ROOT": "/path/to/superdesign-mcp-server",
        "SECURITY_MODE": "strict"
      }
    }
  }
}
```

#### 4. 重启 Claude Code
完全退出并重新启动 Claude Code 应用以加载 MCP 服务器。

---

### 云端部署

#### 1. 准备云服务器
- Ubuntu 20.04+ 或 Debian 10+
- 至少 2GB RAM，20GB 存储
- 开放 22 (SSH) 和 3001 (MCP) 端口

#### 2. 一键部署
```bash
# 连接到云服务器
ssh your-user@your-server-ip

# 克隆项目
git clone https://github.com/your-username/superdesign-mcp-server.git
cd superdesign-mcp-server

# 运行部署脚本
chmod +x deploy-mcp-server.sh
./deploy-mcp-server.sh
# 选择选项 2 进行云端部署
```

#### 3. 启动云端服务
```bash
# 部署完成后启动服务
~/superdesign-mcp-server/start-cloud.sh
```

#### 4. 连接云端服务器
在本地 Claude Code 中配置连接到云端服务器：

**方法一：SSH 隧道连接（推荐）**
```json
{
  "mcpServers": {
    "superdesign-cloud": {
      "type": "stdio",
      "command": "ssh",
      "args": [
        "-L", "3001:localhost:3001",
        "your-user@your-server-ip",
        "cd ~/superdesign-mcp-server && npx tsx src/index.ts"
      ],
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your-api-key-here",
        "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.6",
        "AI_PROVIDER": "custom-api"
      }
    }
  }
}
```

**方法二：本地端口转发**
```bash
# 在本地建立 SSH 隧道
ssh -L 3001:localhost:3001 your-user@your-server-ip -N

# 然后在 Claude Code 中配置本地连接
```

---

### 系统要求

#### 本地部署
| 配置项 | 最低要求 | 推荐配置 |
|--------|----------|----------|
| CPU | 2核心 | 4核心 |
| 内存 | 4GB | 8GB |
| 存储 | 10GB SSD | 20GB SSD |
| 操作系统 | macOS/Linux/Windows | macOS/Linux/Windows |
| Node.js | v18+ | v20+ |

#### 云端部署
| 配置项 | 最低要求 | 推荐配置 |
|--------|----------|----------|
| CPU | 2核心 | 4核心 |
| 内存 | 2GB | 4GB |
| 存储 | 20GB SSD | 50GB SSD |
| 操作系统 | Ubuntu 20.04+ | Ubuntu 22.04 LTS |
| 带宽 | 5Mbps | 10Mbps+ |

## 🔧 配置说明

### Claude Code 配置

SuperDesign MCP 服务器专为单用户本地使用设计，所有 AI 模型配置都在 Claude Code 中完成：

```json
{
  "mcpServers": {
    "superdesign": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/your/actual/path/to/superdesign-mcp-server",
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your-api-key-here",
        "ANTHROPIC_BASE_URL": "your-preferred-endpoint",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "your-preferred-model",
        "AI_PROVIDER": "custom-api"
      }
    }
  }
}
```

### 支持的 AI 模型

#### 智谱AI (bigmodel.cn) - 推荐
```json
"env": {
  "ANTHROPIC_AUTH_TOKEN": "your-zhipu-api-key",
  "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.6",
  "AI_PROVIDER": "custom-api"
}
```

#### OpenAI
```json
"env": {
  "ANTHROPIC_AUTH_TOKEN": "sk-your-openai-key",
  "ANTHROPIC_BASE_URL": "https://api.openai.com/v1",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-4",
  "AI_PROVIDER": "custom-api"
}
```

#### Anthropic Claude
```json
"env": {
  "ANTHROPIC_AUTH_TOKEN": "sk-ant-your-claude-key",
  "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-3-5-sonnet-20241022",
  "AI_PROVIDER": "custom-api"
}
```

#### 本地 Ollama
```json
"env": {
  "ANTHROPIC_AUTH_TOKEN": "",
  "ANTHROPIC_BASE_URL": "http://localhost:11434/v1",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "llama3.1:8b",
  "AI_PROVIDER": "custom-api"
}
```

### 模型选择对比

| 提供商 | 输入成本 | 输出成本 | 优势 | 适用场景 |
|--------|----------|----------|------|----------|
| 智谱AI | ¥0.01/1K tokens | ¥0.03/1K tokens | 中文优化，性价比高 | 中文项目，预算有限 |
| OpenAI GPT-4 | $0.03/1K tokens | $0.06/1K tokens | 质量最好 | 英文项目，质量优先 |
| Claude 3.5 | $0.015/1K tokens | $0.075/1K tokens | 推理能力强 | 复杂逻辑，创意任务 |
| 本地Ollama | 免费 | 免费 | 隐私保护，无限制 | 敏感数据，离线环境 |

### 本地环境配置 (.env)

创建 `.env` 文件用于本地设置（不需要包含 API 密钥）：

```bash
# 本地服务器配置
ENABLE_FILE_LOGGING=true
SECURITY_MODE=strict
WORKSPACE_ROOT=/your/path/to/superdesign-mcp-server

# 性能配置
MAX_CONCURRENT_REQUESTS=3
REQUEST_TIMEOUT=120
LOG_LEVEL=info
```

### 云端服务管理

部署到云端后，可以使用以下脚本管理服务：

```bash
# 启动服务
~/superdesign-mcp-server/start-cloud.sh

# 停止服务
~/superdesign-mcp-server/stop-cloud.sh

# 查看状态
~/superdesign-mcp-server/status-cloud.sh

# 查看日志
pm2 logs superdesign-mcp

# 实时监控
pm2 monit
```

### 部署方式对比

| 特性 | 本地部署 | 云端部署 |
|------|----------|----------|
| 配置复杂度 | 简单 | 中等 |
| 数据隐私 | 完全本地 | 云端存储 |
| 性能 | 受本地机器限制 | 云服务器性能 |
| 可用性 | 本地运行时 | 24/7 运行 |
| 多设备访问 | 需要额外配置 | 天然支持 |
| 成本 | 免费 | 服务器费用 |

## 🛠️ 可用工具

### 核心设计工具

- **`generate_design`** - AI 驱动的 UI 设计生成
  - 支持 1-3 个并行变体
  - 多种输出格式（HTML、React、Vue、Svelte）
  - 响应式设计支持

- **`generate_theme`** - CSS 主题生成
  - 完整的设计令牌系统
  - CSS 自定义属性
  - 可访问性色彩对比

- **`create_layout`** - 布局线框图
  - ASCII 艺术线框图
  - Mermaid 图表
  - HTML 线框图

- **`list_designs`** - 浏览生成的设计
- **`preview_design`** - 在浏览器中预览

### 文件管理工具

- **`read_file`** - 安全文件读取
- **`write_file`** - 文件写入和创建
- **`edit_file`** - 文件编辑
- **`glob`** - 文件模式搜索
- **`grep`** - 文件内容搜索

### 项目管理工具

- **`manage_project`** - 项目初始化和管理
- **`get_workspace_info`** - 工作区信息

## 💡 使用示例

### 生成设计变体
```
生成一个现代仪表板设计的3个变体，包含图表、指标和数据展示
```

### 创建特定设计
```
创建一个电商产品页面，包含图片画廊、产品信息和购买按钮
```

### 生成主题
```
创建一个深色主题，使用蓝色和紫色作为强调色
```

### 布局规划
```
为移动应用登录界面创建一个线框图布局
```

## 🔍 故障排除

### 本地部署问题

#### 1. MCP 服务器无法启动
```bash
# 检查 Node.js 版本
node --version  # 需要 v18+

# 检查 tsx 安装
npx tsx --version

# 安装 tsx（如果未安装）
npm install -g tsx

# 直接测试启动
npx tsx src/index.ts
```

#### 2. Claude Code 无法连接
```bash
# 检查 MCP 配置
cat ~/.claude.json

# 验证路径配置
ls -la /your/path/to/superdesign-mcp-server

# 重启 Claude Code
# 完全退出并重新启动 Claude Code 应用
```

#### 3. API 密钥错误
在 Claude Code 配置中检查您的 API 密钥设置：
```json
{
  "mcpServers": {
    "superdesign": {
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your-correct-api-key"
      }
    }
  }
}
```

### 云端部署问题

#### 4. 云端部署失败
```bash
# 检查系统支持
lsb_release -a  # Ubuntu 版本

# 检查网络连接
curl -I https://github.com

# 手动安装依赖
sudo apt update && sudo apt install -y curl wget git
```

#### 5. SSH 隧道连接问题
```bash
# 测试 SSH 连接
ssh your-user@your-server-ip

# 检查端口占用
netstat -tlnp | grep :3001

# 建立隧道调试
ssh -v -L 3001:localhost:3001 your-user@your-server-ip -N
```

#### 6. 云端服务无法启动
```bash
# 检查 PM2 状态
pm2 list

# 查看错误日志
pm2 logs superdesign-mcp --err

# 重启服务
pm2 restart superdesign-mcp

# 检查环境变量
cat ~/superdesign-mcp-server/.env
```

#### 7. 防火墙问题
```bash
# 检查防火墙状态
sudo ufw status

# 开放必要端口
sudo ufw allow 22/tcp
sudo ufw allow 3001/tcp

# 测试端口连通性
telnet your-server-ip 3001
```

### 通用问题

#### 8. 依赖问题
```bash
# 重新安装依赖
npm install

# 清理缓存
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# 检查项目文件
ls -la src/index.ts
```

#### 9. 权限问题
```bash
# 确保脚本有执行权限
chmod +x deploy-mcp-server.sh
chmod +x start-cloud.sh
chmod +x stop-cloud.sh
chmod +x status-cloud.sh
```

#### 10. 内存不足
```bash
# 检查内存使用
free -h

# 重启服务释放内存
pm2 restart superdesign-mcp

# 设置内存限制
pm2 start --name "superdesign-mcp" --max-memory-restart 1G npx tsx src/index.ts
```

### 调试命令
```bash
# 使用部署脚本检查状态
./deploy-mcp-server.sh
# 选择选项 4 查看系统状态

# 查看项目文件
ls -la

# 测试 MCP 服务器
npx tsx src/index.ts
```

### 获取帮助

- **项目 Issues**: [GitHub Issues](https://github.com/your-username/superdesign-mcp-server/issues)
- **文档**: [项目 Wiki](https://github.com/your-username/superdesign-mcp-server/wiki)
- **讨论**: [GitHub Discussions](https://github.com/your-username/superdesign-mcp-server/discussions)

## 🎯 最佳实践

### 使用建议

1. **API 配置**: 在 Claude Code 中配置您的 API 密钥，确保安全
2. **模型选择**: 根据项目需求选择合适的 AI 模型
3. **路径管理**: 使用绝对路径避免路径问题
4. **定期更新**: 保持项目和依赖的最新版本

### 项目结构

MCP 服务器自动创建以下目录结构：
```
.superdesign/
├── design_iterations/     # 3-并行设计输出
├── themes/                 # 生成的 CSS 主题
├── design_system/          # 布局文件
└── logs/                   # 服务器日志
```

### 可用 MCP 工具验证

服务器启动后，可在 Claude Code 中验证以下工具：
- **设计工具**: `generate_design`, `generate_theme`, `create_layout`
- **文件工具**: `read_file`, `write_file`, `edit_file`, `glob`, `grep`
- **项目工具**: `manage_project`, `preview_design`, `list_designs`
- **系统工具**: `get_workspace_info`

在 Claude Code 中运行 `"List all available MCP tools"` 查看完整工具列表。

## 📝 开发指南

### 项目架构
- **TypeScript** - 严格类型检查
- **MCP 协议** - 完整协议实现
- **模块化设计** - 可扩展的提供商架构
- **安全优先** - 输入验证和边界保护

### 扩展功能
- 添加新的 AI 提供商
- 自定义设计模板
- 集成外部设计工具
- 实时协作功能

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 支持

- 📧 **技术支持**: [项目 Issues](https://github.com/your-username/superdesign-mcp-server/issues)
- 📖 **文档**: [项目 Wiki](https://github.com/your-username/superdesign-mcp-server/wiki)
- 💬 **讨论**: [GitHub Discussions](https://github.com/your-username/superdesign-mcp-server/discussions)

---

**🎉 开始您的 AI 设计之旅！**

现在您可以在 Claude Code 中使用 SuperDesign 的强大功能，让 AI 帮助您创建精美的用户界面设计。