@echo off
echo ========================================================
echo   Starting GOD'S EYE (Insight Hub) Dashboard
echo ========================================================
echo.

set "PROJECT_DIR=%~dp0"

echo Starting Backend Service on http://localhost:5000 ...
start "Gods Eye - Backend" cmd /k "cd /d "%PROJECT_DIR%backend" && npm run dev"

timeout /t 2 /nobreak >nul

echo Starting Frontend Service on http://localhost:5173 ...
start "Gods Eye - Frontend" cmd /k "cd /d "%PROJECT_DIR%Frontend" && npm run dev"

echo.
echo ========================================================
echo Both services are launching!
echo Backend:  http://localhost:5000/api/health
echo Frontend: http://localhost:5173
echo ========================================================
pause
