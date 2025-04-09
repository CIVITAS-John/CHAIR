# Check if "node" is available
$node = (Get-Command node -ErrorAction SilentlyContinue).source
if (-not $node) {
    # Ask the user to provide a path to node
    Write-Host "Node.js cannot be detected." -ForegroundColor Yellow
    $node = Read-Host "Provide the path to node, or leave empty to exit"
    if ($node -eq "") {
        Write-Host "Node.js cannot be detected. Please visit https://nodejs.org/en/download/prebuilt-installer to download and install Node.js." -ForegroundColor Red
        exit 1
    }
}
# https://github.com/nodejs/release?tab=readme-ov-file#release-schedule
$nodeVersion = & $node --version
if ($nodeVersion -notmatch "^v(18|20|2[2-9]|[3-9]\d)") {
    Write-Host "Node.js is outdated. Please visit https://nodejs.org/en/download/prebuilt-installer to download and install the latest version." -ForegroundColor Red
    exit 1
}

# Check if "pnpm" is available
$pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
if (-not $pnpm) {
    # Ask the user to provide a path to pnpm
    Write-Host "pnpm cannot be detected." -ForegroundColor Yellow
    $pnpm = Read-Host "Provide the path to pnpm, or leave empty to install pnpm"
    if ($pnpm -eq "") {
        Write-Host "Installing pnpm..."
        & corepack enable pnpm
        $pnpm = (Get-Command -Name pnpm -ErrorAction SilentlyContinue).Source
        if (-not $pnpm) {
            Write-Host "pnpm cannot be installed. Please follow https://pnpm.io/installation to install pnpm." -ForegroundColor Red
            exit 1
        }
        Write-Host "pnpm has been installed." -ForegroundColor Green    
    }
}

# Install the required packages from package.json
Write-Host "Installing required packages..."
# & $pnpm install --prod
& $pnpm install --frozen-lockfile

Write-Host "All required packages have been installed." -ForegroundColor Green

# Build the project
Write-Host "Building the project..."
& $pnpm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. Please check the error messages above." -ForegroundColor Red
    exit 1
}

Write-Host "Project has been built successfully." -ForegroundColor Green
