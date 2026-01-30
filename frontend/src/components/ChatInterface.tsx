import { useState, useEffect, useRef } from 'react';
import { sendMessage, getConversation, editMessage, deleteMessage, listConversationMeetings } from '../utils/api';
import MessageDisplay from './MessageDisplay';
import type { Message, Stage1Result, Stage2Result, Stage3Result, Stage4Result } from './MessageDisplay';
import InputArea from './InputArea';
import ModelSelector from './ModelSelector';
import ContextManager from './ContextManager';
import type { ModalType } from '../App';
import './ChatView.css';

/**
 * ChatInterface 组件属性
 */
interface ChatInterfaceProps {
  convId: string | null;
  models: Array<{ name: string; display_name: string; description: string; is_chairman: boolean }>;
  onRefreshModels: () => Promise<void>;
  onUpdateTitle?: (convId: string, newTitle: string) => void;
  activeModal: ModalType;
  onSetActiveModal: (modal: ModalType) => void;
  onOpenFileManager: () => void;
}

/**
 * ChatInterface 组件
 * 主聊天界面，整合所有子组件，处理消息发送和 SSE 事件流
 */
function ChatInterface({ convId, models, onRefreshModels, onUpdateTitle, activeModal, onSetActiveModal, onOpenFileManager }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelStatuses, setModelStatuses] = useState<Record<string, {
    status: string;
    error?: string;
    current_retry?: number;
    max_retries?: number;
  }>>({});
  // @ts-ignore - modelStatuses is used in render but TS might not detect it correctly in complex JSX
  console.log(modelStatuses);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [isFooterVisible, setIsFooterVisible] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const shouldAutoScrollRef = useRef<boolean>(false);
  const currentConvIdRef = useRef<string | null>(null);
  const currentMeetingIdRef = useRef<string | null>(null);

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
    // 更新当前对话ID引用
    currentConvIdRef.current = convId;
    
    if (convId) {
      loadConversation();
    } else {
      setMessages([]);
      setIsStreaming(false);
      setCurrentMeetingId(null);
    }
    
    // 切换对话时，重置流式状态（如果不是当前对话的会议）
    return () => {
      // 组件卸载或convId改变时，如果有SSE连接但不是当前对话的，关闭它
      if (eventSourceRef.current) {
        console.log('[ChatInterface] 关闭SSE连接，对话切换');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
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
    // 只有当 footer 可见时才自动滚动到底部，或者强制滚动
    if (isFooterVisible || shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const loadConversation = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const conv = await getConversation(convId!);
      
      // 转换已保存对话中的 LaTeX 数学公式格式
      const loadedMessages = (conv.messages || []).map((msg: any) => {
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
      
      setMessages(loadedMessages);
      
      console.log('[ChatInterface] 对话加载完成，消息数:', loadedMessages.length);
      
      // 使用 setTimeout 确保 setMessages 完成后再检查会议
      setTimeout(async () => {
        console.log('[ChatInterface] 开始检查活跃会议...');
        await checkAndReconnectActiveMeeting();
      }, 0);
    } catch (err: any) {
      setError('加载对话失败: ' + err.message);
      console.error('加载对话失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 检查并重连活跃会议
  const checkAndReconnectActiveMeeting = async () => {
    if (!convId) return;
    
    // 检查是否仍然是当前对话（防止异步问题）
    const checkConvId = convId;
    
    try {
      console.log('[ChatInterface] 正在检查对话的活跃会议:', checkConvId);
      const meetings = await listConversationMeetings(checkConvId);
      console.log('[ChatInterface] 获取到会议列表:', meetings);
      
      // 再次检查是否仍然是当前对话
      if (checkConvId !== currentConvIdRef.current) {
        console.log('[ChatInterface] 对话已切换，取消重连');
        return;
      }
      
      // 查找活跃的会议（非completed/failed/cancelled状态）
      const activeMeeting = meetings.find((m: any) =>
        !['completed', 'failed', 'cancelled'].includes(m.status)
      );
      
      if (activeMeeting) {
        console.log('[ChatInterface] 发现活跃会议，自动重连:', activeMeeting.meeting_id);
        
        // 如果已经有连接，先关闭
        if (eventSourceRef.current) {
          console.log('[ChatInterface] 关闭旧的SSE连接');
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        
        // 保存当前会议ID
        setCurrentMeetingId(activeMeeting.meeting_id);
        
        // 重新连接到活跃会议
        setIsStreaming(true);
        reconnectToMeeting(activeMeeting.meeting_id);
      } else {
        console.log('[ChatInterface] 没有发现活跃会议');
        // 确保没有活跃会议时清除状态
        setIsStreaming(false);
        setCurrentMeetingId(null);
      }
    } catch (err) {
      console.error('[ChatInterface] 检查活跃会议失败:', err);
    }
  };

  // 重连到会议
  const reconnectToMeeting = async (meetingId: string) => {
    try {
      console.log('[ChatInterface] 重连到会议:', meetingId, '对话:', convId);
      const meetingConvId = convId; // 保存当前对话ID到闭包
      console.log('[ChatInterface] 设置currentMeetingIdRef为:', meetingId);
      currentMeetingIdRef.current = meetingId; // 保存当前会议ID
      
      // 1. 用于累积流式响应 - 使用对象包装以便在闭包中共享
      const resultsRef = {
        stage1: [] as Stage1Result[],
        stage2: [] as Stage2Result[],
        stage3: undefined as Stage3Result | undefined,
        stage4: undefined as Stage4Result | undefined
      };
      
      // 2. 用于标记各阶段是否已完成，防止完成后继续处理延迟到达的进度事件
      const stageCompletedRef = {
        stage1: false,
        stage2: false,
        stage3: false,
        stage4: false
      };
      
      // 3. ⭐ 关键修复：在建立SSE连接之前，先获取会议状态并立即显示历史数据
      // 然后设置完成标记，防止SSE重复发送的历史事件再次更新
      // 同时重建modelStatuses以显示执行进度
      const initialModelStatuses: Record<string, {
        status: string;
        error?: string;
        current_retry?: number;
        max_retries?: number;
      }> = {};
      
      // 4. ⭐ 关键修复：从用户消息中获取完整的模型列表
      // 找到当前streaming的助手消息对应的用户消息
      let selectedModelsList: string[] = [];
      const currentMessages = messages;
      for (let i = currentMessages.length - 1; i >= 0; i--) {
        if (currentMessages[i].role === 'user' && currentMessages[i].models) {
          selectedModelsList = currentMessages[i].models || [];
          console.log('[ChatInterface] 从用户消息中获取模型列表:', selectedModelsList);
          break;
        }
      }
      
      // 5. 为所有配置的模型创建初始状态（等待中）
      selectedModelsList.forEach(model => {
        initialModelStatuses[model] = { status: '等待中...' };
      });
      
      try {
        const response = await fetch(`http://localhost:8007/api/meetings/${meetingId}`);
        if (response.ok) {
          const meetingData = await response.json();
          const progress = meetingData?.progress || {};
          
          // 如果已有stage1结果，更新对应模型的状态
          if (progress.stage1_results && progress.stage1_results.length > 0) {
            resultsRef.stage1 = progress.stage1_results;
            stageCompletedRef.stage1 = true;
            console.log('[ChatInterface] 加载历史stage1结果，数量:', progress.stage1_results.length);
            
            // 更新每个stage1模型的状态（从"等待中"更新为实际状态）
            progress.stage1_results.forEach((result: any) => {
              initialModelStatuses[result.model] = result.error
                ? { status: '失败', error: result.error }
                : { status: '已完成' };
            });
          }
          
          // 如果已有stage2结果，立即保存并标记为已完成，同时构建modelStatuses
          if (progress.stage2_results && progress.stage2_results.length > 0) {
            resultsRef.stage2 = progress.stage2_results;
            stageCompletedRef.stage2 = true;
            console.log('[ChatInterface] 加载历史stage2结果，数量:', progress.stage2_results.length);
            
            // 为每个stage2模型添加状态
            progress.stage2_results.forEach((result: any) => {
              initialModelStatuses[`${result.model}-stage2`] = result.error
                ? { status: '评审失败', error: result.error }
                : { status: '评审完成' };
            });
          }
          
          // 如果已有stage3结果，立即保存并标记为已完成
          if (progress.stage3_result) {
            resultsRef.stage3 = progress.stage3_result;
            stageCompletedRef.stage3 = true;
            console.log('[ChatInterface] 加载历史stage3结果');
            
            // 添加stage3状态
            if (progress.stage3_result.error) {
              initialModelStatuses['stage3'] = { status: '综合失败', error: progress.stage3_result.error };
            } else {
              initialModelStatuses['stage3'] = { status: '综合完成' };
            }
          }
          
          // 如果已有stage4结果，立即保存并标记为已完成
          if (progress.stage4_result) {
            resultsRef.stage4 = progress.stage4_result;
            stageCompletedRef.stage4 = true;
            console.log('[ChatInterface] 加载历史stage4结果');
            
            // 添加stage4状态
            if (progress.stage4_result.error) {
              initialModelStatuses['stage4'] = { status: '排名失败', error: progress.stage4_result.error };
            } else {
              initialModelStatuses['stage4'] = { status: '排名完成' };
            }
          }
        }
      } catch (err) {
        console.warn('[ChatInterface] 获取会议状态失败，继续重连:', err);
      }
      
      // 4. 先创建助手消息占位符（如果需要）并立即显示历史数据和modelStatuses
      setMessages(prev => {
        console.log('[ChatInterface] 当前消息数量:', prev.length);
        
        // 检查最后一条消息是否是streaming的助手消息
        const lastMessage = prev[prev.length - 1];
        const needsPlaceholder = !lastMessage ||
                                 lastMessage.role !== 'assistant' ||
                                 !lastMessage.streaming;
        
        if (needsPlaceholder) {
          console.log('[ChatInterface] 需要创建助手消息占位符并填充历史数据');
          const assistantMessage: Message = {
            role: 'assistant',
            timestamp: new Date().toISOString(),
            streaming: true,
            modelStatuses: initialModelStatuses,
            // 5. 立即填充历史数据到新创建的消息中
            stage1: resultsRef.stage1.length > 0 ? resultsRef.stage1 : undefined,
            stage2: resultsRef.stage2.length > 0 ? resultsRef.stage2 : undefined,
            stage3: resultsRef.stage3,
            stage4: resultsRef.stage4
          };
          shouldAutoScrollRef.current = true;
          console.log('[ChatInterface] 创建的助手消息包含历史数据:', {
            stage1: resultsRef.stage1.length,
            stage2: resultsRef.stage2.length,
            hasStage3: !!resultsRef.stage3,
            hasStage4: !!resultsRef.stage4,
            modelStatuses: Object.keys(initialModelStatuses).length
          });
          return [...prev, assistantMessage];
        } else {
          console.log('[ChatInterface] 已存在streaming助手消息，更新历史数据');
          // 如果已经存在streaming消息，更新它
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          newMessages[lastIndex] = {
            ...newMessages[lastIndex],
            modelStatuses: initialModelStatuses,
            stage1: resultsRef.stage1.length > 0 ? resultsRef.stage1 : newMessages[lastIndex].stage1,
            stage2: resultsRef.stage2.length > 0 ? resultsRef.stage2 : newMessages[lastIndex].stage2,
            stage3: resultsRef.stage3 || newMessages[lastIndex].stage3,
            stage4: resultsRef.stage4 || newMessages[lastIndex].stage4
          };
          console.log('[ChatInterface] 更新已存在的助手消息，历史数据:', {
            stage1: resultsRef.stage1.length,
            stage2: resultsRef.stage2.length,
            hasStage3: !!resultsRef.stage3,
            hasStage4: !!resultsRef.stage4,
            modelStatuses: Object.keys(initialModelStatuses).length
          });
          return newMessages;
        }
      });
      
      // 更新modelStatuses状态
      setModelStatuses(initialModelStatuses);
      
      // 6. 使用会议流API重连
      const eventSource = new EventSource(
        `http://localhost:8007/api/meetings/${meetingId}/stream`
      );
      eventSourceRef.current = eventSource;
      
      console.log('[ChatInterface] SSE连接已建立，会议ID:', meetingId, '对话ID:', meetingConvId);

      // Stage 1 事件
      eventSource.addEventListener('stage1_start', () => {
        // 检查对话是否仍然匹配
        if (meetingConvId !== currentConvIdRef.current) {
          console.log('[reconnect] 忽略stage1_start，对话已切换');
          return;
        }
        console.log('[reconnect] Stage 1 开始，对话:', meetingConvId);
        // 不更新modelStatuses，因为selectedModels可能已经改变
      });

      eventSource.addEventListener('stage1_progress', (event: MessageEvent) => {
        try {
          // 检查对话和会议是否仍然匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] 忽略stage1_progress，对话已切换 convId:', meetingConvId, 'current:', currentConvIdRef.current);
            return;
          }
          if (meetingId !== currentMeetingIdRef.current) {
            console.log('[reconnect] 忽略stage1_progress，会议已切换 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
            return;
          }
          
          const data = JSON.parse(event.data);
          console.log('[reconnect] Stage 1 进度:', data, '对话:', meetingConvId);
          
          // 如果 stage1 已经完成，忽略延迟到达的进度事件
          if (stageCompletedRef.stage1) {
            console.log('[reconnect] stage1已完成，忽略延迟的progress事件 model:', data.model);
            return;
          }
          
          // 检查是否是重试进度
          if (data.status === 'retrying') {
            // 再次检查对话是否匹配（防止异步状态更新问题）
            if (meetingConvId !== currentConvIdRef.current) {
              console.log('[reconnect] 忽略重试状态更新，对话已切换');
              return;
            }
            setModelStatuses(prev => {
              // 在状态更新函数内部再次检查
              if (meetingConvId !== currentConvIdRef.current) {
                console.log('[reconnect] 状态更新时对话已切换，保持原状态');
                return prev;
              }
              const newStatuses = {
                ...prev,
                [data.model]: {
                  status: 'retrying',
                  current_retry: data.current_retry,
                  max_retries: data.max_retries
                }
              };
              updateAssistantMessage({ modelStatuses: newStatuses }, meetingConvId);
              return newStatuses;
            });
            return;
          }
          
          const result: Stage1Result = {
            model: data.model,
            response: data.response || '',
            timestamp: new Date().toISOString(),
            error: data.error
          };
          
          // 更新模型状态
          setModelStatuses(prev => {
            // 在状态更新函数内部再次检查对话是否匹配
            if (meetingConvId !== currentConvIdRef.current) {
              console.log('[reconnect] stage1状态更新时对话已切换，保持原状态');
              return prev;
            }
            
            const newStatuses = {
              ...prev,
              [data.model]: data.error
                ? { status: '失败', error: data.error }
                : { status: '已完成' }
            };
            
            // 在修改 resultsRef 前再次检查对话和会议是否匹配
            if (meetingConvId !== currentConvIdRef.current || meetingId !== currentMeetingIdRef.current) {
              console.log('[reconnect] resultsRef更新前对话或会议已切换，跳过更新 meetingId:', meetingId, 'current:', currentMeetingIdRef.current, 'convId:', meetingConvId, 'current:', currentConvIdRef.current);
              return prev;
            }
            
            const existingIndex = resultsRef.stage1.findIndex(r => r.model === data.model);
            if (existingIndex >= 0) {
              resultsRef.stage1[existingIndex] = result;
              console.log('[reconnect] 更新stage1结果:', data.model, 'meetingId:', meetingId, '对话:', meetingConvId, 'resultsRef数量:', resultsRef.stage1.length);
            } else {
              resultsRef.stage1.push(result);
              console.log('[reconnect] 添加stage1结果:', data.model, 'meetingId:', meetingId, '对话:', meetingConvId, 'resultsRef数量:', resultsRef.stage1.length);
            }
            
            updateAssistantMessage({
              stage1: [...resultsRef.stage1],
              modelStatuses: newStatuses
            }, meetingConvId);
            
            return newStatuses;
          });
        } catch (err) {
          console.error('解析stage1_progress失败:', err);
        }
      });

      eventSource.addEventListener('stage1_complete', (event: MessageEvent) => {
        try {
          // 立即标记 stage1 已完成，防止后续 progress 事件继续更新
          // 必须在最开始设置，确保任何后续的progress事件都能看到这个标记
          stageCompletedRef.stage1 = true;
          console.log('[reconnect] stage1_complete收到，立即设置完成标记');
          
          // 检查对话是否仍然匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] 忽略stage1_complete，对话已切换');
            return;
          }
          
          const data = JSON.parse(event.data);
          console.log('[reconnect] Stage 1 完成:', data, 'meetingId:', meetingId, '对话:', meetingConvId);
          
          // 在更新 resultsRef 前检查对话和会议是否匹配
          if (meetingConvId !== currentConvIdRef.current || meetingId !== currentMeetingIdRef.current) {
            console.log('[reconnect] stage1_complete时对话或会议已切换，跳过更新 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
            return;
          }
          
          resultsRef.stage1 = data.results || [];
          console.log('[reconnect] stage1_complete更新resultsRef，结果数:', resultsRef.stage1.length, 'meetingId:', meetingId);
          updateAssistantMessage({ stage1: resultsRef.stage1 }, meetingConvId);
        } catch (err) {
          console.error('解析stage1_complete失败:', err);
        }
      });

      // Stage 2 事件
      eventSource.addEventListener('stage2_start', () => {
        // 检查对话和会议是否仍然匹配
        if (meetingConvId !== currentConvIdRef.current) {
          console.log('[reconnect] 忽略stage2_start，对话已切换 convId:', meetingConvId, 'current:', currentConvIdRef.current);
          return;
        }
        if (meetingId !== currentMeetingIdRef.current) {
          console.log('[reconnect] 忽略stage2_start，会议已切换 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
          return;
        }
        console.log('[reconnect] Stage 2 开始，meetingId:', meetingId, '对话:', meetingConvId);
        // 不更新modelStatuses，因为selectedModels可能已经改变
      });

      eventSource.addEventListener('stage2_label_mapping', (event: MessageEvent) => {
        try {
          // 检查对话是否仍然匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] 忽略stage2_label_mapping，对话已切换');
            return;
          }
          
          const data = JSON.parse(event.data);
          const labelToModel = data.label_to_model || {};
          
          console.log('[reconnect] stage2_label_mapping:', labelToModel, 'meetingId:', meetingId, '对话:', meetingConvId);
          
          // 在修改 resultsRef 前检查对话是否匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] stage2_label_mapping时对话已切换，跳过更新');
            return;
          }
          
          resultsRef.stage2.forEach(result => {
            result.label_to_model = labelToModel;
          });
          
          updateAssistantMessage({ stage2: [...resultsRef.stage2] }, meetingConvId);
        } catch (err) {
          console.error('解析stage2_label_mapping失败:', err);
        }
      });

      eventSource.addEventListener('stage2_progress', (event: MessageEvent) => {
        try {
          // 检查对话和会议是否仍然匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] 忽略stage2_progress，对话已切换 convId:', meetingConvId, 'current:', currentConvIdRef.current);
            return;
          }
          if (meetingId !== currentMeetingIdRef.current) {
            console.log('[reconnect] 忽略stage2_progress，会议已切换 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
            return;
          }
          
          const data = JSON.parse(event.data);
          console.log('[reconnect] Stage 2 进度:', data, '对话:', meetingConvId);
          
          // 如果 stage2 已经完成，忽略延迟到达的进度事件
          if (stageCompletedRef.stage2) {
            console.log('[reconnect] stage2已完成，忽略延迟的progress事件 model:', data.model);
            return;
          }
          
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
            // 在状态更新函数内部再次检查对话是否匹配
            if (meetingConvId !== currentConvIdRef.current) {
              console.log('[reconnect] stage2状态更新时对话已切换，保持原状态');
              return prev;
            }
            
            const newStatuses = {
              ...prev,
              [`${data.model}-stage2`]: data.error
                ? { status: '评审失败', error: data.error }
                : { status: '评审完成' }
            };
            
            // 在修改 resultsRef 前再次检查对话和会议是否匹配
            if (meetingConvId !== currentConvIdRef.current || meetingId !== currentMeetingIdRef.current) {
              console.log('[reconnect] stage2 resultsRef更新前对话或会议已切换，跳过更新 meetingId:', meetingId, 'current:', currentMeetingIdRef.current, 'convId:', meetingConvId, 'current:', currentConvIdRef.current);
              return prev;
            }
            
            const existingIndex = resultsRef.stage2.findIndex(r => r.model === data.model);
            if (existingIndex >= 0) {
              resultsRef.stage2[existingIndex] = result;
              console.log('[reconnect] 更新stage2结果:', data.model, 'meetingId:', meetingId, '对话:', meetingConvId, 'resultsRef数量:', resultsRef.stage2.length);
            } else {
              resultsRef.stage2.push(result);
              console.log('[reconnect] 添加stage2结果:', data.model, 'meetingId:', meetingId, '对话:', meetingConvId, 'resultsRef数量:', resultsRef.stage2.length);
            }
            
            updateAssistantMessage({
              stage1: resultsRef.stage1,
              stage2: [...resultsRef.stage2],
              modelStatuses: newStatuses
            }, meetingConvId);
            
            return newStatuses;
          });
        } catch (err) {
          console.error('解析stage2_progress失败:', err);
        }
      });

      eventSource.addEventListener('stage2_complete', (event: MessageEvent) => {
        try {
          // 立即标记 stage2 已完成，防止后续 progress 事件继续更新
          // 必须在最开始设置，确保任何后续的progress事件都能看到这个标记
          stageCompletedRef.stage2 = true;
          console.log('[reconnect] stage2_complete收到，立即设置完成标记');
          
          // 检查对话是否仍然匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] 忽略stage2_complete，对话已切换');
            return;
          }
          
          const data = JSON.parse(event.data);
          console.log('[reconnect] Stage 2 完成:', data, 'meetingId:', meetingId, '对话:', meetingConvId);
          
          // 在更新 resultsRef 前检查对话和会议是否匹配
          if (meetingConvId !== currentConvIdRef.current || meetingId !== currentMeetingIdRef.current) {
            console.log('[reconnect] stage2_complete时对话或会议已切换，跳过更新 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
            return;
          }
          
          resultsRef.stage2 = data.results || [];
          console.log('[reconnect] stage2_complete更新resultsRef，结果数:', resultsRef.stage2.length, 'meetingId:', meetingId);
          updateAssistantMessage({ stage1: resultsRef.stage1, stage2: resultsRef.stage2 }, meetingConvId);
        } catch (err) {
          console.error('解析stage2_complete失败:', err);
        }
      });

      // Stage 3 事件
      eventSource.addEventListener('stage3_start', () => {
        // 检查对话和会议是否仍然匹配
        if (meetingConvId !== currentConvIdRef.current) {
          console.log('[reconnect] 忽略stage3_start，对话已切换 convId:', meetingConvId, 'current:', currentConvIdRef.current);
          return;
        }
        if (meetingId !== currentMeetingIdRef.current) {
          console.log('[reconnect] 忽略stage3_start，会议已切换 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
          return;
        }
        console.log('[reconnect] Stage 3 开始，meetingId:', meetingId, '对话:', meetingConvId);
      });

      eventSource.addEventListener('stage3_progress', (event: MessageEvent) => {
        try {
          // 检查对话和会议是否仍然匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] 忽略stage3_progress，对话已切换 convId:', meetingConvId, 'current:', currentConvIdRef.current);
            return;
          }
          if (meetingId !== currentMeetingIdRef.current) {
            console.log('[reconnect] 忽略stage3_progress，会议已切换 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
            return;
          }
          
          const data = JSON.parse(event.data);
          console.log('[reconnect] Stage 3 进度:', data, 'meetingId:', meetingId, '对话:', meetingConvId);
          setModelStatuses(prev => {
            // 在状态更新函数内部再次检查对话是否匹配
            if (meetingConvId !== currentConvIdRef.current) {
              console.log('[reconnect] stage3状态更新时对话已切换，保持原状态');
              return prev;
            }
            
            const newStatuses = {
              ...prev,
              [`${data.model}-stage3`]: {
                status: data.status === 'processing' ? '综合中...' :
                        data.status === 'completed' ? '综合完成' : '综合失败',
                error: data.error
              }
            };
            updateAssistantMessage({ modelStatuses: newStatuses }, meetingConvId);
            return newStatuses;
          });
        } catch (err) {
          console.error('解析stage3_progress失败:', err);
        }
      });

      eventSource.addEventListener('stage3_complete', (event: MessageEvent) => {
        try {
          // 检查对话是否仍然匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] 忽略stage3_complete，对话已切换');
            return;
          }
          
          const data = JSON.parse(event.data);
          console.log('[reconnect] Stage 3 完成:', data, 'meetingId:', meetingId, '对话:', meetingConvId);
          
          // 在更新 resultsRef 前检查对话是否匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] stage3_complete时对话已切换，跳过更新');
            return;
          }
          
          resultsRef.stage3 = {
            response: data.response,
            timestamp: data.timestamp,
            error: data.error
          };
          updateAssistantMessage({
            stage1: resultsRef.stage1,
            stage2: resultsRef.stage2,
            stage3: resultsRef.stage3
          }, meetingConvId);
        } catch (err) {
          console.error('解析stage3_complete失败:', err);
        }
      });

      // Stage 4 事件
      eventSource.addEventListener('stage4_start', () => {
        // 检查对话和会议是否仍然匹配
        if (meetingConvId !== currentConvIdRef.current) {
          console.log('[reconnect] 忽略stage4_start，对话已切换 convId:', meetingConvId, 'current:', currentConvIdRef.current);
          return;
        }
        if (meetingId !== currentMeetingIdRef.current) {
          console.log('[reconnect] 忽略stage4_start，会议已切换 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
          return;
        }
        console.log('[reconnect] Stage 4 开始，meetingId:', meetingId, '对话:', meetingConvId);
      });

      eventSource.addEventListener('stage4_progress', (event: MessageEvent) => {
        try {
          // 检查对话和会议是否仍然匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] 忽略stage4_progress，对话已切换 convId:', meetingConvId, 'current:', currentConvIdRef.current);
            return;
          }
          if (meetingId !== currentMeetingIdRef.current) {
            console.log('[reconnect] 忽略stage4_progress，会议已切换 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
            return;
          }
          
          const data = JSON.parse(event.data);
          console.log('[reconnect] Stage 4 进度:', data, 'meetingId:', meetingId, '对话:', meetingConvId);
          setModelStatuses(prev => {
            // 在状态更新函数内部再次检查对话是否匹配
            if (meetingConvId !== currentConvIdRef.current) {
              console.log('[reconnect] stage4状态更新时对话已切换，保持原状态');
              return prev;
            }
            
            const newStatuses = {
              ...prev,
              'stage4': {
                status: data.status === 'processing' ? '计算排名中...' :
                        data.status === 'completed' ? '排名完成' : '排名失败',
                error: data.error
              }
            };
            updateAssistantMessage({ modelStatuses: newStatuses }, meetingConvId);
            return newStatuses;
          });
        } catch (err) {
          console.error('解析stage4_progress失败:', err);
        }
      });

      eventSource.addEventListener('stage4_complete', (event: MessageEvent) => {
        try {
          // 检查对话是否仍然匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] 忽略stage4_complete，对话已切换');
            return;
          }
          
          const data = JSON.parse(event.data);
          console.log('[reconnect] Stage 4 完成:', data, 'meetingId:', meetingId, '对话:', meetingConvId);
          
          // 在更新 resultsRef 前检查对话是否匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] stage4_complete时对话已切换，跳过更新');
            return;
          }
          
          let bestAnswer = data.best_answer || '';
          bestAnswer = bestAnswer.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$1$$');
          bestAnswer = bestAnswer.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
          
          resultsRef.stage4 = {
            rankings: data.rankings || [],
            best_answer: bestAnswer,
            timestamp: data.timestamp,
            error: data.error
          };
          updateAssistantMessage({
            stage1: resultsRef.stage1,
            stage2: resultsRef.stage2,
            stage3: resultsRef.stage3,
            stage4: resultsRef.stage4
          }, meetingConvId);
        } catch (err) {
          console.error('解析stage4_complete失败:', err);
        }
      });

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        try {
          // 检查对话和会议是否仍然匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] 忽略complete，对话已切换 convId:', meetingConvId, 'current:', currentConvIdRef.current);
            return;
          }
          if (meetingId !== currentMeetingIdRef.current) {
            console.log('[reconnect] 忽略complete，会议已切换 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
            return;
          }
          
          const data = JSON.parse(event.data);
          console.log('[reconnect] 会议完成:', data, 'meetingId:', meetingId, '对话:', meetingConvId);
          
          // 只有当前对话匹配时才更新状态
          if (meetingConvId === currentConvIdRef.current) {
            setIsStreaming(false);
            setCurrentMeetingId(null);
            
            // 移除 streaming 标记
            setMessages(prev => prev.map(msg => {
              if (msg.streaming) {
                const { streaming, ...rest } = msg;
                return rest;
              }
              return msg;
            }));
          }
          
          eventSource.close();
          eventSourceRef.current = null;
          
          // 更新对话标题（如果有）
          if (data.title && onUpdateTitle && convId) {
            onUpdateTitle(convId, data.title);
          }
        } catch (err) {
          console.error('解析complete失败:', err);
        }
      });

      eventSource.addEventListener('error', (event: any) => {
        try {
          // 检查对话和会议是否仍然匹配
          if (meetingConvId !== currentConvIdRef.current) {
            console.log('[reconnect] 忽略error，对话已切换 convId:', meetingConvId, 'current:', currentConvIdRef.current);
            return;
          }
          if (meetingId !== currentMeetingIdRef.current) {
            console.log('[reconnect] 忽略error，会议已切换 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
            return;
          }
          
          const data = JSON.parse(event.data);
          console.error('[reconnect] 会议错误:', data, 'meetingId:', meetingId, '对话:', meetingConvId);
          
          // 只有当前对话匹配时才更新错误状态
          if (meetingConvId === currentConvIdRef.current) {
            setError(data.error || '会议执行失败');
            setIsStreaming(false);
            setCurrentMeetingId(null);
          }
          
          eventSource.close();
          eventSourceRef.current = null;
        } catch (err) {
          console.error('解析error失败:', err);
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        // 心跳不需要检查对话ID
        console.log('[reconnect] 收到心跳');
      });

      eventSource.onerror = (err) => {
        // 检查对话和会议是否仍然匹配
        if (meetingConvId !== currentConvIdRef.current) {
          console.log('[reconnect] 忽略onerror，对话已切换 convId:', meetingConvId, 'current:', currentConvIdRef.current);
          eventSource.close();
          return;
        }
        if (meetingId !== currentMeetingIdRef.current) {
          console.log('[reconnect] 忽略onerror，会议已切换 meetingId:', meetingId, 'current:', currentMeetingIdRef.current);
          eventSource.close();
          return;
        }
        
        console.error('[reconnect] SSE 连接错误:', err, 'meetingId:', meetingId, '对话:', meetingConvId);
        setError('连接失败，请重试');
        setIsStreaming(false);
        setCurrentMeetingId(null);
        eventSource.close();
        eventSourceRef.current = null;
      };
    } catch (err: any) {
      setError('重连会议失败: ' + err.message);
      setIsStreaming(false);
      setCurrentMeetingId(null);
      console.error('重连会议失败:', err);
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
    
    const messageConvId = convId; // 保存当前对话ID到闭包

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

      // 监听会议创建事件，保存会议ID
      eventSource.addEventListener('meeting_created', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[ChatInterface] 会议已创建:', data.meeting_id);
          setCurrentMeetingId(data.meeting_id);
        } catch (err) {
          console.error('解析 meeting_created 失败:', err);
        }
      });

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
              }, messageConvId);
              
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
            }, messageConvId);
            
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
          updateAssistantMessage({ stage1: stage1Results }, messageConvId);
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
          }, messageConvId);
          
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
          }, messageConvId);
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
            }, messageConvId);
            
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
          updateAssistantMessage({ stage1: stage1Results, stage2: stage2Results }, messageConvId);
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
            }, messageConvId);
            
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
          }, messageConvId);
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
            }, messageConvId);
            
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
          }, messageConvId);
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

  // 更新助手消息 - 只更新有streaming标记的助手消息，并检查对话ID
  const updateAssistantMessage = (updates: Partial<Message>, meetingConvId?: string | null) => {
    // 如果提供了会议对话ID，检查是否匹配当前对话
    if (meetingConvId && meetingConvId !== currentConvIdRef.current) {
      console.log('[ChatInterface] 忽略其他对话的更新:', meetingConvId, '当前对话:', currentConvIdRef.current);
      return;
    }
    
    setMessages(prev => {
      const newMessages = [...prev];
      // 从后往前查找第一个streaming的助手消息
      for (let i = newMessages.length - 1; i >= 0; i--) {
        if (newMessages[i].role === 'assistant' && newMessages[i].streaming) {
          newMessages[i] = {
            ...newMessages[i],
            ...updates,
            // 保持模型状态更新
            modelStatuses: updates.modelStatuses || newMessages[i].modelStatuses
          };
          break; // 只更新第一个找到的streaming消息
        }
      }
      return newMessages;
    });
  };

  // 停止流式响应 - 取消当前对话的会议
  const handleStopStreaming = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // 如果有会议ID，调用取消会议API
    if (currentMeetingId) {
      try {
        const { cancelMeeting } = await import('../utils/api');
        await cancelMeeting(currentMeetingId);
        console.log('会议已取消:', currentMeetingId);
      } catch (err) {
        console.error('取消会议失败:', err);
      }
      setCurrentMeetingId(null);
    }
    
    setIsStreaming(false);
    
    // 移除 streaming 标记但保留modelStatuses和已完成的阶段数据
    setMessages(prev => prev.map(msg => {
      if (msg.streaming) {
        const { streaming, ...rest } = msg;
        return rest;
      }
      return msg;
    }));
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

        // 监听会议创建事件，保存会议ID
        eventSource.addEventListener('meeting_created', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[ChatInterface] 会议已创建(编辑):', data.meeting_id);
            setCurrentMeetingId(data.meeting_id);
          } catch (err) {
            console.error('解析 meeting_created 失败:', err);
          }
        });

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
      </div>

      {activeModal === 'modelSelector' && (
        <div className="model-selector-overlay" onClick={() => onSetActiveModal(null)}>
          <div className="model-selector-popup" onClick={(e) => e.stopPropagation()}>
            <ModelSelector
              selectedModels={selectedModels}
              onModelsChange={setSelectedModels}
              onRefreshModels={onRefreshModels}
            />
            <button
              className="close-selector-btn"
              onClick={() => onSetActiveModal(null)}
            >
              确定
            </button>
          </div>
        </div>
      )}

      {activeModal === 'contextManager' && (
        <ContextManager
          convId={convId}
          onClose={() => onSetActiveModal(null)}
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

      <div className={`chat-footer ${!isFooterVisible ? 'hidden' : ''}`}>
        <button
          className="footer-toggle-btn"
          onClick={() => setIsFooterVisible(!isFooterVisible)}
          title={isFooterVisible ? "隐藏输入框" : "显示输入框"}
        >
          {isFooterVisible ? '▼' : '▲'}
        </button>
        <div className="footer-content">
          {isStreaming && (
            <button className="stop-btn" onClick={handleStopStreaming}>
              ⏹ 停止生成
            </button>
          )}
          <InputArea
            onSendMessage={handleSendMessage}
            disabled={!convId || isStreaming}
            onOpenContextManager={() => onSetActiveModal('contextManager')}
            onOpenModelSelector={() => onSetActiveModal(activeModal === 'modelSelector' ? null : 'modelSelector')}
            onOpenFileManager={onOpenFileManager}
            selectedModelCount={selectedModels.length}
          />
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;