import { useState, useRef, useEffect } from 'react';
import { uploadAttachment } from '../utils/api';
import FileManager from './FileManager';
import './InputArea.css';

/**
 * InputArea 组件属性
 */
interface InputAreaProps {
  onSendMessage: (message: string, attachments: any[]) => void;
  disabled: boolean;
}

/**
 * 附件类型
 */
interface Attachment {
  filename?: string;
  name?: string;
  [key: string]: any;
}

/**
 * InputArea 组件
 * 提供消息输入、附件上传和发送功能
 */
function InputArea({ onSendMessage, disabled }: InputAreaProps) {
  const [message, setMessage] = useState<string>('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [useMinerU, setUseMinerU] = useState<boolean>(false);
  const [acceptedFileTypes, setAcceptedFileTypes] = useState<string>('.txt,.md');
  const [showFileManager, setShowFileManager] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 加载MinerU配置
  useEffect(() => {
    loadMinerUConfig();
  }, []);

  const loadMinerUConfig = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const settings = await response.json();
        const mineruEnabled = settings.use_mineru || false;
        setUseMinerU(mineruEnabled);
        
        // 根据MinerU状态设置允许的文件类型
        if (mineruEnabled) {
          setAcceptedFileTypes('.txt,.md,.doc,.docx,.xlsx,.xls,.pdf,.ppt,.pptx,.png,.jpg,.jpeg,.html');
          console.log('MinerU已启用,支持多种文档格式');
        } else {
          setAcceptedFileTypes('.txt,.md');
          console.log('MinerU未启用,仅支持txt和markdown文件');
        }
      }
    } catch (err) {
      console.error('加载MinerU配置失败:', err);
    }
  };

  // 处理消息输入
  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // 自动调整文本框高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送消息, Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Shift+Enter 允许换行(默认行为,不需要额外处理)
  };

  // 处理文件选择
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
        // 清空文件输入
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      handleFileUpload(files);
    }
  };

  // 上传文件
  const handleFileUpload = async (files: File[]) => {
    setUploading(true);
    setError(null);

    console.log('=== 开始上传文件 ===');
    console.log('文件数量:', files.length);
    files.forEach((file, index) => {
      console.log(`文件 ${index + 1}:`, {
        name: file.name,
        size: file.size,
        type: file.type
      });
    });

    try {
      const uploadPromises = files.map((file: File) => uploadAttachment(file));
      const results = await Promise.all(uploadPromises);
      
      console.log('=== 文件上传成功 ===');
      console.log('上传结果:', results);
      results.forEach((result, index) => {
        console.log(`文件 ${index + 1} 解析结果:`, {
          filename: result.filename,
          size: result.size,
          content_length: result.content_length,
          extraction_error: result.extraction_error,
          content_preview: result.content ? result.content.substring(0, 200) + '...' : '无内容'
        });
      });
      
      setAttachments([...attachments, ...results]);
    } catch (err: any) {
      setError('文件上传失败: ' + err.message);
      console.error('=== 文件上传失败 ===');
      console.error('错误信息:', err);
    } finally {
      setUploading(false);
      // 清空文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 删除附件
  const handleRemoveAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  // 发送消息
  const handleSend = () => {
    // 验证输入
    if (!message.trim() && attachments.length === 0) {
      setError('请输入消息或上传附件');
      return;
    }

    if (disabled) {
      return;
    }

    // 调用父组件的发送函数
    onSendMessage(message.trim(), attachments);

    // 清空输入
    setMessage('');
    setAttachments([]);
    setError(null);

    // 使用 setTimeout 延迟重置文本框高度，避免页面跳动
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, 0);
  };

  // 触发文件选择
  const handleAttachClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // 从文件管理器选择文件
  const handleSelectFromManager = (file: any) => {
    // 将文件添加到附件列表
    setAttachments([...attachments, {
      filename: file.filename,
      name: file.filename,
      content: file.content,
      size: file.size,
      md5: file.md5
    }]);
    // 关闭文件管理器
    setShowFileManager(false);
  };

  return (
    <div className="input-area">
      {error && (
        <div className="input-error">
          {error}
          <button 
            className="error-close"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="attachments-list">
          {attachments.map((att, index) => (
            <div key={index} className="attachment-item">
              <span className="attachment-name">{att.filename || att.name}</span>
              <button
                className="attachment-remove"
                onClick={() => handleRemoveAttachment(index)}
                title="删除附件"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="input-container">
        <textarea
          ref={textareaRef}
          className="message-input"
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || uploading}
          rows={1}
        />

        <div className="input-actions">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            accept={acceptedFileTypes}
            title={useMinerU ? '支持多种文档格式' : '仅支持txt和markdown文件,如需上传其他格式请在设置中启用MinerU'}
          />
          
          <button
            className="file-manager-btn"
            onClick={() => setShowFileManager(true)}
            disabled={disabled || uploading}
            title="文件管理"
          >
            📁
          </button>

          <button
            className="attach-btn"
            onClick={handleAttachClick}
            disabled={disabled || uploading}
            title="上传附件"
          >
            {uploading ? (
              <div className="loading"></div>
            ) : (
              '📎'
            )}
          </button>

          <button
            className="send-btn primary"
            onClick={handleSend}
            disabled={disabled || uploading || (!message.trim() && attachments.length === 0)}
            title={attachments.length > 0 ? "发送消息和附件 (Enter)" : "发送消息 (Enter)"}
          >
            发送
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

export default InputArea;