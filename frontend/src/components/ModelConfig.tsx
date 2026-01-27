import { useState, useEffect } from 'react';
import { getModelsConfig, updateModelsConfig } from '../utils/api';
import './ModelConfig.css';

/**
 * 模型配置接口
 */
interface ModelConfig {
  name: string;
  url: string;
  api_key: string;
  api_model_name?: string;
  display_name: string;
  description: string;
}

/**
 * ModelConfig 组件属性
 */
interface ModelConfigProps {
  onClose: () => void;
  onSave: () => Promise<void>;
}

/**
 * ModelConfig 组件
 * 用于配置模型的API密钥、URL等信息
 */
function ModelConfig({ onClose, onSave }: ModelConfigProps) {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [chairman, setChairman] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newModel, setNewModel] = useState<ModelConfig>({
    name: '',
    url: '',
    api_key: '',
    api_model_name: '',
    display_name: '',
    description: ''
  });

  // 加载模型配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const config = await getModelsConfig();
      setModels(config.models || []);
      setChairman(config.chairman || '');
    } catch (err: any) {
      setError('加载配置失败: ' + err.message);
      console.error('加载配置失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 保存配置
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      // 验证至少有一个模型
      if (models.length === 0) {
        setError('至少需要配置一个模型');
        return;
      }
      
      // 验证主席模型存在
      if (!chairman || !models.find(m => m.name === chairman)) {
        setError('请选择一个有效的主席模型');
        return;
      }
      
      await updateModelsConfig(models, chairman);
      // 等待onSave完成后再关闭窗口
      await onSave();
      onClose();
    } catch (err: any) {
      setError('保存配置失败: ' + err.message);
      console.error('保存配置失败:', err);
    } finally {
      setSaving(false);
    }
  };

  // 添加新模型
  const handleAddModel = () => {
    // 验证必填字段
    if (!newModel.name || !newModel.url || !newModel.api_key || !newModel.display_name) {
      setError('请填写所有必填字段');
      return;
    }
    
    // 检查模型名称是否重复
    if (models.find(m => m.name === newModel.name)) {
      setError('模型名称已存在');
      return;
    }
    
    setModels([...models, { ...newModel }]);
    setNewModel({
      name: '',
      url: '',
      api_key: '',
      api_model_name: '',
      display_name: '',
      description: ''
    });
    setError(null);
    setShowAddForm(false);
  };

  // 取消添加
  const handleCancelAdd = () => {
    setNewModel({
      name: '',
      url: '',
      api_key: '',
      api_model_name: '',
      display_name: '',
      description: ''
    });
    setError(null);
    setShowAddForm(false);
  };

  // 删除模型
  const handleDeleteModel = (index: number) => {
    const modelToDelete = models[index];
    const newModels = models.filter((_, i) => i !== index);
    setModels(newModels);
    
    // 如果删除的是主席模型,清空主席选择
    if (modelToDelete.name === chairman) {
      setChairman('');
    }
  };

  // 开始编辑模型
  const handleEditModel = (index: number) => {
    setEditingIndex(index);
  };

  // 保存编辑
  const handleSaveEdit = (index: number, updatedModel: ModelConfig) => {
    const newModels = [...models];
    const oldName = newModels[index].name;
    newModels[index] = updatedModel;
    setModels(newModels);
    setEditingIndex(null);
    
    // 如果修改的是主席模型的名称,更新主席选择
    if (oldName === chairman && updatedModel.name !== oldName) {
      setChairman(updatedModel.name);
    }
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  return (
    <>
      {/* 添加模型弹窗 */}
      {showAddForm && (
        <div className="add-model-overlay" onClick={handleCancelAdd}>
          <div className="add-model-popup" onClick={(e) => e.stopPropagation()}>
            <div className="add-model-header">
              <h3>添加新模型</h3>
              <button className="close-btn" onClick={handleCancelAdd} title="关闭">
                ×
              </button>
            </div>
            <div className="add-model-body">
              <div className="model-form">
                <div className="form-row">
                  <label>
                    模型名称 <span className="required">*</span>
                    <input
                      type="text"
                      value={newModel.name}
                      onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                      placeholder="例如: gpt-4"
                    />
                  </label>
                  <label>
                    显示名称 <span className="required">*</span>
                    <input
                      type="text"
                      value={newModel.display_name}
                      onChange={(e) => setNewModel({ ...newModel, display_name: e.target.value })}
                      placeholder="例如: GPT-4"
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    API URL <span className="required">*</span>
                    <input
                      type="text"
                      value={newModel.url}
                      onChange={(e) => setNewModel({ ...newModel, url: e.target.value })}
                      placeholder="例如: https://api.openai.com/v1/chat/completions"
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    API Key <span className="required">*</span>
                    <input
                      type="password"
                      value={newModel.api_key}
                      onChange={(e) => setNewModel({ ...newModel, api_key: e.target.value })}
                      placeholder="输入API密钥"
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    API模型名称 (可选)
                    <input
                      type="text"
                      value={newModel.api_model_name || ''}
                      onChange={(e) => setNewModel({ ...newModel, api_model_name: e.target.value })}
                      placeholder="如果与模型名称不同,请填写"
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    描述
                    <input
                      type="text"
                      value={newModel.description}
                      onChange={(e) => setNewModel({ ...newModel, description: e.target.value })}
                      placeholder="模型描述"
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="add-model-footer">
              <button className="cancel-btn" onClick={handleCancelAdd}>
                取消
              </button>
              <button className="add-btn" onClick={handleAddModel}>
                ➕ 添加模型
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="model-config">
        <div className="model-config-header">
          <h2>模型配置</h2>
          <button className="close-btn" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        {error && (
          <div className="config-error">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {loading ? (
          <div className="config-loading">
            <div className="loading"></div>
            <span>加载配置中...</span>
          </div>
        ) : (
          <>
            {/* 现有模型列表 */}
            <div className="models-section">
              <div className="models-section-header">
                <h3>已配置的模型</h3>
                <button className="add-model-btn" onClick={() => setShowAddForm(true)}>
                  ➕ 添加模型
                </button>
              </div>
              <div className="models-list">
                {models.length === 0 ? (
                  <div className="empty-state">暂无配置的模型</div>
                ) : (
                  models.map((model, index) => (
                    <ModelConfigItem
                      key={index}
                      model={model}
                      isEditing={editingIndex === index}
                      isChairman={model.name === chairman}
                      onEdit={() => handleEditModel(index)}
                      onSave={(updatedModel) => handleSaveEdit(index, updatedModel)}
                      onCancel={handleCancelEdit}
                      onDelete={() => handleDeleteModel(index)}
                      onSetChairman={() => setChairman(model.name)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* 主席模型选择 */}
            <div className="chairman-section">
              <h3>主席模型</h3>
              <select
                value={chairman}
                onChange={(e) => setChairman(e.target.value)}
                className="chairman-select"
              >
                <option value="">请选择主席模型</option>
                {models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.display_name}
                  </option>
                ))}
              </select>
            </div>

            {/* 保存按钮 */}
            <div className="config-footer">
              <button className="cancel-btn" onClick={onClose} disabled={saving}>
                取消
              </button>
              <button className="save-btn" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/**
 * 模型配置项组件
 */
interface ModelConfigItemProps {
  model: ModelConfig;
  isEditing: boolean;
  isChairman: boolean;
  onEdit: () => void;
  onSave: (model: ModelConfig) => void;
  onCancel: () => void;
  onDelete: () => void;
  onSetChairman: () => void;
}

function ModelConfigItem({
  model,
  isEditing,
  isChairman,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onSetChairman
}: ModelConfigItemProps) {
  const [editedModel, setEditedModel] = useState<ModelConfig>(model);

  useEffect(() => {
    setEditedModel(model);
  }, [model, isEditing]);

  if (isEditing) {
    return (
      <div className="model-config-item editing">
        <div className="model-form">
          <div className="form-row">
            <label>
              模型名称 <span className="required">*</span>
              <input
                type="text"
                value={editedModel.name}
                onChange={(e) => setEditedModel({ ...editedModel, name: e.target.value })}
              />
            </label>
            <label>
              显示名称 <span className="required">*</span>
              <input
                type="text"
                value={editedModel.display_name}
                onChange={(e) => setEditedModel({ ...editedModel, display_name: e.target.value })}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              API URL <span className="required">*</span>
              <input
                type="text"
                value={editedModel.url}
                onChange={(e) => setEditedModel({ ...editedModel, url: e.target.value })}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              API Key <span className="required">*</span>
              <input
                type="password"
                value={editedModel.api_key}
                onChange={(e) => setEditedModel({ ...editedModel, api_key: e.target.value })}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              API模型名称 (可选)
              <input
                type="text"
                value={editedModel.api_model_name || ''}
                onChange={(e) => setEditedModel({ ...editedModel, api_model_name: e.target.value })}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              描述
              <input
                type="text"
                value={editedModel.description}
                onChange={(e) => setEditedModel({ ...editedModel, description: e.target.value })}
              />
            </label>
          </div>
          <div className="edit-actions">
            <button className="cancel-btn" onClick={onCancel}>
              取消
            </button>
            <button className="save-btn" onClick={() => onSave(editedModel)}>
              保存
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="model-config-item">
      <div className="model-info">
        <div className="model-header">
          <h4>
            {model.display_name}
            {isChairman && <span className="chairman-badge" title="主席模型">👑</span>}
          </h4>
          <div className="model-actions">
            {!isChairman && (
              <button
                className="set-chairman-btn"
                onClick={onSetChairman}
                title="设为主席模型"
              >
                👑
              </button>
            )}
            <button className="edit-btn" onClick={onEdit} title="编辑">
              ✏️
            </button>
            <button className="delete-btn" onClick={onDelete} title="删除">
              🗑️
            </button>
          </div>
        </div>
        <div className="model-details">
          <div className="detail-item">
            <span className="label">模型名称:</span>
            <span className="value">{model.name}</span>
          </div>
          <div className="detail-item">
            <span className="label">API URL:</span>
            <span className="value">{model.url}</span>
          </div>
          <div className="detail-item">
            <span className="label">API Key:</span>
            <span className="value">{'*'.repeat(20)}</span>
          </div>
          {model.api_model_name && (
            <div className="detail-item">
              <span className="label">API模型名称:</span>
              <span className="value">{model.api_model_name}</span>
            </div>
          )}
          {model.description && (
            <div className="detail-item">
              <span className="label">描述:</span>
              <span className="value">{model.description}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ModelConfig;