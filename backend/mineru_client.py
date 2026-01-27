"""
MinerU API 客户端
实现文档解析的完整流程
"""

import requests
import json
import time
import zipfile
import io
import os
import logging
from typing import Dict, Any, Optional, Tuple, List
from pathlib import Path

logger = logging.getLogger(__name__)


class MinerUClient:
    """MinerU API 客户端"""
    
    def __init__(self, api_token: str, base_url: str = "https://mineru.net/api/v4"):
        """
        初始化MinerU客户端
        
        Args:
            api_token: API令牌
            base_url: API基础URL
        """
        self.api_token = api_token
        self.base_url = base_url
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_token}"
        }
    
    def submit_task(
        self,
        file_url: str,
        model_version: str = "pipeline",
        is_ocr: bool = False,
        enable_formula: bool = True,
        enable_table: bool = True,
        language: str = "ch",
        data_id: Optional[str] = None,
        callback: Optional[str] = None,
        seed: Optional[str] = None,
        extra_formats: Optional[List[str]] = None,
        page_ranges: Optional[str] = None
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        提交文档解析任务
        
        Args:
            file_url: 文件URL
            model_version: 模型版本 (pipeline/vlm/MinerU-HTML)
            is_ocr: 是否启用OCR
            enable_formula: 是否启用公式识别
            enable_table: 是否启用表格识别
            language: 文档语言
            data_id: 数据ID
            callback: 回调URL
            seed: 随机字符串
            extra_formats: 额外导出格式
            page_ranges: 页码范围
            
        Returns:
            (task_id, error) 元组
        """
        try:
            url = f"{self.base_url}/extract/task"
            
            data = {
                "url": file_url,
                "model_version": model_version
            }
            
            # 添加可选参数
            if model_version != "MinerU-HTML":  # HTML文件不支持这些参数
                if is_ocr:
                    data["is_ocr"] = is_ocr
                if not enable_formula:
                    data["enable_formula"] = enable_formula
                if not enable_table:
                    data["enable_table"] = enable_table
                if language != "ch":
                    data["language"] = language
            
            if data_id:
                data["data_id"] = data_id
            if callback:
                data["callback"] = callback
            if seed:
                data["seed"] = seed
            if extra_formats:
                data["extra_formats"] = extra_formats
            if page_ranges:
                data["page_ranges"] = page_ranges
            
            logger.info(f"提交MinerU任务: {data}")
            
            response = requests.post(url, headers=self.headers, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("code") == 0:
                    task_id = result.get("data", {}).get("task_id")
                    logger.info(f"任务提交成功: task_id={task_id}")
                    return task_id, None
                else:
                    error_msg = result.get("msg", "未知错误")
                    logger.error(f"任务提交失败: {error_msg}")
                    return None, error_msg
            else:
                error_msg = f"HTTP错误: {response.status_code}"
                logger.error(error_msg)
                return None, error_msg
                
        except Exception as e:
            error_msg = f"提交任务异常: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return None, error_msg
    
    def query_task(self, task_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """
        查询任务状态
        
        Args:
            task_id: 任务ID
            
        Returns:
            (task_data, error) 元组
            task_data包含: state, full_zip_url, err_msg, extract_progress等
        """
        try:
            url = f"{self.base_url}/extract/task/{task_id}"
            
            response = requests.get(url, headers=self.headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("code") == 0:
                    task_data: Dict[str, Any] = result.get("data", {})
                    return task_data, None
                else:
                    error_msg = result.get("msg", "未知错误")
                    return None, error_msg
            else:
                error_msg = f"HTTP错误: {response.status_code}"
                return None, error_msg
                
        except Exception as e:
            error_msg = f"查询任务异常: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return None, error_msg
    
    def wait_for_completion(
        self,
        task_id: str,
        max_wait_time: int = 600,
        poll_interval: int = 5
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        等待任务完成
        
        Args:
            task_id: 任务ID
            max_wait_time: 最大等待时间(秒)
            poll_interval: 轮询间隔(秒)
            
        Returns:
            (full_zip_url, error) 元组
        """
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            task_data, error = self.query_task(task_id)
            
            if error or task_data is None:
                return None, error or "查询任务失败"
            
            state = task_data.get("state")
            
            if state == "done":
                full_zip_url = task_data.get("full_zip_url")
                logger.info(f"任务完成: task_id={task_id}, url={full_zip_url}")
                return full_zip_url, None
            elif state == "failed":
                err_msg = task_data.get("err_msg", "解析失败")
                logger.error(f"任务失败: {err_msg}")
                return None, err_msg
            elif state in ["pending", "running", "converting"]:
                # 记录进度
                progress = task_data.get("extract_progress", {})
                if progress:
                    extracted = progress.get("extracted_pages", 0)
                    total = progress.get("total_pages", 0)
                    logger.info(f"解析进度: {extracted}/{total}")
                
                time.sleep(poll_interval)
            else:
                logger.warning(f"未知状态: {state}")
                time.sleep(poll_interval)
        
        return None, f"任务超时: 超过{max_wait_time}秒"
    
    def download_and_extract_content(self, zip_url: str) -> Tuple[Optional[str], Optional[str]]:
        """
        下载并提取ZIP文件中的markdown内容
        
        Args:
            zip_url: ZIP文件URL
            
        Returns:
            (content, error) 元组
        """
        try:
            logger.info(f"下载结果文件: {zip_url}")
            
            # 下载ZIP文件
            response = requests.get(zip_url, timeout=60)
            
            if response.status_code != 200:
                return None, f"下载失败: HTTP {response.status_code}"
            
            # 解压ZIP文件
            with zipfile.ZipFile(io.BytesIO(response.content)) as zip_file:
                # 查找markdown文件
                md_files = [f for f in zip_file.namelist() if f.endswith('.md')]
                
                if not md_files:
                    return None, "ZIP文件中未找到markdown文件"
                
                # 读取第一个markdown文件
                md_file = md_files[0]
                logger.info(f"提取markdown文件: {md_file}")
                
                with zip_file.open(md_file) as f:
                    content = f.read().decode('utf-8', errors='ignore')
                    return content, None
                    
        except Exception as e:
            error_msg = f"下载或提取内容失败: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return None, error_msg
    
    def parse_document(
        self,
        file_url: str,
        model_version: str = "pipeline",
        max_wait_time: int = 600,
        **kwargs
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        完整的文档解析流程
        
        Args:
            file_url: 文件URL
            model_version: 模型版本
            max_wait_time: 最大等待时间
            **kwargs: 其他参数
            
        Returns:
            (content, error) 元组
        """
        # 1. 提交任务
        task_id, error = self.submit_task(file_url, model_version, **kwargs)
        if error or task_id is None:
            return None, error or "提交任务失败"
        
        # 2. 等待完成
        zip_url, error = self.wait_for_completion(task_id, max_wait_time)
        if error or zip_url is None:
            return None, error or "等待任务完成失败"
        
        # 3. 下载并提取内容
        content, error = self.download_and_extract_content(zip_url)
        if error:
            return None, error
        
        return content, None
    
    def batch_upload_files(
        self,
        files: List[Dict[str, Any]],
        model_version: str = "pipeline",
        **kwargs
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """
        批量上传文件
        
        Args:
            files: 文件列表，每个文件包含name和可选的data_id, is_ocr, page_ranges
            model_version: 模型版本
            **kwargs: 其他参数
            
        Returns:
            (result, error) 元组
            result包含: batch_id, file_urls
        """
        try:
            url = f"{self.base_url}/file-urls/batch"
            
            data = {
                "files": files,
                "model_version": model_version
            }
            
            # 添加可选参数
            if model_version != "MinerU-HTML":
                if kwargs.get("enable_formula") is not None:
                    data["enable_formula"] = kwargs["enable_formula"]
                if kwargs.get("enable_table") is not None:
                    data["enable_table"] = kwargs["enable_table"]
                if kwargs.get("language"):
                    data["language"] = kwargs["language"]
            
            if kwargs.get("callback"):
                data["callback"] = kwargs["callback"]
            if kwargs.get("seed"):
                data["seed"] = kwargs["seed"]
            if kwargs.get("extra_formats"):
                data["extra_formats"] = kwargs["extra_formats"]
            
            logger.info(f"批量上传文件: {len(files)}个文件")
            
            response = requests.post(url, headers=self.headers, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("code") == 0:
                    data = result.get("data", {})
                    batch_id = data.get("batch_id")
                    file_urls = data.get("file_urls", [])
                    logger.info(f"批量上传成功: batch_id={batch_id}, {len(file_urls)}个URL")
                    return {"batch_id": batch_id, "file_urls": file_urls}, None
                else:
                    error_msg = result.get("msg", "未知错误")
                    return None, error_msg
            else:
                error_msg = f"HTTP错误: {response.status_code}"
                return None, error_msg
                
        except Exception as e:
            error_msg = f"批量上传异常: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return None, error_msg
    
    def upload_file_to_url(self, file_path: str, upload_url: str) -> Optional[str]:
        """
        上传文件到指定URL
        
        Args:
            file_path: 本地文件路径
            upload_url: 上传URL
            
        Returns:
            错误信息，成功返回None
        """
        try:
            with open(file_path, 'rb') as f:
                response = requests.put(upload_url, data=f, timeout=120)
                
                if response.status_code == 200:
                    logger.info(f"文件上传成功: {file_path}")
                    return None
                else:
                    error_msg = f"上传失败: HTTP {response.status_code}"
                    logger.error(error_msg)
                    return error_msg
                    
        except Exception as e:
            error_msg = f"上传文件异常: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return error_msg
    
    def query_batch_results(self, batch_id: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
        """
        查询批量任务结果
        
        Args:
            batch_id: 批次ID
            
        Returns:
            (results, error) 元组
            results是文件结果列表
        """
        try:
            url = f"{self.base_url}/extract-results/batch/{batch_id}"
            
            response = requests.get(url, headers=self.headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("code") == 0:
                    data = result.get("data", {})
                    extract_results = data.get("extract_result", [])
                    return extract_results, None
                else:
                    error_msg = result.get("msg", "未知错误")
                    return None, error_msg
            else:
                error_msg = f"HTTP错误: {response.status_code}"
                return None, error_msg
                
        except Exception as e:
            error_msg = f"查询批量结果异常: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return None, error_msg