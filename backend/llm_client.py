"""
LLM 客户端模块
提供与 LLM API 交互的功能,包括单个查询、并行查询、重试机制和错误处理
"""

import asyncio
import httpx
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 常量配置
BASE_BACKOFF = 1  # 基础退避时间(秒)


async def query_model(
    model_config: Dict[str, Any],
    messages: List[Dict[str, str]],
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    timeout: int = 120,
    max_retries: int = 3
) -> Dict[str, Any]:
    """
    查询单个 LLM 模型
    
    Args:
        model_config: 模型配置,包含 name, url, api_key, api_type 等
        messages: 消息列表,格式为 [{"role": "user", "content": "..."}]
        temperature: 温度参数,控制随机性
        max_tokens: 最大生成 token 数
        timeout: 超时时间(秒)
        max_retries: 最大重试次数
    
    Returns:
        包含响应内容的字典:
        {
            "model": "model-name",
            "response": "模型响应内容",
            "timestamp": "2026-01-26T10:00:00Z",
            "error": "错误信息(如果有)"
        }
    """
    model_name = model_config.get("name", "unknown")
    url = model_config.get("url")
    api_key = model_config.get("api_key")
    api_type = model_config.get("api_type", "openai")  # 默认为 openai
    
    if not url or not api_key:
        error_msg = f"模型 {model_name} 配置不完整"
        logger.error(error_msg)
        return {
            "model": model_name,
            "response": "",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "error": error_msg
        }
    
    # 构建请求体
    request_body = {
        "model": model_name,
        "messages": messages,
        "temperature": temperature
    }
    
    if max_tokens:
        request_body["max_tokens"] = max_tokens
    
    # 根据 API 类型设置请求头
    if api_type == "anthropic":
        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01"
        }
    else:  # openai 或其他兼容 OpenAI 的 API
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
    
    # 重试逻辑
    last_error = None
    for attempt in range(max_retries):
        try:
            logger.info(f"查询模型 {model_name} (尝试 {attempt + 1}/{max_retries})")
            
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    url,
                    json=request_body,
                    headers=headers
                )
                
                response.raise_for_status()
                data = response.json()
                
                # 根据 API 类型提取响应内容
                content = ""
                if api_type == "anthropic":
                    # Anthropic API 响应格式
                    if "content" in data and len(data["content"]) > 0:
                        content = data["content"][0].get("text", "")
                else:
                    # OpenAI API 响应格式
                    if "choices" in data and len(data["choices"]) > 0:
                        choice = data["choices"][0]
                        if "message" in choice:
                            content = choice["message"].get("content", "")
                        elif "text" in choice:
                            content = choice.get("text", "")
                
                logger.info(f"模型 {model_name} 响应成功")
                return {
                    "model": model_name,
                    "response": content,
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
                
        except httpx.TimeoutException as e:
            last_error = f"请求超时: {str(e)}"
            logger.warning(f"模型 {model_name} 请求超时 (尝试 {attempt + 1}/{max_retries})")
            
        except httpx.HTTPStatusError as e:
            # 只记录状态码和简短描述,避免打印HTML错误页面
            status_code = e.response.status_code
            # 尝试解析JSON错误信息
            try:
                error_data = e.response.json()
                error_detail = error_data.get('error', {}).get('message', '') or error_data.get('message', '')
                if error_detail:
                    last_error = f"HTTP {status_code}: {error_detail}"
                else:
                    last_error = f"HTTP {status_code}"
            except:
                # 如果不是JSON,只显示状态码和简短描述
                status_messages = {
                    400: "请求错误",
                    401: "未授权",
                    403: "禁止访问",
                    404: "未找到",
                    429: "请求过多",
                    500: "服务器错误",
                    502: "网关错误",
                    503: "服务不可用",
                    504: "网关超时"
                }
                status_msg = status_messages.get(status_code, "未知错误")
                last_error = f"HTTP {status_code}: {status_msg}"
            
            logger.warning(f"模型 {model_name} 查询失败,已重试 {attempt + 1} 次: {last_error}")
            
        except Exception as e:
            last_error = f"未知错误: {str(e)}"
            logger.warning(f"模型 {model_name} 发生错误 (尝试 {attempt + 1}/{max_retries}): {last_error}")
        
        # 如果不是最后一次尝试,则等待后重试(指数退避)
        if attempt < max_retries - 1:
            backoff_time = BASE_BACKOFF * (2 ** attempt)
            logger.info(f"等待 {backoff_time} 秒后重试...")
            await asyncio.sleep(backoff_time)
    
    # 所有重试都失败
    error_msg = f"查询失败,已重试 {max_retries} 次: {last_error}"
    logger.error(f"模型 {model_name} {error_msg}")
    return {
        "model": model_name,
        "response": "",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "error": error_msg
    }


async def query_models_parallel(
    model_configs: List[Dict[str, Any]],
    messages: List[Dict[str, str]],
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    timeout: int = 120,
    max_retries: int = 3
) -> List[Dict[str, Any]]:
    """
    并行查询多个 LLM 模型
    
    Args:
        model_configs: 模型配置列表
        messages: 消息列表
        temperature: 温度参数
        max_tokens: 最大生成 token 数
        timeout: 超时时间(秒)
        max_retries: 最大重试次数
    
    Returns:
        响应列表,每个元素格式与 query_model 返回值相同
    """
    logger.info(f"开始并行查询 {len(model_configs)} 个模型")
    
    # 创建并行任务
    tasks = [
        query_model(config, messages, temperature, max_tokens, timeout, max_retries)
        for config in model_configs
    ]
    
    # 并行执行所有查询
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 处理异常结果
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            model_name = model_configs[i].get("name", "unknown")
            logger.error(f"模型 {model_name} 查询异常: {str(result)}")
            processed_results.append({
                "model": model_name,
                "response": "",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "error": f"查询异常: {str(result)}"
            })
        else:
            processed_results.append(result)
    
    logger.info(f"并行查询完成,成功: {sum(1 for r in processed_results if 'error' not in r)}/{len(model_configs)}")
    return processed_results