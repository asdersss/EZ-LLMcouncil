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

# 配置文件路径
CONFIG_FILE = "backend/config.json"


def load_config() -> Dict[str, Any]:
    """加载配置文件"""
    try:
        # 尝试多个可能的配置文件路径
        config_paths = [
            "config.json",
            "backend/config.json",
            "../backend/config.json"
        ]
        
        for config_path in config_paths:
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except FileNotFoundError:
                continue
        
        logger.error("未找到配置文件")
        return {"providers": [], "chairman": "", "settings": {}}
    except Exception as e:
        logger.error(f"加载配置文件失败: {e}")
        return {"providers": [], "chairman": "", "settings": {}}


def save_config(config: Dict[str, Any]) -> bool:
    """保存配置文件"""
    try:
        # 尝试多个可能的配置文件路径
        config_paths = [
            "config.json",
            "backend/config.json",
            "../backend/config.json"
        ]
        
        config_path = None
        for path in config_paths:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    json.load(f)
                    config_path = path
                    break
            except FileNotFoundError:
                continue
        
        if not config_path:
            # 如果都不存在，使用默认路径
            config_path = "backend/config.json"
        
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"保存配置文件失败: {e}")
        return False


def load_providers() -> List[Dict[str, Any]]:
    """加载供应商配置"""
    config = load_config()
    return config.get("providers", [])


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
        config = load_config()
        providers = config.get("providers", [])
        
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
            "models": [],
            "created_at": datetime.utcnow().isoformat() + "Z"
        }
        
        providers.append(provider)
        config["providers"] = providers
        
        if save_config(config):
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
        config = load_config()
        providers = config.get("providers", [])
        
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
        
        if save_config(config):
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
        config = load_config()
        providers = config.get("providers", [])
        
        # 过滤掉要删除的供应商
        new_providers = [p for p in providers if p["name"] != name]
        
        if len(new_providers) == len(providers):
            return False, "供应商不存在"
        
        config["providers"] = new_providers
        
        if save_config(config):
            return True, ""
        else:
            return False, "保存配置失败"
            
    except Exception as e:
        logger.error(f"删除供应商失败: {e}")
        return False, str(e)


def get_provider_models(provider_name: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    """
    获取供应商下已添加的模型列表
    
    Args:
        provider_name: 供应商名称
    
    Returns:
        (模型列表, 错误信息)
    """
    try:
        config = load_config()
        providers = config.get("providers", [])
        
        # 查找供应商
        provider = None
        for p in providers:
            if p["name"] == provider_name:
                provider = p
                break
        
        if not provider:
            return None, "供应商不存在"
        
        return provider.get("models", []), None
            
    except Exception as e:
        logger.error(f"获取供应商模型列表失败: {e}")
        return None, str(e)


async def fetch_provider_models(provider_name: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    """
    从供应商API获取可用模型列表
    
    Args:
        provider_name: 供应商名称
    
    Returns:
        (模型列表, 错误信息)
    """
    try:
        config = load_config()
        providers = config.get("providers", [])
        
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


def add_model_to_provider(provider_name: str, model_name: str, display_name: str, description: str = "") -> Tuple[bool, str]:
    """
    添加模型到供应商
    
    Args:
        provider_name: 供应商名称
        model_name: 模型名称（API中的模型ID）
        display_name: 显示名称
        description: 模型描述
    
    Returns:
        (成功标志, 错误信息)
    """
    try:
        config = load_config()
        providers = config.get("providers", [])
        
        # 查找供应商
        provider = None
        for p in providers:
            if p["name"] == provider_name:
                provider = p
                break
        
        if not provider:
            return False, "供应商不存在"
        
        # 检查模型是否已存在
        if "models" not in provider:
            provider["models"] = []
        
        if any(m["name"] == model_name for m in provider["models"]):
            return False, "模型已存在"
        
        # 添加模型
        model = {
            "name": model_name,
            "display_name": display_name,
            "description": description
        }
        
        provider["models"].append(model)
        
        if save_config(config):
            return True, ""
        else:
            return False, "保存配置失败"
            
    except Exception as e:
        logger.error(f"添加模型失败: {e}")
        return False, str(e)


def delete_model_from_provider(provider_name: str, model_name: str) -> Tuple[bool, str]:
    """
    从供应商删除模型
    
    Args:
        provider_name: 供应商名称
        model_name: 模型名称
    
    Returns:
        (成功标志, 错误信息)
    """
    try:
        config = load_config()
        providers = config.get("providers", [])
        
        # 查找供应商
        provider = None
        for p in providers:
            if p["name"] == provider_name:
                provider = p
                break
        
        if not provider:
            return False, "供应商不存在"
        
        # 删除模型
        if "models" not in provider:
            return False, "模型不存在"
        
        original_count = len(provider["models"])
        provider["models"] = [m for m in provider["models"] if m["name"] != model_name]
        
        if len(provider["models"]) == original_count:
            return False, "模型不存在"
        
        if save_config(config):
            return True, ""
        else:
            return False, "保存配置失败"
            
    except Exception as e:
        logger.error(f"删除模型失败: {e}")
        return False, str(e)


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
        config = load_config()
        providers = config.get("providers", [])
        
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
                
                # 检查响应内容类型
                content_type = response.headers.get("content-type", "")
                if "text/html" in content_type:
                    logger.error(f"API返回HTML页面而不是JSON，URL可能不正确: {url}")
                    return False, None, f"API URL配置错误：返回HTML页面。Anthropic API的URL应该是 https://api.anthropic.com/v1/messages，请检查您的配置。"
                
                # 检查响应内容
                response_text = response.text
                if not response_text or response_text.strip() == "":
                    return False, None, "API 返回空响应"
                
                try:
                    data = response.json()
                except json.JSONDecodeError as e:
                    logger.error(f"JSON 解析失败，响应内容: {response_text[:200]}")
                    return False, None, f"API 返回非 JSON 格式响应: {str(e)}。请检查URL配置是否正确。"
                
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