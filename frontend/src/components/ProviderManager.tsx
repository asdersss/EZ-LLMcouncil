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
  created?: number;
  owned_by?: string;
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
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelTestStatus, setModelTestStatus] = useState<Record<string, ModelTestStatus>>({});

  // 新供应商表单
  const [newProvider, setNewProvider] = useState({
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
        setProviderModels([]);
      }
    } catch (err: any) {
      setError('删除供应商失败: ' + err.message);
      console.error('删除供应商失败:', err);
    }
  };

  // 获取供应商模型列表
  const handleFetchModels = async (providerName: string) => {
    try {
      setLoadingModels(true);
      setError(null);
      setSelectedProvider(providerName);
      setModelTestStatus({});

      const response = await fetch(
        `http://localhost:8007/api/providers/${encodeURIComponent(providerName)}/models`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || '获取模型列表失败');
      }

      const data = await response.json();
      setProviderModels(data.models || []);
    } catch (err: any) {
      setError('获取模型列表失败: ' + err.message);
      console.error('获取模型列表失败:', err);
      setProviderModels([]);
    } finally {
      setLoadingModels(false);
    }
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
        `http://localhost:8007/api/providers/models/test?provider_name=${encodeURIComponent(providerName)}&model_name=${encodeURIComponent(modelName)}`
      , {
        method: 'POST'
      });

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

  // 添加模型到本地配置
  const handleAddModelToLocal = async (providerName: string, model: Model) => {
    const displayName = prompt('请输入模型显示名称:', model.name);
    if (!displayName) return;

    const description = prompt('请输入模型描述（可选）:', '') || '';

    try {
      const response = await fetch('http://localhost:8007/api/providers/models/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_name: providerName,
          model_id: model.id,
          display_name: displayName,
          description: description
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || '添加模型失败');
      }

      alert('模型已添加到本地配置');
      await onRefresh();
    } catch (err: any) {
      setError('添加模型失败: ' + err.message);
      console.error('添加模型失败:', err);
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
    <>
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
                      onClick={() => handleFetchModels(provider.name)}
                    >
                      <div className="provider-info">
                        <h4>{provider.name}</h4>
                        <span className="provider-type">{provider.api_type.toUpperCase()}</span>
                      </div>
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
                  ))
                )}
              </div>
            </div>

            {/* 右侧：模型列表 */}
            <div className="model-list-section">
              <div className="section-header">
                <h3>模型列表</h3>
                {selectedProvider && (
                  <button
                    className="refresh-btn"
                    onClick={() => handleFetchModels(selectedProvider)}
                    disabled={loadingModels}
                  >
                    🔄 刷新
                  </button>
                )}
              </div>
              {!selectedProvider ? (
                <div className="empty-state">请选择一个供应商查看模型</div>
              ) : loadingModels ? (
                <div className="provider-loading">
                  <div className="loading"></div>
                  <span>加载模型列表中...</span>
                </div>
              ) : providerModels.length === 0 ? (
                <div className="empty-state">该供应商暂无可用模型</div>
              ) : (
                <div className="model-list">
                  {providerModels.map((model) => {
                    const key = `${selectedProvider}:${model.id}`;
                    const testStatus = modelTestStatus[key];
                    
                    return (
                      <div key={model.id} className="model-item">
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
                            onClick={() => handleTestModel(selectedProvider, model.id)}
                            disabled={testStatus?.status === 'testing'}
                            title="测试模型"
                          >
                            🧪 测试
                          </button>
                          <button
                            className="add-model-btn"
                            onClick={() => handleAddModelToLocal(selectedProvider, model)}
                            title="添加到本地"
                          >
                            ➕ 添加
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default ProviderManager;