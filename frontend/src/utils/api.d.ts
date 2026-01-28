/**
 * API 类型声明文件
 */

export interface Model {
  name: string;
  display_name: string;
  description: string;
  is_chair: boolean;
}

export interface Attachment {
  name: string;
  content: string;
  type?: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: any[];
}

/**
 * 发送消息 (SSE)
 */
export function sendMessage(
  convId: string,
  content: string,
  models: string[],
  attachments?: Attachment[]
): EventSource;

/**
 * 获取对话列表
 */
export function getConversations(): Promise<Conversation[]>;

/**
 * 获取对话详情
 */
export function getConversation(convId: string): Promise<Conversation>;

/**
 * 创建新对话
 */
export function createConversation(): Promise<Conversation>;

/**
 * 删除对话
 */
export function deleteConversation(convId: string): Promise<void>;

/**
 * 获取模型列表
 */
export function getModels(): Promise<Model[]>;

/**
 * 上传附件
 */
export function uploadAttachment(file: File): Promise<any>;

/**
 * 模型配置接口
 */
export interface ModelConfig {
  name: string;
  url: string;
  api_key: string;
  api_model_name?: string;
  display_name: string;
  description: string;
}

/**
 * 获取完整的模型配置（包含API密钥）
 */
export function getModelsConfig(): Promise<{
  models: ModelConfig[];
  chairman: string;
}>;

/**
 * 更新模型配置
 */
export function updateModelsConfig(
  models: ModelConfig[],
  chairman: string
): Promise<{
  models: ModelConfig[];
  chairman: string;
  message: string;
}>;

/**
 * 编辑消息
 */
export function editMessage(
  convId: string,
  messageIndex: number,
  newContent: string,
  newAttachments?: any[]
): Promise<Conversation>;

/**
 * 删除消息
 */
export function deleteMessage(
  convId: string,
  messageIndex: number
): Promise<Conversation>;