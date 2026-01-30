import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getConversation, sendMessage, listConversationMeetings } from '../utils/api';
import InputArea from './InputArea';
import ModelSelector from './ModelSelector';
import './ChatView.css';

/**
 * ChatView 组件
 * 主聊天界面，显示消息历史和处理消息发送
 */
interface ChatViewProps {
  conversationId: string | null;
}

function ChatView({ conversationId }: ChatViewProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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
    if (!conversationId) return;
    try {
      setLoading(true);
      setError(null);
      const conv = await getConversation(conversationId);
      setMessages(conv.messages || []);
      
      console.log('[ChatView] 对话加载完成，开始检查活跃会议...');
      
      // 检查是否有活跃的会议
      await checkAndReconnectActiveMeeting();
    } catch (err: any) {
      setError('加载对话失败: ' + (err.message || String(err)));
      console.error('加载对话失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 检查并重连活跃会议
  const checkAndReconnectActiveMeeting = async () => {
    if (!conversationId) return;
    try {
      console.log('[ChatView] 正在检查对话的活跃会议:', conversationId);
      const result = await listConversationMeetings(conversationId);
      const meetings = (result as any).meetings || [];
      console.log('[ChatView] 获取到会议列表:', meetings);
      
      // 查找活跃的会议（非completed/failed/cancelled状态）
      const activeMeeting = meetings.find((m: any) =>
        !['completed', 'failed', 'cancelled'].includes(m.status)
      );
      
      if (activeMeeting) {
        console.log('[ChatView] 发现活跃会议，自动重连:', activeMeeting.meeting_id);
        
        // 如果已经有连接，先关闭
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
        
        // 重新连接到活跃会议
        setStreaming(true);
        reconnectToMeeting(activeMeeting.meeting_id);
      } else {
        console.log('[ChatView] 没有发现活跃会议');
      }
    } catch (err) {
      console.error('[ChatView] 检查活跃会议失败:', err);
    }
  };

  // 重连到会议
  const reconnectToMeeting = (meetingId: string) => {
    try {
      // 使用会议流API重连
      const eventSource = new EventSource(
        `http://localhost:8007/api/meetings/${meetingId}/stream`
      );
      eventSourceRef.current = eventSource;

      // 用于累积流式响应
      // const streamingMessages: Record<string, any> = {};
      const stage1Results: any[] = [];
      const stage2Results: any[] = [];
      // let stage3Result: any = null;
      // let stage4Result: any = null;

      eventSource.addEventListener('stage1_progress', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Stage 1 进度:', data);
          
          // 更新stage1结果
          const existingIndex = stage1Results.findIndex(r => r.model === data.model);
          if (existingIndex >= 0) {
            stage1Results[existingIndex] = data;
          } else {
            stage1Results.push(data);
          }
        } catch (err) {
          console.error('解析stage1_progress失败:', err);
        }
      });

      eventSource.addEventListener('stage1_complete', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Stage 1 完成:', data);
          // stage1Results = data.results || [];
        } catch (err) {
          console.error('解析stage1_complete失败:', err);
        }
      });

      eventSource.addEventListener('stage2_progress', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Stage 2 进度:', data);
          
          const existingIndex = stage2Results.findIndex(r => r.model === data.model);
          if (existingIndex >= 0) {
            stage2Results[existingIndex] = data;
          } else {
            stage2Results.push(data);
          }
        } catch (err) {
          console.error('解析stage2_progress失败:', err);
        }
      });

      eventSource.addEventListener('stage2_complete', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Stage 2 完成:', data);
          // stage2Results = data.results || [];
        } catch (err) {
          console.error('解析stage2_complete失败:', err);
        }
      });

      eventSource.addEventListener('stage3_complete', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Stage 3 完成:', data);
          // stage3Result = data;
        } catch (err) {
          console.error('解析stage3_complete失败:', err);
        }
      });

      eventSource.addEventListener('stage4_complete', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Stage 4 完成:', data);
          // stage4Result = data;
        } catch (err) {
          console.error('解析stage4_complete失败:', err);
        }
      });

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('会议完成:', data);
          setStreaming(false);
          eventSource.close();
          eventSourceRef.current = null;
          
          // 重新加载对话以获取最新消息
          loadConversation();
        } catch (err) {
          console.error('解析complete失败:', err);
        }
      });

      eventSource.addEventListener('error', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.error('会议错误:', data);
          setError(data.error || '会议执行失败');
          setStreaming(false);
          eventSource.close();
          eventSourceRef.current = null;
        } catch (err) {
          console.error('解析error失败:', err);
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        // 心跳，保持连接
        console.log('收到心跳');
      });

      eventSource.onerror = (err) => {
        console.error('SSE 连接错误:', err);
        setError('连接失败，请重试');
        setStreaming(false);
        eventSource.close();
        eventSourceRef.current = null;
      };
    } catch (err: any) {
      setError('重连会议失败: ' + (err.message || String(err)));
      setStreaming(false);
      console.error('重连会议失败:', err);
    }
  };

  // 处理发送消息
  const handleSendMessage = (content: string, attachments: any[]) => {
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
      const streamingMessages: Record<string, any> = {};

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
              const streaming = Object.values(streamingMessages).map((m: any) => ({
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
    } catch (err: any) {
      setError('发送消息失败: ' + (err.message || String(err)));
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
          onRefreshModels={async () => {}}
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
          onOpenContextManager={() => {}}
          onOpenModelSelector={() => {}}
          onOpenFileManager={() => {}}
          selectedModelCount={selectedModels.length}
        />
      </div>
    </div>
  );
}

export default ChatView;