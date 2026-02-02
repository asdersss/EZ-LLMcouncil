#!/bin/bash
echo "Starting LLM Council Frontend..."
cd frontend

echo "Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing all dependencies..."
    npm install
else
    echo "Verifying critical dependencies..."
    if ! npm list html2canvas >/dev/null 2>&1; then
        echo "Missing critical dependencies, reinstalling..."
        npm install
    else
        echo "Dependencies OK, checking for updates..."
        npm install --silent
    fi
fi

echo ""
echo "Starting development server..."
npm run dev