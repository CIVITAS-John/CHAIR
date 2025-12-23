@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Setup Script for LLM-Qualitative Project
echo ========================================
echo.

:: Step 1: Check and setup Node.js
echo [1/4] Checking Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js cannot be detected.
    echo Please visit https://nodejs.org/en/download to download and install Node.js.
    exit /b 1
)

:: Check Node.js version (v20+)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo Node.js version: %NODE_VERSION%

:: Extract major version number (handle v20.x.x, v22.x.x, etc.)
:: Remove the 'v' prefix and extract the major version
set NODE_VERSION_NUM=%NODE_VERSION:~1%
for /f "tokens=1 delims=." %%i in ("%NODE_VERSION_NUM%") do set MAJOR_VERSION=%%i
if %MAJOR_VERSION% lss 20 (
    echo Node.js is outdated. Please visit https://nodejs.org/en/download to download and install Node.js v20 or later.
    exit /b 1
)
echo Node.js version is compatible.
echo.

:: Step 2: Setup environment file
echo [2/4] Setting up environment file...
if exist .env (
    echo .env file already exists.
) else (
    echo Creating .env file...
    echo # API Keys for LLM providers > .env
    echo. >> .env

    set /p "openai_key=Enter your OpenAI API key (leave blank if not applicable): "
    if defined openai_key (
        echo OPENAI_API_KEY=!openai_key! >> .env
    ) else (
        echo OPENAI_API_KEY={Your OpenAI API key} >> .env
    )

    set /p "anthropic_key=Enter your Anthropic API key (leave blank if not applicable): "
    if defined anthropic_key (
        echo ANTHROPIC_API_KEY=!anthropic_key! >> .env
    ) else (
        echo ANTHROPIC_API_KEY={Your Anthropic API key} >> .env
    )

    set /p "mistral_key=Enter your Mistral API key (leave blank if not applicable): "
    if defined mistral_key (
        echo MISTRAL_API_KEY=!mistral_key! >> .env
    ) else (
        echo MISTRAL_API_KEY={Your Mistral API key} >> .env
    )

    set /p "groq_key=Enter your Groq API key (leave blank if not applicable): "
    if defined groq_key (
        echo GROQ_API_KEY=!groq_key! >> .env
    ) else (
        echo GROQ_API_KEY={Your Groq API key} >> .env
    )

    set /p "google_key=Enter your Google Generative API key (leave blank if not applicable): "
    if defined google_key (
        echo GOOGLE_API_KEY=!google_key! >> .env
    ) else (
        echo GOOGLE_API_KEY={Your Google API key} >> .env
    )

    set /p "ollama_url=If you are using Llama.cpp or LMStudio with a custom endpoint, please provide the URL (leave blank if not applicable): "
    if defined ollama_url (
        echo OLLAMA_URL=!ollama_url! >> .env
    )

    echo .env file has been created successfully.
)
echo.

:: Step 3: Install Node.js dependencies
echo [3/4] Installing Node.js dependencies...
call npm install
if %errorlevel% neq 0 (
    echo Failed to install Node.js dependencies.
    exit /b 1
)
echo Node.js dependencies installed successfully.
echo.

:: Build the project
echo Building the project...
call npm run build
if %errorlevel% neq 0 (
    echo Build failed. Please check the error messages above.
    exit /b 1
)
echo Project has been built successfully.
echo.

:: Step 4: Setup Python environment
echo [4/4] Setting up Python environment...

:: Check if Python is available
where python >nul 2>nul
if %errorlevel% equ 0 (
    set PYTHON_CMD=python
    goto :python_found
)
where py >nul 2>nul
if %errorlevel% equ 0 (
    set PYTHON_CMD=py
    goto :python_found
)
where python3 >nul 2>nul
if %errorlevel% equ 0 (
    set PYTHON_CMD=python3
    goto :python_found
)

echo Python cannot be detected.
set /p "python_path=Provide the path to Python, or leave empty to skip Python setup: "
if not defined python_path (
    echo Skipping Python setup. You can run this script again later to set up Python.
    goto :finish
)
set PYTHON_CMD=%python_path%

:python_found
echo Python found: %PYTHON_CMD%

:: Create virtual environment
if not exist .venv (
    echo Creating Python virtual environment...
    %PYTHON_CMD% -m venv .venv
    if not exist .venv (
        echo Failed to create virtual environment. Please ensure Python is installed correctly.
        echo Continuing without Python setup...
        goto :finish
    )
    echo Virtual environment created successfully.
)

:: Activate virtual environment
if exist .venv\Scripts\activate.bat (
    call .venv\Scripts\activate.bat
    echo Virtual environment activated.
) else (
    echo Warning: Could not activate virtual environment.
    echo Continuing without activation...
)

:: Upgrade pip
echo Upgrading pip...
%PYTHON_CMD% -m ensurepip --upgrade >nul 2>nul
%PYTHON_CMD% -m pip install --upgrade pip >nul 2>nul

:: Install Python dependencies
if exist requirements.txt (
    echo Installing Python dependencies...
    %PYTHON_CMD% -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo Warning: Some Python packages may not have been installed correctly.
    )
)

:: Optional: Install topic modeling dependencies
set /p "bertopic=Do you want to use topic modelling? [y/N]: "
if /i "%bertopic%"=="y" (
    if exist requirements.bertopic.txt (
        echo Installing topic modeling dependencies...
        %PYTHON_CMD% -m pip install -r requirements.bertopic.txt
    )
)

:: Optional: Install hdbscan for developers
set /p "hdbscan=Do you want to install hdbscan? (for repository developers) [y/N]: "
if /i "%hdbscan%"=="y" (
    if exist requirements.hdbscan.txt (
        echo Installing hdbscan dependencies...
        %PYTHON_CMD% -m pip install -r requirements.hdbscan.txt
    )
)

echo Python environment setup complete.
echo.

:finish
echo ========================================
echo Setup completed successfully!
echo ========================================
echo.
echo To activate the Python virtual environment later, run:
echo   .venv\Scripts\activate.bat
echo.
echo To build the project, run:
echo   npm run build
echo.
echo To run tests, use:
echo   npm test
echo.

endlocal