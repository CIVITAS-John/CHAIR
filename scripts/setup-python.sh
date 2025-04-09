#!/bin/bash

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

# Check if "pip" or "pip3" is available
pip=$(command -v pip || command -v pip3)
if [[ -z $pip ]]; then
    echo -e "\033[1;33mpip cannot be detected.\033[0m"
    read -rp "Provide the path to pip, or leave empty to install pip: " pip
    if [[ -z $pip ]]; then
        "$python" -m ensurepip --upgrade
        pip=$(command -v pip || command -v pip3)
        if [[ -z $pip ]]; then
            echo -e "\033[1;31mpip cannot be installed. Please visit https://pip.pypa.io/en/stable/installation/ to install pip.\033[0m"
            exit 1
        fi
    fi
fi

# Ask the user if they want to use bertopic
read -rp "Do you want to use topic modelling? [y/N]" bertopic

# Ask the user if they want to use hdbscan
read -rp "Do you want to install hdbscan? (for repository developers) [y/N]" hdbscan

# Install the required packages from requirements.txt
echo "Installing required packages..."
"$pip" install -r requirements.txt

if [[ $hdbscan == "y" ]]; then
    "$pip" install -r requirements.hdbscan.txt
fi

if [[ $bertopic == "y" ]]; then
    "$pip" install -r requirements.bertopic.txt
fi

echo -e "\033[1;32mAll required packages have been installed.\033[0m"
