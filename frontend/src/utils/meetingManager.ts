/**
 * 会议管理器 - 前端
 * 管理多个并发会议的状态和连接
 */

import { startMeeting, subscribeMeetingUpdates, getMeetingStatus, cancelMeeting } from './api';

export interface MeetingState {
  meetingId: string;
  convId: string;
  status: string;
  progress: any;
  eventSource: any | null;
  createdAt: string;
}

class MeetingManager {
  private meetings: Map<string, MeetingState> = new Map();
  private listeners: Map<string, Set<(state: MeetingState) => void>> = new Map();

  /**
   * 启动新会议
   */
  async startMeeting(
    convId: string,
    content: string,
    models: string[],
    attachments: any[]
  ): Promise<string> {
    try {
      // 启动后台会议
      const result = await startMeeting(convId, content, models, attachments);
      const meetingId = result.meeting_id;

      // 创建会议状态
      const state: MeetingState = {
        meetingId,
        convId,
        status: 'pending',
        progress: {},
        eventSource: null,
        createdAt: new Date().toISOString()
      };

      this.meetings.set(meetingId, state);

      // 订阅会议更新
      this.subscribeMeeting(meetingId);

      // 保存到localStorage
      this.saveMeetingsToStorage();

      return meetingId;
    } catch (error) {
      console.error('启动会议失败:', error);
      throw error;
    }
  }

  /**
   * 订阅会议更新
   */
  private subscribeMeeting(meetingId: string) {
    const state = this.meetings.get(meetingId);
    if (!state) return;

    // 如果已经有连接，先关闭
    if (state.eventSource) {
      state.eventSource.close();
    }

    // 创建新的SSE连接
    const eventSource = subscribeMeetingUpdates(meetingId);
    state.eventSource = eventSource;

    // 监听所有事件类型
    const eventTypes = [
      'stage1_start', 'stage1_progress', 'stage1_complete',
      'stage2_start', 'stage2_progress', 'stage2_complete', 'stage2_label_mapping',
      'stage3_start', 'stage3_progress', 'stage3_complete',
      'stage4_start', 'stage4_progress', 'stage4_complete',
      'complete', 'error', 'progress', 'heartbeat'
    ];

    eventTypes.forEach(eventType => {
      eventSource.addEventListener(eventType, (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          
          // 更新会议状态
          if (eventType === 'progress') {
            // 完整的进度更新
            state.status = data.status || state.status;
            state.progress = data.progress || state.progress;
          } else if (eventType === 'complete') {
            state.status = 'completed';
          } else if (eventType === 'error') {
            state.status = 'failed';
            state.progress.error = data.error;
          } else if (eventType !== 'heartbeat') {
            // 其他事件类型，更新到progress中
            if (!state.progress[eventType]) {
              state.progress[eventType] = [];
            }
            if (Array.isArray(state.progress[eventType])) {
              state.progress[eventType].push(data);
            } else {
              state.progress[eventType] = data;
            }
          }

          // 通知监听器
          this.notifyListeners(meetingId, state);

          // 如果会议完成或失败，关闭连接
          if (eventType === 'complete' || eventType === 'error') {
            eventSource.close();
            state.eventSource = null;
            this.saveMeetingsToStorage();
          }
        } catch (err) {
          console.error('解析会议更新失败:', err);
        }
      });
    });

    eventSource.addEventListener('error', (error: any) => {
      console.error('会议SSE连接错误:', error);
      state.status = 'connection_error';
      this.notifyListeners(meetingId, state);
    });
  }

  /**
   * 获取会议状态
   */
  getMeeting(meetingId: string): MeetingState | undefined {
    return this.meetings.get(meetingId);
  }

  /**
   * 获取对话的所有会议
   */
  getConversationMeetings(convId: string): MeetingState[] {
    return Array.from(this.meetings.values()).filter(m => m.convId === convId);
  }

  /**
   * 获取对话的活跃会议
   */
  getActiveMeeting(convId: string): MeetingState | undefined {
    const meetings = this.getConversationMeetings(convId);
    return meetings.find(m => 
      m.status !== 'completed' && 
      m.status !== 'failed' && 
      m.status !== 'cancelled'
    );
  }

  /**
   * 取消会议
   */
  async cancelMeeting(meetingId: string) {
    const state = this.meetings.get(meetingId);
    if (!state) return;

    try {
      // 关闭SSE连接
      if (state.eventSource) {
        state.eventSource.close();
        state.eventSource = null;
      }

      // 调用后端API取消会议
      await cancelMeeting(meetingId);

      // 更新状态
      state.status = 'cancelled';
      this.notifyListeners(meetingId, state);
      this.saveMeetingsToStorage();
    } catch (error) {
      console.error('取消会议失败:', error);
      throw error;
    }
  }

  /**
   * 重新连接会议
   */
  async reconnectMeeting(meetingId: string) {
    const state = this.meetings.get(meetingId);
    if (!state) return;

    try {
      // 获取最新状态
      const latestState = await getMeetingStatus(meetingId);
      
      // 更新本地状态
      state.status = latestState.status;
      state.progress = latestState.progress;

      // 如果会议还在进行中，重新订阅
      if (state.status !== 'completed' && state.status !== 'failed' && state.status !== 'cancelled') {
        this.subscribeMeeting(meetingId);
      }

      this.notifyListeners(meetingId, state);
    } catch (error) {
      console.error('重新连接会议失败:', error);
      throw error;
    }
  }

  /**
   * 添加监听器
   */
  addListener(meetingId: string, callback: (state: MeetingState) => void) {
    if (!this.listeners.has(meetingId)) {
      this.listeners.set(meetingId, new Set());
    }
    this.listeners.get(meetingId)!.add(callback);
  }

  /**
   * 移除监听器
   */
  removeListener(meetingId: string, callback: (state: MeetingState) => void) {
    const listeners = this.listeners.get(meetingId);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * 通知监听器
   */
  private notifyListeners(meetingId: string, state: MeetingState) {
    const listeners = this.listeners.get(meetingId);
    if (listeners) {
      listeners.forEach(callback => callback(state));
    }
  }

  /**
   * 保存会议到localStorage
   */
  private saveMeetingsToStorage() {
    try {
      const meetingsData = Array.from(this.meetings.entries()).map(([id, state]) => ({
        meetingId: id,
        convId: state.convId,
        status: state.status,
        progress: state.progress,
        createdAt: state.createdAt
      }));
      localStorage.setItem('activeMeetings', JSON.stringify(meetingsData));
    } catch (error) {
      console.error('保存会议状态失败:', error);
    }
  }

  /**
   * 从localStorage恢复会议
   */
  async restoreMeetingsFromStorage() {
    try {
      const stored = localStorage.getItem('activeMeetings');
      if (!stored) return;

      const meetingsData = JSON.parse(stored);
      
      for (const data of meetingsData) {
        // 只恢复未完成的会议
        if (data.status !== 'completed' && data.status !== 'failed' && data.status !== 'cancelled') {
          const state: MeetingState = {
            meetingId: data.meetingId,
            convId: data.convId,
            status: data.status,
            progress: data.progress,
            eventSource: null,
            createdAt: data.createdAt
          };

          this.meetings.set(data.meetingId, state);

          // 重新连接
          await this.reconnectMeeting(data.meetingId);
        }
      }
    } catch (error) {
      console.error('恢复会议状态失败:', error);
    }
  }

  /**
   * 清理已完成的会议
   */
  cleanupCompletedMeetings(maxAge: number = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const toRemove: string[] = [];

    this.meetings.forEach((state, meetingId) => {
      if (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') {
        const age = now - new Date(state.createdAt).getTime();
        if (age > maxAge) {
          toRemove.push(meetingId);
        }
      }
    });

    toRemove.forEach(meetingId => {
      const state = this.meetings.get(meetingId);
      if (state?.eventSource) {
        state.eventSource.close();
      }
      this.meetings.delete(meetingId);
      this.listeners.delete(meetingId);
    });

    if (toRemove.length > 0) {
      this.saveMeetingsToStorage();
    }
  }
}

// 导出单例
export const meetingManager = new MeetingManager();