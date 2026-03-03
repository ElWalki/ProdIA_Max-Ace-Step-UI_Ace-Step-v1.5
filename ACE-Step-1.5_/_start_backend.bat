@echo off
chcp 65001 >nul 2>&1
title ACE-Step UI Backend
cd /d "%~dp0..\ace-step-ui\server"
echo Iniciando Backend en puerto 3001...
npm run dev
pause
