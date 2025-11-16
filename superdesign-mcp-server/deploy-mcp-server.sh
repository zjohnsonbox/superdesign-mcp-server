#!/bin/bash

# =============================================================================
# SuperDesign MCP 服务器单用户部署脚本
# 专为本地 Claude Code CLI 使用设计，支持环境配置和服务管理
# =============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 全局变量
DEPLOYMENT_MODE=""
USERNAME=""
API_KEY=""

# 打印带颜色的消息
print_message() {
    echo -e "${GREEN}[DEPLOY]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_header() {
    echo -e "${CYAN}=== $1 ===${NC}"
}

# 用户确认函数
confirm_action() {
    local prompt="$1"
    local default="${2:-n}"

    while true; do
        read -p "$prompt [y/n]: " yn
        case $yn in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            "" )
                if [[ "$default" == "y" ]]; then
                    return 0
                else
                    return 1
                fi
                ;;
        esac
    done
}

# 显示主菜单
show_main_menu() {
    clear
    print_message "🚀 SuperDesign MCP 服务器部署工具"
    echo ""
    echo "请选择操作："
    echo "1) 📋 配置环境变量 (本地使用)"
    echo "2) ☁️ 云端部署 (单用户)"
    echo "3) 🚀 启动 MCP 服务器"
    echo "4) 🧪 运行环境测试"
    echo "5) 📊 查看系统状态"
    echo "6) ❌ 退出"
    echo ""
}

# 环境变量设置功能
setup_environment() {
    print_header "环境变量配置"
    echo ""

    if ! confirm_action "是否要配置环境变量？这将创建 .env 文件用于本地开发。"; then
        print_info "已取消环境变量配置"
        return
    fi

    print_info "SuperDesign MCP 服务器支持多种大模型提供商，请在 Claude Code 配置中指定您的 API 信息。"
    echo ""

    # 本地基础配置
    read -p "启用文件日志记录 (y/n) [y]: " enable_logging
    if [[ "$enable_logging" =~ ^[Nn]$ ]]; then
        ENABLE_FILE_LOGGING="false"
    else
        ENABLE_FILE_LOGGING="true"
    fi

    read -p "工作空间根目录 [$(pwd)]: " WORKSPACE_ROOT
    WORKSPACE_ROOT=${WORKSPACE_ROOT:-$(pwd)}

    # 创建 .env 文件（仅包含本地配置）
    print_info "创建 .env 文件..."

    cat > .env << EOF
# SuperDesign MCP 服务器本地配置
# 生成时间: $(date)
# 注意: 大模型 API 配置请在 Claude Code 中指定

# 本地服务器配置
ENABLE_FILE_LOGGING=$ENABLE_FILE_LOGGING
SECURITY_MODE=strict
WORKSPACE_ROOT=$WORKSPACE_ROOT

# 日志和监控
LOG_LEVEL=info
MONITORING_ENABLED=true

# 性能配置
MAX_CONCURRENT_REQUESTS=3
REQUEST_TIMEOUT=120
ENABLE_COMPRESSION=true
CACHE_ENABLED=true

# Claude Code 配置示例
# 在 ~/.claude.json 中添加您的 API 配置:
# "ANTHROPIC_AUTH_TOKEN": "your-api-key-here"
# "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic"
# "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.6"
# "AI_PROVIDER": "custom-api"
EOF

    print_message "✅ 本地环境配置完成！"
    print_info "配置文件: $(pwd)/.env"
    print_info "下一步: 在 Claude Code 中配置 MCP 服务器并指定您的 API 信息"
    echo ""
    print_info "Claude Code 配置示例:"
    echo "{"
    echo "  \"mcpServers\": {"
    echo "    \"superdesign\": {"
    echo "      \"type\": \"stdio\","
    echo "      \"command\": \"npx\","
    echo "      \"args\": [\"tsx\", \"src/index.ts\"],"
    echo "      \"cwd\": \"$(pwd)\""
    echo "      \"env\": {"
    echo "        \"ANTHROPIC_AUTH_TOKEN\": \"your-api-key\","
    echo "        \"ANTHROPIC_BASE_URL\": \"https://open.bigmodel.cn/api/anthropic\","
    echo "        \"ANTHROPIC_DEFAULT_SONNET_MODEL\": \"glm-4.6\","
    echo "        \"AI_PROVIDER\": \"custom-api\""
    echo "      }"
    echo "    }"
    echo "  }"
    echo "}"
    print_warning "请勿将 .env 文件提交到版本控制系统"
}

# 云端部署功能
deploy_to_cloud() {
    print_header "云端部署配置 (单用户)"
    echo ""

    if ! confirm_action "是否要进行云端部署？这将安装系统依赖并配置服务。"; then
        print_info "已取消云端部署"
        return
    fi

    # 检查是否为root用户
    if [[ $EUID -eq 0 ]]; then
        print_error "请不要使用root用户运行此脚本！"
        exit 1
    fi

    print_info "开始云端部署..."

    # 更新系统
    print_info "更新系统包..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update -y
        sudo apt-get upgrade -y
    else
        print_error "不支持的包管理器，目前仅支持 Ubuntu/Debian"
        return 1
    fi

    # 安装依赖
    print_info "安装必要的依赖..."
    sudo apt-get install -y curl wget git build-essential

    # 安装 Node.js
    if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 18 ]]; then
        print_info "安装 Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi

    # 安装 pm2 和 tsx
    if ! command -v pm2 &> /dev/null; then
        print_info "安装 pm2 进程管理器..."
        sudo npm install -g pm2
    fi

    if ! command -v tsx &> /dev/null; then
        print_info "安装 tsx TypeScript 运行时..."
        sudo npm install -g tsx
    fi

    # 创建项目目录
    print_info "创建项目目录..."
    CLOUD_DIR="$HOME/superdesign-mcp-server"
    if [ ! -d "$CLOUD_DIR" ]; then
        git clone https://github.com/your-username/superdesign-mcp-server.git "$CLOUD_DIR"
    else
        print_info "项目目录已存在，更新代码..."
        cd "$CLOUD_DIR"
        git pull origin main
    fi

    # 安装项目依赖
    print_info "安装项目依赖..."
    cd "$CLOUD_DIR"
    npm install

    # 设置防火墙
    print_info "设置防火墙规则..."
    if command -v ufw &> /dev/null; then
        sudo ufw allow 22/tcp
        sudo ufw allow 3001/tcp
        print_info "已开放端口 22 (SSH) 和 3001 (MCP)"
    fi

    # 创建云环境配置
    print_info "创建云端环境配置..."
    cat > "$CLOUD_DIR/.env" << EOF
# SuperDesign MCP 服务器云端配置
# 生成时间: $(date)

# 本地服务器配置
ENABLE_FILE_LOGGING=true
SECURITY_MODE=strict
WORKSPACE_ROOT=$CLOUD_DIR

# 性能配置
MAX_CONCURRENT_REQUESTS=3
REQUEST_TIMEOUT=120
LOG_LEVEL=info
MONITORING_ENABLED=true
CACHE_ENABLED=true
EOF

    # 创建启动脚本
    print_info "创建云端启动脚本..."
    cat > "$CLOUD_DIR/start-cloud.sh" << 'EOF'
#!/bin/bash
cd $(dirname "$0")
source .env
echo "启动 SuperDesign MCP 云服务器..."
pm2 start --name "superdesign-mcp" -- "npx" "tsx" "src/index.ts"
pm2 save
pm2 status
EOF
    chmod +x "$CLOUD_DIR/start-cloud.sh"

    # 创建停止脚本
    cat > "$CLOUD_DIR/stop-cloud.sh" << 'EOF'
#!/bin/bash
echo "停止 SuperDesign MCP 云服务器..."
pm2 stop superdesign-mcp
pm2 delete superdesign-mcp
EOF
    chmod +x "$CLOUD_DIR/stop-cloud.sh"

    # 创建状态查看脚本
    cat > "$CLOUD_DIR/status-cloud.sh" << 'EOF'
#!/bin/bash
echo "=== SuperDesign MCP 云服务器状态 ==="
pm2 list
echo ""
echo "日志查看: pm2 logs superdesign-mcp"
echo "实时监控: pm2 monit"
EOF
    chmod +x "$CLOUD_DIR/status-cloud.sh"

    print_message "✅ 云端部署完成！"
    echo ""
    echo "项目位置: $CLOUD_DIR"
    echo ""
    print_info "下一步操作："
    echo "1. 配置 Claude Code 连接云端服务器:"
    echo "   - 使用 SSH 隧道或直接连接"
    echo "   - 在 Claude Code 中配置 MCP 服务器"
    echo ""
    echo "2. 管理服务:"
    echo "   - 启动: $CLOUD_DIR/start-cloud.sh"
    echo "   - 停止: $CLOUD_DIR/stop-cloud.sh"
    echo "   - 状态: $CLOUD_DIR/status-cloud.sh"
    echo ""
    echo "3. 获取服务器IP:"
    echo "   - 运行: curl -s ifconfig.me"

    # 显示服务器IP
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "无法获取外网IP")
    if [ "$SERVER_IP" != "无法获取外网IP" ]; then
        echo ""
        print_info "您的服务器IP: $SERVER_IP"
        echo "MCP 端口: 3001"
    fi
}

# 启动服务器功能
start_server() {
    print_header "启动 MCP 服务器"
    echo ""

    if ! confirm_action "是否要启动 MCP 服务器？"; then
        print_info "已取消启动服务器"
        return
    fi

    # 检查项目文件
    if [ ! -f "src/index.ts" ]; then
        print_error "未找到 src/index.ts 文件，请确保在正确的项目目录中"
        return 1
    fi

    # 检查 tsx 安装
    if ! command -v tsx &> /dev/null; then
        print_info "安装 tsx TypeScript 运行时..."
        npm install -g tsx
    fi

    print_info "SuperDesign MCP 服务器将在后台运行，请在 Claude Code 中配置使用。"
    echo ""

    print_info "配置提醒："
    echo "1. 确保已在 Claude Code 中添加 MCP 服务器配置"
    echo "2. 在配置中指定您的 API 密钥和模型信息"
    echo "3. 重启 Claude Code 以加载 MCP 服务器"
    echo ""

    print_info "启动 MCP 服务器..."

    # 启动服务器
    exec npx tsx src/index.ts
}

# 运行测试功能
run_tests() {
    print_header "运行综合测试"
    echo ""

    if ! confirm_action "是否要运行综合测试？这将检查服务器状态和功能。"; then
        print_info "已取消测试"
        return
    fi

    print_info "开始综合测试..."

    # 基础环境测试
    local passed=0
    local total=0

    # 检查 Node.js
    total=$((total + 1))
    if command -v node &> /dev/null; then
        node_version=$(node --version)
        print_message "✅ Node.js 版本: $node_version"
        passed=$((passed + 1))
    else
        print_error "❌ Node.js 未安装"
    fi

    # 检查 npm
    total=$((total + 1))
    if command -v npm &> /dev/null; then
        npm_version=$(npm --version)
        print_message "✅ npm 版本: $npm_version"
        passed=$((passed + 1))
    else
        print_error "❌ npm 未安装"
    fi

    # 检查 tsx
    total=$((total + 1))
    if command -v tsx &> /dev/null; then
        print_message "✅ tsx 运行时已安装"
        passed=$((passed + 1))
    else
        print_error "❌ tsx 未安装，运行: npm install -g tsx"
    fi

    # 检查项目文件
    total=$((total + 1))
    if [ -f "src/index.ts" ]; then
        print_message "✅ 项目源码存在"
        passed=$((passed + 1))
    else
        print_error "❌ 项目源码不存在"
    fi

    # 检查环境变量
    total=$((total + 1))
    if [ -f ".env" ]; then
        print_message "✅ 环境配置文件存在"
        passed=$((passed + 1))

        # 检查必要变量
        if grep -q "ANTHROPIC_BASE_URL=" .env && grep -q "AI_PROVIDER=" .env; then
            print_message "✅ 环境变量配置完整"
        else
            print_warning "⚠️ 环境变量配置不完整"
        fi
    else
        print_error "❌ 环境配置文件不存在"
    fi

    # 生成测试报告
    local success_rate=0
    if [ $total -gt 0 ]; then
        success_rate=$((passed * 100 / total))
    fi

    echo ""
    print_header "测试结果"
    print_info "通过测试: $passed/$total ($success_rate%)"

    if [ $success_rate -ge 80 ]; then
        print_message "🎉 测试通过！系统基本正常。"
    else
        print_warning "⚠️ 测试发现问题，请检查上述错误。"
    fi
}

# 查看状态功能
show_status() {
    print_header "系统状态检查"
    echo ""

    # 系统信息
    print_info "系统环境:"
    echo "  操作系统: $(uname -s) $(uname -r)"
    echo "  Node.js: $(node --version 2>/dev/null || echo '未安装')"
    echo "  npm: $(npm --version 2>/dev/null || echo '未安装')"
    echo "  tsx: $(tsx --version 2>/dev/null || echo '未安装')"
    echo ""

    # 项目文件状态
    print_info "项目文件状态:"
    if [ -f ".env" ]; then
        print_message "✅ 本地环境配置文件存在"
    else
        print_warning "⚠️ 本地环境配置文件不存在 (可运行选项1创建)"
    fi

    if [ -f "src/index.ts" ]; then
        print_message "✅ MCP 服务器源码存在"
    else
        print_error "❌ MCP 服务器源码不存在"
    fi

    if [ -f "package.json" ]; then
        print_message "✅ 项目配置文件存在"
    else
        print_error "❌ 项目配置文件不存在"
    fi

    # 依赖检查
    if [ -d "node_modules" ]; then
        print_message "✅ 依赖已安装"
    else
        print_warning "⚠️ 依赖未安装 (运行: npm install)"
    fi

    echo ""
    print_info "使用说明:"
    echo "1. 配置环境: 选项 1 - 创建本地配置文件"
    echo "2. 配置 Claude Code: 在 ~/.claude.json 中添加 MCP 服务器"
    echo "3. 启动服务器: 选项 2 - 启动 MCP 服务器"
    echo "4. 重启 Claude Code: 以加载 MCP 服务器"
}

# 主函数
main() {
    while true; do
        show_main_menu

        read -p "请选择操作 (1-6): " choice

        case $choice in
            1)
                setup_environment
                echo ""
                read -p "按回车键继续..."
                ;;
            2)
                deploy_to_cloud
                echo ""
                read -p "按回车键继续..."
                ;;
            3)
                start_server
                break
                ;;
            4)
                run_tests
                echo ""
                read -p "按回车键继续..."
                ;;
            5)
                show_status
                echo ""
                read -p "按回车键继续..."
                ;;
            6)
                print_message "👋 退出部署工具"
                exit 0
                ;;
            *)
                print_error "无效选择，请输入 1-6"
                sleep 1
                ;;
        esac
    done
}

# 运行主函数
main "$@"