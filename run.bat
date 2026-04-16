@echo off
title WebTools CMS Server
color 0A
echo.
echo  =========================================
echo   WebTools CMS - Website Re-generator
echo  =========================================
echo.
echo  [INFO] Dang kiem tra XAMPP MySQL...
sc query MySQL 2>nul | find "RUNNING" >nul 2>&1
if errorlevel 1 (
    echo  [WARN] MySQL chua chay - hay dam bao XAMPP MySQL da duoc bat!
    echo  [HINT] Mo XAMPP Control Panel va bat MySQL truoc khi chay.
    echo.
    pause
)

echo  [INFO] Dang khoi dong WebTools CMS Server...
echo  [INFO] Dashboard: http://localhost:3000
echo  [INFO] API Health: http://localhost:3000/api/health
echo.
echo  [TIP] Nhan Ctrl+C de dung server.
echo.

cd /d "%~dp0backend"
node src/app.js

echo.
echo  [INFO] Server da dung.
pause
