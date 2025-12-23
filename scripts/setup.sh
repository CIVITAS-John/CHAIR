#!/usr/bin/env bash

# Color codes for output
RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "Setup Script for LLM-Qualitative Project"
echo "========================================"
echo

# Step 1: Check and setup Node.js
echo "[1/4] Checking Node.js installation..."
node=$(command -v node)
if [[ -z $node ]]; then
    echo -e "${YELLOW}Node.js cannot be detected.${NC}"
    read -rp "Provide the path to Node.js, or leave empty to exit: " node
    if [[ -z $node ]]; then
        echo -e "${RED}Node.js cannot be detected. Please visit https://nodejs.org/en/download to download and install Node.js.${NC}"
        exit 1
    fi
fi

# Check Node.js version (v20+)
node_version=$("$node" -v)
echo "Node.js version: $node_version"
if ! [[ $node_version =~ ^v(2[0-9]|[3-9][0-9]|[1-9][0-9][0-9]) ]]; then
    echo -e "${RED}Node.js is outdated. Please visit https://nodejs.org/en/download to download and install Node.js v20 or later.${NC}"
    exit 1
fi
echo -e "${GREEN}Node.js version is compatible.${NC}"
echo

# Step 2: Setup environment file
echo "[2/4] Setting up environment file..."
env_file="./.env"
if [[ -f "$env_file" ]]; then
    echo -e "${GREEN}.env file already exists, skipping creation.${NC}"
else
    echo "Creating .env file..."
    declare -a env_list

    # Collect API keys
    read -rp "Enter your OpenAI API key (leave blank if not applicable): " openai_key
    if [[ -n "$openai_key" ]]; then
        env_list+=("OPENAI_API_KEY=$openai_key")
    else
        env_list+=("OPENAI_API_KEY={Your OpenAI API key}")
    fi

    read -rp "Enter your Anthropic API key (leave blank if not applicable): " anthropic_key
    if [[ -n "$anthropic_key" ]]; then
        env_list+=("ANTHROPIC_API_KEY=$anthropic_key")
    else
        env_list+=("ANTHROPIC_API_KEY={Your Anthropic API key}")
    fi

    read -rp "Enter your Mistral API key (leave blank if not applicable): " mistral_key
    if [[ -n "$mistral_key" ]]; then
        env_list+=("MISTRAL_API_KEY=$mistral_key")
    else
        env_list+=("MISTRAL_API_KEY={Your Mistral API key}")
    fi

    read -rp "Enter your Groq API key (leave blank if not applicable): " groq_key
    if [[ -n "$groq_key" ]]; then
        env_list+=("GROQ_API_KEY=$groq_key")
    else
        env_list+=("GROQ_API_KEY={Your Groq API key}")
    fi

    read -rp "Enter your Google API key (leave blank if not applicable): " google_key
    if [[ -n "$google_key" ]]; then
        env_list+=("GOOGLE_API_KEY=$google_key")
    else
        env_list+=("GOOGLE_API_KEY={Your Google API key}")
    fi

    read -rp "If you are using Ollama with a custom endpoint, please provide the URL (leave blank if not applicable): " ollama_url
    if [[ -n "$ollama_url" ]]; then
        env_list+=("OLLAMA_URL=$ollama_url")
    fi

    # Write to .env file
    printf "%s\n" "${env_list[@]}" >"$env_file"
    echo -e "${GREEN}.env file has been created successfully.${NC}"
fi
echo

# Step 3: Install Node.js dependencies
echo "[3/4] Installing Node.js dependencies..."
if ! npm install; then
    echo -e "${RED}Failed to install Node.js dependencies.${NC}"
    exit 1
fi
echo -e "${GREEN}Node.js dependencies installed successfully.${NC}"
echo

# Build the project
echo "Building the project..."
if ! npm run build; then
    echo -e "${RED}Build failed. Please check the error messages above.${NC}"
    exit 1
fi
echo -e "${GREEN}Project has been built successfully.${NC}"
echo

# Step 4: Setup Python environment
echo "[4/4] Setting up Python environment..."

# Check if Python is available
python=$(command -v python || command -v py || command -v python3)
if [[ -z $python ]]; then
    echo -e "${YELLOW}Python cannot be detected.${NC}"
    read -rp "Provide the path to Python, or leave empty to skip Python setup: " python
    if [[ -z $python ]]; then
        echo "Skipping Python setup. You can run this script again later to set up Python."
        # Jump to finish
        echo
        echo "========================================"
        echo -e "${GREEN}Setup completed successfully!${NC}"
        echo "========================================"
        echo
        echo "To build the project, run:"
        echo "  npm run build"
        echo
        exit 0
    fi
fi
echo "Python found: $python"

# Create virtual environment if it doesn't exist
venv_path="./.venv"
if [[ ! -d $venv_path ]]; then
    echo "Creating Python virtual environment..."
    "$python" -m venv "$venv_path"
    if [[ ! -d $venv_path ]]; then
        echo -e "${RED}Failed to create virtual environment. Please ensure Python is installed correctly.${NC}"
        echo "Continuing without Python setup..."
    else
        echo -e "${GREEN}Virtual environment created successfully.${NC}"
    fi
fi

# Activate virtual environment
if [[ -d $venv_path ]]; then
    activate_script="$venv_path/bin/activate"
    if [[ ! -f $activate_script ]]; then
        activate_script="$venv_path/Scripts/activate"
    fi

    if [[ -f $activate_script ]]; then
        # shellcheck source=/dev/null
        source "$activate_script"
        echo -e "${GREEN}Virtual environment activated.${NC}"

        # Upgrade pip
        echo "Upgrading pip..."
        python -m ensurepip --upgrade >/dev/null 2>&1
        python -m pip install --upgrade pip >/dev/null 2>&1

        # Install Python dependencies
        if [[ -f requirements.txt ]]; then
            echo "Installing Python dependencies..."
            if ! python -m pip install -r requirements.txt; then
                echo -e "${YELLOW}Warning: Some Python packages may not have been installed correctly.${NC}"
            fi
        fi

        # Optional: Install topic modeling dependencies
        read -rp "Do you want to use topic modelling? [y/N] " bertopic
        if [[ $bertopic == "y" ]]; then
            if [[ -f requirements.bertopic.txt ]]; then
                echo "Installing topic modeling dependencies..."
                python -m pip install -r requirements.bertopic.txt
            fi
        fi

        # Optional: Install hdbscan for developers
        read -rp "Do you want to install hdbscan? (for repository developers) [y/N] " hdbscan
        if [[ $hdbscan == "y" ]]; then
            if [[ -f requirements.hdbscan.txt ]]; then
                echo "Installing hdbscan dependencies..."
                python -m pip install -r requirements.hdbscan.txt
            fi
        fi

        echo -e "${GREEN}Python environment setup complete.${NC}"
    else
        echo -e "${YELLOW}Warning: Could not activate virtual environment.${NC}"
    fi
fi

echo
echo "========================================"
echo -e "${GREEN}Setup completed successfully!${NC}"
echo "========================================"
echo
if [[ -d $venv_path ]]; then
    echo "To activate the Python virtual environment later, run:"
    echo "  source .venv/bin/activate"
    echo
fi
echo "To build the project, run:"
echo "  npm run build"
echo
echo "To run tests, use:"
echo "  npm test"
echo