"""
供应商管理模块
管理AI供应商的配置和模型列表
"""

import json
import logging
import httpx
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)

# 供应商配置文件路径
PROVIDERS_FILE = "backend/providers.json"


def load_providers() -> List[Dict[str, Any]]:
    """加载供应商配置"""
    try:
        with open(PROVIDERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("providers", [])
    except FileNotFoundError:
        return []
    except Exception as e:
        logger.error(f"加载供应商配置失败: {e}")
        return []


def save_providers(providers: List[Dict[str, Any]]) -> bool:
    """保存供应商配置"""
    try:
        with open(PROVIDERS_FILE, "w", encoding="utf-8") as f:
            json.dump({"providers": providers}, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"保存供应商配置失败: {e}")
        return False


def add_provider(name: str, url: str, api_key: str, api_type: str) -> Tuple[bool, str]:
    """
    添加供应商
    
    Args:
        name: 供应商名称
        url: API URL
        api_key: API密钥
        api_type: API类型 (openai/anthropic)
    
    Returns:
        (成功标志, 错误信息)
    """
    try:
        providers = load_providers()
        
        # 检查名称是否重复
        if any(p["name"] == name for p in providers):
            return False, "供应商名称已存在"
        
        # 验证API类型
        if api_type.lower() not in ["openai", "anthropic"]:
            return False, "API类型必须是 openai 或 anthropic"
        
        provider = {
            "name": name,
            "url": url,
            "api_key": api_key,
            "api_type": api_type.lower(),
            "created_at": datetime.utcnow().isoformat() + "Z"
        }
        
        providers.append(provider)
        
        if save_providers(providers):
            return True, ""
        else:
            return False, "保存配置失败"
            
    except Exception as e:
        logger.error(f"添加供应商失败: {e}")
        return False, str(e)


def update_provider(name: str, url: Optional[str] = None, api_key: Optional[str] = None, 
                   api_type: Optional[str] = None) -> Tuple[bool, str]:
    """
    更新供应商配置
    
    Args:
        name: 供应商名称
        url: 新的API URL（可选）
        api_key: 新的API密钥（可选）
        api_type: 新的API类型（可选）
    
    Returns:
        (成功标志, 错误信息)
    """
    try:
        providers = load_providers()
        
        # 查找供应商
        provider = None
        for p in providers:
            if p["name"] == name:
                provider = p
                break
        
        if not provider:
            return False, "供应商不存在"
        
        # 更新字段
        if url is not None:
            provider["url"] = url
        if api_key is not None:
            provider["api_key"] = api_key
        if api_type is not None:
            if api_type.lower() not in ["openai", "anthropic"]:
                return False, "API类型必须是 openai 或 anthropic"
            provider["api_type"] = api_type.lower()
        
        provider["updated_at"] = datetime.utcnow().isoformat() + "Z"
        
        if save_providers(providers):
            return True, ""
        else:
            return False, "保存配置失败"
            
    except Exception as e:
        logger.error(f"更新供应商失败: {e}")
        return False, str(e)


def delete_provider(name: str) -> Tuple[bool, str]:
    """
    删除供应商
    
    Args:
        name: 供应商名称
    
    Returns:
        (成功标志, 错误信息)
    """
    try:
        providers = load_providers()
        
        # 过滤掉要删除的供应商
        new_providers = [p for p in providers if p["name"] != name]
        
        if len(new_providers) == len(providers):
            return False, "供应商不存在"
        
        if save_providers(new_providers):
            return True, ""
        else:
            return False, "保存配置失败"
            
    except Exception as e:
        logger.error(f"删除供应商失败: {e}")
        return False, str(e)


async def fetch_provider_models(provider_name: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    """
    获取供应商的模型列表
    
    Args:
        provider_name: 供应商名称
    
    Returns:
        (模型列表, 错误信息)
    """
    try:
        providers = load_providers()
        
        # 查找供应商
        provider = None
        for p in providers:
            if p["name"] == provider_name:
                provider = p
                break
        
        if not provider:
            return None, "供应商不存在"
        
        api_type = provider["api_type"]
        url = provider["url"]
        api_key = provider["api_key"]
        
        # 根据API类型构建请求
        if api_type == "openai":
            # OpenAI兼容API - 获取模型列表
            models_url = url.replace("/chat/completions", "/models").replace("/v1/chat/completions", "/v1/models")
            
            headers = {
                "Authorization": f"Bearer {api_key}"
            }
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(models_url, headers=headers)
                response.raise_for_status()
                data = response.json()
                
                # 提取模型列表
                models = []
                if "data" in data:
                    for model in data["data"]:
                        models.append({
                            "id": model.get("id", ""),
                            "name": model.get("id", ""),
                            "created": model.get("created", 0),
                            "owned_by": model.get("owned_by", "")
                        })
                
                return models, None
                
        elif api_type == "anthropic":
            # Anthropic API - 返回预定义的模型列表
            models = [
                {"id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5", "owned_by": "anthropic"},
                {"id": "claude-haiku-4-5", "name": "Claude Haiku 4.5", "owned_by": "anthropic"},
                {"id": "claude-opus-4-5", "name": "Claude Opus 4.5", "owned_by": "anthropic"}
            ]
            return models, None
        
        else:
            return None, f"不支持的API类型: {api_type}"
            
    except httpx.HTTPStatusError as e:
        error_msg = f"HTTP {e.response.status_code}"
        try:
            error_data = e.response.json()
            error_detail = error_data.get('error', {}).get('message', '') or error_data.get('message', '')
            if error_detail:
                error_msg = f"HTTP {e.response.status_code}: {error_detail}"
        except:
            pass
        logger.error(f"获取模型列表失败: {error_msg}")
        return None, error_msg
        
    except Exception as e:
        logger.error(f"获取模型列表失败: {e}")
        return None, str(e)


async def test_model(provider_name: str, model_name: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    测试模型是否可用
    
    Args:
        provider_name: 供应商名称
        model_name: 模型名称
    
    Returns:
        (是否成功, 响应内容, 错误信息)
    """
    try:
        providers = load_providers()
        
        # 查找供应商
        provider = None
        for p in providers:
            if p["name"] == provider_name:
                provider = p
                break
        
        if not provider:
            return False, None, "供应商不存在"
        
        api_type = provider["api_type"]
        url = provider["url"]
        api_key = provider["api_key"]
        
        # 构建测试请求
        if api_type == "openai":
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
            
            request_body = {
                "model": model_name,
                "messages": [{"role": "user", "content": "hello"}],
                "max_tokens": 50
            }
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url, json=request_body, headers=headers)
                response.raise_for_status()
                data = response.json()
                
                # 提取响应内容
                content = ""
                if "choices" in data and len(data["choices"]) > 0:
                    choice = data["choices"][0]
                    if "message" in choice:
                        content = choice["message"].get("content", "")
                
                return True, content, None
                
        elif api_type == "anthropic":
            headers = {
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01"
            }
            
            request_body = {
                "model": model_name,
                "messages": [{"role": "user", "content": "hello"}],
                "max_tokens": 50
            }
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url, json=request_body, headers=headers)
                response.raise_for_status()
                
                # 检查响应内容
                response_text = response.text
                if not response_text or response_text.strip() == "":
                    return False, None, "API 返回空响应"
                
                try:
                    data = response.json()
                except json.JSONDecodeError as e:
                    logger.error(f"JSON 解析失败，响应内容: {response_text[:200]}")
                    return False, None, f"API 返回非 JSON 格式响应: {str(e)}"
                
                # 提取响应内容
                content = ""
                if "content" in data and len(data["content"]) > 0:
                    content = data["content"][0].get("text", "")
                
                return True, content, None
        
        else:
            return False, None, f"不支持的API类型: {api_type}"
            
    except httpx.HTTPStatusError as e:
        error_msg = f"HTTP {e.response.status_code}"
        try:
            error_data = e.response.json()
            error_detail = error_data.get('error', {}).get('message', '') or error_data.get('message', '')
            if error_detail:
                error_msg = f"HTTP {e.response.status_code}: {error_detail}"
        except:
            pass
        logger.error(f"测试模型失败: {error_msg}")
        return False, None, error_msg
        
    except httpx.TimeoutException:
        error_msg = "请求超时"
        logger.error(f"测试模型失败: {error_msg}")
        return False, None, error_msg
        
    except Exception as e:
        logger.error(f"测试模型失败: {e}")
        return False, None, str(e)