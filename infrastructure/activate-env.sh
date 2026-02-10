#!/bin/bash

# AWS Alien Attack - Isolated Environment Setup
# This script sets up an isolated Node.js environment for the project

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Get the project root directory (parent of infrastructure)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Use the project-specific Node version
nvm use

# Configure npm to use project-local global packages and public registry
export NPM_CONFIG_PREFIX="$PROJECT_ROOT/.npm-global"
export NPM_CONFIG_USERCONFIG="$PROJECT_ROOT/.npmrc"
export PATH="$PROJECT_ROOT/.npm-global/bin:$PATH"

# Display environment info
echo ""
echo "========================================="
echo "  AWS Alien Attack - Isolated Environment"
echo "========================================="
echo "  Node version: $(node --version)"
echo "  npm version: $(npm --version)"
echo "  CDK version: $(cdk --version 2>/dev/null || echo 'not installed')"
echo "  Registry: $(npm config get registry)"
echo "  Global packages: $NPM_CONFIG_PREFIX"
echo "========================================="
echo ""
