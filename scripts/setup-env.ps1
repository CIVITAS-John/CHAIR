# Check if .env exists
$envFile = ".\.env"
if (Test-Path $envFile) {
    Write-Host ".env file already exists." -ForegroundColor Green
    exit 0
}

# Ask the user for API keys
$apiKeys =
@("OpenAI", "Anthropic", "Mistral", "Groq", "Google") | ForEach-Object {
    $key = Read-Host "Enter your $($_) API key (leave blank if not available)"
    if ($key -ne "") {
        "$($_.ToUpper())_API_KEY=$key"
    } else {
        "$($_.ToUpper())_API_KEY={Your $($_) API key}"
    }
}

# Write the API keys to the .env file
$apiKeys | Out-File -FilePath $envFile -Encoding utf8
Write-Host ".env file has been created with the provided API keys." -ForegroundColor Green
