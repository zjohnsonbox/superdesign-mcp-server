#!/bin/bash

# SuperDesign MCP Server Installation Script for Claude Code CLI
# This script automates the setup of SuperDesign MCP server

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
check_directory() {
    log_info "Checking current directory..."

    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found. Please run this script from the superdesign-mcp-server directory."
        exit 1
    fi

    if [[ ! -d "src" ]]; then
        log_error "src directory not found. Please run this script from the superdesign-mcp-server directory."
        exit 1
    fi

    log_success "Directory check passed"
}

# Check Node.js and npm installation
check_node_npm() {
    log_info "Checking Node.js and npm installation..."

    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed or not in PATH"
        log_info "Please install Node.js from https://nodejs.org/ or using your package manager"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed or not in PATH"
        log_info "npm usually comes with Node.js. Please check your installation."
        exit 1
    fi

    local node_version=$(node --version)
    local npm_version=$(npm --version)

    log_success "Node.js version: $node_version"
    log_success "npm version: $npm_version"

    # Check Node.js version (requires >= 18.0.0 as per package.json)
    local node_major=$(echo $node_version | cut -d'.' -f1 | sed 's/v//')
    if [[ $node_major -lt 18 ]]; then
        log_warning "Node.js version $node_version is older than recommended (>= 18.0.0)"
        log_warning "Consider upgrading Node.js for better compatibility"
    fi
}

# Check Claude Code CLI installation
check_claude_cli() {
    log_info "Checking Claude Code CLI installation..."

    if ! command -v claude &> /dev/null; then
        log_error "Claude Code CLI is not installed or not in PATH"
        log_info "Please install Claude Code CLI from: https://claude.ai/cli"
        exit 1
    fi

    local claude_version=$(claude --version 2>/dev/null || echo "unknown")
    log_success "Claude Code CLI version: $claude_version"
}

# Install dependencies
install_dependencies() {
    log_info "Installing MCP server dependencies..."

    # Clean installation for fresh start
    log_info "Cleaning node_modules for fresh installation..."
    rm -rf node_modules

    if [[ -f "package-lock.json" ]]; then
        log_info "Running npm ci for faster, reliable, reproducible builds..."
        npm ci
    else
        log_info "Running npm install..."
        npm install
    fi

    log_success "Dependencies installed"
}

# Install tsx globally if not present
install_tsx() {
    log_info "Checking tsx installation..."

    if ! command -v tsx &> /dev/null; then
        log_info "Installing tsx globally..."
        npm install -g tsx
        log_success "tsx installed globally"
    else
        log_success "tsx is already installed: $(tsx --version)"
    fi
}

# Remove existing superdesign MCP server
remove_existing_superdesign() {
    log_info "Removing existing SuperDesign MCP server configuration..."

    # Try to remove existing configuration, suppress error if not found
    if claude mcp remove superdesign -s user 2>/dev/null; then
        log_success "Removed existing SuperDesign MCP server configuration"
    else
        log_info "No existing SuperDesign MCP server configuration found"
    fi
}

# Clean up existing log files
cleanup_log_files() {
    log_info "Cleaning up existing log files..."

    local log_dirs=(
        "$HOME/.superdesign/logs"
        ".superdesign/logs"
        "./logs"
    )

    local files_removed=0
    local dirs_removed=0

    for log_dir in "${log_dirs[@]}"; do
        if [[ -d "$log_dir" ]]; then
            log_info "Found log directory: $log_dir"

            # Count and remove log files
            local file_count=$(find "$log_dir" -name "*.log" -type f 2>/dev/null | wc -l)
            if [[ $file_count -gt 0 ]]; then
                log_info "Removing $file_count log files from $log_dir"
                find "$log_dir" -name "*.log" -type f -delete 2>/dev/null || true
                files_removed=$((files_removed + file_count))
            fi

            # Remove backup files (.1, .2, etc.)
            local backup_count=$(find "$log_dir" -name "*.log.*" -type f 2>/dev/null | wc -l)
            if [[ $backup_count -gt 0 ]]; then
                log_info "Removing $backup_count backup files from $log_dir"
                find "$log_dir" -name "*.log.*" -type f -delete 2>/dev/null || true
                files_removed=$((files_removed + backup_count))
            fi

            # If directory is empty after cleaning, remove it
            if [[ -z "$(ls -A "$log_dir" 2>/dev/null)" ]]; then
                log_info "Removing empty log directory: $log_dir"
                rmdir "$log_dir" 2>/dev/null || true
                dirs_removed=$((dirs_removed + 1))
            fi
        fi
    done

    # Also clean any log files in current directory
    local current_logs=$(find . -maxdepth 1 -name "*.log*" -type f 2>/dev/null)
    if [[ -n "$current_logs" ]]; then
        local current_count=$(echo "$current_logs" | wc -l)
        log_info "Removing $current_count log files from current directory"
        echo "$current_logs" | xargs rm -f 2>/dev/null || true
        files_removed=$((files_removed + current_count))
    fi

    # Clean any test log directories that might exist
    local test_dirs=(
        "test-logs"
        "test_logs"
        "tmp-logs"
        ".test-logs"
    )

    for test_dir in "${test_dirs[@]}"; do
        if [[ -d "$test_dir" ]]; then
            local test_file_count=$(find "$test_dir" -name "*.log*" -type f 2>/dev/null | wc -l)
            if [[ $test_file_count -gt 0 ]]; then
                log_info "Removing $test_file_count test log files from $test_dir"
                find "$test_dir" -name "*.log*" -type f -delete 2>/dev/null || true
                files_removed=$((files_removed + test_file_count))
            fi
            # Remove test directory if empty
            if [[ -z "$(ls -A "$test_dir" 2>/dev/null)" ]]; then
                rmdir "$test_dir" 2>/dev/null || true
                dirs_removed=$((dirs_removed + 1))
            fi
        fi
    done

    if [[ $files_removed -gt 0 || $dirs_removed -gt 0 ]]; then
        log_success "Log cleanup completed: removed $files_removed files, $dirs_removed directories"
    else
        log_info "No existing log files found to clean"
    fi
}

# Get environment variable value with priority: .env file > environment > default
get_env_value() {
    local key="$1"
    local default_value="$2"
    local env_file="$3"

    # Priority 1: .env file
    if [[ -f "$env_file" ]]; then
        local value=$(grep "^${key}=" "$env_file" | cut -d'=' -f2- | sed 's/^"//;s/"$//;s/^'\''.*'\''$//' | head -1)
        if [[ -n "$value" ]]; then
            echo "$value"
            return
        fi
    fi

    # Priority 2: Current environment
    if [[ -n "${!key:-}" ]]; then
        echo "${!key}"
        return
    fi

    # Priority 3: Default value
    echo "$default_value"
}

# Add SuperDesign MCP server to Claude Code CLI
add_superdesign_mcp() {
    log_info "Adding SuperDesign MCP server to Claude Code CLI..."

    # Get current working directory for absolute path
    local current_dir=$(pwd)
    local env_file="$current_dir/.env"

    # Check if .env file exists
    if [[ -f "$env_file" ]]; then
        log_info "Found .env file, loading configuration from it"
    else
        log_info "No .env file found, using defaults and existing environment variables"
    fi

    # Clean and rebuild TypeScript code for safety
    log_info "Cleaning and rebuilding TypeScript code..."

    # Remove old compiled files
    if [[ -d "$current_dir/dist" ]]; then
        log_info "Removing old compiled files..."
        rm -rf "$current_dir/dist"
        log_success "Removed old dist directory"
    fi

    # Remove temporary files and caches
    if [[ -d "$current_dir/.superdesign" ]]; then
        log_info "Cleaning temporary files..."
        rm -rf "$current_dir/.superdesign"
        log_success "Removed temporary files"
    fi

    # Clean npm cache if needed
    log_info "Running npm cache clean..."
    npm cache clean --force >/dev/null 2>&1 || true

    # Ensure TypeScript dependencies are installed
    log_info "Ensuring TypeScript dependencies are installed..."
    npm install typescript @types/node --save-dev >/dev/null 2>&1 || true

    # Install tsx if not present (global)
    if ! command -v tsx &> /dev/null; then
        log_info "Installing tsx globally..."
        npm install -g tsx
        log_success "tsx installed globally"
    else
        log_success "tsx is already available: $(tsx --version)"
    fi

    log_success "TypeScript environment prepared"

    # Environment Variables Configuration
    echo
    log_info "🔧 SuperDesign MCP Server Environment Variables"
    log_info "==============================================="
    echo
    echo "Required variables (with default values):"
    echo "• AI_PROVIDER: custom-api"
    echo "• SECURITY_MODE: strict"
    echo "• WORKSPACE_ROOT: $HOME/.superdesign (default) # set in .env or export"
    echo
    echo "Optional variables (will use defaults if not provided):"
    echo "• ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:-'NOT_SET (will inherit from Claude)'}"
    echo "• ANTHROPIC_BASE_URL: ${ANTHROPIC_BASE_URL:-'https://open.bigmodel.cn/api/anthropic'}"
    echo "• LOG_LEVEL: info"
    echo "• LOG_DIR: $HOME/.superdesign/logs"
    echo

    # Add MCP server with environment variables
    log_info "Adding SuperDesign MCP server with environment variables..."

    # Build environment variables array using priority: .env file > environment > default
    env_vars=()

    # Core configuration variables
    local ai_provider=$(get_env_value "AI_PROVIDER" "custom-api" "$env_file")
    local security_mode=$(get_env_value "SECURITY_MODE" "strict" "$env_file")
    local workspace_root=$(get_env_value "WORKSPACE_ROOT" "$HOME/.superdesign" "$env_file")

    env_vars+=("-e" "AI_PROVIDER=$ai_provider")
    env_vars+=("-e" "SECURITY_MODE=$security_mode")
    env_vars+=("-e" "WORKSPACE_ROOT=$workspace_root")

    # API configuration
    local anthropic_token=$(get_env_value "ANTHROPIC_AUTH_TOKEN" "" "$env_file")
    local anthropic_base_url=$(get_env_value "ANTHROPIC_BASE_URL" "https://open.bigmodel.cn/api/anthropic" "$env_file")
    local anthropic_sonnet_model=$(get_env_value "ANTHROPIC_DEFAULT_SONNET_MODEL" "glm-4.6" "$env_file")

    if [[ -n "$anthropic_token" ]]; then
        env_vars+=("-e" "ANTHROPIC_AUTH_TOKEN=$anthropic_token")
        log_info "Using ANTHROPIC_AUTH_TOKEN from configuration"
    else
        log_info "ANTHROPIC_AUTH_TOKEN not set, will inherit from Claude settings"
    fi

    env_vars+=("-e" "ANTHROPIC_BASE_URL=$anthropic_base_url")
    env_vars+=("-e" "ANTHROPIC_DEFAULT_SONNET_MODEL=$anthropic_sonnet_model")

    # Logging variables
    local log_dir=$(get_env_value "LOG_DIR" "$HOME/.superdesign/logs" "$env_file")
    local log_level=$(get_env_value "LOG_LEVEL" "info" "$env_file")
    local enable_file_logging=$(get_env_value "ENABLE_FILE_LOGGING" "true" "$env_file")
    local enable_console_logging=$(get_env_value "ENABLE_CONSOLE_LOGGING" "true" "$env_file")
    local max_log_size=$(get_env_value "MAX_LOG_SIZE_MB" "10" "$env_file")
    local log_file_backups=$(get_env_value "LOG_FILE_BACKUPS" "5" "$env_file")

    env_vars+=("-e" "LOG_DIR=$log_dir")
    env_vars+=("-e" "LOG_LEVEL=$log_level")
    env_vars+=("-e" "ENABLE_FILE_LOGGING=$enable_file_logging")
    env_vars+=("-e" "ENABLE_CONSOLE_LOGGING=$enable_console_logging")
    env_vars+=("-e" "MAX_LOG_SIZE_MB=$max_log_size")
    env_vars+=("-e" "LOG_FILE_BACKUPS=$log_file_backups")

    # Additional optional variables
    local openai_key=$(get_env_value "OPENAI_API_KEY" "" "$env_file")
    local openrouter_key=$(get_env_value "OPENROUTER_API_KEY" "" "$env_file")
    local claude_code_path=$(get_env_value "CLAUDE_CODE_PATH" "claude" "$env_file")

    [[ -n "$openai_key" ]] && env_vars+=("-e" "OPENAI_API_KEY=$openai_key")
    [[ -n "$openrouter_key" ]] && env_vars+=("-e" "OPENROUTER_API_KEY=$openrouter_key")
    [[ -n "$claude_code_path" ]] && env_vars+=("-e" "CLAUDE_CODE_PATH=$claude_code_path")

    # Log what we're using
    log_info "Configuration summary:"
    log_info "  AI Provider: $ai_provider"
    log_info "  Security Mode: $security_mode"
    log_info "  Workspace Root: $workspace_root"
    log_info "  Log Directory: $log_dir"
    log_info "  Log Level: $log_level"
    log_info "  File Logging: $enable_file_logging"

    echo
    log_info "Environment variables to be set:"
    for var in "${env_vars[@]}"; do
        if [[ "$var" == "-e" ]]; then continue; fi
        log_info "  $var"
    done
    echo

    # Execute the MCP add command
    echo "env string is: ${env_vars[@]}"
    claude mcp add \
        superdesign \
        npx tsx "$current_dir/src/index.ts" \
        "${env_vars[@]}" \
        -s user

    echo "claude mcp get superdesign"
    claude mcp get superdesign

    if [[ $? -eq 0 ]]; then
        log_success "SuperDesign MCP server added successfully"

        # Test MCP server startup to ensure logging works
        log_info "Testing MCP server startup to verify logging..."
        echo
        temp_log_file="/tmp/superdesign-test-$$.log"

        # Build test environment variables
        test_env_vars=(
            "AI_PROVIDER=$ai_provider"
            "SECURITY_MODE=$security_mode"
            "WORKSPACE_ROOT=$workspace_root"
            "LOG_DIR=$log_dir"
            "LOG_LEVEL=$log_level"
            "ENABLE_FILE_LOGGING=$enable_file_logging"
            "ENABLE_CONSOLE_LOGGING=$enable_console_logging"
            "MAX_LOG_SIZE_MB=$max_log_size"
            "LOG_FILE_BACKUPS=$log_file_backups"
        )

        # Add API keys if available
        [[ -n "$anthropic_token" ]] && test_env_vars+=("ANTHROPIC_AUTH_TOKEN=$anthropic_token")
        [[ -n "$openai_key" ]] && test_env_vars+=("OPENAI_API_KEY=$openai_key")
        [[ -n "$openrouter_key" ]] && test_env_vars+=("OPENROUTER_API_KEY=$openrouter_key")
        test_env_vars+=("ANTHROPIC_BASE_URL=$anthropic_base_url")
        test_env_vars+=("ANTHROPIC_DEFAULT_SONNET_MODEL=$anthropic_sonnet_model")
        [[ -n "$claude_code_path" ]] && test_env_vars+=("CLAUDE_CODE_PATH=$claude_code_path")

        # Test with a short timeout to verify server starts and creates logs
        timeout 3s env "${test_env_vars[@]}" npx tsx "$current_dir/src/index.ts" > "$temp_log_file" 2>&1 || true

        # Check if log directory was created
        if [[ -d "$log_dir" ]]; then
            log_success "✅ Log directory created successfully: $log_dir"
            if [[ -f "$log_dir/superdesign-mcp.log" ]]; then
                log_success "✅ Log file created successfully"
                local log_size=$(wc -l < "$log_dir/superdesign-mcp.log" 2>/dev/null || echo "0")
                log_info "📝 Log file contains $log_size lines"
            else
                log_warning "⚠️  Log directory created but log file not found"
            fi
        else
            log_warning "⚠️  Log directory was not created during test (expected: $log_dir)"
        fi

        # Clean up test log
        rm -f "$temp_log_file" 2>/dev/null || true

        echo
        log_info "✅ Installation completed! You can now use SuperDesign MCP tools."
        log_info "   Try: claude 'Generate a design using SuperDesign MCP'"
    else
        log_error "Failed to add SuperDesign MCP server"
        exit 1
    fi
}

# List all MCP servers
list_mcp_servers() {
    log_info "Listing all configured MCP servers..."
    echo
    claude mcp list
    echo
}

# Get SuperDesign MCP server details
get_superdesign_details() {
    log_info "Getting SuperDesign MCP server configuration details..."
    echo
    claude mcp get superdesign
    echo
}

# Main function
main() {
    echo "🚀 SuperDesign MCP Server Installation Script"
    echo "============================================="
    echo

    # Run all setup steps
    check_directory
    check_node_npm
    check_claude_cli
    install_dependencies
    install_tsx
    remove_existing_superdesign
    cleanup_log_files
    add_superdesign_mcp
    list_mcp_servers
    get_superdesign_details

    echo
    log_success "🎉 SuperDesign MCP server installation completed successfully!"
    echo
    log_info "You can now use SuperDesign MCP server tools in your Claude Code CLI sessions."
    echo
    log_info "📋 Logging Information:"
    echo "  - Log file location: $HOME/.superdesign/logs/superdesign-mcp.log"
    echo "  - View live logs: tail -f $HOME/.superdesign/logs/superdesign-mcp.log"
    echo "  - Search for errors: grep 'ERROR' $HOME/.superdesign/logs/superdesign-mcp.log"
    echo "  - Recent logs also available: claude mcp get superdesign"
    echo "  - Check logging status: claude 'get_logging_status'"
    echo
    log_info "Available tools include:"
    echo "  - generate_design: Generate UI designs, mockups, and components"
    echo "  - create_layout: Create layout designs"
    echo "  - generate_theme: Generate design themes"
    echo "  - manage_project: Manage design projects"
    echo "  - read_file, write_file, edit_file: File operations"
    echo "  - glob_tool, grep_tool: Search tools"
    echo "  - preview_design: Preview designs"
    echo "  - list_designs: List existing designs"
    echo
    log_info "To remove the MCP server later, run: claude mcp remove superdesign -s user"
    log_info "To check status anytime, run: claude mcp list"
}

# Handle script interruption
trap 'log_error "Script interrupted"; exit 1' INT TERM

# Run main function
main "$@"
