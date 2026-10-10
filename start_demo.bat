@echo off
title ShieldBin - Start Demo
echo ========================================================
echo        Starting ShieldBin Full-Stack Demo
echo   (FastAPI Backend + Live Webcam Frontend)
echo ========================================================
echo.

echo [1/2] Starting Backend Server on http://localhost:8000 ...
start "ShieldBin Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --reload --port 8000"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend Web Server on http://localhost:5173 ...
start "ShieldBin Frontend" cmd /k "cd /d "%~dp0frontend" && python -m http.server 5173"

timeout /t 1 /nobreak >nul

echo.
echo Opening browser to http://localhost:5173/standalone-test.html ...
start http://localhost:5173/standalone-test.html

echo.
echo ========================================================
echo   Demo is RUNNING!
echo   - Backend:  http://localhost:8000/docs
echo   - Frontend: http://localhost:5173/standalone-test.html
echo ========================================================
