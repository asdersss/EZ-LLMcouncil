#!/bin/bash

# 设置颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================"
echo "  LLM 委员会简化版 - 启动脚本"
echo "========================================"
echo ""

# [1/7] 检查配置文件
echo "[1/7] 检查配置文件..."
if [ ! -f "backend/config.json" ]; then
    if [ -f "backend/config.example.json" ]; then
        echo -e "${YELLOW}[配置] 未找到 config.json，从模板复制...${NC}"
        cp "backend/config.example.json" "backend/config.json"
        echo -e "${GREEN}[提示] 已创建 backend/config.json，请编辑此文件填入您的 API 密钥${NC}"
        echo -e "${YELLOW}[提示] 按任意键继续启动，或按 Ctrl+C 退出先配置 API 密钥...${NC}"
        read -n 1 -s
    else
        echo -e "${RED}[错误] 未找到配置文件模板 backend/config.example.json${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}[跳过] 配置文件已存在${NC}"
fi

# [1.5/7] 检查文件元数据
echo "[1.5/7] 检查文件元数据..."
if [ ! -f "backend/backend/file_metadata.json" ]; then
    if [ -f "backend/backend/file_metadata.example.json" ]; then
        echo -e "${YELLOW}[配置] 未找到 file_metadata.json，从模板复制...${NC}"
        cp "backend/backend/file_metadata.example.json" "backend/backend/file_metadata.json"
        echo -e "${GREEN}[完成] 已创建 backend/backend/file_metadata.json${NC}"
    else
        echo -e "${RED}[错误] 未找到文件元数据模板 backend/backend/file_metadata.example.json${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}[跳过] 文件元数据已存在${NC}"
fi

# [1.6/7] 检查供应商配置
echo "[1.6/7] 检查供应商配置..."
if [ ! -f "backend/providers.json" ]; then
    if [ -f "backend/providers.example.json" ]; then
        echo -e "${YELLOW}[配置] 未找到 providers.json，从模板复制...${NC}"
        cp "backend/providers.example.json" "backend/providers.json"
        echo -e "${GREEN}[完成] 已创建 backend/providers.json${NC}"
    else
        echo -e "${RED}[错误] 未找到供应商配置模板 backend/providers.example.json${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}[跳过] 供应商配置已存在${NC}"
fi

# [2/7] 检查环境
echo "[2/7] 检查环境..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[错误] 未找到 Python，请先安装 Python 3.10+${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}[错误] 未找到 Node.js，请先安装 Node.js 18+${NC}"
    exit 1
fi

# [3/7] 检查后端依赖
echo "[3/7] 检查后端依赖..."
cd backend
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}[安装] 创建 Python 虚拟环境...${NC}"
    python3 -m venv venv
fi

source venv/bin/activate

# 检查关键后端依赖
missing_backend_deps=0
pip show fastapi &> /dev/null || missing_backend_deps=1
pip show python-multipart &> /dev/null || missing_backend_deps=1
pip show httpx &> /dev/null || missing_backend_deps=1

if [ $missing_backend_deps -eq 1 ]; then
    echo -e "${YELLOW}[安装] 检测到缺失依赖，安装后端依赖包...${NC}"
    pip install -r requirements.txt
else
    echo -e "${GREEN}[跳过] 后端依赖已安装${NC}"
fi
cd ..

# [4/7] 检查前端依赖
echo "[4/7] 检查前端依赖..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[安装] 安装前端依赖包...${NC}"
    npm install
else
    # 检查关键依赖是否存在
    missing_deps=0
    [ ! -d "node_modules/react" ] && missing_deps=1
    [ ! -d "node_modules/katex" ] && missing_deps=1
    [ ! -d "node_modules/react-markdown" ] && missing_deps=1
    [ ! -d "node_modules/remark-math" ] && missing_deps=1
    [ ! -d "node_modules/rehype-katex" ] && missing_deps=1
    [ ! -d "node_modules/mermaid" ] && missing_deps=1
    [ ! -d "node_modules/react-mermaid2" ] && missing_deps=1
    [ ! -d "node_modules/react-syntax-highlighter" ] && missing_deps=1

    if [ $missing_deps -eq 1 ]; then
        echo -e "${YELLOW}[安装] 检测到缺失依赖，重新安装...${NC}"
        npm install
    else
        echo -e "${GREEN}[跳过] 前端依赖已安装${NC}"
    fi
fi
cd ..

# [5/7] 启动后端服务
echo "[5/7] 启动后端服务..."
cd backend
source venv/bin/activate
nohup uvicorn main:app --reload --host 0.0.0.0 --port 8007 > ../backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}后端服务已启动 (PID: $BACKEND_PID)${NC}"
cd ..

# [6/7] 等待后端启动
echo "[6/7] 等待后端启动..."
sleep 3

# [7/7] 启动前端服务
echo "[7/7] 启动前端服务..."
cd frontend
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}前端服务已启动 (PID: $FRONTEND_PID)${NC}"
cd ..

echo ""
echo "========================================"
echo "  服务启动完成！"
echo "========================================"
echo "  后端 API: http://localhost:8007"
echo "  API 文档: http://localhost:8007/docs"
echo "  前端界面: http://localhost:5173"
echo "========================================"
echo ""
echo "日志文件："
echo "  后端日志: backend.log"
echo "  前端日志: frontend.log"
echo ""
echo "停止服务："
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "或使用以下命令查看进程："
echo "  ps aux | grep -E 'uvicorn|vite'"
echo "========================================"