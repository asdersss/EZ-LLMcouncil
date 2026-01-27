/**
 * Mermaid 代码清理和修复工具
 * 自动修复常见的 Mermaid 语法错误，提高渲染成功率
 */

/**
 * 清理 Mermaid 代码中的特殊字符和常见错误
 * @param code 原始 Mermaid 代码
 * @returns 清理后的代码
 */
export function sanitizeMermaidCode(code: string): string {
  if (!code) return code;

  let sanitized = code;

  // 1. 清理节点文本中的特殊字符
  // 匹配方括号内的文本：[文本内容]
  sanitized = sanitized.replace(/\[([^\]]+)\]/g, (match, text) => {
    let cleaned = text
      // 移除引号
      .replace(/["']/g, '')
      // 移除中文冒号，替换为空格或短横线
      .replace(/：/g, ' ')
      // 移除英文冒号
      .replace(/:/g, ' ')
      // 移除括号内容（如果太长）
      .replace(/\([^)]{10,}\)/g, '')
      // 保留简短括号内容
      .replace(/[()]/g, '')
      // 移除其他特殊字符
      .replace(/[&<>{}]/g, '')
      // 移除中文标点
      .replace(/[、。！？；，]/g, '')
      // 压缩多个空格
      .replace(/\s+/g, ' ')
      // 去除首尾空格
      .trim();
    
    // 如果文本过长，截断并添加省略号
    if (cleaned.length > 20) {
      cleaned = cleaned.substring(0, 17) + '...';
    }
    
    return `[${cleaned}]`;
  });

  // 2. 清理花括号内的决策文本：{文本}
  sanitized = sanitized.replace(/\{([^}]+)\}/g, (match, text) => {
    let cleaned = text
      .replace(/["']/g, '')
      .replace(/：/g, ' ')
      .replace(/:/g, ' ')
      .replace(/[()]/g, '')
      .replace(/[&<>]/g, '')
      .replace(/[、。！？；，]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleaned.length > 15) {
      cleaned = cleaned.substring(0, 12) + '...';
    }
    
    return `{${cleaned}}`;
  });

  // 3. 清理连接线上的文本：-->|文本|
  sanitized = sanitized.replace(/\|([^|]+)\|/g, (match, text) => {
    let cleaned = text
      .replace(/["']/g, '')
      .replace(/：/g, '')
      .replace(/:/g, '')
      .replace(/[()]/g, '')
      .replace(/[&<>]/g, '')
      .replace(/[、。！？；，]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // 连接线文本应该非常简短
    if (cleaned.length > 8) {
      cleaned = cleaned.substring(0, 6);
    }
    
    return `|${cleaned}|`;
  });

  // 4. 修复常见的语法错误
  // 确保 flowchart 后有空格和方向
  sanitized = sanitized.replace(/^flowchart([A-Z]{2})/m, 'flowchart $1');
  
  // 5. 移除可能导致问题的 HTML 标签
  sanitized = sanitized.replace(/<[^>]+>/g, '');

  // 6. 确保每行末尾没有多余的空格
  sanitized = sanitized.split('\n').map(line => line.trimEnd()).join('\n');

  return sanitized;
}

/**
 * 验证 Mermaid 代码的基本语法
 * @param code Mermaid 代码
 * @returns 是否通过基本验证
 */
export function validateMermaidCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!code || !code.trim()) {
    errors.push('代码为空');
    return { valid: false, errors };
  }

  // 检查是否有图表类型声明
  const hasChartType = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey)/m.test(code);
  if (!hasChartType) {
    errors.push('缺少图表类型声明（如 flowchart TD）');
  }

  // 检查是否有节点定义
  const hasNodes = /[A-Z]\[/.test(code) || /[A-Z]\{/.test(code) || /[A-Z]\(/.test(code);
  if (!hasNodes) {
    errors.push('未找到节点定义');
  }

  // 检查是否有连接
  const hasConnections = /-->|---/.test(code);
  if (!hasConnections && hasChartType && code.includes('flowchart')) {
    errors.push('未找到节点连接');
  }

  // 警告：检查可能有问题的字符
  if (/["']/.test(code)) {
    errors.push('警告：代码中包含引号，可能导致渲染失败');
  }

  if (/[：:]/.test(code) && !/^[A-Z]+:/.test(code)) {
    errors.push('警告：代码中包含冒号，可能导致渲染失败');
  }

  return {
    valid: errors.length === 0 || errors.every(e => e.startsWith('警告')),
    errors
  };
}

/**
 * 生成 Mermaid 代码的修复建议
 * @param code 原始代码
 * @returns 修复建议列表
 */
export function getMermaidFixSuggestions(code: string): string[] {
  const suggestions: string[] = [];

  // 检查节点文本长度
  const longTexts = code.match(/\[[^\]]{20,}\]/g);
  if (longTexts && longTexts.length > 0) {
    suggestions.push('建议：简化节点文本，每个节点文本不超过15个字符');
  }

  // 检查特殊字符
  if (/["']/.test(code)) {
    suggestions.push('建议：移除所有引号');
  }

  if (/[：:]/.test(code)) {
    suggestions.push('建议：移除冒号，使用空格或短横线代替');
  }

  if (/[()（）]/.test(code)) {
    suggestions.push('建议：移除或简化括号内容');
  }

  return suggestions;
}