@echo off
REM 启动带远程调试端口的 Chrome / Edge，供 TBFiller 自动填表使用
REM 端口和 profile 目录与 backend 的环境变量保持一致

set DEBUG_PORT=9222
set PROFILE_DIR=%~dp0..\tb-browser-profile

if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

REM 优先 Chrome
set "EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%EXE%" set "EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%EXE%" set "EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"

REM 没有 Chrome 退回 Edge
if not exist "%EXE%" set "EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EXE%" set "EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if not exist "%EXE%" (
    echo [错误] 未找到 Chrome 或 Edge
    pause
    exit /b 1
)

echo 启动浏览器：%EXE%
echo 调试端口：%DEBUG_PORT%
echo Profile：%PROFILE_DIR%
echo.
echo 浏览器打开后请先扫码登录 Teambition，登录态会保存在 profile 目录下，下次复用。
echo 关闭浏览器窗口即停止调试模式。

start "" "%EXE%" --remote-debugging-port=%DEBUG_PORT% --user-data-dir="%PROFILE_DIR%" https://www.teambition.com/
