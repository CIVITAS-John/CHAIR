@echo off
setlocal enabledelayedexpansion

set DEV_MODE=false
set FILE=

:: Parse arguments
:parse_args
if "%~1"=="" goto :done_args
if "%~1"=="--dev" (
    set DEV_MODE=true
    shift
    goto :parse_args
)
set FILE=%~1
shift
goto :parse_args

:done_args
if not defined FILE (
    echo Usage: scripts\run.bat [--dev] ^<path-to-ts-file^>
    echo.
    echo Examples:
    echo   scripts\run.bat examples\example-automatic.ts
    echo   scripts\run.bat --dev examples\example-automatic.ts
    echo.
    echo Options:
    echo   --dev    Rebuild the project before running ^(for development^)
    exit /b 1
)

if not exist "%FILE%" (
    echo Error: File not found: %FILE%
    exit /b 1
)

if "%DEV_MODE%"=="true" (
    echo [dev] Rebuilding project...
    call npm run build
    if %errorlevel% neq 0 (
        echo Build failed. Please check the error messages above.
        exit /b 1
    )
    echo [dev] Build complete.
    echo.
)

echo Running %FILE%...
call npx tsx "%FILE%"

endlocal
