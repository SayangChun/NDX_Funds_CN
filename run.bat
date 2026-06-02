@echo off
chcp 65001 >nul
title Nasdaq-100

echo.
echo  ========================================
echo   Nasdaq-100 Index Funds CN
echo  ========================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found, please install https://nodejs.org
    pause
    exit /b 1
)

echo  Server: http://localhost:4173
echo  First load may take 5-20 seconds...
echo.
echo  Starting server...

start "Nasdaq100-Server" /MIN node index.mjs
timeout /T 5 /NOBREAK >nul
start "" http://localhost:4173

echo.
echo  Server started, browser opened.
echo  Close the server window or press Ctrl+C to stop.
echo.
pause