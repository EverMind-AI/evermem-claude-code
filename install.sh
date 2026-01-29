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
echo "Get your API key from: https://evermind.ai/dashboard/api-keys"
echo ""

# Check if API key already exists
if [ -n "$EVERMEM_API_KEY" ]; then
    echo -e "${GREEN}✓${NC} EVERMEM_API_KEY already set in environment"
    read -p "Do you want to update it? (y/N): " UPDATE_KEY
    if [ "$UPDATE_KEY" != "y" ] && [ "$UPDATE_KEY" != "Y" ]; then
        echo "Keeping existing API key."
        API_KEY="$EVERMEM_API_KEY"
    else
        read -p "Enter your EverMem API key: " API_KEY
    fi
else
    read -p "Enter your EverMem API key: " API_KEY
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

# Get the directory where the install script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Add marketplace from local clone
echo "Adding EverMem marketplace..."
if claude plugin marketplace add "$SCRIPT_DIR" 2>&1 | grep -q "Successfully\|already exists"; then
    echo -e "${GREEN}✓${NC} Marketplace added"
else
    # Try to update if already exists
    claude plugin marketplace remove evermem 2>/dev/null || true
    if claude plugin marketplace add "$SCRIPT_DIR" 2>&1; then
        echo -e "${GREEN}✓${NC} Marketplace added"
    else
        echo -e "${RED}❌ Failed to add marketplace${NC}"
        exit 1
    fi
fi

# Install plugin
echo "Installing EverMem plugin..."
if claude plugin install evermem@evermem --scope user 2>&1 | grep -q "Successfully"; then
    echo -e "${GREEN}✓${NC} Plugin installed"
else
    # Try reinstalling
    claude plugin uninstall evermem@evermem 2>/dev/null || true
    if claude plugin install evermem@evermem --scope user 2>&1; then
        echo -e "${GREEN}✓${NC} Plugin installed"
    else
        echo -e "${RED}❌ Failed to install plugin${NC}"
        exit 1
    fi
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
echo "Need help? Visit: https://evermind.ai/docs"
echo ""
