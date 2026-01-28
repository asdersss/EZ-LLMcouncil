import { useState, useEffect } from 'react';
import { getConversations, createConversation, deleteConversation, getModels } from './utils/api';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import Settings from './components/Settings';
import FileManager from './components/FileManager';
import ProviderManager from './components/ProviderManager';
import './App.css';

/**
 * 主应用组件
 * 管理对话列表、当前对话和模型列表
 */
function App() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFileManager, setShowFileManager] = useState(false);
  const [showProviderManager, setShowProviderManager] = useState(false);

  // 初始化：加载对话列表和模型列表
  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    try {
      setLoading(true);
      setError(null);

      // 并行加载对话列表和模型列表
      const [convList, modelList] = await Promise.all([
        getConversations(),
        getModels()
      ]);

      setConversations(convList);
      setModels(modelList);

      // 如果有对话，选中第一个
      if (convList.length > 0) {
        setCurrentConvId(convList[0].id);
      } else {
        // 如果没有对话，创建一个新对话
        await handleNewConversation();
      }
    } catch (err: any) {
      setError('初始化失败: ' + err.message);
      console.error('初始化失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 创建新对话
  const handleNewConversation = async () => {
    try {
      const newConv = await createConversation();
      setConversations(prev => [newConv, ...prev]);
      setCurrentConvId(newConv.id);
    } catch (err: any) {
      setError('创建对话失败: ' + err.message);
      console.error('创建对话失败:', err);
    }
  };

  // 删除对话
  const handleDeleteConversation = async (convId: string) => {
    try {
      await deleteConversation(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      
      // 如果删除的是当前对话，切换到第一个对话或创建新对话
      if (convId === currentConvId) {
        const remaining = conversations.filter(c => c.id !== convId);
        if (remaining.length > 0) {
          setCurrentConvId(remaining[0].id);
        } else {
          await handleNewConversation();
        }
      }
    } catch (err: any) {
      setError('删除对话失败: ' + err.message);
      console.error('删除对话失败:', err);
    }
  };

  // 选择对话
  const handleSelectConversation = (convId: string) => {
    setCurrentConvId(convId);
    setError(null);
  };

  // 更新对话标题
  const handleUpdateConversationTitle = (convId: string, newTitle: string) => {
    setConversations(prev =>
      prev.map(conv =>
        conv.id === convId ? { ...conv, title: newTitle } : conv
      )
    );
  };

  // 刷新模型列表
  const handleRefreshModels = async () => {
    try {
      const modelList = await getModels();
      setModels(modelList);
    } catch (err: any) {
      setError('刷新模型列表失败: ' + err.message);
      console.error('刷新模型列表失败:', err);
    }
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {error && (
        <div className="app-error">
          <span>❌ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      <Sidebar
        conversations={conversations}
        currentConvId={currentConvId}
        onConversationChange={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onOpenSettings={() => setShowSettings(true)}
        onOpenFileManager={() => setShowFileManager(true)}
        onOpenProviderManager={() => setShowProviderManager(true)}
      />
      
      <ChatInterface
        convId={currentConvId}
        models={models}
        onRefreshModels={handleRefreshModels}
        onUpdateTitle={handleUpdateConversationTitle}
      />
      
      {/* 设置弹窗 */}
      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}
      
      {/* 全局文件管理器 */}
      {showFileManager && (
        <FileManager onClose={() => setShowFileManager(false)} />
      )}
      
      {/* 供应商管理器 */}
      {showProviderManager && (
        <ProviderManager
          onClose={() => setShowProviderManager(false)}
          onRefresh={handleRefreshModels}
        />
      )}
    </div>
  );
}

export default App;
