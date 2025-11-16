#!/bin/bash

# =============================================================================
# SuperDesign MCP Server Single-User Deployment Script
# Designed for local Claude Code CLI use, supporting environment configuration and service management
# =============================================================================

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Global variables
DEPLOYMENT_MODE=""
USERNAME=""
API_KEY=""

# Print colored messages
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

# User confirmation function
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

# Show main menu
show_main_menu() {
    clear
    print_message "🚀 SuperDesign MCP Server Deployment Tool"
    echo ""
    echo "Please select an action:"
    echo "1) 📋 Configure Environment Variables (Local Use)"
    echo "2) ☁️ Cloud Deployment (Single User)"
    echo "3) 🚀 Start MCP Server"
    echo "4) 🧪 Run Environment Tests"
    echo "5) 📊 View System Status"
    echo "6) ❌ Exit"
    echo ""
}

# Environment variable setup function
setup_environment() {
    print_header "Environment Variable Configuration"
    echo ""

    if ! confirm_action "Do you want to configure environment variables? This will create .env file for local development."; then
        print_info "Environment variable configuration cancelled"
        return
    fi

    print_info "SuperDesign MCP server supports multiple LLM providers, please specify your API information in Claude Code configuration."
    echo ""

    # Local basic configuration
    read -p "Enable file logging (y/n) [y]: " enable_logging
    if [[ "$enable_logging" =~ ^[Nn]$ ]]; then
        ENABLE_FILE_LOGGING="false"
    else
        ENABLE_FILE_LOGGING="true"
    fi

    read -p "Workspace root directory [$(pwd)]: " WORKSPACE_ROOT
    WORKSPACE_ROOT=${WORKSPACE_ROOT:-$(pwd)}

    # Create .env file (only contains local configuration)
    print_info "Creating .env file..."

    cat > .env << EOF
# SuperDesign MCP Server Local Configuration
# Generated at: $(date)
# Note: LLM API configuration should be specified in Claude Code

# Local server configuration
ENABLE_FILE_LOGGING=$ENABLE_FILE_LOGGING
SECURITY_MODE=strict
WORKSPACE_ROOT=$WORKSPACE_ROOT

# Logging configuration
LOG_LEVEL=info
LOG_DIR=$WORKSPACE_ROOT/.superdesign/logs
LOG_FILE_NAME=superdesign-mcp.log
MAX_LOG_SIZE_MB=10
LOG_FILE_BACKUPS=5
ENABLE_CONSOLE_LOGGING=true

# Monitoring
MONITORING_ENABLED=true

# Performance configuration
MAX_CONCURRENT_REQUESTS=3
REQUEST_TIMEOUT=120
ENABLE_COMPRESSION=true
CACHE_ENABLED=true

# Claude Code configuration example
# Add your API configuration in ~/.claude.json:
# "ANTHROPIC_AUTH_TOKEN": "your-api-key-here"
# "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic"
# "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.6"
# "AI_PROVIDER": "custom-api"
EOF

    print_message "✅ Local environment configuration completed!"
    print_info "Configuration file: $(pwd)/.env"
    print_info "Next step: Configure MCP server in Claude Code and specify your API information"
    echo ""
    print_info "Claude Code configuration example:"
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
    print_warning "Do not commit .env file to version control system"
}

# Cloud deployment function
deploy_to_cloud() {
    print_header "Cloud Deployment Configuration (Single User)"
    echo ""

    if ! confirm_action "Do you want to perform cloud deployment? This will install system dependencies and configure services."; then
        print_info "Cloud deployment cancelled"
        return
    fi

    # Check if running as root
    if [[ $EUID -eq 0 ]]; then
        print_error "Please do not run this script as root user!"
        exit 1
    fi

    print_info "Starting cloud deployment..."

    # Update system
    print_info "Updating system packages..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update -y
        sudo apt-get upgrade -y
    else
        print_error "Unsupported package manager, currently only supports Ubuntu/Debian"
        return 1
    fi

    # Install dependencies
    print_info "Installing necessary dependencies..."
    sudo apt-get install -y curl wget git build-essential

    # Install Node.js
    if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 18 ]]; then
        print_info "Installing Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi

    # Install pm2 and tsx
    if ! command -v pm2 &> /dev/null; then
        print_info "Installing pm2 process manager..."
        sudo npm install -g pm2
    fi

    if ! command -v tsx &> /dev/null; then
        print_info "Installing tsx TypeScript runtime..."
        sudo npm install -g tsx
    fi

    # Create project directory
    print_info "Creating project directory..."
    CLOUD_DIR="$HOME/superdesign-mcp-server"
    if [ ! -d "$CLOUD_DIR" ]; then
        git clone https://github.com/your-username/superdesign-mcp-server.git "$CLOUD_DIR"
    else
        print_info "Project directory already exists, updating code..."
        cd "$CLOUD_DIR"
        git pull origin main
    fi

    # Install project dependencies
    print_info "Installing project dependencies..."
    cd "$CLOUD_DIR"
    npm install

    # Setup firewall
    print_info "Setting up firewall rules..."
    if command -v ufw &> /dev/null; then
        sudo ufw allow 22/tcp
        sudo ufw allow 3001/tcp
        print_info "Opened ports 22 (SSH) and 3001 (MCP)"
    fi

    # Create cloud environment configuration
    print_info "Creating cloud environment configuration..."
    cat > "$CLOUD_DIR/.env" << EOF
# SuperDesign MCP Server Cloud Configuration
# Generated at: $(date)

# Local server configuration
ENABLE_FILE_LOGGING=true
SECURITY_MODE=strict
WORKSPACE_ROOT=$CLOUD_DIR

# Logging configuration
LOG_LEVEL=info
LOG_DIR=$CLOUD_DIR/.superdesign/logs
LOG_FILE_NAME=superdesign-mcp.log
MAX_LOG_SIZE_MB=50
LOG_FILE_BACKUPS=10
ENABLE_CONSOLE_LOGGING=true

# Performance configuration
MAX_CONCURRENT_REQUESTS=3
REQUEST_TIMEOUT=120
MONITORING_ENABLED=true
CACHE_ENABLED=true
EOF

    # Create startup script
    print_info "Creating cloud startup script..."
    cat > "$CLOUD_DIR/start-cloud.sh" << 'EOF'
#!/bin/bash
cd $(dirname "$0")
source .env
echo "Starting SuperDesign MCP Cloud Server..."
pm2 start --name "superdesign-mcp" -- "npx" "tsx" "src/index.ts"
pm2 save
pm2 status
EOF
    chmod +x "$CLOUD_DIR/start-cloud.sh"

    # Create stop script
    cat > "$CLOUD_DIR/stop-cloud.sh" << 'EOF'
#!/bin/bash
echo "Stopping SuperDesign MCP Cloud Server..."
pm2 stop superdesign-mcp
pm2 delete superdesign-mcp
EOF
    chmod +x "$CLOUD_DIR/stop-cloud.sh"

    # Create status viewing script
    cat > "$CLOUD_DIR/status-cloud.sh" << 'EOF'
#!/bin/bash
echo "=== SuperDesign MCP Cloud Server Status ==="
pm2 list
echo ""
echo "View logs: pm2 logs superdesign-mcp"
echo "Real-time monitoring: pm2 monit"
EOF
    chmod +x "$CLOUD_DIR/status-cloud.sh"

    print_message "✅ Cloud deployment completed!"
    echo ""
    echo "Project location: $CLOUD_DIR"
    echo ""
    print_info "Next steps:"
    echo "1. Configure Claude Code to connect to cloud server:"
    echo "   - Use SSH tunnel or direct connection"
    echo "   - Configure MCP server in Claude Code"
    echo ""
    echo "2. Manage services:"
    echo "   - Start: $CLOUD_DIR/start-cloud.sh"
    echo "   - Stop: $CLOUD_DIR/stop-cloud.sh"
    echo "   - Status: $CLOUD_DIR/status-cloud.sh"
    echo ""
    echo "3. Get server IP:"
    echo "   - Run: curl -s ifconfig.me"

    # Display server IP
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "Unable to get external IP")
    if [ "$SERVER_IP" != "Unable to get external IP" ]; then
        echo ""
        print_info "Your server IP: $SERVER_IP"
        echo "MCP port: 3001"
    fi
}

# Start server function
start_server() {
    print_header "Start MCP Server"
    echo ""

    if ! confirm_action "Do you want to start MCP server?"; then
        print_info "Server startup cancelled"
        return
    fi

    # Check project files
    if [ ! -f "src/index.ts" ]; then
        print_error "src/index.ts file not found, please ensure you are in the correct project directory"
        return 1
    fi

    # Check tsx installation
    if ! command -v tsx &> /dev/null; then
        print_info "Installing tsx TypeScript runtime..."
        npm install -g tsx
    fi

    print_info "SuperDesign MCP server will run in the background, please configure it in Claude Code."
    echo ""

    print_info "Configuration reminder:"
    echo "1. Ensure MCP server configuration has been added in Claude Code"
    echo "2. Specify your API key and model information in the configuration"
    echo "3. Restart Claude Code to load MCP server"
    echo ""

    print_info "Starting MCP server..."

    # Start server
    exec npx tsx src/index.ts
}

# Run test function
run_tests() {
    print_header "Run Comprehensive Tests"
    echo ""

    if ! confirm_action "Do you want to run comprehensive tests? This will check server status and functionality."; then
        print_info "Test cancelled"
        return
    fi

    print_info "Starting comprehensive tests..."

    # Basic environment tests
    local passed=0
    local total=0

    # Check Node.js
    total=$((total + 1))
    if command -v node &> /dev/null; then
        node_version=$(node --version)
        print_message "✅ Node.js version: $node_version"
        passed=$((passed + 1))
    else
        print_error "❌ Node.js not installed"
    fi

    # Check npm
    total=$((total + 1))
    if command -v npm &> /dev/null; then
        npm_version=$(npm --version)
        print_message "✅ npm version: $npm_version"
        passed=$((passed + 1))
    else
        print_error "❌ npm not installed"
    fi

    # Check tsx
    total=$((total + 1))
    if command -v tsx &> /dev/null; then
        print_message "✅ tsx runtime installed"
        passed=$((passed + 1))
    else
        print_error "❌ tsx not installed, run: npm install -g tsx"
    fi

    # Check project files
    total=$((total + 1))
    if [ -f "src/index.ts" ]; then
        print_message "✅ Project source code exists"
        passed=$((passed + 1))
    else
        print_error "❌ Project source code does not exist"
    fi

    # Check environment variables
    total=$((total + 1))
    if [ -f ".env" ]; then
        print_message "✅ Environment configuration file exists"
        passed=$((passed + 1))

        # Check required variables
        if grep -q "ANTHROPIC_BASE_URL=" .env && grep -q "AI_PROVIDER=" .env; then
            print_message "✅ Environment variable configuration complete"
        else
            print_warning "⚠️ Environment variable configuration incomplete"
        fi
    else
        print_error "❌ Environment configuration file does not exist"
    fi

    # Generate test report
    local success_rate=0
    if [ $total -gt 0 ]; then
        success_rate=$((passed * 100 / total))
    fi

    echo ""
    print_header "Test Results"
    print_info "Tests passed: $passed/$total ($success_rate%)"

    if [ $success_rate -ge 80 ]; then
        print_message "🎉 Tests passed! System is basically normal."
    else
        print_warning "⚠️ Tests found problems, please check the errors above."
    fi
}

# View status function
show_status() {
    print_header "System Status Check"
    echo ""

    # System information
    print_info "System environment:"
    echo "  Operating System: $(uname -s) $(uname -r)"
    echo "  Node.js: $(node --version 2>/dev/null || echo 'Not installed')"
    echo "  npm: $(npm --version 2>/dev/null || echo 'Not installed')"
    echo "  tsx: $(tsx --version 2>/dev/null || echo 'Not installed')"
    echo ""

    # Project file status
    print_info "Project file status:"
    if [ -f ".env" ]; then
        print_message "✅ Local environment configuration file exists"
    else
        print_warning "⚠️ Local environment configuration file does not exist (run option 1 to create)"
    fi

    if [ -f "src/index.ts" ]; then
        print_message "✅ MCP server source code exists"
    else
        print_error "❌ MCP server source code does not exist"
    fi

    if [ -f "package.json" ]; then
        print_message "✅ Project configuration file exists"
    else
        print_error "❌ Project configuration file does not exist"
    fi

    # Dependency check
    if [ -d "node_modules" ]; then
        print_message "✅ Dependencies installed"
    else
        print_warning "⚠️ Dependencies not installed (run: npm install)"
    fi

    echo ""
    print_info "Usage instructions:"
    echo "1. Configure environment: Option 1 - Create local configuration file"
    echo "2. Configure Claude Code: Add MCP server in ~/.claude.json"
    echo "3. Start server: Option 3 - Start MCP server"
    echo "4. Restart Claude Code: to load MCP server"
}

# Main function
main() {
    while true; do
        show_main_menu

        read -p "Please select an action (1-6): " choice

        case $choice in
            1)
                setup_environment
                echo ""
                read -p "Press Enter to continue..."
                ;;
            2)
                deploy_to_cloud
                echo ""
                read -p "Press Enter to continue..."
                ;;
            3)
                start_server
                break
                ;;
            4)
                run_tests
                echo ""
                read -p "Press Enter to continue..."
                ;;
            5)
                show_status
                echo ""
                read -p "Press Enter to continue..."
                ;;
            6)
                print_message "👋 Exit deployment tool"
                exit 0
                ;;
            *)
                print_error "Invalid choice, please enter 1-6"
                sleep 1
                ;;
        esac
    done
}

# Run main function
main "$@"