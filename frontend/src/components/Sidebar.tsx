import { useState } from 'react';
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
  const [isVisible, setIsVisible] = useState(true);

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
    <div className={`sidebar ${!isVisible ? 'hidden' : ''}`}>
      <button
        className="sidebar-toggle-btn"
        onClick={() => setIsVisible(!isVisible)}
        title={isVisible ? "隐藏侧边栏" : "显示侧边栏"}
      >
        {isVisible ? '◀' : '▶'}
      </button>
      <div className="sidebar-content">
        <div className="sidebar-settings-bar">
          <button
            className="icon-btn"
          onClick={onOpenSettings}
          title="系统设置"
        >
          ⚙️
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            // 打开文件管理器时，不传递 onSelectFile 回调，这样就不会显示选择按钮
            // 这里我们需要修改 App.tsx 中的逻辑，或者通过某种方式告诉 App.tsx 不要传递回调
            // 由于 Sidebar 的 onOpenFileManager 是直接调用 setActiveModal('fileManager')
            // 我们可以在 App.tsx 中处理，或者在这里通过参数区分
            // 简单起见，我们假设 App.tsx 会处理这个逻辑，或者我们修改 onOpenFileManager 的签名
            // 但根据当前代码结构，Sidebar 只是触发打开，具体传参在 App.tsx
            // 所以我们需要修改 App.tsx
            onOpenFileManager();
          }}
          title="文件管理"
        >
          📁
        </button>
        <button
          className="icon-btn"
          onClick={onOpenProviderManager}
          title="模型服务商"
        >
          🏢
        </button>
      </div>
      
      <div className="sidebar-header">
        <h2>对话记录</h2>
        <button
          className="new-conversation-btn"
          onClick={onNewConversation}
          title="新建对话"
        >
          +
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
    </div>
  );
}

export default Sidebar;