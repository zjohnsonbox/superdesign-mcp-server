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

# Add SuperDesign MCP server to Claude Code CLI
add_superdesign_mcp() {
    log_info "Adding SuperDesign MCP server to Claude Code CLI..."

    # Get current working directory for absolute path
    local current_dir=$(pwd)

    # Load environment variables from .env file if it exists
    local env_file="$current_dir/.env"
    local env_args=()

    if [[ -f "$env_file" ]]; then
        log_info "Loading environment variables from .env file..."

        # Read environment variables and add them to MCP server config
        while IFS='=' read -r key value; do
            # Skip comments and empty lines
            [[ $key =~ ^[[:space:]]*# ]] && continue
            [[ -z $key ]] && continue

            # Remove any surrounding quotes from value
            value=$(echo "$value" | sed 's/^"//;s/"$//')

            # Add to environment arguments
            env_args+=("--env" "$key=$value")
            log_info "Setting environment: $key"
        done < "$env_file"
    fi

    # Add default environment variables if not in .env file
    env_args+=("--env" "AI_PROVIDER=custom-api")
    env_args+=("--env" "SECURITY_MODE=strict")
    env_args+=("--env" "WORKSPACE_ROOT=$current_dir")

    # Add MCP server
    claude mcp add \
        --transport stdio \
        --scope user \
        superdesign \
        "${env_args[@]}" \
        -- \
        npx tsx "$current_dir"/src/index.ts

    if [[ $? -eq 0 ]]; then
        log_success "SuperDesign MCP server added successfully"
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
    add_superdesign_mcp
    list_mcp_servers
    get_superdesign_details

    echo
    log_success "🎉 SuperDesign MCP server installation completed successfully!"
    echo
    log_info "You can now use SuperDesign MCP server tools in your Claude Code CLI sessions."
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
