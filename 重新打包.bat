@echo off
chcp 65001 >nul
echo ========================================
echo   EZ LLM 委员会 - 重新打包脚本
echo ========================================
echo.

echo [1/3] 构建前端项目...
cd frontend
call npm run build
if errorlevel 1 (
    echo [错误] 前端构建失败
    pause
    exit /b 1
)
cd ..

echo.
echo [2/3] 激活虚拟环境并打包...
cd backend
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo [错误] 虚拟环境激活失败
    pause
    exit /b 1
)

echo.
echo [3/3] 执行 PyInstaller 打包...
pyinstaller build.spec
if errorlevel 1 (
    echo [错误] 打包失败
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo   打包完成！
echo ========================================
echo   可执行文件位置: backend\dist\LLMCouncil.exe
echo ========================================
echo.
echo 按任意键关闭此窗口...
pause >nul