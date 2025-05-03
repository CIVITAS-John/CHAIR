#!/usr/bin/env bash

# Check if "python", "py", or "python3" is available
python=$(command -v python || command -v py || command -v python3)
if [[ -z $python ]]; then
    echo -e "\033[1;33mPython cannot be detected.\033[0m"
    read -rp "Provide the path to python, or leave empty to exit: " python
    if [[ -z $python ]]; then
        echo -e "\033[1;31mPython cannot be detected. Please visit https://www.python.org/downloads/ to download and install Python.\033[0m"
        exit 1
    fi
fi

# Create a virtual environment if it doesn't exist
venv_path="./.venv"
if [[ ! -d $venv_path ]]; then
    echo "Creating a virtual environment..."
    "$python" -m venv "$venv_path"
    if [[ ! -d $venv_path ]]; then
        echo -e "\033[1;31mFailed to create a virtual environment. Please ensure Python is installed correctly.\033[0m"
        exit 1
    fi
    echo -e "\033[1;32mVirtual environment created at $venv_path.\033[0m"
fi

# Activate the virtual environment
activate_script="$venv_path/bin/activate"
if [[ ! -f $activate_script ]]; then
    activate_script="$venv_path/Scripts/activate"
    if [[ ! -f $activate_script ]]; then
        echo -e "\033[1;31mActivation script not found. Ensure the virtual environment was created successfully.\033[0m"
        exit 1
    fi
fi
# shellcheck source=/dev/null
source "$activate_script"
echo -e "\033[1;32mVirtual environment activated.\033[0m"

# Ask the user if they want to use bertopic
read -rp "Do you want to use topic modelling? [y/N] " bertopic

# Ask the user if they want to use hdbscan
read -rp "Do you want to install hdbscan? (for repository developers) [y/N] " hdbscan

# Install the required packages from requirements.txt
echo "Installing required packages in the virtual environment..."
python -m ensurepip --upgrade
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if [[ $bertopic == "y" ]]; then
    python -m pip install -r requirements.bertopic.txt
fi

if [[ $hdbscan == "y" ]]; then
    python -m pip install -r requirements.hdbscan.txt
fi

echo -e "\033[1;32mAll required packages have been installed in the virtual environment.\033[0m"
