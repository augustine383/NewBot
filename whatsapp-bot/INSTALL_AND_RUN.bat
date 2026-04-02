@echo off
title WhatsApp Bot - Setup & Run
color 0A

echo.
echo  ============================================
echo   WhatsApp Bot - Install ^& Setup
echo  ============================================
echo.

cd /d C:\Users\TGNE\Desktop\newbot\whatsapp-bot

:: Step 1 — Delete ghost folders if they exist
echo [1/5] Cleaning up ghost folders...
if exist "src\{bot" rd /s /q "src\{bot" 2>nul
if exist "src\{bot,db,admin" rd /s /q "src\{bot,db,admin" 2>nul
if exist "src\{src" rd /s /q "src\{src" 2>nul
echo       Done.

:: Step 2 — Set env vars to skip Puppeteer Chrome download
echo [2/5] Configuring environment...
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
set PUPPETEER_SKIP_DOWNLOAD=true
echo       Done.

:: Step 3 — Clean old node_modules to avoid permission errors
echo [3/5] Clearing old node_modules (this may take a moment)...
if exist "node_modules" (
  rmdir /s /q "node_modules" 2>nul
  if exist "node_modules" (
    echo       Warning: Could not fully remove node_modules. Trying with robocopy trick...
    md _empty_temp_
    robocopy _empty_temp_ node_modules /MIR /NFL /NDL /NJH /NJS >nul 2>&1
    rd /s /q _empty_temp_ 2>nul
    rd /s /q node_modules 2>nul
  )
)
echo       Done.

:: Step 4 — Install dependencies
echo [4/5] Installing dependencies (skip Puppeteer download)...
set npm_config_puppeteer_skip_chromium_download=true
npm install --ignore-scripts
if errorlevel 1 (
  echo.
  echo  ERROR: npm install failed. Check your internet connection.
  pause
  exit /b 1
)
echo       Done.

:: Step 5 — Run DB migration
echo [5/5] Setting up Neon database tables...
node src/db/migrate.js
if errorlevel 1 (
  echo.
  echo  ERROR: Database migration failed.
  echo  Check your DATABASE_URL in .env file.
  pause
  exit /b 1
)

echo.
echo  ============================================
echo   Setup Complete! Starting bot...
echo  ============================================
echo.
echo  Scan the QR code with WhatsApp when it appears.
echo  Admin panel: http://localhost:3001
echo.

npm run dev

pause
