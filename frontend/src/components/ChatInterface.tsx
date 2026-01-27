import { useState, useEffect, useRef } from 'react';
import { sendMessage, getConversation, editMessage, deleteMessage } from '../utils/api';
import MessageDisplay from './MessageDisplay';
import type { Message, Stage1Result, Stage2Result, Stage3Result, Stage4Result } from './MessageDisplay';
import InputArea from './InputArea';
import ModelSelector from './ModelSelector';
import ContextManager from './ContextManager';
import './ChatView.css';

/**
 * ChatInterface 组件属性
 */
interface ChatInterfaceProps {
  convId: string | null;
  models: Array<{ name: string; display_name: string; description: string; is_chairman: boolean }>;
  onRefreshModels: () => Promise<void>;
  onUpdateTitle?: (convId: string, newTitle: string) => void;
}

/**
 * ChatInterface 组件
 * 主聊天界面，整合所有子组件，处理消息发送和 SSE 事件流
 */
function ChatInterface({ convId, models, onRefreshModels, onUpdateTitle }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showContextManager, setShowContextManager] = useState(false);
  const [modelStatuses, setModelStatuses] = useState<Record<string, {
    status: string;
    error?: string;
    current_retry?: number;
    max_retries?: number;
  }>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const shouldAutoScrollRef = useRef<boolean>(false);

  // 从localStorage加载已保存的模型选择
  useEffect(() => {
    const savedModels = localStorage.getItem('selectedModels');
    if (savedModels) {
      try {
        const parsedModels = JSON.parse(savedModels);
        // 获取当前可用的模型名称列表
        const availableModelNames = models.map(m => m.name);
        // 过滤掉不存在的模型,只保留仍然可用的模型
        const validModels = parsedModels.filter((modelName: string) =>
          availableModelNames.includes(modelName)
        );
        if (validModels.length > 0) {
          setSelectedModels(validModels);
        }
      } catch (err) {
        console.error('解析保存的模型选择失败:', err);
      }
    }
  }, [models]);

  // 当模型选择改变时保存到localStorage
  useEffect(() => {
    if (selectedModels.length > 0) {
      localStorage.setItem('selectedModels', JSON.stringify(selectedModels));
    }
  }, [selectedModels]);

  // 加载对话历史
  useEffect(() => {
    if (convId) {
      loadConversation();
    } else {
      setMessages([]);
    }
  }, [convId]);

  // 自动滚动到底部 - 只在需要时滚动
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom();
      shouldAutoScrollRef.current = false;
    }
  }, [messages]);

  // 组件卸载时关闭 SSE 连接
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversation = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const conv = await getConversation(convId!);
      
      // 转换已保存对话中的 LaTeX 数学公式格式
      const messages = (conv.messages || []).map((msg: any) => {
        if (msg.role === 'assistant' && msg.stage4 && msg.stage4.best_answer) {
          let bestAnswer = msg.stage4.best_answer;
          // 将 \[ ... \] 转换为 $$ ... $$
          bestAnswer = bestAnswer.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$1$$');
          // 将 \( ... \) 转换为 $ ... $
          bestAnswer = bestAnswer.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
          
          return {
            ...msg,
            stage4: {
              ...msg.stage4,
              best_answer: bestAnswer
            }
          };
        }
        return msg;
      });
      
      setMessages(messages);
    } catch (err: any) {
      setError('加载对话失败: ' + err.message);
      console.error('加载对话失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理发送消息
  const handleSendMessage = (content: string, attachments: any[]) => {
    if (!convId) {
      setError('请先选择或创建一个对话');
      return;
    }

    if (selectedModels.length === 0) {
      setError('请至少选择一个模型');
      return;
    }

    // 添加用户消息到界面
    const userMessage: Message = {
      role: 'user',
      content: content,
      models: selectedModels,
      attachments: attachments,
      timestamp: new Date().toISOString()
    };
    // 设置自动滚动标志,因为用户发送了新消息
    shouldAutoScrollRef.current = true;
    setMessages(prev => [...prev, userMessage]);

    // 初始化模型状态
    const initialStatuses: Record<string, {
      status: string;
      error?: string;
      current_retry?: number;
      max_retries?: number;
    }> = {};
    selectedModels.forEach(model => {
      initialStatuses[model] = { status: '等待中...' };
    });
    setModelStatuses(initialStatuses);

    // 创建助手消息占位符
    const assistantMessage: Message = {
      role: 'assistant',
      timestamp: new Date().toISOString(),
      streaming: true,
      modelStatuses: initialStatuses
    };
    // 设置自动滚动标志,因为添加了助手消息占位符
    shouldAutoScrollRef.current = true;
    setMessages(prev => [...prev, assistantMessage]);

    // 开始流式响应
    setIsStreaming(true);
    setError(null);

    // 创建 SSE 连接
    try {
      const eventSource = sendMessage(convId, content, selectedModels, attachments);
      eventSourceRef.current = eventSource;

      // 用于累积各阶段的结果
      let stage1Results: Stage1Result[] = [];
      let stage2Results: Stage2Result[] = [];
      let stage3Result: Stage3Result | undefined = undefined;
      let stage4Result: Stage4Result | undefined = undefined;

      eventSource.addEventListener('stage1_progress', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          
          // 检查是否是重试进度
          if (data.status === 'retrying') {
            setModelStatuses(prev => {
              const newStatuses = {
                ...prev,
                [data.model]: {
                  status: 'retrying',
                  current_retry: data.current_retry,
                  max_retries: data.max_retries
                }
              };
              
              // 更新助手消息的模型状态
              updateAssistantMessage({
                modelStatuses: newStatuses
              });
              
              return newStatuses;
            });
            return;
          }
          
          // 正常的完成或错误状态
          const result: Stage1Result = {
            model: data.model,
            response: data.response || '',
            timestamp: new Date().toISOString(),
            error: data.error
          };
          
          // 更新模型状态 - 使用函数式更新确保保留所有模型的状态
          setModelStatuses(prev => {
            const newStatuses = {
              ...prev,
              [data.model]: data.error
                ? { status: '失败', error: data.error }
                : { status: '已完成' }
            };
            
            // 更新或添加 stage1 结果
            const existingIndex = stage1Results.findIndex(r => r.model === data.model);
            if (existingIndex >= 0) {
              stage1Results[existingIndex] = result;
            } else {
              stage1Results.push(result);
            }

            // 更新消息
            updateAssistantMessage({
              stage1: [...stage1Results],
              modelStatuses: newStatuses
            });
            
            return newStatuses;
          });
        } catch (err) {
          console.error('解析 stage1_progress 失败:', err);
        }
      });

      eventSource.addEventListener('stage1_complete', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          stage1Results = data.results.map((r: any) => ({
            model: r.model,
            response: r.response,
            timestamp: r.timestamp,
            error: r.error
          }));
          updateAssistantMessage({ stage1: stage1Results });
        } catch (err) {
          console.error('解析 stage1_complete 失败:', err);
        }
      });

      // Stage 1 开始事件
      eventSource.addEventListener('stage1_start', () => {
        setModelStatuses(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(model => {
            updated[model] = { status: '分析中...' };
          });
          return updated;
        });
      });

      // Stage 2 开始事件
      eventSource.addEventListener('stage2_start', () => {
        // 保留Stage 1的状态,为Stage 2添加新的状态
        setModelStatuses(prev => {
          const updated = { ...prev };
          // 为所有选中的模型添加评审状态
          selectedModels.forEach(model => {
            updated[`${model}-stage2`] = { status: '评审中...' };
          });
          
          // 同步更新助手消息的modelStatuses
          updateAssistantMessage({
            modelStatuses: updated
          });
          
          return updated;
        });
      });

      // Stage 2 label映射事件 - 实时接收标签到模型的映射
      eventSource.addEventListener('stage2_label_mapping', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          const labelToModel = data.label_to_model || {};
          
          // 将 label_to_model 映射添加到所有 stage2 结果中
          stage2Results.forEach(result => {
            result.label_to_model = labelToModel;
          });
          
          // 更新助手消息，让前端立即知道标签映射
          updateAssistantMessage({
            stage2: [...stage2Results]
          });
        } catch (err) {
          console.error('解析 stage2_label_mapping 失败:', err);
        }
      });

      eventSource.addEventListener('stage2_progress', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          const result: Stage2Result = {
            model: data.model,
            scores: data.scores || {},
            raw_text: data.raw_text || '',
            label_to_model: data.label_to_model || {},
            timestamp: new Date().toISOString(),
            participated: data.participated,
            skip_reason: data.skip_reason,
            error: data.error
          };
          
          // 更新模型状态 - 使用stage2前缀
          setModelStatuses(prev => {
            const newStatuses = {
              ...prev,
              [`${data.model}-stage2`]: data.error
                ? { status: '评审失败', error: data.error }
                : { status: '评审完成' }
            };
            
            // 更新或添加 stage2 结果
            const existingIndex = stage2Results.findIndex(r => r.model === data.model);
            if (existingIndex >= 0) {
              stage2Results[existingIndex] = result;
            } else {
              stage2Results.push(result);
            }

            // 更新消息,包含modelStatuses
            updateAssistantMessage({
              stage1: stage1Results,
              stage2: [...stage2Results],
              modelStatuses: newStatuses
            });
            
            return newStatuses;
          });
        } catch (err) {
          console.error('解析 stage2_progress 失败:', err);
        }
      });

      eventSource.addEventListener('stage2_complete', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          stage2Results = data.results.map((r: any) => ({
            model: r.model,
            scores: r.scores || {},
            raw_text: r.raw_text || '',
            timestamp: r.timestamp,
            error: r.error
          }));
          updateAssistantMessage({ stage1: stage1Results, stage2: stage2Results });
        } catch (err) {
          console.error('解析 stage2_complete 失败:', err);
        }
      });

      // Stage 3 开始和进度事件
      eventSource.addEventListener('stage3_start', () => {
        // 保留之前的状态,不清除
      });

      eventSource.addEventListener('stage3_progress', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          setModelStatuses(prev => {
            const newStatuses = {
              ...prev,
              [`${data.model}-stage3`]: {
                status: data.status === 'processing' ? '综合中...' :
                        data.status === 'completed' ? '综合完成' : '综合失败',
                error: data.error
              }
            };
            
            // 同步更新助手消息
            updateAssistantMessage({
              modelStatuses: newStatuses
            });
            
            return newStatuses;
          });
        } catch (err) {
          console.error('解析 stage3_progress 失败:', err);
        }
      });

      eventSource.addEventListener('stage3_complete', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          stage3Result = {
            response: data.response,
            timestamp: data.timestamp,
            error: data.error
          };
          
          updateAssistantMessage({
            stage1: stage1Results,
            stage2: stage2Results,
            stage3: stage3Result
          });
        } catch (err) {
          console.error('解析 stage3_complete 失败:', err);
        }
      });

      // Stage 4 开始和进度事件
      eventSource.addEventListener('stage4_start', () => {
        // 保留之前的状态,不清除
      });

      eventSource.addEventListener('stage4_progress', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          setModelStatuses(prev => {
            const newStatuses = {
              ...prev,
              'stage4': {
                status: data.status === 'processing' ? '计算排名中...' :
                        data.status === 'completed' ? '排名完成' : '排名失败',
                error: data.error
              }
            };
            
            // 同步更新助手消息
            updateAssistantMessage({
              modelStatuses: newStatuses
            });
            
            return newStatuses;
          });
        } catch (err) {
          console.error('解析 stage4_progress 失败:', err);
        }
      });

      eventSource.addEventListener('stage4_complete', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          // 转换 LaTeX 数学公式格式为 Markdown 格式
          let bestAnswer = data.best_answer || '';
          // 将 \[ ... \] 转换为 $$ ... $$
          bestAnswer = bestAnswer.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$1$$');
          // 将 \( ... \) 转换为 $ ... $
          bestAnswer = bestAnswer.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
          
          stage4Result = {
            rankings: data.rankings || [],
            best_answer: bestAnswer,
            timestamp: data.timestamp,
            error: data.error
          };
          updateAssistantMessage({
            stage1: stage1Results,
            stage2: stage2Results,
            stage3: stage3Result,
            stage4: stage4Result
          });
        } catch (err) {
          console.error('解析 stage4_complete 失败:', err);
        }
      });

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          // 更新对话标题
          if (data.title && onUpdateTitle && convId) {
            onUpdateTitle(convId, data.title);
          }
        } catch (err) {
          console.error('解析 complete 事件失败:', err);
        }
        
        setIsStreaming(false);
        // 不清空模型状态,保留完整的执行进度
        // 移除 streaming 标记但保留modelStatuses
        setMessages(prev => prev.map(msg => {
          if (msg.streaming) {
            const { streaming, ...rest } = msg;
            return rest;
          }
          return msg;
        }));
        eventSource.close();
        eventSourceRef.current = null;
      });

      eventSource.addEventListener('error', (event: any) => {
        console.error('SSE 连接错误:', event);
        
        // 尝试从事件中提取错误信息
        let errorMessage = '连接失败，请重试';
        if (event.data) {
          try {
            const data = JSON.parse(event.data);
            errorMessage = data.error || data.detail || errorMessage;
          } catch (e) {
            // 无法解析错误数据
          }
        }
        
        setError(errorMessage);
        setIsStreaming(false);
        eventSource.close();
        eventSourceRef.current = null;
      });

      // 通用消息处理（兼容旧格式）
      eventSource.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          
          // 处理错误事件
          if (data.type === 'error' || data.error) {
            setError(data.error || data.message || '发生错误');
            setIsStreaming(false);
            eventSource.close();
            eventSourceRef.current = null;
          }
        } catch (err) {
          console.error('解析 SSE 消息失败:', err);
        }
      };

    } catch (err: any) {
      setError('发送消息失败: ' + err.message);
      setIsStreaming(false);
      console.error('发送消息失败:', err);
    }
  };

  // 更新助手消息
  const updateAssistantMessage = (updates: Partial<Message>) => {
    setMessages(prev => {
      const newMessages = [...prev];
      const lastIndex = newMessages.length - 1;
      if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
        newMessages[lastIndex] = {
          ...newMessages[lastIndex],
          ...updates,
          // 保持模型状态更新
          modelStatuses: updates.modelStatuses || newMessages[lastIndex].modelStatuses
        };
      }
      return newMessages;
    });
  };

  // 停止流式响应
  const handleStopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
      // 不清空模型状态,保留已完成的进度
      
      // 移除 streaming 标记但保留modelStatuses和已完成的阶段数据
      setMessages(prev => prev.map(msg => {
        if (msg.streaming) {
          const { streaming, ...rest } = msg;
          // 保留已有的stage数据和modelStatuses
          return rest;
        }
        return msg;
      }));
    }
  };

  // 处理编辑消息
  const handleEditMessage = async (messageIndex: number, newContent: string, newAttachments?: any[]) => {
    if (!convId) return;
    
    // 检查内容和附件是否有变化
    const originalMessage = messages[messageIndex];
    const contentUnchanged = originalMessage && originalMessage.content === newContent;
    const attachmentsUnchanged = JSON.stringify(originalMessage?.attachments || []) === JSON.stringify(newAttachments || []);
    
    if (contentUnchanged && attachmentsUnchanged) {
      // 内容和附件都没有变化,不需要重新调用AI
      return;
    }
    
    try {
      setError(null);
      // 调用API编辑消息,这会删除该消息之后的所有消息
      const updatedConv = await editMessage(convId, messageIndex, newContent, newAttachments);
      
      // 更新本地消息列表（此时只包含编辑后的用户消息，不包含AI回复）
      setMessages(updatedConv.messages || []);
      
      // 获取编辑后的用户消息（应该是最后一条消息）
      const editedMessage = updatedConv.messages[updatedConv.messages.length - 1];
      if (editedMessage && editedMessage.role === 'user') {
        // 初始化模型状态
        const initialStatuses: Record<string, {
          status: string;
          error?: string;
          current_retry?: number;
          max_retries?: number;
        }> = {};
        selectedModels.forEach(model => {
          initialStatuses[model] = { status: '等待中...' };
        });
        setModelStatuses(initialStatuses);

        // 创建助手消息占位符
        const assistantMessage: Message = {
          role: 'assistant',
          timestamp: new Date().toISOString(),
          streaming: true,
          modelStatuses: initialStatuses
        };
        // 设置自动滚动标志
        shouldAutoScrollRef.current = true;
        setMessages(prev => [...prev, assistantMessage]);

        // 开始流式响应
        setIsStreaming(true);

        // 创建 SSE 连接
        const eventSource = sendMessage(convId, newContent, selectedModels, editedMessage.attachments || []);
        eventSourceRef.current = eventSource;

        // 用于累积各阶段的结果
        let stage1Results: Stage1Result[] = [];
        let stage2Results: Stage2Result[] = [];
        let stage3Result: Stage3Result | undefined = undefined;
        let stage4Result: Stage4Result | undefined = undefined;

        eventSource.addEventListener('stage1_progress', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            
            // 检查是否是重试进度
            if (data.status === 'retrying') {
              setModelStatuses(prev => {
                const newStatuses = {
                  ...prev,
                  [data.model]: {
                    status: 'retrying',
                    current_retry: data.current_retry,
                    max_retries: data.max_retries
                  }
                };
                
                // 更新助手消息的模型状态
                updateAssistantMessage({
                  modelStatuses: newStatuses
                });
                
                return newStatuses;
              });
              return;
            }
            
            // 正常的完成或错误状态
            const result: Stage1Result = {
              model: data.model,
              response: data.response || '',
              timestamp: new Date().toISOString(),
              error: data.error
            };
            
            setModelStatuses(prev => {
              const newStatuses = {
                ...prev,
                [data.model]: data.error
                  ? { status: '失败', error: data.error }
                  : { status: '已完成' }
              };
              
              const existingIndex = stage1Results.findIndex(r => r.model === data.model);
              if (existingIndex >= 0) {
                stage1Results[existingIndex] = result;
              } else {
                stage1Results.push(result);
              }

              updateAssistantMessage({
                stage1: [...stage1Results],
                modelStatuses: newStatuses
              });
              
              return newStatuses;
            });
          } catch (err) {
            console.error('解析 stage1_progress 失败:', err);
          }
        });

        eventSource.addEventListener('stage1_complete', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            stage1Results = data.results.map((r: any) => ({
              model: r.model,
              response: r.response,
              timestamp: r.timestamp,
              error: r.error
            }));
            updateAssistantMessage({ stage1: stage1Results });
          } catch (err) {
            console.error('解析 stage1_complete 失败:', err);
          }
        });

        eventSource.addEventListener('stage1_start', () => {
          setModelStatuses(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(model => {
              updated[model] = { status: '分析中...' };
            });
            return updated;
          });
        });

        eventSource.addEventListener('stage2_start', () => {
          setModelStatuses(prev => {
            const updated = { ...prev };
            selectedModels.forEach(model => {
              updated[`${model}-stage2`] = { status: '评审中...' };
            });
            updateAssistantMessage({ modelStatuses: updated });
            return updated;
          });
        });

        // Stage 2 label映射事件
        eventSource.addEventListener('stage2_label_mapping', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            const labelToModel = data.label_to_model || {};
            
            stage2Results.forEach(result => {
              result.label_to_model = labelToModel;
            });
            
            updateAssistantMessage({
              stage2: [...stage2Results]
            });
          } catch (err) {
            console.error('解析 stage2_label_mapping 失败:', err);
          }
        });

        eventSource.addEventListener('stage2_progress', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            const result: Stage2Result = {
              model: data.model,
              scores: data.scores || {},
              raw_text: data.raw_text || '',
              label_to_model: data.label_to_model || {},
              timestamp: new Date().toISOString(),
              participated: data.participated,
              skip_reason: data.skip_reason,
              error: data.error
            };
            
            setModelStatuses(prev => {
              const newStatuses = {
                ...prev,
                [`${data.model}-stage2`]: data.error
                  ? { status: '评审失败', error: data.error }
                  : { status: '评审完成' }
              };
              
              const existingIndex = stage2Results.findIndex(r => r.model === data.model);
              if (existingIndex >= 0) {
                stage2Results[existingIndex] = result;
              } else {
                stage2Results.push(result);
              }

              updateAssistantMessage({
                stage1: stage1Results,
                stage2: [...stage2Results],
                modelStatuses: newStatuses
              });
              
              return newStatuses;
            });
          } catch (err) {
            console.error('解析 stage2_progress 失败:', err);
          }
        });

        eventSource.addEventListener('stage2_complete', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            stage2Results = data.results.map((r: any) => ({
              model: r.model,
              scores: r.scores || {},
              raw_text: r.raw_text || '',
              timestamp: r.timestamp,
              error: r.error
            }));
            updateAssistantMessage({ stage1: stage1Results, stage2: stage2Results });
          } catch (err) {
            console.error('解析 stage2_complete 失败:', err);
          }
        });

        eventSource.addEventListener('stage3_start', () => {});

        eventSource.addEventListener('stage3_progress', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            setModelStatuses(prev => {
              const newStatuses = {
                ...prev,
                [`${data.model}-stage3`]: {
                  status: data.status === 'processing' ? '综合中...' :
                          data.status === 'completed' ? '综合完成' : '综合失败',
                  error: data.error
                }
              };
              updateAssistantMessage({ modelStatuses: newStatuses });
              return newStatuses;
            });
          } catch (err) {
            console.error('解析 stage3_progress 失败:', err);
          }
        });

        eventSource.addEventListener('stage3_complete', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            stage3Result = {
              response: data.response,
              timestamp: data.timestamp,
              error: data.error
            };
            updateAssistantMessage({
              stage1: stage1Results,
              stage2: stage2Results,
              stage3: stage3Result
            });
          } catch (err) {
            console.error('解析 stage3_complete 失败:', err);
          }
        });

        eventSource.addEventListener('stage4_start', () => {});

        eventSource.addEventListener('stage4_progress', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            setModelStatuses(prev => {
              const newStatuses = {
                ...prev,
                'stage4': {
                  status: data.status === 'processing' ? '计算排名中...' :
                          data.status === 'completed' ? '排名完成' : '排名失败',
                  error: data.error
                }
              };
              updateAssistantMessage({ modelStatuses: newStatuses });
              return newStatuses;
            });
          } catch (err) {
            console.error('解析 stage4_progress 失败:', err);
          }
        });

        eventSource.addEventListener('stage4_complete', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            // 转换 LaTeX 数学公式格式为 Markdown 格式
            let bestAnswer = data.best_answer || '';
            // 将 \[ ... \] 转换为 $$ ... $$
            bestAnswer = bestAnswer.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$1$$');
            // 将 \( ... \) 转换为 $ ... $
            bestAnswer = bestAnswer.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
            
            stage4Result = {
              rankings: data.rankings || [],
              best_answer: bestAnswer,
              timestamp: data.timestamp,
              error: data.error
            };
            updateAssistantMessage({
              stage1: stage1Results,
              stage2: stage2Results,
              stage3: stage3Result,
              stage4: stage4Result
            });
          } catch (err) {
            console.error('解析 stage4_complete 失败:', err);
          }
        });

        eventSource.addEventListener('complete', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            // 更新对话标题
            if (data.title && onUpdateTitle && convId) {
              onUpdateTitle(convId, data.title);
            }
          } catch (err) {
            console.error('解析 complete 事件失败:', err);
          }
          
          setIsStreaming(false);
          setMessages(prev => prev.map(msg => {
            if (msg.streaming) {
              const { streaming, ...rest } = msg;
              return rest;
            }
            return msg;
          }));
          eventSource.close();
          eventSourceRef.current = null;
        });

        eventSource.addEventListener('error', (event: any) => {
          console.error('SSE 连接错误:', event);
          let errorMessage = '连接失败，请重试';
          if (event.data) {
            try {
              const data = JSON.parse(event.data);
              errorMessage = data.error || data.detail || errorMessage;
            } catch (e) {}
          }
          setError(errorMessage);
          setIsStreaming(false);
          eventSource.close();
          eventSourceRef.current = null;
        });

        eventSource.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'error' || data.error) {
              setError(data.error || data.message || '发生错误');
              setIsStreaming(false);
              eventSource.close();
              eventSourceRef.current = null;
            }
          } catch (err) {
            console.error('解析 SSE 消息失败:', err);
          }
        };
      }
    } catch (err: any) {
      setError('编辑消息失败: ' + err.message);
      console.error('编辑消息失败:', err);
    }
  };

  // 处理删除消息
  const handleDeleteMessage = async (messageIndex: number) => {
    if (!convId) return;
    
    try {
      setError(null);
      // 调用API删除消息
      const updatedConv = await deleteMessage(convId, messageIndex);
      
      // 更新本地消息列表
      setMessages(updatedConv.messages || []);
    } catch (err: any) {
      setError('删除消息失败: ' + err.message);
      console.error('删除消息失败:', err);
    }
  };

  return (
    <div className="chat-view">
      <div className="chat-header">
        <h2>🏛️ LLM 委员会</h2>
        <div className="header-actions">
          <button
            className="context-manager-trigger"
            onClick={() => setShowContextManager(true)}
            title="上下文管理"
          >
            📚 上下文
          </button>
          <button
            className="model-selector-trigger"
            onClick={() => setShowModelSelector(!showModelSelector)}
            title="选择模型"
          >
            🤖 模型 ({selectedModels.length})
          </button>
        </div>
      </div>

      {showModelSelector && (
        <div className="model-selector-overlay" onClick={() => setShowModelSelector(false)}>
          <div className="model-selector-popup" onClick={(e) => e.stopPropagation()}>
            <ModelSelector
              selectedModels={selectedModels}
              onModelsChange={setSelectedModels}
              onRefreshModels={onRefreshModels}
            />
            <button
              className="close-selector-btn"
              onClick={() => setShowModelSelector(false)}
            >
              确定
            </button>
          </div>
        </div>
      )}

      {showContextManager && (
        <ContextManager
          convId={convId}
          onClose={() => setShowContextManager(false)}
        />
      )}

      {error && (
        <div className="chat-error">
          <span>❌ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="messages-container">
        {isLoading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <span>加载对话中...</span>
          </div>
        ) : (
          <>
            <MessageDisplay
              messages={messages}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
            />
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="chat-footer">
        {isStreaming && (
          <button className="stop-btn" onClick={handleStopStreaming}>
            ⏹ 停止生成
          </button>
        )}
        <InputArea
          onSendMessage={handleSendMessage}
          disabled={!convId || isStreaming}
        />
      </div>
    </div>
  );
}

export default ChatInterface;