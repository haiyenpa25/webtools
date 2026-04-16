@echo off
title WebTools CMS - Restart
color 0E
echo.
echo  =========================================
echo   WebTools CMS - RESTART SERVER
echo  =========================================
echo.

echo  [1/3] Dang tim va tat process Node.js tren port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    echo  [INFO] Tim thay PID: %%a - Dang kill...
    taskkill /PID %%a /F >nul 2>&1
)

echo  [2/3] Cho 2 giay...
timeout /t 2 /nobreak >nul

echo  [3/3] Dang khoi dong lai server...
echo.
echo  [INFO] Dashboard: http://localhost:3000
echo  [INFO] Nhan Ctrl+C de dung server.
echo.

cd /d "%~dp0backend"
node src/app.js

echo.
echo  [INFO] Server da dung.
pause
