# Check if "python", "py" or "python3" is available
$python = (Get-Command python -ErrorAction SilentlyContinue).source
if (-not $python) {
    $python = (Get-Command py -ErrorAction SilentlyContinue).source
}
if (-not $python) {
    $python = (Get-Command python3 -ErrorAction SilentlyContinue).source
}
if (-not $python) {
    # Ask the user to provide a path to python
    Write-Host "Python cannot be detected." -ForegroundColor Yellow
    $python = Read-Host "Provide the path to python, or leave empty to exit"
    if ($python -eq "") {
        Write-Host "Python cannot be detected. Please visit https://www.python.org/downloads/ to download and install Python." -ForegroundColor Red
        exit 1
    }
}

# Create a virtual environment if it doesn't exist
$venvPath = ".\.venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "Creating a virtual environment..."
    & $python -m venv $venvPath
    if (-not (Test-Path $venvPath)) {
        Write-Host "Failed to create a virtual environment. Please ensure Python is installed correctly." -ForegroundColor Red
        exit 1
    }
    Write-Host "Virtual environment created at $venvPath." -ForegroundColor Green
}

# Activate the virtual environment
$activateScript = Join-Path $venvPath "Scripts\Activate.ps1"
if (-not (Test-Path $activateScript)) {
    Write-Host "Activation script not found. Ensure the virtual environment was created successfully." -ForegroundColor Red
    exit 1
}
& $activateScript
Write-Host "Virtual environment activated." -ForegroundColor Green

# Ask the user if they want to use bertopic
$bertopic = Read-Host "Do you want to use topic modelling? [y/N]"

# Ask the user if they want to use hdbscan
$hdbscan = Read-Host "Do you want to install hdbscan? (for repository developers) [y/N]"

# Install the required packages from requirements.txt
Write-Host "Installing required packages in the virtual environment..."
& python -m ensurepip --upgrade
& python -m pip install --upgrade pip
& python -m pip install -r requirements.txt

if ($bertopic -eq "y") {
    & python -m pip install -r requirements.bertopic.txt
}

if ($hdbscan -eq "y") {
    & python -m pip install -r requirements.hdbscan.txt
}

Write-Host "All required packages have been installed in the virtual environment." -ForegroundColor Green
