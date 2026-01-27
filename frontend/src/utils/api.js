/**
 * API 调用工具
 * 提供与后端 API 交互的函数
 */

const API_BASE = '/api';

/**
 * 发送消息 (SSE)
 * @param {string} convId - 对话 ID
 * @param {string} content - 消息内容
 * @param {string[]} models - 模型列表
 * @param {Array} attachments - 附件列表
 * @returns {EventSource} SSE 连接
 */
export function sendMessage(convId, content, models, attachments = []) {
  // 构建查询参数
  const params = new URLSearchParams();
  params.append('conv_id', convId);
  params.append('content', content);
  models.forEach(model => params.append('models', model));
  
  // 如果有附件，添加到参数中(作为一个JSON数组)
  if (attachments && attachments.length > 0) {
    params.append('attachments', JSON.stringify(attachments));
  }

  // 创建 SSE 连接
  const url = `${API_BASE}/chat/stream?${params.toString()}`;
  const eventSource = new EventSource(url);

  return eventSource;
}

/**
 * 获取对话列表
 * @returns {Promise<Array>} 对话列表
 */
export async function getConversations() {
  try {
    const response = await fetch(`${API_BASE}/conversations`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.conversations || [];
  } catch (error) {
    console.error('获取对话列表失败:', error);
    throw error;
  }
}

/**
 * 获取对话详情
 * @param {string} convId - 对话 ID
 * @returns {Promise<Object>} 对话详情
 */
export async function getConversation(convId) {
  try {
    const response = await fetch(`${API_BASE}/conversations/${convId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('获取对话详情失败:', error);
    throw error;
  }
}

/**
 * 创建新对话
 * @returns {Promise<Object>} 新对话信息
 */
export async function createConversation() {
  try {
    const response = await fetch(`${API_BASE}/conversations/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('创建对话失败:', error);
    throw error;
  }
}

/**
 * 删除对话
 * @param {string} convId - 对话 ID
 * @returns {Promise<void>}
 */
export async function deleteConversation(convId) {
  try {
    const response = await fetch(`${API_BASE}/conversations/${convId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('删除对话失败:', error);
    throw error;
  }
}

/**
 * 获取模型列表
 * @returns {Promise<Array>} 模型列表
 */
export async function getModels() {
  try {
    const response = await fetch(`${API_BASE}/models`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    console.error('获取模型列表失败:', error);
    throw error;
  }
}

/**
 * 上传附件
 * @param {File} file - 文件对象
 * @returns {Promise<Object>} 上传结果
 */
export async function uploadAttachment(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('上传附件失败:', error);
    throw error;
  }
}

/**
 * 获取完整的模型配置（包含API密钥）
 * @returns {Promise<Object>} 模型配置
 */
export async function getModelsConfig() {
  try {
    const response = await fetch(`${API_BASE}/models/config`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('获取模型配置失败:', error);
    throw error;
  }
}

/**
 * 更新模型配置
 * @param {Array} models - 模型配置列表
 * @param {string} chairman - 主席模型名称
 * @returns {Promise<Object>} 更新结果
 */
export async function updateModelsConfig(models, chairman) {
  try {
    const response = await fetch(`${API_BASE}/models/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        models: models,
        chairman: chairman
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('更新模型配置失败:', error);
    throw error;
  }
}

/**
 * 编辑消息
 * @param {string} convId - 对话ID
 * @param {number} messageIndex - 消息索引
 * @param {string} newContent - 新的消息内容
 * @param {Array} newAttachments - 新的附件列表(可选)
 * @returns {Promise<Object>} 更新后的对话
 */
export async function editMessage(convId, messageIndex, newContent, newAttachments) {
  try {
    const requestBody = {
      message_index: messageIndex,
      new_content: newContent
    };
    
    // 如果提供了附件,添加到请求体中
    if (newAttachments !== undefined) {
      requestBody.new_attachments = newAttachments;
    }
    
    const response = await fetch(`${API_BASE}/conversations/${convId}/messages/${messageIndex}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('编辑消息失败:', error);
    throw error;
  }
}

/**
 * 删除消息
 * @param {string} convId - 对话ID
 * @param {number} messageIndex - 消息索引
 * @returns {Promise<Object>} 更新后的对话
 */
export async function deleteMessage(convId, messageIndex) {
  try {
    const response = await fetch(`${API_BASE}/conversations/${convId}/messages/${messageIndex}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('删除消息失败:', error);
    throw error;
  }
}