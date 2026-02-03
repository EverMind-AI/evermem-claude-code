#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}    ███████╗██╗   ██╗███████╗██████╗ ███╗   ███╗███████╗███╗   ███╗${NC}"
echo -e "${CYAN}    ██╔════╝██║   ██║██╔════╝██╔══██╗████╗ ████║██╔════╝████╗ ████║${NC}"
echo -e "${CYAN}    █████╗  ██║   ██║█████╗  ██████╔╝██╔████╔██║█████╗  ██╔████╔██║${NC}"
echo -e "${CYAN}    ██╔══╝  ╚██╗ ██╔╝██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║${NC}"
echo -e "${CYAN}    ███████╗ ╚████╔╝ ███████╗██║  ██║██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║${NC}"
echo -e "${CYAN}    ╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝${NC}"
echo ""
echo -e "              ${GREEN}Plugin for Claude Code${NC}"
echo ""

# Check if claude CLI is installed
if ! command -v claude &> /dev/null; then
    echo -e "${RED}❌ Error: Claude Code CLI is not installed${NC}"
    echo ""
    echo "Please install Claude Code first:"
    echo "  https://claude.ai/code"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} Claude Code CLI detected"

# Detect shell and profile
detect_shell_profile() {
    if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ]; then
        echo "$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ]; then
        if [ -f "$HOME/.bash_profile" ]; then
            echo "$HOME/.bash_profile"
        else
            echo "$HOME/.bashrc"
        fi
    elif [ "$SHELL" = "/usr/bin/fish" ] || [ "$SHELL" = "/bin/fish" ]; then
        echo "$HOME/.config/fish/config.fish"
    else
        echo "$HOME/.profile"
    fi
}

PROFILE=$(detect_shell_profile)
SHELL_NAME=$(basename "$SHELL")

echo -e "${GREEN}✓${NC} Detected shell: $SHELL_NAME"
echo -e "${GREEN}✓${NC} Profile file: $PROFILE"
echo ""

# Prompt for API key
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Step 1: Configure API Key${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Get your API key from: https://console.evermind.ai/"
echo ""

# Check if API key already exists
if [ -n "$EVERMEM_API_KEY" ]; then
    echo -e "${GREEN}✓${NC} EVERMEM_API_KEY already set in environment"
    read -p "Do you want to update it? (y/N): " UPDATE_KEY </dev/tty
    if [ "$UPDATE_KEY" != "y" ] && [ "$UPDATE_KEY" != "Y" ]; then
        echo "Keeping existing API key."
        API_KEY="$EVERMEM_API_KEY"
    else
        read -p "Enter your EverMem API key: " API_KEY </dev/tty
    fi
else
    read -p "Enter your EverMem API key: " API_KEY </dev/tty
fi

if [ -z "$API_KEY" ]; then
    echo -e "${RED}❌ API key is required${NC}"
    exit 1
fi

# Add API key to profile
if ! grep -q "EVERMEM_API_KEY" "$PROFILE" 2>/dev/null; then
    echo "" >> "$PROFILE"
    echo "# EverMem API Key (added by install script)" >> "$PROFILE"
    if [ "$SHELL_NAME" = "fish" ]; then
        echo "set -gx EVERMEM_API_KEY \"$API_KEY\"" >> "$PROFILE"
    else
        echo "export EVERMEM_API_KEY=\"$API_KEY\"" >> "$PROFILE"
    fi
    echo -e "${GREEN}✓${NC} API key added to $PROFILE"
else
    # Update existing key
    if [ "$SHELL_NAME" = "fish" ]; then
        sed -i.bak "s|set -gx EVERMEM_API_KEY.*|set -gx EVERMEM_API_KEY \"$API_KEY\"|" "$PROFILE"
    else
        sed -i.bak "s|export EVERMEM_API_KEY=.*|export EVERMEM_API_KEY=\"$API_KEY\"|" "$PROFILE"
    fi
    echo -e "${GREEN}✓${NC} API key updated in $PROFILE"
fi

# Export for current session
export EVERMEM_API_KEY="$API_KEY"

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Step 2: Install Plugin${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

REPO_URL="https://github.com/EverMind-AI/evermem-claude-code.git"
PLUGIN_DIR="$HOME/.evermem"

# Check if we're running from a cloned repo or via curl
SCRIPT_DIR=""
# BASH_SOURCE[0] is empty when running via 'bash -c' (curl pipe)
if [[ -n "${BASH_SOURCE[0]}" ]]; then
    POSSIBLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
    if [[ -n "$POSSIBLE_DIR" && -f "$POSSIBLE_DIR/.claude-plugin/marketplace.json" ]]; then
        SCRIPT_DIR="$POSSIBLE_DIR"
    fi
fi

# If not running from repo, clone it
if [[ -z "$SCRIPT_DIR" ]]; then
    echo "Downloading EverMem plugin..."
    if [[ -d "$PLUGIN_DIR" ]]; then
        echo "Updating existing installation..."
        if ! git -C "$PLUGIN_DIR" pull --quiet 2>/dev/null; then
            rm -rf "$PLUGIN_DIR"
            git clone --quiet "$REPO_URL" "$PLUGIN_DIR"
        fi
    else
        git clone --quiet "$REPO_URL" "$PLUGIN_DIR"
    fi
    SCRIPT_DIR="$PLUGIN_DIR"
    echo -e "${GREEN}✓${NC} Plugin downloaded to $PLUGIN_DIR"
fi

# Add marketplace from local clone
echo "Adding EverMem marketplace..."
claude plugin marketplace remove evermem 2>/dev/null || true
if claude plugin marketplace add "$SCRIPT_DIR" 2>&1 | grep -q "Successfully"; then
    echo -e "${GREEN}✓${NC} Marketplace added"
else
    echo -e "${RED}❌ Failed to add marketplace${NC}"
    exit 1
fi

# Install plugin
echo "Installing EverMem plugin..."
claude plugin uninstall evermem@evermem 2>/dev/null || true
if claude plugin install evermem@evermem --scope user 2>&1 | grep -q "Successfully"; then
    echo -e "${GREEN}✓${NC} Plugin installed"
else
    echo -e "${RED}❌ Failed to install plugin${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🎉 Installation Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "To activate the API key in your current terminal:"
echo ""
echo -e "  ${BLUE}source $PROFILE${NC}"
echo ""
echo "Or simply restart your terminal."
echo ""
echo "Your conversations with Claude Code will now be remembered!"
echo ""
echo "Need help? Run /evermem:help in Claude Code"
echo ""
