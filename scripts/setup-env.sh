#!/usr/bin/env bash

# Check if .env exists
env_file="./.env"
if [[ -f "$env_file" ]]; then
    echo -e "\033[1;32m.env file already exists.\033[0m"
    exit 0
fi

# Ask the user for API keys
declare -a env_list
services=("OpenAI" "Anthropic" "Mistral" "Groq" "Google")

for service in "${services[@]}"; do
    read -rp "Enter your $service API key (leave blank if not applicable): " key
    if [[ -n "$key" ]]; then
        env_list+=("${service^^}_API_KEY=$key")
    else
        env_list+=("${service^^}_API_KEY={Your $service API key}")
    fi
done

# Ask the user for OLLAMA_URL
read -rp "If you are using Ollama with a custom endpoint, please provide the URL (leave blank if not applicable): " ollama_url
if [[ -n "$ollama_url" ]]; then
    env_list+=("OLLAMA_URL=$ollama_url")
fi

# Write the API keys to the .env file
printf "%s\n" "${env_list[@]}" >"$env_file"
echo -e "\033[1;32m.env file has been created successfully.\033[0m"
