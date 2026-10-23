@echo off
echo ========================================================
echo   Starting GOD'S EYE via Docker Compose
echo ========================================================
echo.

cd /d "%~dp0"
docker compose up --build -d

echo.
echo ========================================================
echo Docker containers started!
echo Dashboard: http://localhost:8081
echo Health:    http://localhost:8081/health
echo ========================================================
pause
