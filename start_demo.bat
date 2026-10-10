@echo off
title ShieldBin - Start Demo
echo ========================================================
echo        Starting ShieldBin Full-Stack Demo
echo   (FastAPI Backend + Live Webcam Frontend)
echo ========================================================
echo.

set "PYTHON_EXE=%~dp0backend\.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

echo [1/2] Starting Backend Server on http://localhost:8000 ...
start "ShieldBin Backend" cmd /k "cd /d "%~dp0backend" && "%PYTHON_EXE%" -m uvicorn app.main:app --reload --port 8000"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend Web Server on http://localhost:5173 ...
if exist "%~dp0frontend\node_modules" (
    start "ShieldBin Frontend" cmd /k "cd /d "%~dp0frontend" && npm.cmd run dev"
    timeout /t 2 /nobreak >nul
    echo.
    echo Opening React Vite App at http://localhost:5173 ...
    start http://localhost:5173
) else (
    start "ShieldBin Frontend" cmd /k "cd /d "%~dp0frontend" && "%PYTHON_EXE%" -m http.server 5173"
    timeout /t 2 /nobreak >nul
    echo.
    echo Opening Standalone App at http://localhost:5173/standalone-test.html ...
    start http://localhost:5173/standalone-test.html
)

echo.
echo ========================================================
echo   Demo is RUNNING!
echo   - App UI:   http://localhost:5173
echo   - Backend:  http://localhost:8000/docs
echo   - Test UI:  http://localhost:5173/standalone-test.html
echo ========================================================

