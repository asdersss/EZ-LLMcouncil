import { useState, useEffect, useRef } from 'react';
import { uploadAttachment } from '../utils/api';
import './FileManager.css';

/**
 * 文件管理器组件属性
 */
interface FileManagerProps {
  onClose: () => void;
  onSelectFile?: (file: FileInfo) => void;
}

/**
 * 文件信息类型
 */
interface FileInfo {
  md5: string;
  filename: string;
  stored_path: string;
  content: string;
  size: number;
  reference_count: number;
  created_at: string;
  last_accessed: string;
}

/**
 * 文件管理器组件
 * 管理已上传的文件,支持上传、下载、删除操作
 */
function FileManager({ onClose, onSelectFile }: FileManagerProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [useMinerU, setUseMinerU] = useState<boolean>(false);
  const [acceptedFileTypes, setAcceptedFileTypes] = useState<string>('.txt,.md');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载MinerU配置
  useEffect(() => {
    loadMinerUConfig();
  }, []);

  // 加载文件列表
  useEffect(() => {
    loadFiles();
  }, []);

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

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/files');
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      } else {
        throw new Error('加载文件列表失败');
      }
    } catch (err: any) {
      setError('加载文件列表失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    if (selectedFiles.length > 0) {
      // 检查文件类型
      const allowedExtensions = acceptedFileTypes.split(',');
      const invalidFiles = selectedFiles.filter(file => {
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

      handleFileUpload(selectedFiles);
    }
  };

  const handleFileUpload = async (selectedFiles: File[]) => {
    setUploading(true);
    setError(null);

    try {
      const uploadPromises = selectedFiles.map((file: File) => uploadAttachment(file));
      await Promise.all(uploadPromises);
      
      // 重新加载文件列表
      await loadFiles();
    } catch (err: any) {
      setError('文件上传失败: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownload = async (file: FileInfo) => {
    try {
      const response = await fetch(`/api/files/${file.md5}/download`);
      if (!response.ok) {
        throw new Error('下载失败');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError('下载文件失败: ' + err.message);
    }
  };

  const handleDelete = async (file: FileInfo) => {
    if (!confirm(`确定要删除文件 "${file.filename}" 吗?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/files/${file.md5}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('删除失败');
      }
      
      // 重新加载文件列表
      await loadFiles();
    } catch (err: any) {
      setError('删除文件失败: ' + err.message);
    }
  };

  const handleSelect = (file: FileInfo) => {
    if (onSelectFile) {
      onSelectFile(file);
    }
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="file-manager-overlay" onClick={onClose}>
      <div className="file-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="file-manager-header">
          <h2>📁 文件管理</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="file-error">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className="file-manager-toolbar">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            accept={acceptedFileTypes}
          />
          <button
            className="upload-btn"
            onClick={handleUploadClick}
            disabled={uploading}
          >
            {uploading ? '⏳ 上传中...' : '📤 上传文件'}
          </button>
          <span className="file-count">
            共 {files.length} 个文件
          </span>
          <span className="upload-hint">
            {useMinerU ? '支持多种文档格式' : '仅支持txt和markdown文件'}
          </span>
        </div>

        <div className="file-manager-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>加载中...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              <p>📂 暂无文件</p>
              <p className="empty-hint">点击上传按钮添加文件</p>
            </div>
          ) : (
            <div className="files-list">
              {files.map((file) => (
                <div key={file.md5} className="file-item">
                  <div className="file-icon">📄</div>
                  <div className="file-info">
                    <div className="file-name">{file.filename}</div>
                    <div className="file-meta">
                      <span className="file-size">{formatSize(file.size)}</span>
                      <span className="file-separator">•</span>
                      <span className="file-date">上传于 {formatDate(file.created_at)}</span>
                      {file.reference_count > 1 && (
                        <>
                          <span className="file-separator">•</span>
                          <span className="file-refs">引用 {file.reference_count} 次</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="file-actions">
                    {onSelectFile && (
                      <button
                        className="action-btn select-btn"
                        onClick={() => handleSelect(file)}
                        title="选择文件"
                      >
                        ✓ 选择
                      </button>
                    )}
                    <button
                      className="action-btn download-btn"
                      onClick={() => handleDownload(file)}
                      title="下载文件"
                    >
                      ⬇️ 下载
                    </button>
                    <button
                      className="file-delete-btn"
                      onClick={() => handleDelete(file)}
                      title="删除文件"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="file-manager-footer">
          <button className="close-footer-btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export default FileManager;