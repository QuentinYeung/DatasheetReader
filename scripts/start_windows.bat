@echo off
setlocal
cd /d "%~dp0.."

if not exist ".venv\Scripts\python.exe" (
  echo The Python environment is missing. Run scripts\setup_windows.bat first.
  pause
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo Frontend packages are missing. Run scripts\setup_windows.bat first.
  pause
  exit /b 1
)

start "Datasheet Reader API" cmd /k "cd /d ""%CD%"" && .venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000"
start "Datasheet Reader Web" cmd /k "cd /d ""%CD%\frontend"" && npm run dev"

echo Starting Datasheet Reader...
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173"

echo Two command windows are running the program.
echo Close both command windows when you finish using Datasheet Reader.
endlocal
