"""
FastAPI 应用主入口
提供 RESTful API 和 SSE 流式接口
"""

import json
import logging
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
import os
import shutil
from typing import Tuple

from models import ChatRequest, Conversation, Message, get_iso_timestamp
from pydantic import BaseModel, Field
from storage import (
    save_conversation,
    load_conversation,
    list_conversations,
    delete_conversation,
    generate_conversation_title,
    generate_ai_title
)
from council import run_council
from file_storage import (
    calculate_md5,
    get_file_by_md5,
    add_file,
    get_all_files,
    delete_file as delete_file_from_storage,
    get_file_path,
    update_last_accessed
)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(
    title="LLM Council Simplified",
    description="简化版 LLM 委员会系统 - 四阶段协作式 AI 对话",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_config() -> Dict[str, Any]:
    """加载配置文件"""
    try:
        # 尝试多个可能的配置文件路径
        config_paths = [
            "config.json",  # 当前目录(backend/)
            "backend/config.json",  # 从项目根目录
            "../backend/config.json"  # 从其他目录
        ]
        
        for config_path in config_paths:
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    logger.info(f"成功加载配置文件: {config_path}")
                    return json.load(f)
            except FileNotFoundError:
                continue
        
        logger.error("未找到配置文件")
        return {"models": [], "chairman": "", "settings": {}}
    except Exception as e:
        logger.error(f"加载配置文件失败: {e}")
        return {"models": [], "chairman": "", "settings": {}}


def format_sse(event: str, data: dict) -> str:
    """
    格式化 SSE 事件
    
    Args:
        event: 事件名称
        data: 事件数据
    
    Returns:
        格式化的 SSE 字符串
    """
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def chat_stream_generator(request: ChatRequest, config: Dict[str, Any]):
    """
    聊天流式生成器
    
    Args:
        request: 聊天请求
        config: 配置信息
    
    Yields:
        SSE 格式的事件流
    """
    try:
        # 1. 加载或创建对话
        conv_id = request.conv_id or str(uuid.uuid4())
        conversation = load_conversation(conv_id)
        
        if conversation:
            logger.info(f"加载已有对话: {conv_id}")
        else:
            logger.info(f"创建新对话: {conv_id}")
            conversation = {
                "id": conv_id,
                "title": generate_conversation_title(request.content),
                "created_at": get_iso_timestamp(),
                "updated_at": get_iso_timestamp(),
                "messages": []
            }
        
        # 2. 检查最后一条消息是否已经是用户消息（编辑场景）
        messages = conversation.get("messages", [])
        last_message = messages[-1] if messages else None
        
        # 如果最后一条消息是用户消息且内容匹配，说明是编辑后重新生成，不需要再添加
        if last_message and last_message.get("role") == "user" and last_message.get("content") == request.content:
            logger.info(f"检测到编辑场景，使用已有的用户消息")
            user_message = last_message
        else:
            # 正常场景，添加新的用户消息
            user_message = {
                "role": "user",
                "content": request.content,
                "models": request.models,
                "attachments": [att.model_dump() for att in request.attachments] if request.attachments else [],
                "timestamp": get_iso_timestamp()
            }
            conversation["messages"].append(user_message)
            logger.info(f"添加新的用户消息")
        
        # 3. 准备模型配置和设置
        model_configs = {m["name"]: m for m in config.get("models", [])}
        chairman = config.get("chairman", "")
        settings = config.get("settings", {})
        temperature = settings.get("temperature", 0.7)
        timeout = settings.get("timeout", 120)
        max_retries = settings.get("max_retries", 3)
        max_concurrent = settings.get("max_concurrent", 10)
        
        # 4. 提取历史消息
        history = conversation["messages"]
        
        # 5. 准备附件数据
        attachments = None
        if request.attachments:
            attachments = [att.model_dump() for att in request.attachments]
        
        # 6. Stage 1 开始
        yield format_sse("stage1_start", {"message": "开始 Stage 1: 并行查询模型"})
        
        # 导入 council 模块并执行四阶段流程
        from council_streaming import collect_responses_with_progress
        from council import collect_scores, synthesize_final, calculate_final_ranking, build_context
        
        # 构建上下文
        context = build_context(history[:-1], max_turns=3)  # 排除刚添加的用户消息
        
        # Stage 1: 收集响应 - 使用生成器方式实时返回进度
        stage1_results = []
        async for result in collect_responses_with_progress(
            query=request.content,
            context=context,
            attachments=attachments,
            models=request.models,
            model_configs=model_configs,
            temperature=temperature,
            timeout=timeout,
            max_retries=max_retries,
            max_concurrent=max_concurrent
        ):
            # 检查是否是重试进度事件
            if result.get("type") == "retry":
                # 发送重试进度
                yield format_sse("stage1_progress", {
                    "model": result["model"],
                    "status": "retrying",
                    "current_retry": result["current_retry"],
                    "max_retries": result["max_retries"]
                })
            else:
                # 实时发送每个模型的响应进度
                yield format_sse("stage1_progress", {
                    "model": result["model"],
                    "status": "completed" if not result.get("error") else "error",
                    "response": result.get("response", ""),
                    "error": result.get("error")
                })
                stage1_results.append(result)
        
        # Stage 1 完成
        yield format_sse("stage1_complete", {"results": stage1_results})
        
        # 7. Stage 2 开始
        yield format_sse("stage2_start", {"message": "开始 Stage 2: 匿名同行评审"})
        
        # Stage 2: 收集打分 - 使用生成器方式实时返回进度
        from council import collect_scores_with_progress
        
        stage2_results = []
        async for result in collect_scores_with_progress(
            query=request.content,
            stage1_results=stage1_results,
            context=context,
            models=request.models,
            model_configs=model_configs,
            temperature=temperature,
            timeout=timeout,
            max_retries=max_retries,
            max_concurrent=max_concurrent
        ):
            # 检查是否是 label_mapping 消息
            if result.get("type") == "label_mapping":
                # 发送 label_to_model 映射
                yield format_sse("stage2_label_mapping", {
                    "label_to_model": result.get("label_to_model", {})
                })
            else:
                # 发送每个模型的打分进度
                yield format_sse("stage2_progress", {
                    "model": result["model"],
                    "status": "completed" if not result.get("error") else "error",
                    "scores": result.get("scores", {}),
                    "raw_text": result.get("raw_text", ""),
                    "label_to_model": result.get("label_to_model", {}),
                    "participated": result.get("participated"),
                    "skip_reason": result.get("skip_reason"),
                    "error": result.get("error")
                })
                stage2_results.append(result)
        
        # Stage 2 完成
        yield format_sse("stage2_complete", {"results": stage2_results})
        
        # 8. Stage 3 开始
        yield format_sse("stage3_start", {"message": "开始 Stage 3: 主席综合答案"})
        
        # 发送 Stage 3 进度 - 主席模型开始处理
        yield format_sse("stage3_progress", {
            "model": chairman,
            "status": "processing"
        })
        
        # Stage 3: 综合答案
        stage3_result = await synthesize_final(
            query=request.content,
            stage1_results=stage1_results,
            stage2_results=stage2_results,
            context=context,
            chairman_model=chairman,
            model_configs=model_configs,
            temperature=temperature,
            timeout=timeout,
            max_retries=max_retries
        )
        
        # 发送 Stage 3 进度 - 主席模型完成
        yield format_sse("stage3_progress", {
            "model": chairman,
            "status": "completed" if not stage3_result.get("error") else "error",
            "error": stage3_result.get("error")
        })
        
        # Stage 3 完成
        yield format_sse("stage3_complete", stage3_result)
        
        # 8. Stage 4 开始
        yield format_sse("stage4_start", {"message": "开始 Stage 4: 汇总打分和排名"})
        
        # 发送 Stage 4 进度 - 开始计算排名
        yield format_sse("stage4_progress", {
            "status": "processing",
            "message": "正在计算排名..."
        })
        
        # Stage 4: 汇总打分和排名
        stage4_result = await calculate_final_ranking(
            stage1_results=stage1_results,
            stage2_results=stage2_results
        )
        
        # 发送 Stage 4 进度 - 完成
        yield format_sse("stage4_progress", {
            "status": "completed" if not stage4_result.get("error") else "error",
            "error": stage4_result.get("error")
        })
        
        # Stage 4 完成
        yield format_sse("stage4_complete", stage4_result)
        
        # 9. 保存助手消息
        assistant_message = {
            "role": "assistant",
            "stage1": stage1_results,
            "stage2": stage2_results,
            "stage3": stage3_result,
            "stage4": stage4_result,
            "timestamp": get_iso_timestamp()
        }
        conversation["messages"].append(assistant_message)
        
        # 10. 如果是第一轮对话，使用AI生成标题
        if len(conversation["messages"]) == 2:  # 一条用户消息 + 一条助手消息
            try:
                ai_title = await generate_ai_title(
                    query=request.content,
                    response=stage3_result.get("response", ""),
                    chairman_model=chairman,
                    model_configs=model_configs
                )
                conversation["title"] = ai_title
                logger.info(f"AI生成对话标题: {ai_title}")
            except Exception as e:
                logger.warning(f"AI生成标题失败，使用默认标题: {e}")
        
        # 11. 更新对话时间戳
        conversation["updated_at"] = get_iso_timestamp()
        
        # 12. 保存对话
        save_conversation(conv_id, conversation)
        
        # 13. 发送完成事件（包含更新后的标题）
        yield format_sse("complete", {
            "conv_id": conv_id,
            "title": conversation.get("title", "新对话"),
            "message": "对话完成"
        })
        
    except Exception as e:
        logger.error(f"聊天流处理错误: {e}", exc_info=True)
        yield format_sse("error", {
            "error": str(e),
            "details": "处理请求时发生错误"
        })


@app.get("/api/chat/stream")
async def chat_stream(
    conv_id: str = Query(..., description="对话 ID"),
    content: str = Query(..., description="消息内容"),
    models: List[str] = Query(..., description="模型列表"),
    attachments: Optional[str] = Query(None, description="附件 JSON 字符串")
):
    """
    发送消息并获取流式响应 (GET 方式，用于 EventSource)
    
    Args:
        conv_id: 对话 ID
        content: 消息内容
        models: 模型列表
        attachments: 附件 JSON 字符串
    
    Returns:
        SSE 流式响应
    """
    try:
        # 解析附件
        parsed_attachments = None
        if attachments:
            try:
                parsed_attachments = json.loads(attachments)
            except json.JSONDecodeError:
                logger.warning(f"无法解析附件 JSON: {attachments}")
        
        # 构建请求对象
        request = ChatRequest(
            conv_id=conv_id,
            content=content,
            models=models,
            attachments=parsed_attachments
        )
        
        # 加载配置
        config = load_config()
        
        # 验证模型是否存在
        available_models = {m["name"] for m in config.get("models", [])}
        for model in request.models:
            if model not in available_models:
                raise HTTPException(
                    status_code=400,
                    detail=f"模型 '{model}' 不存在"
                )
        
        # 返回流式响应
        return StreamingResponse(
            chat_stream_generator(request, config),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        
    except ValidationError as e:
        logger.error(f"请求验证失败: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"聊天接口错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    发送消息并获取流式响应 (POST 方式，备用接口)
    
    Args:
        request: 聊天请求
    
    Returns:
        SSE 流式响应
    """
    try:
        # 加载配置
        config = load_config()
        
        # 验证模型是否存在
        available_models = {m["name"] for m in config.get("models", [])}
        for model in request.models:
            if model not in available_models:
                raise HTTPException(
                    status_code=400,
                    detail=f"模型 '{model}' 不存在"
                )
        
        # 返回流式响应
        return StreamingResponse(
            chat_stream_generator(request, config),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        
    except ValidationError as e:
        logger.error(f"请求验证失败: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"聊天接口错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/conversations")
async def get_conversations(
    limit: int = Query(50, ge=1, le=100, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    sort: str = Query("created_at", pattern="^(created_at|updated_at)$", description="排序字段"),
    order: str = Query("desc", pattern="^(asc|desc)$", description="排序顺序")
):
    """
    获取对话列表
    
    Args:
        limit: 返回数量限制
        offset: 偏移量
        sort: 排序字段
        order: 排序顺序
    
    Returns:
        对话列表
    """
    try:
        # 获取所有对话
        conversations = list_conversations()
        
        # 排序
        reverse = (order == "desc")
        conversations.sort(key=lambda x: x.get(sort, ""), reverse=reverse)
        
        # 分页
        total = len(conversations)
        conversations = conversations[offset:offset + limit]
        
        return {
            "conversations": conversations,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"获取对话列表错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/conversations/new")
async def create_conversation():
    """
    创建新对话
    
    Returns:
        新创建的对话信息
    """
    try:
        # 生成新的对话 ID
        conv_id = str(uuid.uuid4())
        
        # 创建新对话
        conversation = {
            "id": conv_id,
            "title": "新对话",
            "created_at": get_iso_timestamp(),
            "updated_at": get_iso_timestamp(),
            "messages": []
        }
        
        # 保存对话
        save_conversation(conv_id, conversation)
        
        logger.info(f"创建新对话: {conv_id}")
        
        return conversation
        
    except Exception as e:
        logger.error(f"创建对话错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    """
    获取对话详情
    
    Args:
        conv_id: 对话 ID
    
    Returns:
        对话详情
    """
    try:
        conversation = load_conversation(conv_id)
        
        if not conversation:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found"
            )
        
        return conversation
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取对话详情错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation_endpoint(conv_id: str):
    """
    删除对话
    
    Args:
        conv_id: 对话 ID
    
    Returns:
        删除结果
    """
    try:
        success = delete_conversation(conv_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found"
            )
        
        return {
            "message": "Conversation deleted successfully",
            "id": conv_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除对话错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/models")
async def get_models():
    """
    获取可用模型列表
    
    Returns:
        模型列表和主席模型
    """
    try:
        config = load_config()
        models = config.get("models", [])
        chairman = config.get("chairman", "")
        
        # 格式化模型信息
        formatted_models = []
        for model in models:
            formatted_models.append({
                "name": model.get("name", ""),
                "display_name": model.get("display_name", ""),
                "description": model.get("description", ""),
                "is_chairman": model.get("name") == chairman
            })
        
        return {
            "models": formatted_models,
            "chairman": chairman
        }
        
    except Exception as e:
        logger.error(f"获取模型列表错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/settings")
async def get_settings():
    """
    获取系统设置
    
    Returns:
        系统设置（温度、超时、重试次数、并发数）
    """
    try:
        config = load_config()
        settings = config.get("settings", {})
        
        return {
            "temperature": settings.get("temperature", 0.7),
            "timeout": settings.get("timeout", 120),
            "max_retries": settings.get("max_retries", 3),
            "max_concurrent": settings.get("max_concurrent", 10),
            "use_mineru": settings.get("use_mineru", False),
            "mineru_api_url": settings.get("mineru_api_url", ""),
            "mineru_api_key": settings.get("mineru_api_key", "")
        }
        
    except Exception as e:
        logger.error(f"获取设置错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


class SettingsUpdate(BaseModel):
    """设置更新请求模型"""
    temperature: float = Field(..., ge=0.0, le=2.0, description="模型温度")
    timeout: int = Field(..., ge=30, le=300, description="超时时间（秒）")
    max_retries: int = Field(..., ge=0, le=10, description="最大重试次数")
    max_concurrent: int = Field(..., ge=1, le=100, description="最大并发数")
    use_mineru: bool = Field(False, description="是否启用MinerU")
    mineru_api_url: str = Field("", description="MinerU API地址")
    mineru_api_key: str = Field("", description="MinerU API密钥")


@app.put("/api/settings")
async def update_settings(settings: SettingsUpdate):
    """
    更新系统设置
    
    Args:
        settings: 设置更新请求
    
    Returns:
        更新后的设置
    """
    temperature = settings.temperature
    timeout = settings.timeout
    max_retries = settings.max_retries
    max_concurrent = settings.max_concurrent
    try:
        # 尝试多个可能的配置文件路径
        config_paths = [
            "config.json",  # 当前目录(backend/)
            "backend/config.json",  # 从项目根目录
            "../backend/config.json"  # 从其他目录
        ]
        
        config_path = None
        for path in config_paths:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    config_path = path
                    break
            except FileNotFoundError:
                continue
        
        if not config_path:
            raise HTTPException(status_code=500, detail="配置文件未找到")
        
        # 更新设置
        if "settings" not in config:
            config["settings"] = {}
        
        config["settings"]["temperature"] = temperature
        config["settings"]["timeout"] = timeout
        config["settings"]["max_retries"] = max_retries
        config["settings"]["max_concurrent"] = max_concurrent
        config["settings"]["use_mineru"] = settings.use_mineru
        config["settings"]["mineru_api_url"] = settings.mineru_api_url
        config["settings"]["mineru_api_key"] = settings.mineru_api_key
        
        # 保存配置文件
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        
        logger.info(f"设置已更新: temperature={temperature}, timeout={timeout}, max_retries={max_retries}, max_concurrent={max_concurrent}")
        
        return {
            "temperature": temperature,
            "timeout": timeout,
            "max_retries": max_retries,
            "max_concurrent": max_concurrent,
            "use_mineru": settings.use_mineru,
            "mineru_api_url": settings.mineru_api_url,
            "mineru_api_key": settings.mineru_api_key,
            "message": "设置更新成功"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新设置错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


class ModelConfigUpdate(BaseModel):
    """模型配置更新请求模型"""
    models: List[Dict[str, Any]] = Field(..., description="模型配置列表")
    chairman: str = Field(..., description="主席模型名称")


@app.get("/api/models/config")
async def get_models_config():
    """
    获取完整的模型配置（包含API密钥等敏感信息）
    
    Returns:
        完整的模型配置列表和主席模型
    """
    try:
        config = load_config()
        models = config.get("models", [])
        chairman = config.get("chairman", "")
        
        return {
            "models": models,
            "chairman": chairman
        }
        
    except Exception as e:
        logger.error(f"获取模型配置错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.put("/api/models/config")
async def update_models_config(config_update: ModelConfigUpdate):
    """
    更新模型配置
    
    Args:
        config_update: 模型配置更新请求
    
    Returns:
        更新后的配置
    """
    try:
        # 尝试多个可能的配置文件路径
        config_paths = [
            "config.json",  # 当前目录(backend/)
            "backend/config.json",  # 从项目根目录
            "../backend/config.json"  # 从其他目录
        ]
        
        config_path = None
        for path in config_paths:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    config_path = path
                    break
            except FileNotFoundError:
                continue
        
        if not config_path:
            raise HTTPException(status_code=500, detail="配置文件未找到")
        
        # 更新模型配置
        config["models"] = config_update.models
        config["chairman"] = config_update.chairman
        
        # 保存配置文件
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        
        logger.info(f"模型配置已更新: {len(config_update.models)} 个模型, 主席: {config_update.chairman}")
        
        return {
            "models": config_update.models,
            "chairman": config_update.chairman,
            "message": "模型配置更新成功"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新模型配置错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


class MessageEditRequest(BaseModel):
    """消息编辑请求模型"""
    message_index: int = Field(..., description="要编辑的消息索引")
    new_content: str = Field(..., description="新的消息内容")


@app.put("/api/conversations/{conv_id}/messages/{message_index}")
async def edit_message(conv_id: str, message_index: int, request: MessageEditRequest):
    """
    编辑对话中的消息并重新生成AI回复
    
    Args:
        conv_id: 对话ID
        message_index: 消息索引
        request: 编辑请求
        
    Returns:
        更新后的对话
    """
    try:
        # 加载对话
        conversation = load_conversation(conv_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="对话不存在")
        
        messages = conversation.get("messages", [])
        
        # 验证消息索引
        if message_index < 0 or message_index >= len(messages):
            raise HTTPException(status_code=400, detail="无效的消息索引")
        
        # 验证是否为用户消息
        if messages[message_index].get("role") != "user":
            raise HTTPException(status_code=400, detail="只能编辑用户消息")
        
        # 更新消息内容和时间戳
        current_time = get_iso_timestamp()
        messages[message_index]["content"] = request.new_content
        messages[message_index]["edited"] = True
        messages[message_index]["edited_at"] = current_time
        messages[message_index]["timestamp"] = current_time  # 更新时间戳为编辑时间
        
        # 删除该消息之后的所有消息(包括对应的AI回复)
        conversation["messages"] = messages[:message_index + 1]
        
        # 更新对话时间戳
        conversation["updated_at"] = get_iso_timestamp()
        
        # 保存对话
        save_conversation(conv_id, conversation)
        
        logger.info(f"消息已编辑: 对话={conv_id}, 索引={message_index}")
        
        return conversation
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"编辑消息错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.delete("/api/conversations/{conv_id}/messages/{message_index}")
async def delete_message(conv_id: str, message_index: int):
    """
    删除对话中的消息及其后续所有消息
    
    Args:
        conv_id: 对话ID
        message_index: 消息索引
        
    Returns:
        更新后的对话
    """
    try:
        # 加载对话
        conversation = load_conversation(conv_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="对话不存在")
        
        messages = conversation.get("messages", [])
        
        # 验证消息索引
        if message_index < 0 or message_index >= len(messages):
            raise HTTPException(status_code=400, detail="无效的消息索引")
        
        # 验证是否为用户消息
        if messages[message_index].get("role") != "user":
            raise HTTPException(status_code=400, detail="只能删除用户消息")
        
        # 删除该消息及其后续所有消息
        conversation["messages"] = messages[:message_index]
        
        # 更新对话时间戳
        conversation["updated_at"] = get_iso_timestamp()
        
        # 保存对话
        save_conversation(conv_id, conversation)
        
        logger.info(f"消息已删除: 对话={conv_id}, 索引={message_index}")
        
        return conversation
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除消息错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


class ContextConfigUpdate(BaseModel):
    """上下文配置更新请求模型"""
    max_turns: int = Field(..., ge=0, le=100, description="上下文轮数")
    context_attachments: List[Dict[str, Any]] = Field(default=[], description="上下文附件列表")


@app.get("/api/conversations/{conv_id}/context")
async def get_context_config(conv_id: str):
    """
    获取对话的上下文配置
    
    Args:
        conv_id: 对话ID
        
    Returns:
        上下文配置(包含历史对话中的所有附件)
    """
    try:
        # 加载对话
        conversation = load_conversation(conv_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="对话不存在")
        
        # 获取已保存的上下文配置
        context_config = conversation.get("context_config", {
            "max_turns": 3,
            "context_attachments": []
        })
        
        # 如果没有保存过上下文配置,则从历史对话中提取所有附件
        if not context_config.get("context_attachments"):
            messages = conversation.get("messages", [])
            all_attachments = []
            
            # 遍历所有用户消息,提取附件
            for msg in messages:
                if msg.get("role") == "user" and msg.get("attachments"):
                    for att in msg.get("attachments", []):
                        # 避免重复添加相同的附件
                        att_name = att.get("filename") or att.get("name")
                        if not any(a.get("filename") == att_name or a.get("name") == att_name for a in all_attachments):
                            all_attachments.append(att)
            
            context_config["context_attachments"] = all_attachments
        
        return context_config
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取上下文配置错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.put("/api/conversations/{conv_id}/context")
async def update_context_config(conv_id: str, config: ContextConfigUpdate):
    """
    更新对话的上下文配置
    
    Args:
        conv_id: 对话ID
        config: 上下文配置
        
    Returns:
        更新后的配置
    """
    try:
        # 加载对话
        conversation = load_conversation(conv_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="对话不存在")
        
        # 更新上下文配置
        conversation["context_config"] = {
            "max_turns": config.max_turns,
            "context_attachments": config.context_attachments
        }
        
        # 更新对话时间戳
        conversation["updated_at"] = get_iso_timestamp()
        
        # 保存对话
        save_conversation(conv_id, conversation)
        
        logger.info(f"上下文配置已更新: 对话={conv_id}, 轮数={config.max_turns}, 附件数={len(config.context_attachments)}")
        
        return conversation["context_config"]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新上下文配置错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


def extract_file_content_with_mineru(file_path: str, filename: str) -> Tuple[str, Optional[str]]:
    """
    使用MinerU API提取文件内容(高质量解析)
    
    Args:
        file_path: 文件路径
        filename: 原始文件名
        
    Returns:
        (content, error) 元组
    """
    try:
        from mineru_client import MinerUClient
        import requests
        
        logger.info("=" * 60)
        logger.info("开始使用MinerU解析文档")
        logger.info(f"文件名: {filename}")
        logger.info(f"文件路径: {file_path}")
        
        # 从配置文件读取MinerU API配置
        config = load_config()
        api_key = config.get("settings", {}).get("mineru_api_key", "")
        
        if not api_key:
            logger.error("MinerU API密钥未配置")
            return "", "MinerU API密钥未配置"
        
        logger.info("MinerU API密钥已配置")
        
        # 创建MinerU客户端
        client = MinerUClient(api_token=api_key)
        logger.info("MinerU客户端创建成功")
        
        # 确定模型版本
        file_ext = os.path.splitext(filename)[1].lower()
        if file_ext == '.html':
            model_version = "MinerU-HTML"
        else:
            model_version = "pipeline"  # 默认使用pipeline模型
        
        logger.info(f"文件类型: {file_ext}, 使用模型: {model_version}")
        
        # 步骤1: 申请上传URL
        logger.info("步骤1: 申请上传URL...")
        batch_result, error = client.batch_upload_files(
            files=[{"name": filename}],
            model_version=model_version
        )
        
        if error or not batch_result:
            logger.error(f"申请上传URL失败: {error}")
            return "", f"申请上传URL失败: {error}"
        
        batch_id = batch_result.get("batch_id")
        file_urls = batch_result.get("file_urls", [])
        
        logger.info(f"获取到batch_id: {batch_id}")
        logger.info(f"获取到{len(file_urls)}个上传URL")
        
        if not file_urls:
            logger.error("未获取到上传URL")
            return "", "未获取到上传URL"
        
        upload_url = file_urls[0]
        logger.info(f"上传URL: {upload_url[:50]}...")
        
        # 步骤2: 上传文件
        logger.info("步骤2: 上传文件到MinerU...")
        error = client.upload_file_to_url(file_path, upload_url)
        if error:
            logger.error(f"文件上传失败: {error}")
            return "", f"文件上传失败: {error}"
        
        logger.info(f"文件上传成功! batch_id={batch_id}")
        logger.info("步骤3: 等待MinerU解析...")
        
        # 步骤3: 轮询查询结果
        import time
        max_wait_time = 600  # 最多等待10分钟
        poll_interval = 5  # 每5秒查询一次
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            if not batch_id:
                return "", "批次ID为空"
                
            results, error = client.query_batch_results(batch_id)
            
            if error:
                return "", f"查询结果失败: {error}"
            
            if results and len(results) > 0:
                result = results[0]
                state = result.get("state")
                
                if state == "done":
                    # 解析完成,下载结果
                    full_zip_url = result.get("full_zip_url")
                    if not full_zip_url:
                        logger.error("未获取到结果下载URL")
                        return "", "未获取到结果下载URL"
                    
                    logger.info(f"解析完成! 下载URL: {full_zip_url[:50]}...")
                    logger.info("步骤4: 下载并提取内容...")
                    
                    # 下载并提取内容
                    content, error = client.download_and_extract_content(full_zip_url)
                    if error:
                        logger.error(f"下载结果失败: {error}")
                        return "", f"下载结果失败: {error}"
                    
                    if content:
                        logger.info(f"MinerU解析成功! 内容长度: {len(content)} 字符")
                        logger.info(f"内容预览: {content[:200]}...")
                        logger.info("=" * 60)
                        return content, None
                    else:
                        logger.error("提取的内容为空")
                        return "", "提取的内容为空"
                    
                elif state == "failed":
                    err_msg = result.get("err_msg", "解析失败")
                    logger.error(f"MinerU解析失败: {err_msg}")
                    logger.info("=" * 60)
                    return "", f"MinerU解析失败: {err_msg}"
                    
                elif state in ["waiting-file", "pending", "running", "converting"]:
                    # 记录进度
                    progress = result.get("extract_progress", {})
                    if progress:
                        extracted = progress.get("extracted_pages", 0)
                        total = progress.get("total_pages", 0)
                        logger.info(f"MinerU解析进度: {extracted}/{total}")
                    else:
                        logger.info(f"MinerU状态: {state}")
                    
                    time.sleep(poll_interval)
                else:
                    logger.warning(f"未知状态: {state}")
                    time.sleep(poll_interval)
            else:
                time.sleep(poll_interval)
        
        logger.error(f"MinerU解析超时: 超过{max_wait_time}秒")
        logger.info("=" * 60)
        return "", f"MinerU解析超时: 超过{max_wait_time}秒"
                
    except Exception as e:
        error_msg = f"MinerU解析失败: {str(e)}"
        logger.error(error_msg, exc_info=True)
        logger.info("=" * 60)
        return "", error_msg


def extract_file_content(file_path: str, filename: str, use_mineru: bool = False) -> Tuple[str, Optional[str]]:
    """
    提取文件内容
    
    Args:
        file_path: 文件路径
        filename: 原始文件名
        use_mineru: 是否使用MinerU进行高质量解析
        
    Returns:
        (content, error) 元组，content为提取的文本内容，error为错误信息
    """
    file_ext = os.path.splitext(filename)[1].lower()
    
    # txt和md文件直接读取,不需要解析
    if file_ext in ['.txt', '.md']:
        logger.info(f"检测到文本文件({file_ext}),直接读取内容")
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                logger.info(f"文本文件读取成功,内容长度: {len(content)} 字符")
                return content, None
        except Exception as e:
            error_msg = f"读取文本文件失败: {str(e)}"
            logger.error(error_msg)
            return "", error_msg
    
    # 其他格式:如果启用MinerU,先尝试使用MinerU解析
    if use_mineru:
        logger.info(f"检测到文档文件({file_ext}),使用MinerU解析")
        content, error = extract_file_content_with_mineru(file_path, filename)
        if content:  # MinerU解析成功
            return content, None
        # MinerU失败,继续使用本地解析
        logger.info(f"MinerU解析失败,使用本地解析: {error}")
    else:
        logger.warning(f"MinerU未启用,无法解析{file_ext}格式文件")
        return "", f"MinerU未启用,无法解析{file_ext}格式。请在设置中启用MinerU。"
    
    try:
        # Word文档 (.docx)
        if file_ext == '.docx':
            try:
                from docx import Document
                doc = Document(file_path)
                content = '\n'.join([paragraph.text for paragraph in doc.paragraphs])
                return content, None
            except ImportError:
                return "", "需要安装python-docx库来处理.docx文件"
            except Exception as e:
                return "", f"读取.docx文件失败: {str(e)}"
        
        # Excel文件 (.xlsx, .xls)
        elif file_ext in ['.xlsx', '.xls']:
            try:
                from openpyxl import load_workbook
                wb = load_workbook(file_path, data_only=True)
                content_parts = []
                for sheet_name in wb.sheetnames:
                    sheet = wb[sheet_name]
                    content_parts.append(f"=== 工作表: {sheet_name} ===")
                    for row in sheet.iter_rows(values_only=True):
                        row_text = '\t'.join([str(cell) if cell is not None else '' for cell in row])
                        if row_text.strip():
                            content_parts.append(row_text)
                return '\n'.join(content_parts), None
            except ImportError:
                return "", "需要安装openpyxl库来处理Excel文件"
            except Exception as e:
                return "", f"读取Excel文件失败: {str(e)}"
        
        # PDF文件
        elif file_ext == '.pdf':
            try:
                from PyPDF2 import PdfReader
                reader = PdfReader(file_path)
                content_parts = []
                for i, page in enumerate(reader.pages):
                    text = page.extract_text()
                    if text.strip():
                        content_parts.append(f"=== 第{i+1}页 ===\n{text}")
                return '\n\n'.join(content_parts), None
            except ImportError:
                return "", "需要安装PyPDF2库来处理PDF文件"
            except Exception as e:
                return "", f"读取PDF文件失败: {str(e)}"
        
        # DOC文件 (旧版Word)
        elif file_ext == '.doc':
            return "", ".doc格式不支持，请转换为.docx格式"
        
        else:
            return "", f"不支持的文件格式: {file_ext}"
            
    except Exception as e:
        logger.error(f"提取文件内容错误: {e}", exc_info=True)
        return "", f"提取文件内容失败: {str(e)}"


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    上传文件并提取内容(支持MD5去重)
    
    支持的文件格式:
    - .txt: 纯文本文件
    - .docx: Word文档
    - .xlsx, .xls: Excel表格
    - .pdf: PDF文档
    
    Args:
        file: 上传的文件
        
    Returns:
        上传结果，包含文件名、路径、大小、MD5和提取的文本内容
    """
    try:
        logger.info("=" * 60)
        logger.info("收到文件上传请求")
        logger.info(f"文件名: {file.filename}")
        logger.info(f"Content-Type: {file.content_type}")
        
        # 从配置文件读取是否启用MinerU
        config = load_config()
        use_mineru = config.get("settings", {}).get("use_mineru", False)
        
        logger.info(f"MinerU状态: {'启用' if use_mineru else '禁用'}")
        
        # 检查文件类型
        file_ext = os.path.splitext(file.filename)[1].lower()
        
        # 根据MinerU状态确定允许的文件类型
        if use_mineru:
            # 启用MinerU时,支持多种文档格式
            allowed_extensions = ['.txt', '.md', '.doc', '.docx', '.xlsx', '.xls', '.pdf', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.html']
            logger.info("MinerU已启用,支持多种文档格式")
        else:
            # 未启用MinerU时,只支持txt和markdown
            allowed_extensions = ['.txt', '.md']
            logger.info("MinerU未启用,仅支持txt和markdown文件")
        
        logger.info(f"文件扩展名: {file_ext}")
        logger.info(f"允许的格式: {', '.join(allowed_extensions)}")
        
        if file_ext not in allowed_extensions:
            logger.error(f"不支持的文件格式: {file_ext}")
            if not use_mineru:
                raise HTTPException(
                    status_code=400,
                    detail=f"未启用MinerU,仅支持txt和markdown文件。如需上传其他格式,请在设置中启用MinerU。"
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"不支持的文件格式。支持的格式: {', '.join(allowed_extensions)}"
                )
        
        # 创建uploads目录（如果不存在）
        upload_dir = "backend/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        
        # 生成临时文件名
        temp_filename = f"temp_{uuid.uuid4()}{file_ext}"
        temp_path = os.path.join(upload_dir, temp_filename)
        
        # 保存临时文件
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 计算MD5
        file_md5 = calculate_md5(temp_path)
        logger.info(f"文件MD5: {file_md5}")
        
        # 检查是否已存在相同MD5的文件
        existing_file = get_file_by_md5(file_md5)
        
        if existing_file:
            # 文件已存在,删除临时文件,返回已有文件信息
            os.remove(temp_path)
            logger.info(f"文件已存在(MD5: {file_md5}),复用已有文件")
            
            # 更新最后访问时间
            update_last_accessed(file_md5)
            
            return {
                "filename": file.filename,
                "name": file.filename,
                "path": existing_file["stored_path"],
                "size": existing_file["size"],
                "content_type": file.content_type,
                "content": existing_file["content"],
                "content_length": len(existing_file["content"]),
                "md5": file_md5,
                "is_duplicate": True,
                "extraction_error": None
            }
        
        # 新文件,重命名为正式文件名
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(upload_dir, unique_filename)
        os.rename(temp_path, file_path)
        
        # 提取文件内容
        content, error = extract_file_content(file_path, file.filename, use_mineru=use_mineru)
        
        if error:
            logger.warning(f"文件内容提取失败: {error}")
        
        # 添加到文件存储系统
        file_info = add_file(
            file_path=file_path,
            original_filename=file.filename,
            content=content,
            size=os.path.getsize(file_path),
            md5=file_md5
        )
        
        logger.info(f"文件上传成功: {file.filename} -> {file_path}, MD5: {file_md5}, 内容长度: {len(content)}")
        
        return {
            "filename": file.filename,
            "name": file.filename,
            "path": file_path,
            "size": file_info["size"],
            "content_type": file.content_type,
            "content": content,
            "content_length": len(content),
            "md5": file_md5,
            "is_duplicate": False,
            "extraction_error": error
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"文件上传错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"文件上传失败: {str(e)}")


@app.get("/api/files")
async def list_files_endpoint():
    """
    获取所有已上传文件列表
    
    Returns:
        文件列表
    """
    try:
        files = get_all_files()
        return {
            "files": files,
            "total": len(files)
        }
    except Exception as e:
        logger.error(f"获取文件列表错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/files/{md5}/download")
async def download_file(md5: str):
    """
    下载文件(源文件)
    
    Args:
        md5: 文件MD5值
        
    Returns:
        文件内容
    """
    try:
        from fastapi.responses import FileResponse
        
        file_path = get_file_path(md5)
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="文件不存在")
        
        # 更新最后访问时间
        update_last_accessed(md5)
        
        # 获取文件信息
        file_info = get_file_by_md5(md5)
        filename = file_info.get("filename", "download")
        
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type='application/octet-stream'
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"下载文件错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.delete("/api/files/{md5}")
async def delete_file_endpoint(md5: str):
    """
    删除文件
    
    Args:
        md5: 文件MD5值
        
    Returns:
        删除结果
    """
    try:
        success = delete_file_from_storage(md5)
        
        if not success:
            raise HTTPException(status_code=404, detail="文件不存在")
        
        logger.info(f"文件已删除: MD5={md5}")
        
        return {
            "message": "文件删除成功",
            "md5": md5
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除文件错误: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """全局异常处理器"""
    logger.error(f"未处理的异常: {exc}", exc_info=True)
    return {
        "detail": "Internal server error",
        "timestamp": get_iso_timestamp()
    }


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": "LLM Council Simplified API",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8007)