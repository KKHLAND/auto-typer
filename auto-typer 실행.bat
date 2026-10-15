@echo off
chcp 65001 > nul
title auto-typer
cd /d "%~dp0"

where node > nul 2>&1
if errorlevel 1 (
  echo Node.js 가 필요합니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)

if not exist node_modules (
  echo 처음 실행: 필요한 부품을 설치합니다. 잠시만 기다려 주세요...
  call npm install
)

if not exist dist\index.html (
  echo 앱을 준비하는 중입니다. 1~2분 걸릴 수 있습니다...
  call npm run build
)

echo.
echo auto-typer 가 이 컴퓨터에서만 열립니다: http://127.0.0.1:5180
echo 이 창을 닫으면 앱이 종료됩니다.
echo.
start "" http://127.0.0.1:5180
call npx vite preview
