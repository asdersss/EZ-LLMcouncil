#!/bin/bash
echo "Starting LLM Council Backend..."
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8007