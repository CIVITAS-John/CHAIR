#!/usr/bin/env bash

# Check if .env exists
env_file="./.env"
if [[ -f "$env_file" ]]; then
    echo -e "\033[1;32m.env file already exists.\033[0m"
    exit 0
fi

# Ask the user for API keys
declare -a services=("OpenAI" "Anthropic" "Mistral" "Groq" "Google")
api_keys=()

for service in "${services[@]}"; do
    read -rp "Enter your $service API key (leave blank if not available): " key
    api_keys+=("${service^^}_API_KEY=${key:-{Your $service API key\}}")
done

# Write the API keys to the .env file
printf "%s\n" "${api_keys[@]}" >"$env_file"
echo -e "\033[1;32m.env file has been created with the provided API keys.\033[0m"
