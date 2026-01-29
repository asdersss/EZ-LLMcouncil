/**
 * API 调用工具
 * 提供与后端 API 交互的函数
 */

const API_BASE = '/api';

/**
 * 启动新会议（后台运行）
 * @param {string} convId - 对话 ID
 * @param {string} content - 消息内容
 * @param {string[]} models - 模型列表
 * @param {Array} attachments - 附件列表
 * @returns {Promise<Object>} 会议信息
 */
export async function startMeeting(convId, content, models, attachments = []) {
  try {
    const response = await fetch(`${API_BASE}/meetings/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conv_id: convId,
        content: content,
        models: models,
        attachments: attachments || []
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('启动会议失败:', error);
    throw error;
  }
}

/**
 * 获取会议状态
 * @param {string} meetingId - 会议 ID
 * @returns {Promise<Object>} 会议状态
 */
export async function getMeetingStatus(meetingId) {
  try {
    const response = await fetch(`${API_BASE}/meetings/${meetingId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('获取会议状态失败:', error);
    throw error;
  }
}

/**
 * 订阅会议更新流
 * @param {string} meetingId - 会议 ID
 * @returns {Object} EventSource 兼容对象
 */
export function subscribeMeetingUpdates(meetingId) {
  const url = `${API_BASE}/meetings/${meetingId}/stream`;
  
  // 创建一个模拟 EventSource 的对象
  const eventSource = {
    _listeners: {},
    _controller: null,
    
    addEventListener(event, callback) {
      if (!this._listeners[event]) {
        this._listeners[event] = [];
      }
      this._listeners[event].push(callback);
    },
    
    close() {
      if (this._controller) {
        this._controller.abort();
        this._controller = null;
      }
    },
    
    _emit(event, data) {
      const listeners = this._listeners[event] || [];
      listeners.forEach(callback => {
        callback({ data: data });
      });
    },
    
    _emitError(error) {
      const listeners = this._listeners['error'] || [];
      listeners.forEach(callback => {
        callback(error);
      });
    }
  };
  
  // 设置 onmessage 和 onerror 属性
  Object.defineProperty(eventSource, 'onmessage', {
    set(callback) {
      this.addEventListener('message', callback);
    }
  });
  
  Object.defineProperty(eventSource, 'onerror', {
    set(callback) {
      this.addEventListener('error', callback);
    }
  });
  
  // 启动 fetch 请求
  const controller = new AbortController();
  eventSource._controller = controller;
  
  fetch(url, {
    method: 'GET',
    signal: controller.signal
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    function processText({ done, value }) {
      if (done) {
        return;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      // 处理 SSE 格式: event: xxx\ndata: xxx\n\n
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || ''; // 保留不完整的消息
      
      for (const message of messages) {
        if (!message.trim()) continue;
        
        const lines = message.split('\n');
        let eventType = 'message';
        let data = '';
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            data = line.substring(5).trim();
          }
        }
        
        if (data) {
          eventSource._emit(eventType, data);
        }
      }
      
      return reader.read().then(processText);
    }
    
    return reader.read().then(processText);
  })
  .catch(error => {
    if (error.name !== 'AbortError') {
      console.error('SSE connection error:', error);
      eventSource._emitError(error);
    }
  });
  
  return eventSource;
}

/**
 * 取消会议
 * @param {string} meetingId - 会议 ID
 * @returns {Promise<Object>} 取消结果
 */
export async function cancelMeeting(meetingId) {
  try {
    const response = await fetch(`${API_BASE}/meetings/${meetingId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('取消会议失败:', error);
    throw error;
  }
}

/**
 * 列出对话的所有会议
 * @param {string} convId - 对话 ID
 * @returns {Promise<Array>} 会议列表
 */
export async function listConversationMeetings(convId) {
  try {
    const response = await fetch(`${API_BASE}/conversations/${convId}/meetings`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.meetings || [];
  } catch (error) {
    console.error('列出会议失败:', error);
    throw error;
  }
}

/**
 * 发送消息 (SSE) - 旧版本，保持向后兼容
 * @param {string} convId - 对话 ID
 * @param {string} content - 消息内容
 * @param {string[]} models - 模型列表
 * @param {Array} attachments - 附件列表
 * @returns {Object} 包含 EventSource 兼容接口的对象
 */
export function sendMessage(convId, content, models, attachments = []) {
  // 使用 POST 方式发送请求，避免 URL 长度限制
  const url = `${API_BASE}/chat`;
  
  // 创建一个模拟 EventSource 的对象
  const eventSource = {
    _listeners: {},
    _controller: null,
    
    addEventListener(event, callback) {
      if (!this._listeners[event]) {
        this._listeners[event] = [];
      }
      this._listeners[event].push(callback);
    },
    
    close() {
      if (this._controller) {
        this._controller.abort();
        this._controller = null;
      }
    },
    
    _emit(event, data) {
      const listeners = this._listeners[event] || [];
      listeners.forEach(callback => {
        callback({ data: data });
      });
    },
    
    _emitError(error) {
      const listeners = this._listeners['error'] || [];
      listeners.forEach(callback => {
        callback(error);
      });
    }
  };
  
  // 设置 onmessage 和 onerror 属性
  Object.defineProperty(eventSource, 'onmessage', {
    set(callback) {
      this.addEventListener('message', callback);
    }
  });
  
  Object.defineProperty(eventSource, 'onerror', {
    set(callback) {
      this.addEventListener('error', callback);
    }
  });
  
  // 启动 fetch 请求
  const controller = new AbortController();
  eventSource._controller = controller;
  
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conv_id: convId,
      content: content,
      models: models,
      attachments: attachments || []
    }),
    signal: controller.signal
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    function processText({ done, value }) {
      if (done) {
        return;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      // 处理 SSE 格式: event: xxx\ndata: xxx\n\n
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || ''; // 保留不完整的消息
      
      for (const message of messages) {
        if (!message.trim()) continue;
        
        const lines = message.split('\n');
        let eventType = 'message';
        let data = '';
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            data = line.substring(5).trim();
          }
        }
        
        if (data) {
          eventSource._emit(eventType, data);
        }
      }
      
      return reader.read().then(processText);
    }
    
    return reader.read().then(processText);
  })
  .catch(error => {
    if (error.name !== 'AbortError') {
      console.error('SSE connection error:', error);
      eventSource._emitError(error);
    }
  });
  
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