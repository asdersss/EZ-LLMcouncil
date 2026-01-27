"""
数据模型定义
使用 Pydantic 定义所有数据结构和验证规则
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Literal
from datetime import datetime


class Attachment(BaseModel):
    """附件模型"""
    name: Optional[str] = Field(None, description="文件名")
    filename: Optional[str] = Field(None, description="文件名(兼容字段)")
    content: str = Field(..., description="文件内容")
    type: Optional[str] = Field(None, description="MIME 类型")
    
    def model_post_init(self, __context):
        """初始化后处理:如果只有filename没有name,则将filename赋值给name"""
        if not self.name and self.filename:
            self.name = self.filename
        elif not self.filename and self.name:
            self.filename = self.name


class ChatRequest(BaseModel):
    """聊天请求模型"""
    conv_id: Optional[str] = Field(None, description="对话 ID，不提供则创建新对话")
    content: str = Field("", max_length=10000, description="用户消息内容")
    models: List[str] = Field(..., min_length=1, max_length=20, description="参会模型列表")
    attachments: Optional[List[Attachment]] = Field(None, description="附件列表")
    
    @field_validator('attachments', mode='after')
    @classmethod
    def validate_content_or_attachments(cls, v: Optional[List[Attachment]], info) -> Optional[List[Attachment]]:
        """验证内容和附件:至少要有一个"""
        content = info.data.get('content', '')
        
        # 如果内容为空且没有附件,则报错
        if (not content or not content.strip()) and (not v or len(v) == 0):
            raise ValueError("消息内容和附件不能同时为空")
        
        return v
    
    @field_validator('models')
    @classmethod
    def validate_models(cls, v: List[str]) -> List[str]:
        """验证模型列表"""
        if not v:
            raise ValueError("至少需要选择 1 个模型")
        if len(v) > 20:
            raise ValueError("最多只能选择 20 个模型")
        return v


class Stage1Result(BaseModel):
    """Stage 1 结果模型"""
    model: str = Field(..., description="模型标识符")
    response: str = Field(..., description="模型响应")
    timestamp: str = Field(..., description="时间戳 (ISO 8601)")
    error: Optional[str] = Field(None, description="错误信息")


class Stage2Result(BaseModel):
    """Stage 2 结果模型 - 打分制"""
    model: str = Field(..., description="评审模型标识符")
    scores: dict = Field(..., description="对各个答案的打分,格式: {label: score}")
    raw_response: str = Field(..., description="原始打分文本")
    timestamp: str = Field(..., description="时间戳 (ISO 8601)")
    error: Optional[str] = Field(None, description="错误信息")


class Stage3Result(BaseModel):
    """Stage 3 结果模型 - 主席综合答案和解析"""
    response: str = Field(..., description="综合答案和解析")
    timestamp: str = Field(..., description="时间戳 (ISO 8601)")
    error: Optional[str] = Field(None, description="错误信息")


class Stage4Result(BaseModel):
    """Stage 4 结果模型 - 打分汇总和排名"""
    rankings: List[dict] = Field(..., description="排名列表,格式: [{label, model, avg_score, response}]")
    best_answer: str = Field(..., description="得分最高的答案内容")
    timestamp: str = Field(..., description="时间戳 (ISO 8601)")
    error: Optional[str] = Field(None, description="错误信息")


class Message(BaseModel):
    """消息模型"""
    role: Literal["user", "assistant"] = Field(..., description="角色")
    timestamp: str = Field(..., description="消息时间戳 (ISO 8601)")
    
    # 用户消息字段
    content: Optional[str] = Field(None, description="用户消息内容")
    models: Optional[List[str]] = Field(None, description="参会模型列表")
    attachments: Optional[List[Attachment]] = Field(None, description="附件列表")
    
    # 助手消息字段
    stage1: Optional[List[Stage1Result]] = Field(None, description="Stage 1 结果")
    stage2: Optional[List[Stage2Result]] = Field(None, description="Stage 2 结果")
    stage3: Optional[Stage3Result] = Field(None, description="Stage 3 结果")
    stage4: Optional[Stage4Result] = Field(None, description="Stage 4 结果")


class Conversation(BaseModel):
    """对话模型"""
    id: str = Field(..., description="对话 ID")
    title: str = Field(..., description="对话标题")
    created_at: str = Field(..., description="创建时间 (ISO 8601)")
    updated_at: str = Field(..., description="更新时间 (ISO 8601)")
    messages: List[Message] = Field(default_factory=list, description="消息列表")


def get_iso_timestamp() -> str:
    """获取 ISO 8601 格式的当前时间戳"""
    return datetime.utcnow().isoformat() + "Z"