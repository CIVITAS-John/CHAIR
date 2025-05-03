# Check if .env exists
$envFile = ".\.env"
if (Test-Path $envFile) {
    Write-Host ".env file already exists." -ForegroundColor Green
    exit 0
}

# Ask the user for API keys
$envList =
@("OpenAI", "Anthropic", "Mistral", "Groq", "Google") | ForEach-Object {
    $key = Read-Host "Enter your $($_) API key (leave blank if not applicable)"
    if ($key -ne "") {
        "$($_.ToUpper())_API_KEY=$key"
    }
    else {
        "$($_.ToUpper())_API_KEY={Your $($_) API key}"
    }
}

# Ask the user for OLLAMA_URL
$ollamaUrl = Read-Host "If you are using Ollama with a custom endpoint, please provide the URL (leave blank if not applicable)"
if ($ollamaUrl -ne "") {
    $envList += "OLLAMA_URL=$ollamaUrl"
}

# Write the API keys to the .env file
$envList | Out-File -FilePath $envFile -Encoding utf8
Write-Host ".env file has been created successfully." -ForegroundColor Green
