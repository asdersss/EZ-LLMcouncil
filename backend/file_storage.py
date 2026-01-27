"""
文件存储管理模块
负责文件的MD5计算、去重、元数据管理
"""
import os
import json
import hashlib
import shutil
from typing import Dict, List, Optional, Any
from datetime import datetime

# 文件存储目录
UPLOADS_DIR = "backend/uploads"
METADATA_FILE = "backend/file_metadata.json"

def ensure_directories():
    """确保必要的目录存在"""
    os.makedirs(UPLOADS_DIR, exist_ok=True)

def calculate_md5(file_path: str) -> str:
    """
    计算文件的MD5值
    
    Args:
        file_path: 文件路径
        
    Returns:
        MD5哈希值
    """
    md5_hash = hashlib.md5()
    with open(file_path, "rb") as f:
        # 分块读取以处理大文件
        for chunk in iter(lambda: f.read(4096), b""):
            md5_hash.update(chunk)
    return md5_hash.hexdigest()

def load_metadata() -> Dict[str, Any]:
    """
    加载文件元数据
    
    Returns:
        文件元数据字典
    """
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {"files": {}}
    return {"files": {}}

def save_metadata(metadata: Dict[str, Any]):
    """
    保存文件元数据
    
    Args:
        metadata: 文件元数据字典
    """
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

def get_file_by_md5(md5: str) -> Optional[Dict[str, Any]]:
    """
    根据MD5查找文件
    
    Args:
        md5: 文件MD5值
        
    Returns:
        文件信息或None
    """
    metadata = load_metadata()
    return metadata["files"].get(md5)

def add_file(
    file_path: str,
    original_filename: str,
    content: str,
    size: int,
    md5: Optional[str] = None
) -> Dict[str, Any]:
    """
    添加文件到存储系统
    
    Args:
        file_path: 文件存储路径
        original_filename: 原始文件名
        content: 文件内容(已提取的文本)
        size: 文件大小
        md5: 文件MD5(如果已计算)
        
    Returns:
        文件信息
    """
    ensure_directories()
    
    # 计算MD5(如果未提供)
    if md5 is None:
        md5 = calculate_md5(file_path)
    
    # 检查是否已存在
    existing_file = get_file_by_md5(md5)
    if existing_file:
        # 文件已存在,增加引用计数
        metadata = load_metadata()
        metadata["files"][md5]["reference_count"] += 1
        metadata["files"][md5]["last_accessed"] = datetime.now().isoformat()
        save_metadata(metadata)
        return metadata["files"][md5]
    
    # 新文件,添加到元数据
    file_info = {
        "md5": md5,
        "filename": original_filename,
        "stored_path": file_path,
        "content": content,
        "size": size,
        "reference_count": 1,
        "created_at": datetime.now().isoformat(),
        "last_accessed": datetime.now().isoformat()
    }
    
    metadata = load_metadata()
    metadata["files"][md5] = file_info
    save_metadata(metadata)
    
    return file_info

def get_all_files() -> List[Dict[str, Any]]:
    """
    获取所有文件列表
    
    Returns:
        文件信息列表
    """
    metadata = load_metadata()
    return list(metadata["files"].values())

def delete_file(md5: str) -> bool:
    """
    删除文件
    
    Args:
        md5: 文件MD5值
        
    Returns:
        是否删除成功
    """
    metadata = load_metadata()
    file_info = metadata["files"].get(md5)
    
    if not file_info:
        return False
    
    # 减少引用计数
    file_info["reference_count"] -= 1
    
    # 如果引用计数为0,删除文件
    if file_info["reference_count"] <= 0:
        # 删除物理文件
        if os.path.exists(file_info["stored_path"]):
            try:
                os.remove(file_info["stored_path"])
            except Exception:
                pass
        
        # 从元数据中删除
        del metadata["files"][md5]
    
    save_metadata(metadata)
    return True

def get_file_path(md5: str) -> Optional[str]:
    """
    获取文件的存储路径
    
    Args:
        md5: 文件MD5值
        
    Returns:
        文件路径或None
    """
    file_info = get_file_by_md5(md5)
    if file_info:
        return file_info["stored_path"]
    return None

def update_last_accessed(md5: str):
    """
    更新文件的最后访问时间
    
    Args:
        md5: 文件MD5值
    """
    metadata = load_metadata()
    if md5 in metadata["files"]:
        metadata["files"][md5]["last_accessed"] = datetime.now().isoformat()
        save_metadata(metadata)