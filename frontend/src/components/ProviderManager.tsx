import { useState, useEffect } from 'react';
import './ProviderManager.css';

/**
 * 供应商接口
 */
interface Provider {
  name: string;
  url: string;
  api_key?: string;
  api_key_masked?: string;
  api_type: 'openai' | 'anthropic';
  created_at?: string;
  updated_at?: string;
}

/**
 * 模型接口
 */
interface Model {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  created?: number;
  owned_by?: string;
}

/**
 * 已添加的模型接口
 */
interface AddedModel {
  name: string;
  display_name: string;
  description?: string;
}

/**
 * 模型测试状态
 */
interface ModelTestStatus {
  status: 'idle' | 'testing' | 'success' | 'warning' | 'error';
  message?: string;
  response?: string;
}

/**
 * 可用模型选择状态
 */
interface AvailableModelSelection {
  [modelId: string]: boolean;
}

/**
 * ProviderManager 组件属性
 */
interface ProviderManagerProps {
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

/**
 * ProviderManager 组件
 * 用于管理AI供应商和模型
 */
function ProviderManager({ onClose, onRefresh }: ProviderManagerProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [addedModels, setAddedModels] = useState<AddedModel[]>([]);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [modelTestStatus, setModelTestStatus] = useState<Record<string, ModelTestStatus>>({});
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [showAvailableModels, setShowAvailableModels] = useState(false);
  const [selectedModels, setSelectedModels] = useState<AvailableModelSelection>({});
  const [manualModelName, setManualModelName] = useState('');
  const [manualDisplayName, setManualDisplayName] = useState('');
  const [manualDescription, setManualDescription] = useState('');

  // 新供应商表单
  const [newProvider, setNewProvider] = useState({
    name: '',
    url: '',
    api_key: '',
    api_type: 'openai' as 'openai' | 'anthropic'
  });

  // 编辑供应商表单
  const [editProvider, setEditProvider] = useState({
    name: '',
    url: '',
    api_key: '',
    api_type: 'openai' as 'openai' | 'anthropic'
  });

  // 加载供应商列表
  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:8007/api/providers');
      if (!response.ok) throw new Error('加载供应商列表失败');
      const data = await response.json();
      setProviders(data.providers || []);
    } catch (err: any) {
      setError('加载供应商列表失败: ' + err.message);
      console.error('加载供应商列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 打开编辑供应商弹窗
  const handleOpenEditProvider = (provider: Provider) => {
    setEditingProvider(provider);
    setEditProvider({
      name: provider.name,
      url: provider.url,
      api_key: '', // 不显示原密钥
      api_type: provider.api_type
    });
    setShowEditForm(true);
  };

  // 编辑供应商
  const handleUpdateProvider = async () => {
    if (!editingProvider || !editProvider.url) {
      setError('请填写API URL');
      return;
    }

    try {
      const updateData: any = {
        url: editProvider.url,
        api_type: editProvider.api_type
      };

      // 只有填写了新密钥才更新
      if (editProvider.api_key) {
        updateData.api_key = editProvider.api_key;
      }

      const response = await fetch(`http://localhost:8007/api/providers/${encodeURIComponent(editingProvider.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || '更新供应商失败');
      }

      setEditProvider({ name: '', url: '', api_key: '', api_type: 'openai' });
      setEditingProvider(null);
      setShowEditForm(false);
      setError(null);
      await loadProviders();
    } catch (err: any) {
      setError('更新供应商失败: ' + err.message);
      console.error('更新供应商失败:', err);
    }
  };

  // 添加供应商
  const handleAddProvider = async () => {
    if (!newProvider.name || !newProvider.url || !newProvider.api_key) {
      setError('请填写所有必填字段');
      return;
    }

    try {
      const response = await fetch('http://localhost:8007/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProvider)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || '添加供应商失败');
      }

      setNewProvider({ name: '', url: '', api_key: '', api_type: 'openai' });
      setShowAddForm(false);
      setError(null);
      await loadProviders();
    } catch (err: any) {
      setError('添加供应商失败: ' + err.message);
      console.error('添加供应商失败:', err);
    }
  };

  // 删除供应商
  const handleDeleteProvider = async (name: string) => {
    if (!confirm(`确定要删除供应商 "${name}" 吗？`)) return;

    try {
      const response = await fetch(`http://localhost:8007/api/providers/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || '删除供应商失败');
      }

      await loadProviders();
      if (selectedProvider === name) {
        setSelectedProvider(null);
        setAddedModels([]);
        setAvailableModels([]);
      }
    } catch (err: any) {
      setError('删除供应商失败: ' + err.message);
      console.error('删除供应商失败:', err);
    }
  };

  // 选择供应商，加载已添加的模型
  const handleSelectProvider = async (providerName: string) => {
    try {
      setLoadingModels(true);
      setError(null);
      setSelectedProvider(providerName);
      setModelTestStatus({});
      setAvailableModels([]);

      const response = await fetch(
        `http://localhost:8007/api/providers/${encodeURIComponent(providerName)}/models`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || '获取模型列表失败');
      }

      const data = await response.json();
      setAddedModels(data.models || []);
    } catch (err: any) {
      setError('获取模型列表失败: ' + err.message);
      console.error('获取模型列表失败:', err);
      setAddedModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  // 获取供应商可用模型列表并显示弹窗
  const handleFetchAvailableModels = async () => {
    if (!selectedProvider) return;

    try {
      setLoadingAvailable(true);
      setError(null);
      setSelectedModels({});
      setModelTestStatus({});

      const response = await fetch(
        `http://localhost:8007/api/providers/${encodeURIComponent(selectedProvider)}/models/fetch`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || '获取可用模型列表失败');
      }

      const data = await response.json();
      setAvailableModels(data.models || []);
      setShowAvailableModels(true);
    } catch (err: any) {
      setError('获取可用模型列表失败: ' + err.message);
      console.error('获取可用模型列表失败:', err);
      setAvailableModels([]);
    } finally {
      setLoadingAvailable(false);
    }
  };

  // 切换模型选择
  const toggleModelSelection = (modelId: string) => {
    setSelectedModels(prev => ({
      ...prev,
      [modelId]: !prev[modelId]
    }));
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    const allSelected = availableModels.every(m => selectedModels[m.id]);
    const newSelection: AvailableModelSelection = {};
    
    if (!allSelected) {
      availableModels.forEach(m => {
        newSelection[m.id] = true;
      });
    }
    
    setSelectedModels(newSelection);
  };

  // 测试模型
  const handleTestModel = async (providerName: string, modelName: string) => {
    const key = `${providerName}:${modelName}`;
    
    try {
      setModelTestStatus(prev => ({
        ...prev,
        [key]: { status: 'testing' }
      }));

      const response = await fetch(
        `http://localhost:8007/api/providers/models/test?provider_name=${encodeURIComponent(providerName)}&model_name=${encodeURIComponent(modelName)}`,
        {
          method: 'POST'
        }
      );

      const data = await response.json();

      if (data.success) {
        setModelTestStatus(prev => ({
          ...prev,
          [key]: {
            status: 'success',
            message: '模型正常',
            response: data.response
          }
        }));
      } else {
        setModelTestStatus(prev => ({
          ...prev,
          [key]: {
            status: 'error',
            message: data.error || '测试失败'
          }
        }));
      }
    } catch (err: any) {
      setModelTestStatus(prev => ({
        ...prev,
        [key]: {
          status: 'error',
          message: '测试失败: ' + err.message
        }
      }));
    }
  };

  // 批量添加选中的模型
  const handleBatchAddModels = async () => {
    if (!selectedProvider) return;

    const modelsToAdd = availableModels.filter(m => selectedModels[m.id]);
    
    if (modelsToAdd.length === 0) {
      setError('请至少选择一个模型');
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;

      for (const model of modelsToAdd) {
        try {
          const response = await fetch(
            `http://localhost:8007/api/providers/${encodeURIComponent(selectedProvider)}/models`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                provider_name: selectedProvider,
                model_id: model.id,
                display_name: model.name,
                description: model.owned_by ? `by ${model.owned_by}` : ''
              })
            }
          );

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        alert(`成功添加 ${successCount} 个模型${failCount > 0 ? `，失败 ${failCount} 个` : ''}`);
        setShowAvailableModels(false);
        setSelectedModels({});
        await handleSelectProvider(selectedProvider);
        await onRefresh();
      } else {
        setError('所有模型添加失败');
      }
    } catch (err: any) {
      setError('批量添加模型失败: ' + err.message);
      console.error('批量添加模型失败:', err);
    }
  };

  // 手动添加模型
  const handleManualAddModel = async () => {
    if (!selectedProvider || !manualModelName || !manualDisplayName) {
      setError('请填写模型名称和显示名称');
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:8007/api/providers/${encodeURIComponent(selectedProvider)}/models`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_name: selectedProvider,
            model_id: manualModelName,
            display_name: manualDisplayName,
            description: manualDescription
          })
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || '添加模型失败');
      }

      alert('模型已添加');
      setShowManualAdd(false);
      setManualModelName('');
      setManualDisplayName('');
      setManualDescription('');
      await handleSelectProvider(selectedProvider);
      await onRefresh();
    } catch (err: any) {
      setError('添加模型失败: ' + err.message);
      console.error('添加模型失败:', err);
    }
  };

  // 删除已添加的模型
  const handleDeleteModel = async (modelName: string) => {
    if (!selectedProvider) return;
    if (!confirm(`确定要删除模型 "${modelName}" 吗？`)) return;

    try {
      const response = await fetch(
        `http://localhost:8007/api/providers/${encodeURIComponent(selectedProvider)}/models/${encodeURIComponent(modelName)}`,
        {
          method: 'DELETE'
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || '删除模型失败');
      }

      await handleSelectProvider(selectedProvider);
      await onRefresh();
    } catch (err: any) {
      setError('删除模型失败: ' + err.message);
      console.error('删除模型失败:', err);
    }
  };

  // 获取测试状态图标
  const getStatusIcon = (status: ModelTestStatus) => {
    switch (status.status) {
      case 'testing':
        return <span className="status-icon testing" title="测试中...">⏳</span>;
      case 'success':
        return <span className="status-icon success" title={status.message}>✓</span>;
      case 'warning':
        return <span className="status-icon warning" title={status.message}>⚠</span>;
      case 'error':
        return <span className="status-icon error" title={status.message}>✗</span>;
      default:
        return null;
    }
  };

  return (
    <div className="provider-manager-overlay" onClick={onClose}>
      <div className="provider-manager-wrapper" onClick={(e) => e.stopPropagation()}>
        {/* 编辑供应商弹窗 */}
        {showEditForm && (
          <div className="provider-overlay" onClick={() => setShowEditForm(false)}>
            <div className="provider-popup" onClick={(e) => e.stopPropagation()}>
              <div className="provider-popup-header">
                <h3>编辑供应商</h3>
                <button className="close-btn" onClick={() => setShowEditForm(false)}>×</button>
              </div>
              <div className="provider-popup-body">
                <div className="form-group">
                  <label>
                    供应商名称
                    <input
                      type="text"
                      value={editProvider.name}
                      disabled
                      style={{ background: '#f3f4f6', cursor: 'not-allowed' }}
                    />
                    <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                      供应商名称不可修改
                    </span>
                  </label>
                </div>
                <div className="form-group">
                  <label>
                    API类型 <span className="required">*</span>
                    <select
                      value={editProvider.api_type}
                      onChange={(e) => setEditProvider({ ...editProvider, api_type: e.target.value as 'openai' | 'anthropic' })}
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                  </label>
                </div>
                <div className="form-group">
                  <label>
                    API URL <span className="required">*</span>
                    <input
                      type="text"
                      value={editProvider.url}
                      onChange={(e) => setEditProvider({ ...editProvider, url: e.target.value })}
                      placeholder="例如: https://api.openai.com/v1/chat/completions"
                    />
                  </label>
                </div>
                <div className="form-group">
                  <label>
                    API Key
                    <input
                      type="password"
                      value={editProvider.api_key}
                      onChange={(e) => setEditProvider({ ...editProvider, api_key: e.target.value })}
                      placeholder="留空则不修改密钥"
                    />
                    <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                      留空则保持原密钥不变
                    </span>
                  </label>
                </div>
              </div>
              <div className="provider-popup-footer">
                <button className="cancel-btn" onClick={() => setShowEditForm(false)}>取消</button>
                <button className="add-btn" onClick={handleUpdateProvider}>保存</button>
              </div>
            </div>
          </div>
        )}
  
        {/* 添加供应商弹窗 */}
          {showAddForm && (
          <div className="provider-overlay" onClick={() => setShowAddForm(false)}>
            <div className="provider-popup" onClick={(e) => e.stopPropagation()}>
              <div className="provider-popup-header">
                <h3>添加供应商</h3>
                <button className="close-btn" onClick={() => setShowAddForm(false)}>×</button>
              </div>
            <div className="provider-popup-body">
              <div className="form-group">
                <label>
                  供应商名称 <span className="required">*</span>
                  <input
                    type="text"
                    value={newProvider.name}
                    onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                    placeholder="例如: OpenAI"
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  API类型 <span className="required">*</span>
                  <select
                    value={newProvider.api_type}
                    onChange={(e) => setNewProvider({ ...newProvider, api_type: e.target.value as 'openai' | 'anthropic' })}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </label>
              </div>
              <div className="form-group">
                <label>
                  API URL <span className="required">*</span>
                  <input
                    type="text"
                    value={newProvider.url}
                    onChange={(e) => setNewProvider({ ...newProvider, url: e.target.value })}
                    placeholder="例如: https://api.openai.com/v1/chat/completions"
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  API Key <span className="required">*</span>
                  <input
                    type="password"
                    value={newProvider.api_key}
                    onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
                    placeholder="输入API密钥"
                  />
                </label>
              </div>
            </div>
            <div className="provider-popup-footer">
              <button className="cancel-btn" onClick={() => setShowAddForm(false)}>取消</button>
              <button className="add-btn" onClick={handleAddProvider}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 可用模型弹窗 */}
      {showAvailableModels && (
        <div className="provider-overlay" onClick={() => setShowAvailableModels(false)}>
          <div className="provider-popup large-popup" onClick={(e) => e.stopPropagation()}>
            <div className="provider-popup-header">
              <h3>可用模型列表 - {selectedProvider}</h3>
              <button className="close-btn" onClick={() => setShowAvailableModels(false)}>×</button>
            </div>
            <div className="provider-popup-body scrollable">
              {loadingAvailable ? (
                <div className="provider-loading">
                  <div className="loading"></div>
                  <span>获取可用模型中...</span>
                </div>
              ) : availableModels.length === 0 ? (
                <div className="empty-state">暂无可用模型</div>
              ) : (
                <>
                  <div className="batch-actions">
                    <button
                      className="select-all-btn"
                      onClick={toggleSelectAll}
                    >
                      {availableModels.every(m => selectedModels[m.id]) ? '取消全选' : '全选'}
                    </button>
                    <span className="selected-count">
                      已选择 {Object.values(selectedModels).filter(Boolean).length} / {availableModels.length}
                    </span>
                  </div>
                  <div className="available-model-list">
                    {availableModels.map((model) => {
                      const key = `${selectedProvider}:${model.id}`;
                      const testStatus = modelTestStatus[key];
                      const isSelected = selectedModels[model.id];
                      
                      return (
                        <div
                          key={model.id}
                          className={`available-model-item ${isSelected ? 'selected' : ''}`}
                        >
                          <div className="model-checkbox">
                            <input
                              type="checkbox"
                              checked={isSelected || false}
                              onChange={() => toggleModelSelection(model.id)}
                            />
                          </div>
                          <div className="model-info">
                            <h4>{model.name}</h4>
                            {model.owned_by && (
                              <span className="model-owner">by {model.owned_by}</span>
                            )}
                          </div>
                          <div className="model-actions">
                            {testStatus && getStatusIcon(testStatus)}
                            <button
                              className="test-btn"
                              onClick={() => handleTestModel(selectedProvider!, model.id)}
                              disabled={testStatus?.status === 'testing'}
                              title="测试模型"
                            >
                              🧪 测试
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div className="provider-popup-footer">
              <button className="cancel-btn" onClick={() => setShowAvailableModels(false)}>取消</button>
              <button
                className="add-btn"
                onClick={handleBatchAddModels}
                disabled={Object.values(selectedModels).filter(Boolean).length === 0}
              >
                添加选中的模型 ({Object.values(selectedModels).filter(Boolean).length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 手动添加模型弹窗 */}
      {showManualAdd && (
        <div className="provider-overlay" onClick={() => setShowManualAdd(false)}>
          <div className="provider-popup" onClick={(e) => e.stopPropagation()}>
            <div className="provider-popup-header">
              <h3>手动添加模型</h3>
              <button className="close-btn" onClick={() => setShowManualAdd(false)}>×</button>
            </div>
            <div className="provider-popup-body">
              <div className="form-group">
                <label>
                  模型名称 <span className="required">*</span>
                  <input
                    type="text"
                    value={manualModelName}
                    onChange={(e) => setManualModelName(e.target.value)}
                    placeholder="例如: gpt-4"
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  显示名称 <span className="required">*</span>
                  <input
                    type="text"
                    value={manualDisplayName}
                    onChange={(e) => setManualDisplayName(e.target.value)}
                    placeholder="例如: GPT-4"
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  模型描述
                  <input
                    type="text"
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    placeholder="可选"
                  />
                </label>
              </div>
            </div>
            <div className="provider-popup-footer">
              <button className="cancel-btn" onClick={() => setShowManualAdd(false)}>取消</button>
              <button className="add-btn" onClick={handleManualAddModel}>添加</button>
            </div>
          </div>
        </div>
      )}

      <div className="provider-manager">
        <div className="provider-manager-header">
          <h2>供应商管理</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="provider-error">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {loading ? (
          <div className="provider-loading">
            <div className="loading"></div>
            <span>加载中...</span>
          </div>
        ) : (
          <div className="provider-content">
            {/* 左侧：供应商列表 */}
            <div className="provider-list-section">
              <div className="section-header">
                <h3>供应商列表</h3>
                <button className="add-provider-btn" onClick={() => setShowAddForm(true)}>
                  ➕ 添加供应商
                </button>
              </div>
              <div className="provider-list">
                {providers.length === 0 ? (
                  <div className="empty-state">暂无供应商</div>
                ) : (
                  providers.map((provider) => (
                    <div
                      key={provider.name}
                      className={`provider-item ${selectedProvider === provider.name ? 'selected' : ''}`}
                      onClick={() => handleSelectProvider(provider.name)}
                    >
                      <div className="provider-info">
                        <h4>{provider.name}</h4>
                        <span className="provider-type">{provider.api_type.toUpperCase()}</span>
                      </div>
                      <div className="provider-actions">
                        <button
                          className="edit-provider-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditProvider(provider);
                          }}
                          title="编辑供应商"
                        >
                          ✏️
                        </button>
                        <button
                          className="delete-provider-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProvider(provider.name);
                          }}
                          title="删除供应商"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 右侧：模型列表 */}
            <div className="model-list-section">
              <div className="section-header">
                <h3>模型列表</h3>
                {selectedProvider && (
                  <div className="header-actions">
                    <button
                      className="fetch-btn"
                      onClick={handleFetchAvailableModels}
                      disabled={loadingAvailable}
                    >
                      🔍 获取可用模型
                    </button>
                    <button
                      className="manual-add-btn"
                      onClick={() => setShowManualAdd(true)}
                    >
                      ➕ 手动添加
                    </button>
                  </div>
                )}
              </div>
              {!selectedProvider ? (
                <div className="empty-state">请选择一个供应商查看模型</div>
              ) : (
                <>
                  {/* 已添加的模型 */}
                  <div className="added-models-section">
                    <h4>已添加的模型</h4>
                    {loadingModels ? (
                      <div className="provider-loading">
                        <div className="loading"></div>
                        <span>加载模型列表中...</span>
                      </div>
                    ) : addedModels.length === 0 ? (
                      <div className="empty-state">该供应商暂无已添加的模型</div>
                    ) : (
                      <div className="model-list">
                        {addedModels.map((model) => {
                          const key = `${selectedProvider}:${model.name}`;
                          const testStatus = modelTestStatus[key];
                          
                          return (
                            <div key={model.name} className="model-item">
                              <div className="model-info">
                                <h4>{model.display_name}</h4>
                                <span className="model-name">{model.name}</span>
                                {model.description && (
                                  <span className="model-description">{model.description}</span>
                                )}
                              </div>
                              <div className="model-actions">
                                {testStatus && getStatusIcon(testStatus)}
                                <button
                                  className="test-btn"
                                  onClick={() => handleTestModel(selectedProvider, model.name)}
                                  disabled={testStatus?.status === 'testing'}
                                  title="测试模型"
                                >
                                  🧪 测试
                                </button>
                                <button
                                  className="delete-model-btn"
                                  onClick={() => handleDeleteModel(model.name)}
                                  title="删除模型"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

export default ProviderManager;