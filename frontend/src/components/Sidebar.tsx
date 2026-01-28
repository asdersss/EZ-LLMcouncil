import { useState, useEffect } from 'react';
import { getConversations } from '../utils/api';
import './Sidebar.css';

/**
 * Sidebar 组件属性
 */
interface SidebarProps {
  conversations: any[];
  currentConvId: string | null;
  onConversationChange: (convId: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (convId: string) => void;
  onOpenSettings: () => void;
  onOpenFileManager: () => void;
  onOpenProviderManager: () => void;
}

/**
 * Sidebar 组件
 * 显示对话列表，支持新建、切换和删除对话
 */
function Sidebar({
  conversations,
  currentConvId,
  onConversationChange,
  onNewConversation,
  onDeleteConversation,
  onOpenSettings,
  onOpenFileManager,
  onOpenProviderManager
}: SidebarProps) {

  // 删除对话
  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 防止触发切换对话
    
    if (!window.confirm('确定要删除这个对话吗？')) {
      return;
    }

    onDeleteConversation(convId);
  };

  // 切换对话
  const handleSelectConversation = (convId: string) => {
    onConversationChange(convId);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <h2>对话列表</h2>
          <div className="header-buttons">
            <button
              className="provider-manager-btn"
              onClick={onOpenProviderManager}
              title="供应商管理"
            >
              🏢
            </button>
            <button
              className="file-manager-btn"
              onClick={onOpenFileManager}
              title="文件管理"
            >
              📁
            </button>
            <button
              className="settings-btn"
              onClick={onOpenSettings}
              title="系统设置"
            >
              ⚙️
            </button>
          </div>
        </div>
        <button
          className="new-conversation-btn primary"
          onClick={onNewConversation}
          title="新建对话"
        >
          + 新对话
        </button>
      </div>

      <div className="conversation-list">
          {conversations.length === 0 ? (
            <div className="empty-state">
              <p>暂无对话</p>
              <p>点击上方按钮创建新对话</p>
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`conversation-item ${conv.id === currentConvId ? 'active' : ''}`}
                onClick={() => handleSelectConversation(conv.id)}
              >
                <div className="conversation-info">
                  <div className="conversation-title">
                    {conv.title || '新对话'}
                  </div>
                  <div className="conversation-meta">
                    {new Date(conv.created_at).toLocaleString('zh-CN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                <button
                  className="delete-btn"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  title="删除对话"
                >
                  ×
                </button>
              </div>
            ))
          )}
      </div>
    </div>
  );
}

export default Sidebar;