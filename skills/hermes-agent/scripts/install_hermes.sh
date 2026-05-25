#!/bin/bash
# ============================================================================
# Hermes Agent One-Command Install Script (Universal Portable Edition)
# ============================================================================
# Supports macOS and Linux, auto-detects system environment and installs.
#
# Usage:
#   ./install_hermes.sh                  # Full install
#   ./install_hermes.sh --skip-deps      # Skip system dependency checks
#   ./install_hermes.sh --prefix ~/local # Custom install prefix
#
# What it installs:
#   1. Checks Python 3.11+ environment
#   2. Creates Python virtual environment
#   3. Clones Hermes Agent from GitHub
#   4. Installs dependencies and creates CLI entrypoint
#   5. Initializes config directory
#   6. Verifies installation
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================
INSTALL_DIR="${HERMES_INSTALL_DIR:-$HOME/.local/hermes-agent}"
VENV_DIR="$INSTALL_DIR/.venv"
BIN_DIR="$HOME/.local/bin"
CONFIG_DIR="$HOME/.hermes"
REPO_URL="https://github.com/NousResearch/hermes-agent.git"
REPO_BRANCH="main"
SKIP_DEPS=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================================================
# Logging
# ============================================================================
log_info()    { echo -e "${BLUE}[INSTALL]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }

# ============================================================================
# Argument Parsing
# ============================================================================
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-deps) SKIP_DEPS=true; shift ;;
        --prefix) shift; INSTALL_DIR="$1/hermes-agent"; VENV_DIR="$INSTALL_DIR/.venv"; shift ;;
        --help|-h)
            echo "Usage: $0 [--skip-deps] [--prefix DIR]"
            echo ""
            echo "Options:"
            echo "  --skip-deps    Skip system dependency checks"
            echo "  --prefix DIR   Custom install prefix (default: ~/.local)"
            echo "  -h, --help     Show help"
            exit 0
            ;;
        *) log_error "Unknown argument: $1"; exit 1 ;;
    esac
done

# ============================================================================
# Step 1: Check System Dependencies
# ============================================================================
check_system_deps() {
    log_info "Checking system dependencies..."

    # Python
    local python_cmd=""
    for cmd in python3.11 python3.12 python3.13 python3 python; do
        if command -v "$cmd" &> /dev/null; then
            local ver=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
            local major=$(echo "$ver" | cut -d. -f1)
            local minor=$(echo "$ver" | cut -d. -f2)
            if [ "$major" -ge 3 ] && [ "$minor" -ge 11 ]; then
                python_cmd="$cmd"
                break
            fi
        fi
    done

    if [ -z "$python_cmd" ]; then
        log_error "Python 3.11+ required but not found."
        log_error "Please install Python 3.11+:"
        log_error "  macOS: brew install python@3.11"
        log_error "  Linux: sudo apt install python3.11 python3.11-venv"
        log_error "  Or use pyenv: pyenv install 3.11.15"
        return 1
    fi
    log_success "Python: $($python_cmd --version)"

    # Git
    if ! command -v git &> /dev/null; then
        log_error "Git required but not found."
        log_error "  macOS: xcode-select --install"
        log_error "  Linux: sudo apt install git"
        return 1
    fi
    log_success "Git: $(git --version)"

    # pip
    if ! $python_cmd -m pip --version &> /dev/null; then
        log_warn "pip unavailable, attempting to install..."
        $python_cmd -m ensurepip --upgrade 2>/dev/null || {
            log_error "Cannot install pip. Please install manually."
            return 1
        }
    fi
    log_success "pip: $($python_cmd -m pip --version)"

    export PYTHON_CMD="$python_cmd"
    return 0
}

# ============================================================================
# Step 2: Clone / Update Repository
# ============================================================================
clone_repo() {
    log_info "Installing Hermes Agent to $INSTALL_DIR..."

    if [ -d "$INSTALL_DIR/.git" ]; then
        log_info "Existing installation detected, updating..."
        cd "$INSTALL_DIR"
        git pull --ff-only 2>/dev/null || {
            log_warn "Update failed, continuing with existing version."
        }
    else
        # Backup existing directory (non-git repo)
        if [ -d "$INSTALL_DIR" ]; then
            log_warn "Backing up existing directory: ${INSTALL_DIR}.bak"
            mv "$INSTALL_DIR" "${INSTALL_DIR}.bak"
        fi

        git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR" || {
            log_error "Clone failed. Check network connection."
            return 1
        }
    fi

    log_success "Hermes Agent source ready"
    return 0
}

# ============================================================================
# Step 3: Create Virtual Environment and Install Dependencies
# ============================================================================
setup_venv() {
    log_info "Creating Python virtual environment..."

    if [ -d "$VENV_DIR" ]; then
        log_info "Virtual environment already exists, skipping creation."
    else
        "$PYTHON_CMD" -m venv "$VENV_DIR" || {
            log_error "Failed to create virtual environment."
            log_error "Debian/Ubuntu may need: sudo apt install python3.11-venv"
            return 1
        }
    fi

    # Activate virtual environment
    source "$VENV_DIR/bin/activate"

    log_info "Upgrading pip..."
    pip install --upgrade pip --quiet 2>/dev/null

    log_info "Installing Hermes dependencies..."
    if [ -f "$INSTALL_DIR/requirements.txt" ]; then
        pip install -r "$INSTALL_DIR/requirements.txt" --quiet 2>/dev/null
    elif [ -f "$INSTALL_DIR/pyproject.toml" ]; then
        pip install -e "$INSTALL_DIR" --quiet 2>/dev/null
    else
        # Try direct install
        pip install hermes-agent --quiet 2>/dev/null || {
            log_warn "pip install hermes-agent failed, trying from source..."
            cd "$INSTALL_DIR"
            pip install . --quiet 2>/dev/null || {
                log_error "Dependency install failed. Run manually:"
                log_error "  source $VENV_DIR/bin/activate"
                log_error "  cd $INSTALL_DIR && pip install -e ."
                return 1
            }
        }
    fi

    log_success "Dependencies installed"
    return 0
}

# ============================================================================
# Step 4: Create CLI Entrypoint
# ============================================================================
create_cli_entry() {
    log_info "Creating CLI entrypoint..."

    mkdir -p "$BIN_DIR"

    local cli_script="$BIN_DIR/hermes"

    cat > "$cli_script" << 'CLISCRIPT'
#!/bin/bash
# Hermes Agent CLI Entrypoint (auto-generated)
# Created by install_hermes.sh — do not edit manually.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Attempt to detect install location
if [ -z "${HERMES_INSTALL_DIR:-}" ]; then
    # Search by priority
    for candidate in \
        "$HOME/.local/hermes-agent" \
        "$HOME/.hermes-agent" \
        "/opt/hermes-agent" \
        "/tmp/hermes-agent"; do
        if [ -f "$candidate/hermes" ] || [ -f "$candidate/src/hermes/__main__.py" ]; then
            export HERMES_INSTALL_DIR="$candidate"
            break
        fi
    done
fi

if [ -z "${HERMES_INSTALL_DIR:-}" ]; then
    echo "Error: Hermes Agent not found. Re-run install_hermes.sh." >&2
    exit 1
fi

# Activate virtual environment and run
VENV_DIR="$HERMES_INSTALL_DIR/.venv"

if [ -d "$VENV_DIR/bin" ]; then
    source "$VENV_DIR/bin/activate"
else
    echo "Error: Virtual environment not found: $VENV_DIR" >&2
    echo "Re-run install_hermes.sh." >&2
    exit 1
fi

# Run hermes
if [ -f "$HERMES_INSTALL_DIR/hermes" ]; then
    python "$HERMES_INSTALL_DIR/hermes" "$@"
elif [ -f "$HERMES_INSTALL_DIR/src/hermes/__main__.py" ]; then
    python -m hermes "$@"
else
    # Try as installed Python package
    if command -v hermes &> /dev/null; then
        hermes "$@"
    else
        echo "Error: Cannot find Hermes entrypoint." >&2
        exit 1
    fi
fi
CLISCRIPT

    chmod +x "$cli_script"
    log_success "CLI entrypoint: $cli_script"
    return 0
}

# ============================================================================
# Step 5: Initialize Configuration
# ============================================================================
init_config() {
    log_info "Initializing configuration directory..."

    mkdir -p "$CONFIG_DIR"
    mkdir -p "$CONFIG_DIR/cron"
    mkdir -p "$CONFIG_DIR/sessions"
    mkdir -p "$CONFIG_DIR/logs"
    mkdir -p "$CONFIG_DIR/skills"
    mkdir -p "$CONFIG_DIR/memories"

    # Create default .env (if it doesn't exist)
    if [ ! -f "$CONFIG_DIR/.env" ]; then
        cat > "$CONFIG_DIR/.env" << 'ENVFILE'
# =============================================================================
# Hermes Agent Environment Variables
# =============================================================================
# Choose at least one LLM provider and fill in your API key.

# --- Recommended Providers (pick one) ---
# OpenRouter (supports 200+ models)
# OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Anthropic (Claude series)
# ANTHROPIC_API_KEY=sk-ant-your-key-here

# OpenAI
# OPENAI_API_KEY=sk-your-key-here

# Google Gemini
# GOOGLE_API_KEY=your-key-here

# Z.AI / GLM (GLM series)
# GLM_API_KEY=your-key-here
# GLM_BASE_URL=https://api.z.ai/api/paas/v4

# Kimi / Moonshot
# KIMI_API_KEY=your-key-here

# --- Optional Enhancements ---
# FIRECRAWL_API_KEY=fc-your-key       # Web scraping
# FAL_KEY=your-fal-key                # Image generation
# ELEVENLABS_API_KEY=your-key         # Advanced TTS
# EXA_API_KEY=your-key                # Search engine
# GITHUB_TOKEN=ghp-your-token         # GitHub integration
ENVFILE
        log_success "Created default config: $CONFIG_DIR/.env"
    else
        log_info "Config file already exists: $CONFIG_DIR/.env"
    fi

    # Create default config.yaml (if it doesn't exist)
    if [ ! -f "$CONFIG_DIR/config.yaml" ]; then
        # Run hermes setup to generate default config
        if [ -x "$BIN_DIR/hermes" ]; then
            "$BIN_DIR/hermes" setup --non-interactive 2>/dev/null || true
        fi
    fi

    log_success "Config directory: $CONFIG_DIR"
    return 0
}

# ============================================================================
# Step 6: Verify Installation
# ============================================================================
verify_install() {
    log_info "Verifying installation..."

    local errors=0

    # Check CLI
    if command -v hermes &> /dev/null || [ -x "$BIN_DIR/hermes" ]; then
        log_success "hermes command available"
    else
        log_error "hermes command not available"
        errors=$((errors + 1))
    fi

    # Check version
    if [ -x "$BIN_DIR/hermes" ]; then
        local ver
        ver=$("$BIN_DIR/hermes" --version 2>&1 | head -1 || echo "unknown")
        log_success "Version: $ver"
    fi

    # Check config
    if [ -f "$CONFIG_DIR/.env" ]; then
        log_success "Config file: $CONFIG_DIR/.env"
    else
        log_warn "Config file missing — API key must be configured manually"
        errors=$((errors + 1))
    fi

    # PATH check
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        log_warn "Add $BIN_DIR to PATH:"
        log_warn "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"
        log_warn "  source ~/.zshrc"
    fi

    echo ""
    if [ $errors -eq 0 ]; then
        log_success "Installation complete! Run the following to get started:"
        echo ""
        echo "  1. Configure API key:"
        echo "     nano $CONFIG_DIR/.env"
        echo ""
        echo "  2. Run diagnostics:"
        echo "     $BIN_DIR/hermes doctor"
        echo ""
        echo "  3. Start chatting:"
        echo "     $BIN_DIR/hermes chat"
        return 0
    else
        log_error "Installation complete with $errors issues. Check output above."
        return 1
    fi
}

# ============================================================================
# Main
# ============================================================================
main() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     Hermes Agent Installer v1.0.0        ║${NC}"
    echo -e "${CYAN}║     Universal Portable Edition           ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""

    # Step 1: Check system dependencies
    if [ "$SKIP_DEPS" = false ]; then
        check_system_deps || exit 1
    else
        log_warn "Skipping system dependency checks"
        export PYTHON_CMD="${PYTHON_CMD:-python3}"
    fi

    # Step 2: Clone repository
    clone_repo || exit 1

    # Step 3: Create virtual environment
    setup_venv || exit 1

    # Step 4: Create CLI entrypoint
    create_cli_entry || exit 1

    # Step 5: Initialize configuration
    init_config || exit 1

    # Step 6: Verify
    verify_install
}

main "$@"
