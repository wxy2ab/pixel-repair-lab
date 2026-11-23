@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "launcherResult=1"
pushd "%~dp0" || goto finish
"%SystemRoot%\System32\where.exe" /q node.exe
if errorlevel 1 goto missingNode
node.exe "scripts\local-game.mjs" setup %*
set "launcherResult=%errorlevel%"
goto restore

:missingNode
echo Install Node.js 22.12 or later with npm, then reopen Setup.cmd. 1>&2
:restore
popd
:finish
if not "%launcherResult%"=="0" if "%~1"=="" if not defined CI "%SystemRoot%\System32\timeout.exe" /t 30 2>nul
exit /b %launcherResult%
