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

# Check if "pip" or "pip3" is available
$pip = (Get-Command -Name pip -ErrorAction SilentlyContinue).Source
if (-not $pip) {
    $pip = (Get-Command -Name pip3 -ErrorAction SilentlyContinue).Source
}
if (-not $pip) {
    # Ask the user to provide a path to pip
    Write-Host "pip cannot be detected." -ForegroundColor Yellow
    $pip = Read-Host "Provide the path to pip, or leave empty to install pip"
    if ($pip -eq "") {
        Write-Host "Installing pip..."
        & $python -m ensurepip
        $pip = (Get-Command -Name pip -ErrorAction SilentlyContinue).Source
        if (-not $pip) {
            Write-Host "pip cannot be installed. Please follow https://pip.pypa.io/en/stable/installation/ to install pip." -ForegroundColor Red
            exit 1
        }
        Write-Host "pip has been installed." -ForegroundColor Green
    }
}

# Install the required packages from requirements.txt
Write-Host "Installing required packages..."
& $pip install -r requirements.txt

# Ask the user if they want to use hdbscan
Clear-Host
$hdbscan = Read-Host "Do you want to use hdbscan? [y/N]"
if ($hdbscan -eq "y") {
    & $pip install -r requirements.hdbscan.txt
}

# Ask the user if they want to use bertopic
Clear-Host
$bertopic = Read-Host "Do you want to use bertopic? [y/N]"
if ($bertopic -eq "y") {
    & $pip install -r requirements.bertopic.txt
}

Write-Host "All required packages have been installed." -ForegroundColor Green
