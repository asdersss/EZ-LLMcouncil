"""
存储层模块
提供对话数据的 JSON 文件存储和管理功能
"""

import json
import os
from pathlib import Path
from typing import Optional, List, Dict
from datetime import datetime


# 数据目录路径
DATA_DIR = Path("data/conversations")


def ensure_data_directory() -> None:
    """确保 data/conversations 目录存在"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def save_conversation(conv_id: str, conversation: dict) -> None:
    """
    保存对话到 JSON 文件
    
    Args:
        conv_id: 对话 ID
        conversation: 对话数据字典
    """
    ensure_data_directory()
    file_path = DATA_DIR / f"{conv_id}.json"
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(conversation, f, ensure_ascii=False, indent=2)


def load_conversation(conv_id: str) -> Optional[dict]:
    """
    从 JSON 文件加载对话
    
    Args:
        conv_id: 对话 ID
        
    Returns:
        对话数据字典，如果文件不存在则返回 None
    """
    file_path = DATA_DIR / f"{conv_id}.json"
    
    if not file_path.exists():
        return None
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def list_conversations() -> List[dict]:
    """
    列出所有对话
    
    Returns:
        对话列表，每个对话包含 id, title, created_at, updated_at, message_count
        按 created_at 降序排序
    """
    ensure_data_directory()
    
    conversations = []
    
    # 遍历所有 JSON 文件
    for file_path in DATA_DIR.glob("*.json"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # 提取对话信息
            conversations.append({
                "id": data.get("id", file_path.stem),
                "title": data.get("title", "未命名对话"),
                "created_at": data.get("created_at", ""),
                "updated_at": data.get("updated_at", ""),
                "message_count": len(data.get("messages", []))
            })
        except (json.JSONDecodeError, IOError, KeyError):
            # 跳过损坏的文件
            continue
    
    # 按 created_at 降序排序
    conversations.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return conversations


def delete_conversation(conv_id: str) -> bool:
    """
    删除对话文件
    
    Args:
        conv_id: 对话 ID
        
    Returns:
        True 如果成功删除，False 如果文件不存在
    """
    file_path = DATA_DIR / f"{conv_id}.json"
    
    if not file_path.exists():
        return False
    
    try:
        file_path.unlink()
        return True
    except OSError:
        return False


def generate_conversation_title(first_message: str) -> str:
    """
    根据第一条消息生成对话标题
    
    Args:
        first_message: 第一条用户消息内容
        
    Returns:
        对话标题（最多 30 个字符）
    """
    # 移除首尾空白
    title = first_message.strip()
    
    # 如果超过 30 个字符，截取并添加省略号
    if len(title) > 30:
        title = title[:30] + "..."
    
    return title


async def generate_ai_title(query: str, response: str, chairman_model: str, model_configs: dict) -> str:
    """
    使用主席AI生成对话标题
    
    Args:
        query: 用户的问题
        response: AI的回答
        chairman_model: 主席模型名称
        model_configs: 模型配置字典
        
    Returns:
        AI生成的对话标题（最多 30 个字符）
    """
    from llm_client import query_model
    
    # 如果主席模型不存在，使用简单标题
    if chairman_model not in model_configs:
        return generate_conversation_title(query)
    
    # 构建提示词
    prompt = f"""请为以下对话生成一个简洁的标题（不超过15个字）。

用户问题：{query}

AI回答：{response[:200]}...

要求：
1. 标题要简洁明了，能概括对话主题
2. 不超过15个字
3. 不要使用引号或其他标点符号
4. 直接输出标题，不要有任何其他内容

标题："""
    
    messages = [
        {"role": "user", "content": prompt}
    ]
    
    try:
        # 调用主席模型生成标题
        result = await query_model(
            model_config=model_configs[chairman_model],
            messages=messages,
            temperature=0.3,  # 使用较低的温度以获得更稳定的结果
            max_tokens=50
        )
        
        if result.get("error"):
            # 如果生成失败，使用简单标题
            return generate_conversation_title(query)
        
        # 提取并清理标题
        title = result.get("response", "").strip()
        
        # 移除可能的引号
        title = title.strip('"\'""''')
        
        # 如果标题为空或过长，使用简单标题
        if not title or len(title) > 30:
            return generate_conversation_title(query)
        
        return title
        
    except Exception as e:
        # 如果发生错误，使用简单标题
        print(f"生成AI标题失败: {e}")
        return generate_conversation_title(query)