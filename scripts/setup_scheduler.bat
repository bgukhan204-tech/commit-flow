@echo off
title CommitFlow - Daily Scheduler Setup
echo ===================================================
echo  CommitFlow - Automated 10 Daily Commits Scheduler
echo ===================================================
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0setup_scheduler.ps1"
echo.
pause
