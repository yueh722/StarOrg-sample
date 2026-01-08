@echo off
REM use 'npm install -g serve' to fix the issue that serve is not recognized as an internal or external command.

REM if you want to wait so long every time you start test web, you can comment the following line to avoid installing serve in case you already have done it before when you are trying to start test web.
cmd /c ..\nodejs\init.bat
serve -s dist