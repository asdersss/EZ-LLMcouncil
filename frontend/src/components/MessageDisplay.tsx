import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import CodeBlock from './CodeBlock';
import './MessageDisplay.css';

// KaTeX 配置选项
const katexOptions = {
  strict: false,
  throwOnError: false,
  trust: true
};

/**
 * 消息接口定义
 */
interface Attachment {
  name: string;
  content: string;
  type?: string;
}

interface Stage1Result {
  model: string;
  response: string;
  timestamp: string;
  error?: string;
}

interface Stage2Result {
  model: string;
  scores: { [key: string]: number };
  raw_text: string;
  label_to_model?: { [key: string]: string };
  timestamp: string;
  error?: string;
  participated?: boolean;
  skip_reason?: string;
}

interface Stage3Result {
  response: string;
  timestamp: string;
  error?: string;
}

interface Stage4Result {
  rankings: Array<{
    rank: number;
    label: string;
    model: string;
    avg_score: number;
    score_count: number;  // 收到的有效评分数量
    response: string;
    scorer_valid: boolean;  // 该模型作为评分者是否有效
    scorer_reason?: string;  // 如果无效，原因是什么
  }>;
  best_answer: string;
  scoring_summary?: Record<string, {
    valid: boolean;
    reason?: string;
    expected: number;
    actual: number;
  }>;
  valid_scorer_count?: number;  // 有效评分者数量
  timestamp: string;
  error?: string;
}

interface Message {
  role: 'user' | 'assistant';
  timestamp: string;
  
  // 用户消息字段
  content?: string;
  models?: string[];
  attachments?: Attachment[];
  
  // 助手消息字段
  stage1?: Stage1Result[];
  stage2?: Stage2Result[];
  stage3?: Stage3Result;
  stage4?: Stage4Result;
  
  // 执行进度状态
  modelStatuses?: Record<string, {
    status: string;
    error?: string;
    current_retry?: number;
    max_retries?: number;
  }>;
  
  // 流式状态
  streaming?: boolean;
}

interface MessageDisplayProps {
  messages: Message[];
  onEditMessage?: (index: number, newContent: string, newAttachments?: Attachment[]) => void;
  onDeleteMessage?: (index: number) => void;
}

/**
 * 用户消息组件
 */
function UserMessage({
  message,
  messageIndex,
  onEdit,
  onDelete
}: {
  message: Message;
  messageIndex: number;
  onEdit?: (index: number, newContent: string, newAttachments?: Attachment[]) => void;
  onDelete?: (index: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || '');
  const [editAttachments, setEditAttachments] = useState<Attachment[]>(message.attachments || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveEdit = () => {
    // 验证:内容和附件至少要有一个
    if (!editContent.trim() && editAttachments.length === 0) {
      setUploadError('消息内容和附件不能同时为空');
      return;
    }
    
    if (onEdit) {
      onEdit(messageIndex, editContent, editAttachments);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditContent(message.content || '');
    setEditAttachments(message.attachments || []);
    setUploadError(null);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (onDelete && confirm('确定要删除这条消息吗？删除后将同时删除对应的AI回复以及后续所有对话。')) {
      onDelete(messageIndex);
    }
  };

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      // 动态导入uploadAttachment函数
      const { uploadAttachment } = await import('../utils/api');
      const uploadPromises = files.map((file: File) => uploadAttachment(file));
      const results = await Promise.all(uploadPromises);
      
      setEditAttachments([...editAttachments, ...results]);
    } catch (err: any) {
      setUploadError('文件上传失败: ' + err.message);
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
    setEditAttachments(editAttachments.filter((_, i) => i !== index));
  };

  // 触发文件选择
  const handleAttachClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="message user-message">
      <div className="message-header">
        <span className="message-role">👤 用户</span>
        <div className="message-actions">
          {!isEditing && onEdit && (
            <button
              className="message-action-btn edit-btn"
              onClick={() => setIsEditing(true)}
              title="编辑消息"
            >
              ✏️
            </button>
          )}
          {!isEditing && onDelete && (
            <button
              className="message-action-btn delete-btn"
              onClick={handleDelete}
              title="删除消息"
            >
              🗑️
            </button>
          )}
          <span className="message-time">
            {new Date(message.timestamp).toLocaleTimeString('zh-CN')}
          </span>
        </div>
      </div>
      {isEditing ? (
        <div className="message-edit-area">
          {uploadError && (
            <div className="input-error" style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: '4px' }}>
              {uploadError}
              <button
                className="error-close"
                onClick={() => setUploadError(null)}
                style={{ marginLeft: '10px', cursor: 'pointer', background: 'none', border: 'none', fontSize: '18px' }}
              >
                ×
              </button>
            </div>
          )}
          
          {editAttachments.length > 0 && (
            <div className="attachments-list" style={{ marginBottom: '10px' }}>
              {editAttachments.map((att, index) => (
                <div key={index} className="attachment-item" style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 10px', margin: '5px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
                  <span className="attachment-name" style={{ marginRight: '8px', color: '#000' }}>📎 {att.name}</span>
                  <button
                    className="attachment-remove"
                    onClick={() => handleRemoveAttachment(index)}
                    title="删除附件"
                    style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '16px', color: '#999' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <textarea
            className="message-edit-input"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={5}
            autoFocus
            placeholder="输入消息内容..."
          />
          
          <div className="message-edit-actions">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              accept=".txt,.md,.doc,.docx,.xlsx,.xls,.pdf,.ppt,.pptx,.png,.jpg,.jpeg,.html"
            />
            <button
              className="attach-btn"
              onClick={handleAttachClick}
              disabled={uploading}
              title="上传附件"
              style={{ marginRight: '10px', padding: '8px 12px', cursor: uploading ? 'not-allowed' : 'pointer' }}
            >
              {uploading ? '⏳' : '📎'}
            </button>
            <button className="save-edit-btn" onClick={handleSaveEdit} disabled={uploading}>
              ✓ 保存并重新生成
            </button>
            <button className="cancel-edit-btn" onClick={handleCancelEdit} disabled={uploading}>
              ✕ 取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="message-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[[rehypeKatex, katexOptions]]}
              components={{
                code: CodeBlock,
                p: ({ children, ...props }) => {
                  // 递归检查是否包含代码块
                  const hasCodeBlock = (node: any): boolean => {
                    if (!node) return false;
                    if (node?.type?.name === 'CodeBlock') return true;
                    if (node?.props?.className && typeof node.props.className === 'string' &&
                        node.props.className.includes('code-block')) return true;
                    if (Array.isArray(node)) return node.some(hasCodeBlock);
                    if (node?.props?.children) return hasCodeBlock(node.props.children);
                    return false;
                  };
                  return hasCodeBlock(children) ? <>{children}</> : <p {...props}>{children}</p>;
                }
              }}
            >
              {message.content || ''}
            </ReactMarkdown>
          </div>
          {message.attachments && message.attachments.length > 0 && (
            <div className="message-attachments">
              {message.attachments.map((att, idx) => (
                <div key={idx} className="attachment">
                  📎 {att.name}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Stage 1 结果展示组件
 */
function Stage1Display({ results }: { results: Stage1Result[] }) {
  const [selectedModel, setSelectedModel] = useState<string>(results[0]?.model || '');
  
  // 当results变化时,更新选中的模型
  useState(() => {
    if (results.length > 0 && !selectedModel) {
      setSelectedModel(results[0].model);
    }
  });
  
  const selectedResult = results.find(r => r.model === selectedModel) || results[0];
  
  return (
    <div className="stage-content">
      {/* 模型选择器 */}
      <div className="model-selector-bar">
        {results.map((result) => (
          <button
            key={result.model}
            className={`model-tab ${selectedModel === result.model ? 'active' : ''} ${result.error ? 'error' : 'success'}`}
            onClick={() => setSelectedModel(result.model)}
            title={result.error ? `错误: ${result.error}` : '执行成功'}
          >
            <span className="model-tab-name">{result.model}</span>
            {result.error ? (
              <span className="status-icon error-icon" title={result.error}>⚠️</span>
            ) : (
              <span className="status-icon success-icon">✓</span>
            )}
          </button>
        ))}
      </div>
      
      {/* 选中模型的响应内容 */}
      <div className="stage-results">
        <div className="model-response">
          <div className="model-header">
            <span className="model-name">🤖 {selectedResult.model}</span>
            <span className="model-time">
              {new Date(selectedResult.timestamp).toLocaleTimeString('zh-CN')}
            </span>
          </div>
          {selectedResult.error ? (
            <div className="model-error">
              <div className="error-title">❌ 执行失败</div>
              <div className="error-details">{selectedResult.error}</div>
            </div>
          ) : (
            <div className="model-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[[rehypeKatex, katexOptions]]}
                components={{
                  code: CodeBlock,
                  p: ({ children, ...props }) => {
                    const hasCodeBlock = (node: any): boolean => {
                      if (!node) return false;
                      if (node?.type?.name === 'CodeBlock') return true;
                      if (node?.props?.className && typeof node.props.className === 'string' &&
                          node.props.className.includes('code-block')) return true;
                      if (Array.isArray(node)) return node.some(hasCodeBlock);
                      if (node?.props?.children) return hasCodeBlock(node.props.children);
                      return false;
                    };
                    return hasCodeBlock(children) ? <>{children}</> : <p {...props}>{children}</p>;
                  }
                }}
              >
                {selectedResult.response}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Stage 2 结果展示组件 - 显示打分和评论
 */
function Stage2Display({ results }: { results: Stage2Result[] }) {
  const [selectedModel, setSelectedModel] = useState<string>(results[0]?.model || '');
  const [viewMode, setViewMode] = useState<'given' | 'received'>('given'); // 'given' = 当前AI给出的评价, 'received' = 其他AI给当前AI的评价
  
  // 当results变化时,更新选中的模型
  useState(() => {
    if (results.length > 0 && !selectedModel) {
      setSelectedModel(results[0].model);
    }
  });
  
  const selectedResult = results.find(r => r.model === selectedModel) || results[0];
  
  // 获取标签到模型的映射 - 使用第一个有效结果的映射（所有结果应该共享同一个映射）
  const labelToModel = (() => {
    for (const result of results) {
      if (result.label_to_model && Object.keys(result.label_to_model).length > 0) {
        console.log('找到 label_to_model 映射:', result.label_to_model);
        return result.label_to_model;
      }
    }
    console.warn('未找到任何 label_to_model 映射');
    return {};
  })();
  
  // 从评论文本中提取针对特定标签的评论
  const extractCommentForLabel = (rawText: string, targetLabel: string): string => {
    if (!rawText || !targetLabel) return '';
    
    // 尝试多种模式提取针对特定标签的评论
    // 模式 1: "#1: 8分 - 评论内容"
    const pattern1 = new RegExp(`${targetLabel}\\s*[:：]\\s*\\d+(?:\\.\\d+)?\\s*分?\\s*[-–—]?\\s*([^#\\n]+)`, 'i');
    const match1 = rawText.match(pattern1);
    if (match1 && match1[1]) {
      return match1[1].trim();
    }
    
    // 模式 2: "#1 (8分): 评论内容"
    const pattern2 = new RegExp(`${targetLabel}\\s*\\([^)]+\\)\\s*[:：]\\s*([^#\\n]+)`, 'i');
    const match2 = rawText.match(pattern2);
    if (match2 && match2[1]) {
      return match2[1].trim();
    }
    
    // 模式 3: 查找包含标签的段落
    const lines = rawText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(targetLabel) && /\d+(?:\.\d+)?\s*分/.test(line)) {
        // 找到包含标签和分数的行，提取后续内容
        const parts = line.split(/[-–—:：]/);
        if (parts.length > 1) {
          // 移除分数部分，只保留评论
          const comment = parts.slice(1).join('').replace(/\d+(?:\.\d+)?\s*分/, '').trim();
          if (comment) return comment;
        }
        // 如果当前行没有评论，检查下一行
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine && !nextLine.match(/^#\d+/)) {
            return nextLine;
          }
        }
      }
    }
    
    // 如果都没匹配到，返回提示
    return `评分: ${targetLabel}（未找到具体评论）`;
  };
  
  // 计算其他AI对当前AI的评分
  const getReceivedScores = () => {
    if (!selectedResult) return [];
    
    // 找到当前模型对应的标签
    let currentLabel = '';
    for (const [label, model] of Object.entries(labelToModel)) {
      if (model === selectedModel) {
        currentLabel = label;
        break;
      }
    }
    
    if (!currentLabel) {
      console.log('未找到当前模型的标签:', selectedModel, 'labelToModel:', labelToModel);
      return [];
    }
    
    console.log('当前模型标签:', currentLabel, '模型:', selectedModel);
    
    // 收集其他AI对当前AI的打分
    const receivedScores: Array<{ reviewer: string; score: number; comment: string }> = [];
    
    for (const result of results) {
      if (result.model === selectedModel || result.error) continue;
      
      // 使用该结果自己的 label_to_model 映射
      const resultLabelToModel = result.label_to_model || {};
      
      console.log(`检查 ${result.model} 的打分:`, result.scores, 'label_to_model:', resultLabelToModel);
      
      const score = result.scores[currentLabel];
      if (score !== undefined) {
        // 提取针对当前标签的评论
        const specificComment = extractCommentForLabel(result.raw_text, currentLabel);
        
        receivedScores.push({
          reviewer: result.model,
          score: score,
          comment: specificComment
        });
      }
    }
    
    console.log('收到的评分:', receivedScores);
    return receivedScores;
  };
  
  const receivedScores = getReceivedScores();
  
  return (
    <div className="stage-content">
      {/* 模型选择器 */}
      <div className="model-selector-bar">
        {results.map((result) => {
          // 判断状态：error（红色）、未参与评分（黄色）、成功（绿色）
          const hasError = result.error;
          const notParticipated = !hasError && result.participated === false;
          const isSuccess = !hasError && result.participated !== false;
          
          let statusClass = 'success';
          let statusTitle = '执行成功';
          let statusIcon = '✓';
          
          if (hasError) {
            statusClass = 'error';
            statusTitle = `错误: ${result.error}`;
            statusIcon = '⚠️';
          } else if (notParticipated) {
            statusClass = 'warning';
            statusTitle = `未参与评分: ${result.skip_reason || '未知原因'}`;
            statusIcon = '⚠️';
          }
          
          return (
            <button
              key={result.model}
              className={`model-tab ${selectedModel === result.model ? 'active' : ''} ${statusClass}`}
              onClick={() => setSelectedModel(result.model)}
              title={statusTitle}
            >
              <span className="model-tab-name">{result.model}</span>
              <span className={`status-icon ${statusClass}-icon`} title={statusTitle}>
                {statusIcon}
              </span>
            </button>
          );
        })}
      </div>
      
      {/* 视图切换按钮 */}
      <div className="view-mode-toggle">
        <button
          className={`view-mode-btn ${viewMode === 'given' ? 'active' : ''}`}
          onClick={() => setViewMode('given')}
        >
          📤 {selectedResult.model} 给出的评价
        </button>
        <button
          className={`view-mode-btn ${viewMode === 'received' ? 'active' : ''}`}
          onClick={() => setViewMode('received')}
        >
          📥 其他 AI 对 {selectedResult.model} 的评价
        </button>
      </div>
      
      {/* 选中模型的打分内容 */}
      <div className="stage-results">
        <div className="scoring-result">
          <div className="scoring-header">
            <span className="model-name">
              {viewMode === 'given' ? `🎯 ${selectedResult.model} 的评价` : `📊 ${selectedResult.model} 收到的评价`}
            </span>
            <span className="model-time">
              {new Date(selectedResult.timestamp).toLocaleTimeString('zh-CN')}
            </span>
          </div>
          {selectedResult.error ? (
            <div className="model-error">
              <div className="error-title">❌ 执行失败</div>
              <div className="error-details">{selectedResult.error}</div>
            </div>
          ) : selectedResult.participated === false ? (
            <div className="model-error">
              <div className="error-title">⚠️ 未参与评分</div>
              <div className="error-details">{selectedResult.skip_reason || '未知原因'}</div>
            </div>
          ) : viewMode === 'given' ? (
            <div className="scoring-content">
              <div className="scores-grid">
                <strong>打分结果（满分10分）：</strong>
                <div className="scores-list">
                  {Object.entries(selectedResult.scores).map(([label, score]) => {
                    const modelName = labelToModel[label] || `未知模型 ${label}`;
                    return (
                      <div key={label} className="score-item">
                        <div>
                          <span className="score-model">{modelName}</span>
                          <span className="score-label"> ({label})</span>
                          <span className="score-value">{score.toFixed(1)} / 10</span>
                        </div>
                        <div className="score-bar">
                          <div
                            className="score-fill"
                            style={{ width: `${(score / 10) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="raw-text">
                <strong>完整评论：</strong>
                <div className="comment-text">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[[rehypeKatex, katexOptions]]}
                  >
                    {selectedResult.raw_text}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="scoring-content">
              {receivedScores.length > 0 ? (
                <div className="received-scores">
                  <strong>收到 {receivedScores.length} 个评价：</strong>
                  {receivedScores.map((item, index) => (
                    <div key={index} className="received-score-item">
                      <div className="received-score-header">
                        <span className="reviewer-name">👤 {item.reviewer}</span>
                        <span className="reviewer-score">评分: {item.score.toFixed(1)} / 10</span>
                      </div>
                      <div className="score-bar">
                        <div
                          className="score-fill"
                          style={{ width: `${(item.score / 10) * 100}%` }}
                        ></div>
                      </div>
                      <div className="reviewer-comment">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[[rehypeKatex, katexOptions]]}
                        >
                          {item.comment}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-scores">
                  <p>暂无其他 AI 对该模型的评价</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Stage 3 结果展示组件
 */
function Stage3Display({ result }: { result: Stage3Result }) {
  return (
    <div className="stage-content">
      <div className="final-answer">
        <div className="final-header">
          <span className="final-icon">✨ 主席综合答案</span>
          <span className="final-time">
            {new Date(result.timestamp).toLocaleTimeString('zh-CN')}
          </span>
        </div>
        {result.error ? (
          <div className="model-error">❌ {result.error}</div>
        ) : (
          <div className="final-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[[rehypeKatex, katexOptions]]}
              components={{
                code: CodeBlock,
                p: ({ children, ...props }) => {
                  const hasCodeBlock = (node: any): boolean => {
                    if (!node) return false;
                    if (node?.type?.name === 'CodeBlock') return true;
                    if (node?.props?.className && typeof node.props.className === 'string' &&
                        node.props.className.includes('code-block')) return true;
                    if (Array.isArray(node)) return node.some(hasCodeBlock);
                    if (node?.props?.children) return hasCodeBlock(node.props.children);
                    return false;
                  };
                  return hasCodeBlock(children) ? <>{children}</> : <p {...props}>{children}</p>;
                }
              }}
            >
              {result.response}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Stage 4 结果展示组件 - 显示排名
 */
function Stage4Display({ result, stage1Results }: { result: Stage4Result; stage1Results?: Stage1Result[] }) {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showAllRankings, setShowAllRankings] = useState<boolean>(false);
  
  // 获取选中模型的详细答案
  const selectedAnswer = selectedModel && stage1Results
    ? stage1Results.find(r => r.model === selectedModel)
    : null;
  
  // 判断是否需要折叠显示
  const totalRankings = result.rankings.length;
  const shouldCollapse = totalRankings > 10;
  const displayedRankings = shouldCollapse && !showAllRankings
    ? result.rankings.slice(0, 10)
    : result.rankings;
  
  return (
    <div className="stage-content">
      <div className="stage4-container">
        {result.error ? (
          <div className="model-error">
            <div className="error-title">❌ 执行失败</div>
            <div className="error-details">{result.error}</div>
          </div>
        ) : (
          <>
            {/* 排名列表 */}
            <div className="rankings-section">
              <div className="rankings-header">
                <span className="rankings-icon">🏆 最终排名</span>
                <span className="rankings-time">
                  {new Date(result.timestamp).toLocaleTimeString('zh-CN')}
                </span>
              </div>
              <div className="rankings-description">
                <p>根据所有 AI 的同行评审打分，计算出的综合排名（点击查看完整答案）</p>
              </div>
              <div className="rankings-list">
                {displayedRankings.map((ranking, index) => {
                  // 判断该模型作为评分者的状态
                  const scorerStatus = ranking.scorer_valid ? 'valid' : 'invalid';
                  const scorerIcon = ranking.scorer_valid ? '✓' : '⚠️';
                  const scorerTitle = ranking.scorer_valid
                    ? '该模型的评分有效'
                    : `该模型的评分无效: ${ranking.scorer_reason || '未知原因'}`;
                  
                  return (
                    <div
                      key={ranking.model}
                      className={`ranking-item ${selectedModel === ranking.model ? 'selected' : ''} ${index === 0 ? 'best' : ''}`}
                      onClick={() => setSelectedModel(ranking.model === selectedModel ? null : ranking.model)}
                    >
                      <div className="ranking-position">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </div>
                      <div className="ranking-info">
                        <div className="ranking-model-line">
                          <span className="ranking-model">{ranking.model}</span>
                          <span
                            className={`scorer-status ${scorerStatus}`}
                            title={scorerTitle}
                          >
                            {scorerIcon}
                          </span>
                        </div>
                        <span className="ranking-score">
                          平均分: {ranking.avg_score.toFixed(2)} / 10
                          <span className="score-count"> (收到 {ranking.score_count} 个有效评分)</span>
                        </span>
                      </div>
                      <div className="ranking-bar">
                        <div
                          className="ranking-fill"
                          style={{ width: `${(ranking.avg_score / 10) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* 展开/收起按钮 */}
              {shouldCollapse && (
                <div className="rankings-toggle">
                  <button
                    className="toggle-button"
                    onClick={() => setShowAllRankings(!showAllRankings)}
                  >
                    {showAllRankings ? (
                      <>
                        <span>收起</span>
                        <span className="toggle-icon">▲</span>
                      </>
                    ) : (
                      <>
                        <span>显示全部 {totalRankings} 个排名</span>
                        <span className="toggle-icon">▼</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
            
            {/* 选中答案的详细内容 */}
            {selectedAnswer && (
              <div className="selected-answer-section">
                <div className="selected-answer-header">
                  <span className="selected-answer-icon">📄 {selectedAnswer.model} 的完整答案</span>
                  <button
                    className="close-button"
                    onClick={() => setSelectedModel(null)}
                  >
                    ✕
                  </button>
                </div>
                <div className="selected-answer-content">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[[rehypeKatex, katexOptions]]}
                    components={{
                      code: CodeBlock,
                      p: ({ children, ...props }) => {
                        const hasCodeBlock = (node: any): boolean => {
                          if (!node) return false;
                          if (node?.type?.name === 'CodeBlock') return true;
                          if (node?.props?.className && typeof node.props.className === 'string' &&
                              node.props.className.includes('code-block')) return true;
                          if (Array.isArray(node)) return node.some(hasCodeBlock);
                          if (node?.props?.children) return hasCodeBlock(node.props.children);
                          return false;
                        };
                        return hasCodeBlock(children) ? <>{children}</> : <p {...props}>{children}</p>;
                      }
                    }}
                  >
                    {selectedAnswer.response}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 进度阶段组件 - 支持折叠和优先级排序
 */
function ProgressStageSection({
  title,
  icon,
  progress
}: {
  title: string;
  icon: string;
  progress: Array<[string, {
    status: string;
    error?: string;
    current_retry?: number;
    max_retries?: number;
  }]>;
}) {
  const [showAll, setShowAll] = useState(false);
  
  // 按优先级排序：失败 > 重试中 > 执行中 > 成功
  const sortedProgress = [...progress].sort((a, b) => {
    const [, statusA] = a;
    const [, statusB] = b;
    
    // 定义优先级函数
    const getPriority = (status: { status: string; error?: string; current_retry?: number; max_retries?: number }) => {
      if (status.error) return 0;  // 失败：最高优先级
      if (status.status === 'retrying') return 1;  // 重试中：第二优先级
      if (status.status.includes('中')) return 2;  // 执行中：第三优先级
      return 3;  // 成功：最低优先级
    };
    
    const priorityA = getPriority(statusA);
    const priorityB = getPriority(statusB);
    
    return priorityA - priorityB;
  });
  
  const totalCount = sortedProgress.length;
  const shouldCollapse = totalCount > 10;
  const displayedProgress = shouldCollapse && !showAll
    ? sortedProgress.slice(0, 10)
    : sortedProgress;
  
  return (
    <div className="progress-stage">
      <div className="progress-stage-title">{icon} {title}</div>
      <div className="progress-list">
        {displayedProgress.map(([modelName, status]) => (
          <div key={modelName} className={`progress-item ${status.error ? 'error' : ''}`}>
            <span className="progress-model">{modelName}</span>
            <span className="progress-status">
              {status.error ? (
                <span className="status-error" title={status.error}>
                  ⚠️ {status.status}: {status.error}
                </span>
              ) : status.status === 'retrying' ? (
                <span className="status-retrying">
                  🔄 重试中 {status.current_retry}/{status.max_retries}
                </span>
              ) : (
                <span className={`status-${status.status.includes('中') ? 'processing' : 'completed'}`}>
                  {status.status.includes('中') ? '⏳' : '✅'} {status.status}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      
      {/* 展开/收起按钮 */}
      {shouldCollapse && (
        <div className="progress-toggle">
          <button
            className="toggle-button"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? (
              <>
                <span>收起</span>
                <span className="toggle-icon">▲</span>
              </>
            ) : (
              <>
                <span>显示全部 {totalCount} 个</span>
                <span className="toggle-icon">▼</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 执行进度展示组件 - 按阶段分组显示
 */
function ExecutionProgressDisplay({ modelStatuses }: {
  modelStatuses?: Record<string, {
    status: string;
    error?: string;
    current_retry?: number;
    max_retries?: number;
  }>
}) {
  if (!modelStatuses || Object.keys(modelStatuses).length === 0) {
    return null;
  }

  // 按阶段分组进度
  const stage1Progress: Array<[string, { status: string; error?: string }]> = [];
  const stage2Progress: Array<[string, { status: string; error?: string }]> = [];
  const stage3Progress: Array<[string, { status: string; error?: string }]> = [];
  const stage4Progress: Array<[string, { status: string; error?: string }]> = [];

  // 首先收集 Stage 1 的状态，找出成功的模型
  const stage1SuccessModels = new Set<string>();
  
  Object.entries(modelStatuses).forEach(([key, status]) => {
    if (!key.includes('-stage2') && !key.includes('-stage3') && key !== 'stage4') {
      // Stage 1 模型
      stage1Progress.push([key, status]);
      // 如果状态是成功（已完成且没有错误），记录为成功模型
      if (!status.error && (status.status === '已完成' || status.status.includes('完成'))) {
        stage1SuccessModels.add(key);
      }
    }
  });

  // 然后处理其他阶段，Stage 2 只显示 Stage 1 成功的模型
  Object.entries(modelStatuses).forEach(([key, status]) => {
    if (key.includes('-stage2')) {
      const modelName = key.replace('-stage2', '');
      // 只显示 Stage 1 成功的模型的 Stage 2 进度
      if (stage1SuccessModels.has(modelName)) {
        stage2Progress.push([modelName, status]);
      }
    } else if (key.includes('-stage3')) {
      stage3Progress.push([key.replace('-stage3', ''), status]);
    } else if (key === 'stage4') {
      stage4Progress.push(['排名计算', status]);
    }
  });

  return (
    <div className="stage-content">
      <div className="execution-progress">
        {/* Stage 4 进度 */}
        {stage4Progress.length > 0 && (
          <ProgressStageSection
            title="Stage 4: 最终排名"
            icon="🏆"
            progress={stage4Progress}
          />
        )}

        {/* Stage 3 进度 */}
        {stage3Progress.length > 0 && (
          <ProgressStageSection
            title="Stage 3: 主席综合"
            icon="✨"
            progress={stage3Progress}
          />
        )}

        {/* Stage 2 进度 */}
        {stage2Progress.length > 0 && (
          <ProgressStageSection
            title="Stage 2: 同行评审"
            icon="🎯"
            progress={stage2Progress}
          />
        )}

        {/* Stage 1 进度 */}
        {stage1Progress.length > 0 && (
          <ProgressStageSection
            title="Stage 1: 模型响应"
            icon="📝"
            progress={stage1Progress}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 助手消息组件（四阶段结果展示 + 执行进度）
 */
function AssistantMessage({ message }: { message: Message }) {
  // 检查各阶段是否有数据
  const hasStage1 = message.stage1 && message.stage1.length > 0;
  const hasStage2 = message.stage2 && message.stage2.length > 0;
  const hasStage3 = message.stage3 !== undefined;
  const hasStage4 = message.stage4 !== undefined;
  const hasProgress = message.modelStatuses && Object.keys(message.modelStatuses).length > 0;
  
  // 判断是否所有阶段都已完成
  const allStagesComplete = hasStage1 && hasStage2 && hasStage3 && hasStage4;
  
  // 计算实际显示的进度项数量（考虑 Stage 2 过滤）
  const getActualProgressCount = () => {
    if (!message.modelStatuses) return 0;
    
    let count = 0;
    const stage1SuccessModels = new Set<string>();
    
    // 统计 Stage 1 和识别成功的模型
    Object.entries(message.modelStatuses).forEach(([key, status]) => {
      if (!key.includes('-stage2') && !key.includes('-stage3') && key !== 'stage4') {
        count++; // Stage 1 模型
        if (!status.error && (status.status === '已完成' || status.status.includes('完成'))) {
          stage1SuccessModels.add(key);
        }
      }
    });
    
    // 统计其他阶段（Stage 2 只计算 Stage 1 成功的模型）
    Object.entries(message.modelStatuses).forEach(([key]) => {
      if (key.includes('-stage2')) {
        const modelName = key.replace('-stage2', '');
        if (stage1SuccessModels.has(modelName)) {
          count++; // 只计算 Stage 1 成功的模型的 Stage 2
        }
      } else if (key.includes('-stage3')) {
        count++; // Stage 3
      } else if (key === 'stage4') {
        count++; // Stage 4
      }
    });
    
    return count;
  };
  
  const actualProgressCount = getActualProgressCount();
  
  // 初始选项卡：如果正在流式传输或未完成，显示进度；如果已完成，显示 stage4
  const [activeTab, setActiveTab] = useState<'progress' | 'stage1' | 'stage2' | 'stage3' | 'stage4'>(
    message.streaming || !allStagesComplete ? 'progress' : 'stage4'
  );
  
  // 只在所有阶段完成时自动切换到 stage4（不强制，用户可以手动切换）
  useEffect(() => {
    if (allStagesComplete && !message.streaming && activeTab === 'progress') {
      setActiveTab('stage4');
    }
  }, [allStagesComplete, message.streaming, activeTab]);
  
  // 如果没有任何阶段数据且没有进度信息，显示加载状态
  if (!hasStage1 && !hasStage2 && !hasStage3 && !hasStage4 && !hasProgress) {
    return (
      <div className="message assistant-message">
        <div className="message-header">
          <span className="message-role">🤖 AI 委员会</span>
          <span className="message-time">
            {new Date(message.timestamp).toLocaleTimeString('zh-CN')}
          </span>
        </div>
        <div className="message-loading">
          <div className="loading-spinner"></div>
          <span>正在初始化...</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`message assistant-message ${message.streaming ? 'streaming' : ''}`}>
      <div className="message-header">
        <span className="message-role">🤖 AI 委员会</span>
        <span className="message-time">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN')}
        </span>
      </div>
      
      <div className="stage-tabs">
        {/* 只在未完成所有阶段时显示执行进度标签 */}
        {hasProgress && !allStagesComplete && (
          <button
            className={`stage-tab ${activeTab === 'progress' ? 'active' : ''}`}
            onClick={() => setActiveTab('progress')}
          >
            执行进度
            <span className="tab-badge">{actualProgressCount}</span>
          </button>
        )}
        {hasStage1 && (
          <button
            className={`stage-tab ${activeTab === 'stage1' ? 'active' : ''}`}
            onClick={() => setActiveTab('stage1')}
          >
            Stage 1: 模型响应
            <span className="tab-badge">{message.stage1?.length || 0}</span>
          </button>
        )}
        {hasStage2 && (
          <button
            className={`stage-tab ${activeTab === 'stage2' ? 'active' : ''}`}
            onClick={() => setActiveTab('stage2')}
          >
            Stage 2: 同行评审
            <span className="tab-badge">{message.stage2?.length || 0}</span>
          </button>
        )}
        {hasStage3 && (
          <button
            className={`stage-tab ${activeTab === 'stage3' ? 'active' : ''}`}
            onClick={() => setActiveTab('stage3')}
          >
            Stage 3: 综合答案
          </button>
        )}
        {hasStage4 && (
          <button
            className={`stage-tab ${activeTab === 'stage4' ? 'active' : ''}`}
            onClick={() => setActiveTab('stage4')}
          >
            Stage 4: 最终排名
          </button>
        )}
      </div>
      
      <div className="stage-panel">
        {activeTab === 'progress' && hasProgress && (
          <ExecutionProgressDisplay modelStatuses={message.modelStatuses} />
        )}
        {activeTab === 'stage1' && hasStage1 && (
          <Stage1Display results={message.stage1!} />
        )}
        {activeTab === 'stage2' && hasStage2 && (
          <Stage2Display results={message.stage2!} />
        )}
        {activeTab === 'stage3' && hasStage3 && (
          <Stage3Display result={message.stage3!} />
        )}
        {activeTab === 'stage4' && hasStage4 && (
          <Stage4Display result={message.stage4!} stage1Results={message.stage1} />
        )}
      </div>
    </div>
  );
}

/**
 * 消息展示组件
 * 渲染用户消息和助手消息（三阶段结果）
 */
function MessageDisplay({ messages, onEditMessage, onDeleteMessage }: MessageDisplayProps) {
  if (messages.length === 0) {
    return (
      <div className="empty-messages">
        <div className="empty-icon">💬</div>
        <h3>还没有消息</h3>
        <p>选择模型并开始对话</p>
      </div>
    );
  }
  
  return (
    <div className="message-display">
      {messages.map((message, index) => (
        <div key={index}>
          {message.role === 'user' ? (
            <UserMessage
              message={message}
              messageIndex={index}
              onEdit={onEditMessage}
              onDelete={onDeleteMessage}
            />
          ) : (
            <AssistantMessage message={message} />
          )}
        </div>
      ))}
    </div>
  );
}

export default MessageDisplay;
export type { Message, Attachment, Stage1Result, Stage2Result, Stage3Result, Stage4Result };