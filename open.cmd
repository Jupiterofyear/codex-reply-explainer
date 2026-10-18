@echo off
if not exist "%~dp0.local\open.cmd" (
  echo Run install.ps1 first.
  exit /b 1
)
call "%~dp0.local\open.cmd"
