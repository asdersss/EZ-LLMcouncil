@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo ========================================
echo   LLM 委员会简化版 - 启动脚本
echo ========================================
echo.

echo [1/7] 检查配置文件...
if not exist "backend\config.json" (
    if exist "backend\config.example.json" (
        echo [配置] 未找到 config.json，从模板复制...
        copy "backend\config.example.json" "backend\config.json" >nul
        echo [提示] 已创建 backend\config.json，请编辑此文件填入您的 API 密钥
        echo [提示] 按任意键继续启动，或关闭窗口先配置 API 密钥...
        pause
    ) else (
        echo [错误] 未找到配置文件模板 backend\config.example.json
        pause
        exit /b 1
    )
) else (
    echo [跳过] 配置文件已存在
)

echo [1.5/7] 检查文件元数据...
if not exist "backend\backend\file_metadata.json" (
    if exist "backend\backend\file_metadata.example.json" (
        echo [配置] 未找到 file_metadata.json，从模板复制...
        copy "backend\backend\file_metadata.example.json" "backend\backend\file_metadata.json" >nul
        echo [完成] 已创建 backend\backend\file_metadata.json
    ) else (
        echo [错误] 未找到文件元数据模板 backend\backend\file_metadata.example.json
        pause
        exit /b 1
    )
) else (
    echo [跳过] 文件元数据已存在
)

echo [1.6/7] 检查供应商配置...
if not exist "backend\providers.json" (
    if exist "backend\providers.example.json" (
        echo [配置] 未找到 providers.json，从模板复制...
        copy "backend\providers.example.json" "backend\providers.json" >nul
        echo [完成] 已创建 backend\providers.json
    ) else (
        echo [错误] 未找到供应商配置模板 backend\providers.example.json
        pause
        exit /b 1
    )
) else (
    echo [跳过] 供应商配置已存在
)

echo [2/7] 检查环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.10+
    pause
    exit /b 1
)

node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 18+
    pause
    exit /b 1
)

echo [3/7] 检查后端依赖...
cd backend
if not exist "venv\" (
    echo [安装] 创建 Python 虚拟环境...
    python -m venv venv
)

call venv\Scripts\activate.bat

REM 检查关键后端依赖
set missing_backend_deps=0
pip show fastapi >nul 2>&1
if errorlevel 1 set missing_backend_deps=1
pip show python-multipart >nul 2>&1
if errorlevel 1 set missing_backend_deps=1
pip show httpx >nul 2>&1
if errorlevel 1 set missing_backend_deps=1

if !missing_backend_deps!==1 (
    echo [安装] 检测到缺失依赖，安装后端依赖包...
    pip install -r requirements.txt
) else (
    echo [跳过] 后端依赖已安装
)
cd ..

echo [4/7] 检查前端依赖...
cd frontend
if not exist "node_modules\" (
    echo [安装] 安装前端依赖包...
    npm install
    goto :frontend_done
)

REM 检查关键依赖是否存在
set missing_deps=0
if not exist "node_modules\react\" set missing_deps=1
if not exist "node_modules\katex\" set missing_deps=1
if not exist "node_modules\react-markdown\" set missing_deps=1
if not exist "node_modules\remark-math\" set missing_deps=1
if not exist "node_modules\rehype-katex\" set missing_deps=1
if not exist "node_modules\mermaid\" set missing_deps=1
if not exist "node_modules\react-mermaid2\" set missing_deps=1
if not exist "node_modules\react-syntax-highlighter\" set missing_deps=1

if !missing_deps!==1 (
    echo [安装] 检测到缺失依赖，重新安装...
    npm install
) else (
    echo [跳过] 前端依赖已安装
)

:frontend_done
cd ..

echo [5/7] 启动后端服务...
start "LLM Council Backend" cmd /k "cd backend && call venv\Scripts\activate.bat && uvicorn main:app --reload --host 0.0.0.0 --port 8007"

echo [6/7] 等待后端启动...
timeout /t 3 /nobreak >nul

echo [7/7] 启动前端服务...
start "LLM Council Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo   服务启动完成！
echo ========================================
echo   后端 API: http://localhost:8007
echo   API 文档: http://localhost:8007/docs
echo   前端界面: http://localhost:5173
echo ========================================
echo.
echo 按任意键关闭此窗口...
pause >nul