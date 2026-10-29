@echo off
setlocal
cd /d "%~dp0.."

echo [1/4] Checking Python...
where py >nul 2>nul
if errorlevel 1 (
  echo Python Launcher was not found. Install Python 3.12 from python.org first.
  exit /b 1
)

echo [2/4] Checking Node.js...
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js 22 LTS from nodejs.org first.
  exit /b 1
)

echo [3/4] Installing Python packages...
if not exist ".venv\Scripts\python.exe" py -3 -m venv .venv
if errorlevel 1 exit /b 1
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 exit /b 1
".venv\Scripts\python.exe" -m pip install -r backend\requirements-dev.txt
if errorlevel 1 exit /b 1

echo [4/4] Installing frontend packages...
pushd frontend
call npm ci
if errorlevel 1 (
  popd
  exit /b 1
)
popd

echo.
echo Setup completed. Run scripts\start_windows.bat next.
endlocal
