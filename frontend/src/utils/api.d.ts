/**
 * API 类型声明
 */

/**
 * 启动新会议（后台运行）
 */
export function startMeeting(
  convId: string,
  content: string,
  models: string[],
  attachments?: any[]
): Promise<{
  meeting_id: string;
  conv_id: string;
  message: string;
}>;

/**
 * 获取会议状态
 */
export function getMeetingStatus(meetingId: string): Promise<{
  meeting_id: string;
  conv_id: string;
  status: string;
  progress: any;
  created_at: string;
  updated_at: string;
}>;

/**
 * 订阅会议更新流
 */
export function subscribeMeetingUpdates(meetingId: string): EventSource;

/**
 * 取消会议
 */
export function cancelMeeting(meetingId: string): Promise<{
  message: string;
  meeting_id: string;
}>;

/**
 * 列出对话的所有会议
 */
export function listConversationMeetings(convId: string): Promise<any[]>;

/**
 * 发送消息 (SSE) - 旧版本
 */
export function sendMessage(
  convId: string,
  content: string,
  models: string[],
  attachments?: any[]
): EventSource;

/**
 * 获取对话列表
 */
export function getConversations(): Promise<any[]>;

/**
 * 获取对话详情
 */
export function getConversation(convId: string): Promise<any>;

/**
 * 创建新对话
 */
export function createConversation(): Promise<any>;

/**
 * 删除对话
 */
export function deleteConversation(convId: string): Promise<void>;

/**
 * 获取模型列表
 */
export function getModels(): Promise<any[]>;

/**
 * 上传附件
 */
export function uploadAttachment(file: File): Promise<any>;

/**
 * 获取完整的模型配置
 */
export function getModelsConfig(): Promise<any>;

/**
 * 更新模型配置
 */
export function updateModelsConfig(models: any[], chairman: string): Promise<any>;

/**
 * 编辑消息
 */
export function editMessage(
  convId: string,
  messageIndex: number,
  newContent: string,
  newAttachments?: any[]
): Promise<any>;

/**
 * 删除消息
 */
export function deleteMessage(convId: string, messageIndex: number): Promise<any>;