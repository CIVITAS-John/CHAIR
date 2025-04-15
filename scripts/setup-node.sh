#!/usr/bin/env bash

# Check if "node" is available
node=$(command -v node)
if [[ -z $node ]]; then
    echo -e "\033[1;33mNode.js cannot be detected.\033[0m"
    read -rp "Provide the path to Node.js, or leave empty to exit: " node
    if [[ -z $node ]]; then
        echo -e "\033[1;31mNode.js cannot be detected. Please visit https://nodejs.org/en/download/prebuilt-installer to download and install Node.js.\033[0m"
        exit 1
    fi
fi

# Check Node.js version (https://github.com/nodejs/release#release-schedule)
node_version=$("$node" -v)
if ! [[ $node_version =~ ^v(20|2[2-9]|[3-9][0-9]) ]]; then
    echo -e "\033[1;31mNode.js is outdated. Please visit https://nodejs.org/en/download/prebuilt-installer to download and install the latest version.\033[0m"
    exit 1
fi

# Check if "pnpm" is available
pnpm=$(command -v pnpm)
if [[ -z $pnpm ]]; then
    echo -e "\033[1;33mpnpm cannot be detected.\033[0m"
    read -rp "Provide the path to pnpm, or leave empty to install pnpm: " pnpm
    if [[ -z $pnpm ]]; then
        echo "Installing pnpm..."
        corepack enable pnpm
        pnpm=$(command -v pnpm)
        if [[ -z $pnpm ]]; then
            echo -e "\033[1;31mpnpm cannot be installed. Please follow https://pnpm.io/installation to install pnpm.\033[0m"
            exit 1
        fi
        echo -e "\033[1;32mpnpm has been installed.\033[0m"
    fi
fi

# Install the required packages from package.json
echo "Installing required packages..."
# "$pnpm" install --prod
"$pnpm" install --frozen-lockfile

echo -e "\033[1;32mAll required packages have been installed.\033[0m"

# Build the project
echo "Building the project..."
"$pnpm" run build
if [[ $? -ne 0 ]]; then
    echo -e "\033[1;31mBuild failed. Please check the error messages above.\033[0m"
    exit 1
fi

echo -e "\033[1;32mProject has been built successfully.\033[0m"
