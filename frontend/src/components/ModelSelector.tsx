import { useState, useEffect } from 'react';
import { getModels } from '../utils/api';
import ModelConfig from './ModelConfig';
import './ModelSelector.css';

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
 * 显示可用模型列表，支持多选和主席模型标识
 */
function ModelSelector({ selectedModels, onModelsChange, onRefreshModels }: ModelSelectorProps) {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // 加载模型列表
  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      setLoading(true);
      setError(null);
      const modelList = await getModels();
      setModels(modelList);
      
      // 如果没有选中的模型，默认选中主席模型
      if (selectedModels.length === 0 && modelList.length > 0) {
        const chairModel = modelList.find(m => m.is_chair);
        if (chairModel) {
          onModelsChange([chairModel.name]);
        }
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

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedModels.length === models.length) {
      // 如果已全选，则取消全选(但至少保留第一个模型)
      if (models.length > 0) {
        onModelsChange([models[0].name]);
      }
    } else {
      // 全选
      onModelsChange(models.map(m => m.name));
    }
  };

  // 处理配置保存后的回调
  const handleConfigSave = async () => {
    // 重新加载App.tsx中的模型列表
    await onRefreshModels();
    // 重新加载ModelSelector中的模型列表
    await loadModels();
  };

  return (
    <>
      {showConfig && (
        <div className="model-config-overlay" onClick={() => setShowConfig(false)}>
          <div className="model-config-popup" onClick={(e) => e.stopPropagation()}>
            <ModelConfig
              onClose={() => setShowConfig(false)}
              onSave={handleConfigSave}
            />
          </div>
        </div>
      )}
      
      <div className="model-selector">
        <div className="model-selector-header">
          <h3>选择模型</h3>
          <div className="header-actions">
            <button
              className="config-btn"
              onClick={() => setShowConfig(true)}
              title="模型配置"
            >
              ⚙️ 配置
            </button>
            {!loading && models.length > 0 && (
              <button
                className="select-all-btn"
                onClick={handleSelectAll}
                title={selectedModels.length === models.length ? '取消全选' : '全选'}
              >
                {selectedModels.length === models.length ? '取消全选' : '全选'}
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
          {models.length === 0 ? (
            <div className="empty-state">
              <p>暂无可用模型</p>
            </div>
          ) : (
            models.map(model => (
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
                    {model.is_chair && (
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
              </div>
            ))
          )}
        </div>
      )}

        <div className="model-selector-footer">
          <span className="selected-count">
            已选择 {selectedModels.length} / {models.length} 个模型
          </span>
        </div>
      </div>
    </>
  );
}

export default ModelSelector;