"""
会议管理器 - 管理所有进行中的AI会议
支持后台运行和多对话并发
"""

import asyncio
import logging
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class MeetingStatus(Enum):
    """会议状态枚举"""
    PENDING = "pending"  # 等待开始
    STAGE1 = "stage1"  # Stage 1 进行中
    STAGE2 = "stage2"  # Stage 2 进行中
    STAGE3 = "stage3"  # Stage 3 进行中
    STAGE4 = "stage4"  # Stage 4 进行中
    COMPLETED = "completed"  # 已完成
    FAILED = "failed"  # 失败
    CANCELLED = "cancelled"  # 已取消


@dataclass
class MeetingProgress:
    """会议进度数据"""
    stage1_results: List[Dict[str, Any]] = field(default_factory=list)
    stage2_results: List[Dict[str, Any]] = field(default_factory=list)
    stage3_result: Optional[Dict[str, Any]] = None
    stage4_result: Optional[Dict[str, Any]] = None
    model_statuses: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    current_stage: str = "pending"
    error: Optional[str] = None


@dataclass
class Meeting:
    """会议对象"""
    meeting_id: str
    conv_id: str
    content: str
    models: List[str]
    attachments: List[Dict[str, Any]]
    status: MeetingStatus
    progress: MeetingProgress
    created_at: str
    updated_at: str
    task: Optional[asyncio.Task] = None
    subscribers: List[asyncio.Queue] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            "meeting_id": self.meeting_id,
            "conv_id": self.conv_id,
            "content": self.content,
            "models": self.models,
            "status": self.status.value,
            "progress": {
                "stage1_results": self.progress.stage1_results,
                "stage2_results": self.progress.stage2_results,
                "stage3_result": self.progress.stage3_result,
                "stage4_result": self.progress.stage4_result,
                "model_statuses": self.progress.model_statuses,
                "current_stage": self.progress.current_stage,
                "error": self.progress.error
            },
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }


class CouncilManager:
    """会议管理器 - 单例模式"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._meetings: Dict[str, Meeting] = {}
        self._lock = asyncio.Lock()
        self._initialized = True
        logger.info("会议管理器已初始化")
    
    async def create_meeting(
        self,
        conv_id: str,
        content: str,
        models: List[str],
        attachments: List[Dict[str, Any]],
        config: Dict[str, Any]
    ) -> str:
        """
        创建新会议
        
        Args:
            conv_id: 对话ID
            content: 用户消息内容
            models: 参会模型列表
            attachments: 附件列表
            config: 配置信息
            
        Returns:
            meeting_id: 会议ID
        """
        async with self._lock:
            meeting_id = str(uuid.uuid4())
            now = datetime.utcnow().isoformat() + "Z"
            
            meeting = Meeting(
                meeting_id=meeting_id,
                conv_id=conv_id,
                content=content,
                models=models,
                attachments=attachments,
                status=MeetingStatus.PENDING,
                progress=MeetingProgress(),
                created_at=now,
                updated_at=now
            )
            
            self._meetings[meeting_id] = meeting
            
            # 启动会议任务
            meeting.task = asyncio.create_task(
                self._run_meeting(meeting_id, config)
            )
            
            logger.info(f"创建会议: {meeting_id}, 对话: {conv_id}, 模型数: {len(models)}")
            return meeting_id
    
    async def _run_meeting(self, meeting_id: str, config: Dict[str, Any]):
        """
        运行会议（后台任务）
        
        Args:
            meeting_id: 会议ID
            config: 配置信息
        """
        try:
            meeting = self._meetings.get(meeting_id)
            if not meeting:
                logger.error(f"会议不存在: {meeting_id}")
                return
            
            logger.info(f"会议开始: {meeting_id}")
            
            # 导入必要的模块
            from council_streaming import collect_responses_with_progress
            from council import (
                collect_scores_with_progress,
                synthesize_final,
                calculate_final_ranking,
                build_context
            )
            from storage import load_conversation
            
            # 加载对话历史
            conversation = load_conversation(meeting.conv_id)
            if not conversation:
                raise Exception(f"对话不存在: {meeting.conv_id}")
            
            history = conversation.get("messages", [])
            context = build_context(history[:-1], max_turns=3)
            
            # 准备模型配置
            model_configs = {}
            providers = config.get("providers", [])
            for provider in providers:
                provider_name = provider.get("name", "")
                provider_models = provider.get("models", [])
                
                for model in provider_models:
                    model_name = model.get("name", "")
                    full_model_name = f"{model_name}/{provider_name}"
                    
                    model_configs[full_model_name] = {
                        "name": full_model_name,
                        "display_name": model.get("display_name", model_name),
                        "description": model.get("description", ""),
                        "url": provider.get("url", ""),
                        "api_key": provider.get("api_key", ""),
                        "api_type": provider.get("api_type", "openai"),
                        "provider": provider_name
                    }
            
            settings = config.get("settings", {})
            temperature = settings.get("temperature", 0.7)
            timeout = settings.get("timeout", 120)
            max_retries = settings.get("max_retries", 3)
            max_concurrent = settings.get("max_concurrent", 10)
            chairman = config.get("chairman", "")
            
            # Stage 1: 收集响应
            meeting.status = MeetingStatus.STAGE1
            meeting.progress.current_stage = "stage1"
            await self._broadcast_update(meeting_id, {
                "type": "stage1_start",
                "message": "开始 Stage 1: 并行查询模型"
            })
            
            async for result in collect_responses_with_progress(
                query=meeting.content,
                context=context,
                attachments=meeting.attachments,
                models=meeting.models,
                model_configs=model_configs,
                temperature=temperature,
                timeout=timeout,
                max_retries=max_retries,
                max_concurrent=max_concurrent
            ):
                if result.get("type") == "retry":
                    await self._broadcast_update(meeting_id, {
                        "type": "stage1_progress",
                        "data": result
                    })
                else:
                    meeting.progress.stage1_results.append(result)
                    await self._broadcast_update(meeting_id, {
                        "type": "stage1_progress",
                        "data": result
                    })
            
            await self._broadcast_update(meeting_id, {
                "type": "stage1_complete",
                "results": meeting.progress.stage1_results
            })
            
            # Stage 2: 同行评审
            meeting.status = MeetingStatus.STAGE2
            meeting.progress.current_stage = "stage2"
            await self._broadcast_update(meeting_id, {
                "type": "stage2_start",
                "message": "开始 Stage 2: 匿名同行评审"
            })
            
            async for result in collect_scores_with_progress(
                query=meeting.content,
                stage1_results=meeting.progress.stage1_results,
                context=context,
                models=meeting.models,
                model_configs=model_configs,
                temperature=temperature,
                timeout=timeout,
                max_retries=max_retries,
                max_concurrent=max_concurrent
            ):
                if result.get("type") == "label_mapping":
                    await self._broadcast_update(meeting_id, {
                        "type": "stage2_label_mapping",
                        "data": result
                    })
                else:
                    meeting.progress.stage2_results.append(result)
                    await self._broadcast_update(meeting_id, {
                        "type": "stage2_progress",
                        "data": result
                    })
            
            await self._broadcast_update(meeting_id, {
                "type": "stage2_complete",
                "results": meeting.progress.stage2_results
            })
            
            # Stage 3: 主席综合
            meeting.status = MeetingStatus.STAGE3
            meeting.progress.current_stage = "stage3"
            await self._broadcast_update(meeting_id, {
                "type": "stage3_start",
                "message": "开始 Stage 3: 主席综合答案"
            })
            
            stage3_result = await synthesize_final(
                query=meeting.content,
                stage1_results=meeting.progress.stage1_results,
                stage2_results=meeting.progress.stage2_results,
                context=context,
                chairman_model=chairman,
                model_configs=model_configs,
                temperature=temperature,
                timeout=timeout,
                max_retries=max_retries
            )
            
            meeting.progress.stage3_result = stage3_result
            await self._broadcast_update(meeting_id, {
                "type": "stage3_complete",
                "data": stage3_result
            })
            
            # Stage 4: 计算排名
            meeting.status = MeetingStatus.STAGE4
            meeting.progress.current_stage = "stage4"
            await self._broadcast_update(meeting_id, {
                "type": "stage4_start",
                "message": "开始 Stage 4: 汇总打分和排名"
            })
            
            stage4_result = await calculate_final_ranking(
                stage1_results=meeting.progress.stage1_results,
                stage2_results=meeting.progress.stage2_results
            )
            
            meeting.progress.stage4_result = stage4_result
            await self._broadcast_update(meeting_id, {
                "type": "stage4_complete",
                "data": stage4_result
            })
            
            # 完成
            meeting.status = MeetingStatus.COMPLETED
            meeting.progress.current_stage = "completed"
            meeting.updated_at = datetime.utcnow().isoformat() + "Z"
            
            # 保存消息到对话
            await self._save_meeting_to_conversation(meeting_id, meeting, config)
            
            await self._broadcast_update(meeting_id, {
                "type": "complete",
                "message": "会议完成"
            })
            
            logger.info(f"会议完成: {meeting_id}")
            
        except asyncio.CancelledError:
            logger.info(f"会议被取消: {meeting_id}")
            meeting = self._meetings.get(meeting_id)
            if meeting:
                meeting.status = MeetingStatus.CANCELLED
                meeting.updated_at = datetime.utcnow().isoformat() + "Z"
            raise
            
        except Exception as e:
            logger.error(f"会议执行失败: {meeting_id}, 错误: {e}", exc_info=True)
            meeting = self._meetings.get(meeting_id)
            if meeting:
                meeting.status = MeetingStatus.FAILED
                meeting.progress.error = str(e)
                meeting.updated_at = datetime.utcnow().isoformat() + "Z"
                
                await self._broadcast_update(meeting_id, {
                    "type": "error",
                    "error": str(e)
                })
    
    async def _broadcast_update(self, meeting_id: str, update: Dict[str, Any]):
        """
        广播更新到所有订阅者
        
        Args:
            meeting_id: 会议ID
            update: 更新数据
        """
        meeting = self._meetings.get(meeting_id)
        if not meeting:
            return
        
        # 移除已关闭的订阅者
        active_subscribers = []
        for queue in meeting.subscribers:
            try:
                queue.put_nowait(update)
                active_subscribers.append(queue)
            except asyncio.QueueFull:
                logger.warning(f"订阅者队列已满，跳过更新")
                active_subscribers.append(queue)
            except Exception as e:
                logger.warning(f"广播更新失败: {e}")
        
        meeting.subscribers = active_subscribers
    
    async def subscribe(self, meeting_id: str) -> asyncio.Queue:
        """
        订阅会议更新
        
        Args:
            meeting_id: 会议ID
            
        Returns:
            更新队列
        """
        async with self._lock:
            meeting = self._meetings.get(meeting_id)
            if not meeting:
                raise ValueError(f"会议不存在: {meeting_id}")
            
            queue = asyncio.Queue(maxsize=1000)
            meeting.subscribers.append(queue)
            
            # 发送当前进度
            await queue.put({
                "type": "progress",
                "data": meeting.to_dict()
            })
            
            logger.info(f"新订阅者加入会议: {meeting_id}")
            return queue
    
    async def unsubscribe(self, meeting_id: str, queue: asyncio.Queue):
        """
        取消订阅会议更新
        
        Args:
            meeting_id: 会议ID
            queue: 订阅队列
        """
        async with self._lock:
            meeting = self._meetings.get(meeting_id)
            if meeting and queue in meeting.subscribers:
                meeting.subscribers.remove(queue)
                logger.info(f"订阅者离开会议: {meeting_id}")
    
    async def get_meeting(self, meeting_id: str) -> Optional[Dict[str, Any]]:
        """
        获取会议信息
        
        Args:
            meeting_id: 会议ID
            
        Returns:
            会议信息字典
        """
        meeting = self._meetings.get(meeting_id)
        if meeting:
            return meeting.to_dict()
        return None
    
    async def cancel_meeting(self, meeting_id: str):
        """
        取消会议
        
        Args:
            meeting_id: 会议ID
        """
        async with self._lock:
            meeting = self._meetings.get(meeting_id)
            if meeting and meeting.task and not meeting.task.done():
                meeting.task.cancel()
                logger.info(f"会议已取消: {meeting_id}")
    
    async def list_meetings(self, conv_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        列出所有会议
        
        Args:
            conv_id: 可选，只列出指定对话的会议
            
        Returns:
            会议列表
        """
        meetings = []
        for meeting in self._meetings.values():
            if conv_id is None or meeting.conv_id == conv_id:
                meetings.append(meeting.to_dict())
        return meetings
    
    async def cleanup_completed_meetings(self, max_age_hours: int = 24):
        """
        清理已完成的旧会议
        
        Args:
            max_age_hours: 最大保留时间（小时）
        """
        async with self._lock:
            now = datetime.utcnow()
            to_remove = []
            
            for meeting_id, meeting in self._meetings.items():
                if meeting.status in [MeetingStatus.COMPLETED, MeetingStatus.FAILED, MeetingStatus.CANCELLED]:
                    updated_at = datetime.fromisoformat(meeting.updated_at.replace('Z', '+00:00'))
                    age_hours = (now - updated_at.replace(tzinfo=None)).total_seconds() / 3600
                    
                    if age_hours > max_age_hours:
                        to_remove.append(meeting_id)
            
            for meeting_id in to_remove:
                del self._meetings[meeting_id]
                logger.info(f"清理旧会议: {meeting_id}")
            
            if to_remove:
                logger.info(f"清理了 {len(to_remove)} 个旧会议")
    
    async def _save_meeting_to_conversation(self, meeting_id: str, meeting: 'Meeting', config: Dict[str, Any]):
        """
        保存会议结果到对话
        
        Args:
            meeting_id: 会议ID
            meeting: 会议对象
            config: 配置信息
        """
        try:
            from storage import load_conversation, save_conversation, generate_ai_title
            from models import get_iso_timestamp
            
            # 加载对话
            conversation = load_conversation(meeting.conv_id)
            if not conversation:
                logger.error(f"对话不存在: {meeting.conv_id}")
                return
            
            # 检查是否已经保存过（避免重复保存）
            messages = conversation.get("messages", [])
            if messages and messages[-1].get("role") == "assistant":
                # 最后一条消息已经是助手消息，可能已经保存过了
                logger.info(f"对话已有助手消息，跳过保存: {meeting.conv_id}")
                return
            
            # 保存助手消息
            assistant_message = {
                "role": "assistant",
                "stage1": meeting.progress.stage1_results,
                "stage2": meeting.progress.stage2_results,
                "stage3": meeting.progress.stage3_result or {},
                "stage4": meeting.progress.stage4_result or {},
                "timestamp": get_iso_timestamp()
            }
            conversation["messages"].append(assistant_message)
            
            # 如果是第一轮对话，使用AI生成标题
            if len(conversation["messages"]) == 2:
                try:
                    chairman = config.get("chairman", "")
                    model_configs = {}
                    providers = config.get("providers", [])
                    for provider in providers:
                        provider_name = provider.get("name", "")
                        provider_models = provider.get("models", [])
                        for model in provider_models:
                            model_name = model.get("name", "")
                            full_model_name = f"{model_name}/{provider_name}"
                            model_configs[full_model_name] = {
                                "name": full_model_name,
                                "url": provider.get("url", ""),
                                "api_key": provider.get("api_key", ""),
                                "api_type": provider.get("api_type", "openai"),
                            }
                    
                    stage3_result = meeting.progress.stage3_result or {}
                    ai_title = await generate_ai_title(
                        query=meeting.content,
                        response=stage3_result.get("response", ""),
                        chairman_model=chairman,
                        model_configs=model_configs
                    )
                    conversation["title"] = ai_title
                    logger.info(f"AI生成对话标题: {ai_title}")
                except Exception as e:
                    logger.warning(f"AI生成标题失败: {e}")
            
            # 更新对话时间戳
            conversation["updated_at"] = get_iso_timestamp()
            
            # 保存对话
            save_conversation(meeting.conv_id, conversation)
            logger.info(f"会议结果已保存到对话: {meeting.conv_id}")
            
        except Exception as e:
            logger.error(f"保存会议到对话失败: {e}", exc_info=True)


# 全局会议管理器实例
council_manager = CouncilManager()