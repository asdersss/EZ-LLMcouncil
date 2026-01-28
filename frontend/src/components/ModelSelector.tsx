import { useState, useEffect } from 'react';
import { getModels } from '../utils/api';
import './ModelSelector.css';

/**
 * 供应商分组的模型
 */
interface ProviderGroup {
  provider: string;
  models: ModelInfo[];
}

/**
 * 模型信息
 */
interface ModelInfo {
  name: string;
  display_name: string;
  description?: string;
  provider: string;
  is_chairman: boolean;
}

/**
 * ModelSelector 组件属性
 */
interface ModelSelectorProps {
  selectedModels: string[];
  onModelsChange: (models: string[]) => void;
  onRefreshModels: () => Promise<void>;
}

/**
 * ModelSelector 组件
 * 按供应商分组显示模型，支持跨供应商多选和主席模型配置
 */
function ModelSelector({ selectedModels, onModelsChange, onRefreshModels }: ModelSelectorProps) {
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chairman, setChairman] = useState<string>('');
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  // 加载模型列表
  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getModels();
      
      // 按供应商分组
      const groups: { [provider: string]: ModelInfo[] } = {};
      let chairmanModel = '';
      
      response.forEach((model: any) => {
        const provider = model.provider || 'Unknown';
        if (!groups[provider]) {
          groups[provider] = [];
        }
        groups[provider].push({
          name: model.name,
          display_name: model.display_name,
          description: model.description,
          provider: provider,
          is_chairman: model.is_chairman
        });
        
        if (model.is_chairman) {
          chairmanModel = model.name;
        }
      });
      
      // 转换为数组
      const groupArray = Object.keys(groups).map(provider => ({
        provider,
        models: groups[provider]
      }));
      
      setProviderGroups(groupArray);
      setChairman(chairmanModel);
      // 默认展开所有供应商
      setExpandedProviders(new Set(Object.keys(groups)));
      
      // 如果没有选中的模型，默认选中主席模型
      if (selectedModels.length === 0 && chairmanModel) {
        onModelsChange([chairmanModel]);
      }
    } catch (err) {
      setError('加载模型列表失败');
      console.error('加载模型列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 处理模型选择
  const handleModelToggle = (modelName: string) => {
    if (selectedModels.includes(modelName)) {
      // 取消选择
      const newSelection = selectedModels.filter(m => m !== modelName);
      // 至少保留一个模型
      if (newSelection.length > 0) {
        onModelsChange(newSelection);
      }
    } else {
      // 添加选择
      onModelsChange([...selectedModels, modelName]);
    }
  };

  // 切换供应商展开/折叠
  const toggleProvider = (provider: string) => {
    const newExpanded = new Set(expandedProviders);
    if (newExpanded.has(provider)) {
      newExpanded.delete(provider);
    } else {
      newExpanded.add(provider);
    }
    setExpandedProviders(newExpanded);
  };

  // 全选/取消全选供应商下的模型
  const toggleProviderModels = (provider: string, models: ModelInfo[]) => {
    const providerModelNames = models.map(m => m.name);
    const allSelected = providerModelNames.every(name => selectedModels.includes(name));
    
    if (allSelected) {
      // 取消选择该供应商的所有模型
      const newSelection = selectedModels.filter(name => !providerModelNames.includes(name));
      // 至少保留一个模型
      if (newSelection.length > 0) {
        onModelsChange(newSelection);
      }
    } else {
      // 选择该供应商的所有模型
      const newSelection = [...new Set([...selectedModels, ...providerModelNames])];
      onModelsChange(newSelection);
    }
  };

  // 设置主席模型
  const handleSetChairman = async (modelName: string) => {
    try {
      const response = await fetch('http://localhost:8007/api/models/config');
      if (!response.ok) throw new Error('获取配置失败');
      
      const data = await response.json();
      
      // 更新主席模型
      const updateResponse = await fetch('http://localhost:8007/api/models/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: data.models,
          chairman: modelName
        })
      });
      
      if (!updateResponse.ok) throw new Error('更新主席模型失败');
      
      setChairman(modelName);
      await onRefreshModels();
      await loadModels();
    } catch (err: any) {
      setError('设置主席模型失败: ' + err.message);
      console.error('设置主席模型失败:', err);
    }
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    const allModelNames = providerGroups.flatMap(g => g.models.map(m => m.name));
    
    if (selectedModels.length === allModelNames.length) {
      // 如果已全选，则取消全选(但至少保留第一个模型)
      if (allModelNames.length > 0) {
        onModelsChange([allModelNames[0]]);
      }
    } else {
      // 全选
      onModelsChange(allModelNames);
    }
  };

  const totalModels = providerGroups.reduce((sum, g) => sum + g.models.length, 0);

  return (
    <div className="model-selector">
      <div className="model-selector-header">
        <h3>选择模型</h3>
        <div className="header-actions">
          {!loading && totalModels > 0 && (
            <button
              className="select-all-btn"
              onClick={handleSelectAll}
              title={selectedModels.length === totalModels ? '取消全选' : '全选'}
            >
              {selectedModels.length === totalModels ? '取消全选' : '全选'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="model-selector-error">
          {error}
          <button onClick={loadModels} className="retry-btn">
            重试
          </button>
        </div>
      )}

      {loading ? (
        <div className="model-selector-loading">
          <div className="loading"></div>
          <span>加载模型中...</span>
        </div>
      ) : (
        <div className="model-list">
          {providerGroups.length === 0 ? (
            <div className="empty-state">
              <p>暂无可用模型</p>
            </div>
          ) : (
            providerGroups.map(group => {
              const isExpanded = expandedProviders.has(group.provider);
              const providerModelNames = group.models.map(m => m.name);
              const allSelected = providerModelNames.every(name => selectedModels.includes(name));
              const someSelected = providerModelNames.some(name => selectedModels.includes(name));
              
              return (
                <div key={group.provider} className="provider-group">
                  <div className="provider-group-header">
                    <button
                      className="provider-toggle"
                      onClick={() => toggleProvider(group.provider)}
                    >
                      <span className={`toggle-icon ${isExpanded ? 'expanded' : ''}`}>▶</span>
                      <span className="provider-name">{group.provider}</span>
                      <span className="provider-count">({group.models.length})</span>
                    </button>
                    <button
                      className={`provider-select-all ${allSelected ? 'all-selected' : someSelected ? 'some-selected' : ''}`}
                      onClick={() => toggleProviderModels(group.provider, group.models)}
                      title={allSelected ? '取消全选' : '全选'}
                    >
                      {allSelected ? '✓' : someSelected ? '◐' : '○'}
                    </button>
                  </div>
                  
                  {isExpanded && (
                    <div className="provider-models">
                      {group.models.map(model => (
                        <div
                          key={model.name}
                          className={`model-item ${selectedModels.includes(model.name) ? 'selected' : ''}`}
                          onClick={() => handleModelToggle(model.name)}
                        >
                          <div className="model-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedModels.includes(model.name)}
                              onChange={() => handleModelToggle(model.name)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          
                          <div className="model-info">
                            <div className="model-name">
                              {model.display_name || model.name}
                              {chairman === model.name && (
                                <span className="chair-badge" title="主席模型">
                                  👑
                                </span>
                              )}
                            </div>
                            {model.description && (
                              <div className="model-description">
                                {model.description}
                              </div>
                            )}
                          </div>
                          
                          {chairman !== model.name && (
                            <button
                              className="set-chairman-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetChairman(model.name);
                              }}
                              title="设为主席"
                            >
                              设为主席
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="model-selector-footer">
        <span className="selected-count">
          已选择 {selectedModels.length} / {totalModels} 个模型
        </span>
        {chairman && (() => {
          const chairmanModel = providerGroups.flatMap(g => g.models).find(m => m.name === chairman);
          const displayText = chairmanModel
            ? `${chairmanModel.display_name} (${chairmanModel.provider})`
            : chairman;
          return (
            <span className="chairman-info">
              主席: {displayText}
            </span>
          );
        })()}
      </div>
    </div>
  );
}

export default ModelSelector;