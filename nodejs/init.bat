@echo off
set "NODE_PATH_64=%ProgramFiles%\nodejs\node.exe"
set "NODE_PATH_32=%ProgramFiles(x86)%\nodejs\node.exe"

if exist "%NODE_PATH_64%" (
  set "NODE_PATH=%NODE_PATH_64%"
) else if exist "%NODE_PATH_32%" (
  set "NODE_PATH=%NODE_PATH_32%"
)

echo node: %NODE_PATH%
set "PATH=%NODE_PATH%;%PATH%"

echo npm install -g serve
npm install -g serve


