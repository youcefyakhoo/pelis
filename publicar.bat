@echo off
chcp 65001 >nul
title Pelis - publicar cambios
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No encuentro Node.js. Instalalo desde https://nodejs.org y vuelve a intentarlo.
  echo.
  pause
  exit /b 1
)
node scripts\publish.mjs %*
echo.
pause
