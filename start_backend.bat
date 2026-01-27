@echo off
echo ========================================
echo   启动 LLM Council 后端服务
echo ========================================
echo.

cd backend

echo 检查依赖包...
python -c "import fastapi" 2>nul
if errorlevel 1 (
    echo.
    echo [警告] 依赖包未安装，正在安装...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo [错误] 依赖包安装失败，请手动运行: pip install -r requirements.txt
        pause
        exit /b 1
    )
)

echo.
echo 启动服务器...
echo 访问地址: http://localhost:8007
echo API 文档: http://localhost:8007/docs
echo.
echo 按 Ctrl+C 停止服务器
echo.

uvicorn main:app --reload --host 0.0.0.0 --port 8007

pause