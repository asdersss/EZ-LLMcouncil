import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getConversation, sendMessage } from '../utils/api';
import InputArea from './InputArea';
import ModelSelector from './ModelSelector';
import './ChatView.css';

/**
 * ChatView 组件
 * 主聊天界面，显示消息历史和处理消息发送
 */
function ChatView({ conversationId }) {
  const [messages, setMessages] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  // 加载对话历史
  useEffect(() => {
    if (conversationId) {
      loadConversation();
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  // 自动滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversation = async () => {
    try {
      setLoading(true);
      setError(null);
      const conv = await getConversation(conversationId);
      setMessages(conv.messages || []);
    } catch (err) {
      setError('加载对话失败: ' + err.message);
      console.error('加载对话失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 处理发送消息
  const handleSendMessage = (content, attachments) => {
    if (!conversationId) {
      setError('请先选择或创建一个对话');
      return;
    }

    if (selectedModels.length === 0) {
      setError('请至少选择一个模型');
      return;
    }

    // 添加用户消息到界面
    const userMessage = {
      role: 'user',
      content: content,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    // 开始流式响应
    setStreaming(true);
    setError(null);

    // 创建 SSE 连接
    try {
      const eventSource = sendMessage(conversationId, content, selectedModels, attachments);
      eventSourceRef.current = eventSource;

      // 用于累积流式响应
      const streamingMessages = {};

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'chunk') {
            // 处理流式数据块
            const { model, content: chunk } = data;
            
            if (!streamingMessages[model]) {
              streamingMessages[model] = {
                role: 'assistant',
                model: model,
                content: chunk,
                timestamp: new Date().toISOString()
              };
            } else {
              streamingMessages[model].content += chunk;
            }

            // 更新消息列表
            setMessages(prev => {
              const filtered = prev.filter(m => !m.streaming);
              const streaming = Object.values(streamingMessages).map(m => ({
                ...m,
                streaming: true
              }));
              return [...filtered, ...streaming];
            });
          } else if (data.type === 'done') {
            // 流式响应完成
            setStreaming(false);
            
            // 标记消息为完成状态
            setMessages(prev => prev.map(m => {
              if (m.streaming) {
                const { streaming, ...rest } = m;
                return rest;
              }
              return m;
            }));
            
            eventSource.close();
            eventSourceRef.current = null;
          } else if (data.type === 'error') {
            // 处理错误
            setError(data.error || '发送消息失败');
            setStreaming(false);
            eventSource.close();
            eventSourceRef.current = null;
          }
        } catch (err) {
          console.error('解析 SSE 数据失败:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('SSE 连接错误:', err);
        setError('连接失败，请重试');
        setStreaming(false);
        eventSource.close();
        eventSourceRef.current = null;
      };
    } catch (err) {
      setError('发送消息失败: ' + err.message);
      setStreaming(false);
      console.error('发送消息失败:', err);
    }
  };

  // 停止流式响应
  const handleStopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setStreaming(false);
    }
  };

  return (
    <div className="chat-view">
      <div className="chat-header">
        <h2>LLM 委员会</h2>
        <ModelSelector
          selectedModels={selectedModels}
          onModelsChange={setSelectedModels}
        />
      </div>

      {error && (
        <div className="chat-error">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="messages-container">
        {loading ? (
          <div className="loading-state">
            <div className="loading"></div>
            <span>加载对话中...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <h3>👋 欢迎使用 LLM 委员会</h3>
            <p>选择模型并开始对话</p>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`message ${msg.role} ${msg.streaming ? 'streaming' : ''}`}
              >
                <div className="message-header">
                  <span className="message-role">
                    {msg.role === 'user' ? '👤 用户' : `🤖 ${msg.model || 'AI'}`}
                  </span>
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN')}
                  </span>
                </div>
                <div className="message-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="chat-footer">
        {streaming && (
          <button className="stop-btn danger" onClick={handleStopStreaming}>
            ⏹ 停止生成
          </button>
        )}
        <InputArea
          onSendMessage={handleSendMessage}
          disabled={!conversationId || streaming}
        />
      </div>
    </div>
  );
}

export default ChatView;