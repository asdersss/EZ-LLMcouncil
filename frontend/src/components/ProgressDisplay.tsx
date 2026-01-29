import { useState } from 'react';
import './ProgressDisplay.css';

/**
 * 模型状态接口
 */
interface ModelStatus {
  status: string;
  error?: string;
  current_retry?: number;
  max_retries?: number;
}

/**
 * Stage配置接口
 */
interface StageConfig {
  id: string;
  title: string;
  icon: string;
  order: number; // 用于排序，数字越大越靠上
}

/**
 * 进度项接口
 */
interface ProgressItem {
  modelName: string;
  status: ModelStatus;
  stage: string;
  isCompleted: boolean;
}

/**
 * 进度显示组件属性
 */
interface ProgressDisplayProps {
  modelStatuses?: Record<string, ModelStatus>;
  stage1Results?: any[]; // 用于判断哪些模型在Stage 1成功
}

/**
 * Stage配置
 */
const STAGE_CONFIGS: Record<string, StageConfig> = {
  stage4: {
    id: 'stage4',
    title: 'Stage 4: 最终排名',
    icon: '🏆',
    order: 4
  },
  stage3: {
    id: 'stage3',
    title: 'Stage 3: 主席综合',
    icon: '✨',
    order: 3
  },
  stage2: {
    id: 'stage2',
    title: 'Stage 2: 同行评审',
    icon: '🎯',
    order: 2
  },
  stage1: {
    id: 'stage1',
    title: 'Stage 1: 模型响应',
    icon: '📝',
    order: 1
  }
};

/**
 * 获取状态显示信息
 */
function getStatusDisplay(status: ModelStatus): {
  icon: string;
  text: string;
  className: string;
  tooltip?: string;
} {
  // 错误状态
  if (status.error) {
    return {
      icon: '❌',
      text: '错误',
      className: 'status-error',
      tooltip: status.error
    };
  }
  
  // 重试状态
  if (status.status === 'retrying') {
    return {
      icon: '🔄',
      text: `重试中 ${status.current_retry}/${status.max_retries}`,
      className: 'status-retrying'
    };
  }
  
  // 执行中状态（包含"中"字的状态）
  if (status.status.includes('中')) {
    return {
      icon: '⏳',
      text: status.status,
      className: 'status-processing'
    };
  }
  
  // 完成状态
  return {
    icon: '✅',
    text: status.status,
    className: 'status-completed'
  };
}

/**
 * 判断状态是否已完成
 */
function isStatusCompleted(status: ModelStatus): boolean {
  // 有错误算完成（失败也是一种完成）
  if (status.error) return true;
  
  // 包含"完成"、"失败"的状态算完成
  if (status.status.includes('完成') || status.status.includes('失败')) {
    return true;
  }
  
  // 重试中或包含"中"的状态算未完成
  if (status.status === 'retrying' || status.status.includes('中')) {
    return false;
  }
  
  // 其他情况算完成
  return true;
}

/**
 * 单个进度项组件
 */
function ProgressItemComponent({ item }: { item: ProgressItem }) {
  const statusDisplay = getStatusDisplay(item.status);
  
  return (
    <div className={`progress-item-new ${statusDisplay.className}`}>
      <div className="progress-item-model">{item.modelName}</div>
      <div className="progress-item-status">
        <span className="progress-status-icon">{statusDisplay.icon}</span>
        <span className="progress-status-text">{statusDisplay.text}</span>
        {statusDisplay.tooltip && (
          <span className="progress-status-tooltip" title={statusDisplay.tooltip}>
            {statusDisplay.tooltip.length > 50 
              ? `${statusDisplay.tooltip.substring(0, 50)}...` 
              : statusDisplay.tooltip}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Stage组件
 */
function StageSection({
  config,
  items,
  isCompleted
}: {
  config: StageConfig;
  items: ProgressItem[];
  isCompleted: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  
  // 按优先级排序：错误 > 重试中 > 执行中 > 成功
  const sortedItems = [...items].sort((a, b) => {
    const getPriority = (item: ProgressItem) => {
      if (item.status.error) return 0; // 错误最优先
      if (item.status.status === 'retrying') return 1; // 重试中第二
      if (item.status.status.includes('中')) return 2; // 执行中第三
      return 3; // 成功最低
    };
    
    return getPriority(a) - getPriority(b);
  });
  
  const shouldCollapse = items.length > 10;
  const displayedItems = shouldCollapse && !showAll
    ? sortedItems.slice(0, 10)
    : sortedItems;
  
  return (
    <div className={`progress-stage-new ${isCompleted ? 'stage-completed' : ''}`}>
      <div className="progress-stage-header">
        <span className="progress-stage-icon">{config.icon}</span>
        <span className="progress-stage-title">{config.title}</span>
        <span className="progress-stage-count">({items.length})</span>
      </div>
      
      <div className="progress-stage-items">
        {displayedItems.map((item, index) => (
          <ProgressItemComponent key={`${item.modelName}-${index}`} item={item} />
        ))}
      </div>
      
      {shouldCollapse && (
        <div className="progress-stage-toggle">
          <button
            className="progress-toggle-btn"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? (
              <>
                <span>收起</span>
                <span className="toggle-icon">▲</span>
              </>
            ) : (
              <>
                <span>显示全部 {items.length} 个</span>
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
 * 进度显示主组件
 */
function ProgressDisplay({ modelStatuses, stage1Results }: ProgressDisplayProps) {
  if (!modelStatuses || Object.keys(modelStatuses).length === 0) {
    return null;
  }
  
  // 获取Stage 1成功的模型集合
  const stage1SuccessModels = new Set<string>();
  if (stage1Results) {
    stage1Results.forEach(result => {
      if (!result.error) {
        stage1SuccessModels.add(result.model);
      }
    });
  }
  
  // 分组进度项
  const stageGroups: Record<string, ProgressItem[]> = {
    stage1: [],
    stage2: [],
    stage3: [],
    stage4: []
  };
  
  // 处理所有状态
  Object.entries(modelStatuses).forEach(([key, status]) => {
    let stageId: string;
    let modelName: string;
    
    if (key === 'stage4') {
      // Stage 4特殊处理
      stageId = 'stage4';
      modelName = '排名计算';
    } else if (key.includes('-stage3')) {
      // Stage 3
      stageId = 'stage3';
      modelName = key.replace('-stage3', '');
    } else if (key.includes('-stage2')) {
      // Stage 2 - 只显示Stage 1成功的模型
      modelName = key.replace('-stage2', '');
      if (!stage1SuccessModels.has(modelName)) {
        return; // 跳过Stage 1失败的模型
      }
      stageId = 'stage2';
    } else {
      // Stage 1
      stageId = 'stage1';
      modelName = key;
      
      // 记录Stage 1成功的模型
      if (!status.error && (status.status === '已完成' || status.status.includes('完成'))) {
        stage1SuccessModels.add(modelName);
      }
    }
    
    const item: ProgressItem = {
      modelName,
      status,
      stage: stageId,
      isCompleted: isStatusCompleted(status)
    };
    
    stageGroups[stageId].push(item);
  });
  
  // 按Stage分组并排序（完成的在下面，新的在上面）
  const stages = Object.keys(STAGE_CONFIGS)
    .filter(stageId => stageGroups[stageId].length > 0)
    .map(stageId => {
      const items = stageGroups[stageId];
      const allCompleted = items.every(item => item.isCompleted);
      
      return {
        config: STAGE_CONFIGS[stageId],
        items,
        isCompleted: allCompleted
      };
    })
    .sort((a, b) => {
      // 未完成的stage在上面
      if (a.isCompleted !== b.isCompleted) {
        return a.isCompleted ? 1 : -1;
      }
      // 同样完成状态下，按order排序（数字大的在上）
      return b.config.order - a.config.order;
    });
  
  return (
    <div className="progress-display-new">
      {stages.map(stage => (
        <StageSection
          key={stage.config.id}
          config={stage.config}
          items={stage.items}
          isCompleted={stage.isCompleted}
        />
      ))}
    </div>
  );
}

export default ProgressDisplay;