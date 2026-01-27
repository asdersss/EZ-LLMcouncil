import { useState, useEffect, useRef } from 'react';
import { uploadAttachment } from '../utils/api';
import FileManager from './FileManager';
import './ContextManager.css';

/**
 * 上下文管理器组件属性
 */
interface ContextManagerProps {
  convId: string | null;
  onClose: () => void;
}

/**
 * 附件类型
 */
interface Attachment {
  filename?: string;
  name?: string;
  content: string;
  size?: number;
  [key: string]: any;
}

/**
 * 上下文配置类型
 */
interface ContextConfig {
  maxTurns: number;
  contextAttachments: Attachment[];
}

/**
 * 上下文管理器组件
 * 允许用户配置上下文轮数和管理上下文附件
 */
function ContextManager({ convId, onClose }: ContextManagerProps) {
  const [maxTurns, setMaxTurns] = useState<number>(3);
  const [contextAttachments, setContextAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [useMinerU, setUseMinerU] = useState<boolean>(false);
  const [acceptedFileTypes, setAcceptedFileTypes] = useState<string>('.txt,.md');
  const [showFileManager, setShowFileManager] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载MinerU配置
  useEffect(() => {
    loadMinerUConfig();
  }, []);

  // 加载当前对话的上下文配置
  useEffect(() => {
    if (convId) {
      loadContextConfig();
    }
  }, [convId]);

  const loadMinerUConfig = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const settings = await response.json();
        const mineruEnabled = settings.use_mineru || false;
        setUseMinerU(mineruEnabled);
        
        if (mineruEnabled) {
          setAcceptedFileTypes('.txt,.md,.doc,.docx,.xlsx,.xls,.pdf,.ppt,.pptx,.png,.jpg,.jpeg,.html');
        } else {
          setAcceptedFileTypes('.txt,.md');
        }
      }
    } catch (err) {
      console.error('加载MinerU配置失败:', err);
    }
  };

  const loadContextConfig = async () => {
    if (!convId) return;
    
    try {
      const response = await fetch(`/api/conversations/${convId}/context`);
      if (response.ok) {
        const config = await response.json();
        setMaxTurns(config.max_turns || 3);
        // context_attachments现在包含历史对话中的所有附件
        // 用户可以选择保留或删除哪些附件作为上下文
        setContextAttachments(config.context_attachments || []);
      }
    } catch (err) {
      console.error('加载上下文配置失败:', err);
    }
  };

  const handleMaxTurnsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      setMaxTurns(value);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      // 检查文件类型
      const allowedExtensions = acceptedFileTypes.split(',');
      const invalidFiles = files.filter(file => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        return !allowedExtensions.includes(ext);
      });

      if (invalidFiles.length > 0) {
        const invalidNames = invalidFiles.map(f => f.name).join(', ');
        if (!useMinerU) {
          setError(`未启用MinerU,仅支持txt和markdown文件。不支持的文件: ${invalidNames}`);
        } else {
          setError(`不支持的文件格式: ${invalidNames}`);
        }
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      handleFileUpload(files);
    }
  };

  const handleFileUpload = async (files: File[]) => {
    setUploading(true);
    setError(null);

    try {
      const uploadPromises = files.map((file: File) => uploadAttachment(file));
      const results = await Promise.all(uploadPromises);
      
      setContextAttachments([...contextAttachments, ...results]);
    } catch (err: any) {
      setError('文件上传失败: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setContextAttachments(contextAttachments.filter((_, i) => i !== index));
  };

  const handleAttachClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleSelectFromManager = (file: any) => {
    // 将文件添加到上下文附件列表
    setContextAttachments([...contextAttachments, {
      filename: file.filename,
      name: file.filename,
      content: file.content,
      size: file.size,
      md5: file.md5
    }]);
    // 关闭文件管理器
    setShowFileManager(false);
  };

  const handleSave = async () => {
    if (!convId) {
      setError('请先选择一个对话');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${convId}/context`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          max_turns: maxTurns,
          context_attachments: contextAttachments
        })
      });

      if (!response.ok) {
        throw new Error('保存失败');
      }

      // 保存成功,关闭窗口
      onClose();
    } catch (err: any) {
      setError('保存上下文配置失败: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="context-manager-overlay" onClick={onClose}>
      <div className="context-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="context-manager-header">
          <h2>📚 上下文管理</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="context-error">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className="context-manager-content">
          {/* 上下文轮数设置 */}
          <div className="context-section">
            <h3>上下文轮数</h3>
            <p className="section-description">
              设置携带的历史对话轮数 (0-100轮，0表示不携带上下文)
            </p>
            <div className="turns-control">
              <input
                type="range"
                min="0"
                max="100"
                value={maxTurns}
                onChange={handleMaxTurnsChange}
                className="turns-slider"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={maxTurns}
                onChange={handleMaxTurnsChange}
                className="turns-input"
              />
              <span className="turns-label">轮</span>
            </div>
            <div className="turns-info">
              {maxTurns === 0 ? (
                <span className="info-warning">⚠️ 不携带历史对话上下文</span>
              ) : (
                <span className="info-normal">✓ 携带最近 {maxTurns} 轮对话</span>
              )}
            </div>
          </div>

          {/* 上下文附件管理 */}
          <div className="context-section">
            <h3>上下文附件</h3>
            <p className="section-description">
              管理历史对话中的附件,选择在下次对话时要携带哪些附件作为上下文
            </p>
            
            {contextAttachments.length > 0 && (
              <div className="context-attachments-list">
                {contextAttachments.map((att, index) => (
                  <div key={index} className="context-attachment-item">
                    <span className="attachment-icon">📎</span>
                    <span className="attachment-name">{att.filename || att.name}</span>
                    <span className="attachment-size">
                      {att.size ? `(${(att.size / 1024).toFixed(1)} KB)` : ''}
                    </span>
                    <button
                      className="attachment-remove-btn"
                      onClick={() => handleRemoveAttachment(index)}
                      title="移除附件"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="attachment-actions">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                accept={acceptedFileTypes}
              />
              <button
                className="file-manager-btn"
                onClick={() => setShowFileManager(true)}
                disabled={uploading}
              >
                📁 从文件库选择
              </button>
              <button
                className="upload-btn"
                onClick={handleAttachClick}
                disabled={uploading}
              >
                {uploading ? '⏳ 上传中...' : '📤 上传新文件'}
              </button>
              <span className="upload-hint">
                {useMinerU ? '支持多种文档格式' : '仅支持txt和markdown文件'}
              </span>
            </div>
          </div>
        </div>

        <div className="context-manager-footer">
          <button className="cancel-btn" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="save-btn" onClick={handleSave} disabled={saving || !convId}>
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      {showFileManager && (
        <FileManager
          onClose={() => setShowFileManager(false)}
          onSelectFile={handleSelectFromManager}
        />
      )}
    </div>
  );
}

export default ContextManager;