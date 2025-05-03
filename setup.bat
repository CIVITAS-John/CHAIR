@echo off

echo Setting up Python environment...
powershell -ExecutionPolicy Bypass -File scripts\setup-python.ps1
if %errorlevel% neq 0 (
   pause
   exit /b %errorlevel%
)

echo Setting up Node.js environment...
powershell -ExecutionPolicy Bypass -File scripts\setup-node.ps1
if %errorlevel% neq 0 (
   pause
   exit /b %errorlevel%
)

echo Setting up .env file...
powershell -ExecutionPolicy Bypass -File scripts\setup-env.ps1
if %errorlevel% neq 0 (
   pause
   exit /b %errorlevel%
)

pause
