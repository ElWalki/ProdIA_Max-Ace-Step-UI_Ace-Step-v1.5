@echo off
chcp 65001 >nul 2>&1
title ACE-Step UI Frontend
cd /d "%~dp0..\ace-step-ui"
echo Iniciando Frontend en puerto 3000...
npm run dev
pause
