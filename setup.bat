@echo off

echo Setting up Python environment...
powershell -ExecutionPolicy Bypass -File scripts\setup-python.ps1

echo Setting up Node.js environment...
powershell -ExecutionPolicy Bypass -File scripts\setup-node.ps1

pause
