import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { sanitizeMermaidCode, validateMermaidCode } from '../utils/mermaidSanitizer';

// 初始化 Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Arial, sans-serif',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis',
    padding: 20,
    nodeSpacing: 50,
    rankSpacing: 50,
    diagramPadding: 8,
    wrappingWidth: 200
  },
  themeVariables: {
    fontSize: '16px'
  }
});

interface MermaidRendererProps {
  chart: string;
}

/**
 * Mermaid 流程图渲染组件
 */
function MermaidRenderer({ chart }: MermaidRendererProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>('');
  const [showSource, setShowSource] = useState<boolean>(false);

  useEffect(() => {
    if (chart) {
      setError(null);
      setSvg('');
      
      // 1. 验证和清理 Mermaid 代码
      const validation = validateMermaidCode(chart);
      const sanitizedChart = sanitizeMermaidCode(chart);
      
      // 2. 渲染 Mermaid 图表（使用清理后的代码）
      mermaid.render(idRef.current, sanitizedChart)
        .then(({ svg }: { svg: string }) => {
          setSvg(svg);
          setError(null);
          
          // 延迟清理，确保渲染完成
          setTimeout(() => {
            const tempDivs = document.querySelectorAll('div[id^="dmermaid-"], div[id^="mermaid-"]');
            tempDivs.forEach(div => {
              const htmlDiv = div as HTMLDivElement;
              // 只移除不在我们容器中的临时元素
              if (!htmlDiv.classList.contains('mermaid-container') &&
                  !htmlDiv.closest('.mermaid-container')) {
                htmlDiv.remove();
              }
            });
          }, 100);
        })
        .catch((error: any) => {
          console.error('Mermaid 渲染错误:', error);
          
          // 提供更友好的错误信息
          let errorMessage = '图表语法可能存在错误，请检查 Mermaid 语法是否正确';
          const errorStr = error?.message || String(error);
          
          if (errorStr.includes('Parse error') || errorStr.includes('Syntax error')) {
            errorMessage = '语法错误：代码格式不正确，请检查节点定义和连接语法';
          } else if (errorStr.includes('Lexical error')) {
            errorMessage = '词法错误：代码中包含不支持的特殊字符（如引号、冒号等）';
          } else if (errorStr.includes('Unexpected token')) {
            errorMessage = '语法错误：发现意外的符号或关键字';
          }
          
          // 如果有验证错误，添加到错误信息中
          if (!validation.valid && validation.errors.length > 0) {
            errorMessage += '\n\n可能的问题：\n' + validation.errors.join('\n');
          }
          
          setError(errorMessage);
          setSvg('');
          
          // 延迟清理错误元素
          setTimeout(() => {
            const tempDivs = document.querySelectorAll('div[id^="dmermaid-"], div[id^="mermaid-"]');
            tempDivs.forEach(div => {
              const htmlDiv = div as HTMLDivElement;
              if (!htmlDiv.classList.contains('mermaid-container') &&
                  !htmlDiv.closest('.mermaid-container')) {
                htmlDiv.remove();
              }
            });
          }, 100);
        });
    }
    
    // 组件卸载时清理
    return () => {
      setTimeout(() => {
        const tempDivs = document.querySelectorAll('div[id^="dmermaid-"], div[id^="mermaid-"]');
        tempDivs.forEach(div => {
          const htmlDiv = div as HTMLDivElement;
          if (!htmlDiv.classList.contains('mermaid-container') &&
              !htmlDiv.closest('.mermaid-container')) {
            htmlDiv.remove();
          }
        });
      }, 100);
    };
  }, [chart]);

  return (
    <div
      className="mermaid-container"
      style={{
        margin: '1rem 0',
        background: 'var(--bg-tertiary)',
        borderRadius: '8px',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* 切换按钮 */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '0.5rem 1rem',
        borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
        background: 'rgba(0, 0, 0, 0.02)'
      }}>
        <button
          onClick={() => setShowSource(!showSource)}
          style={{
            padding: '0.25rem 0.75rem',
            fontSize: '0.875rem',
            background: showSource ? '#3b82f6' : '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = showSource ? '#2563eb' : '#4b5563';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = showSource ? '#3b82f6' : '#6b7280';
          }}
          title={showSource ? '查看渲染结果' : '查看源码'}
        >
          {showSource ? '📊 查看图表' : '📝 查看源码'}
        </button>
      </div>

      {/* 内容区域 */}
      <div style={{ padding: '1rem' }}>
        {showSource ? (
          // 显示源码
          <pre style={{
            margin: 0,
            padding: '1rem',
            background: '#1e1e1e',
            color: '#d4d4d4',
            borderRadius: '4px',
            overflow: 'auto',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace'
          }}>
            <code>{chart}</code>
          </pre>
        ) : error ? (
          // 显示错误
          <div style={{
            color: '#ef4444',
            background: '#fee2e2',
            padding: '1rem',
            borderRadius: '8px',
            borderLeft: '4px solid #ef4444',
            fontFamily: 'Arial, sans-serif'
          }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
              ⚠️ 流程图渲染失败
            </div>
            <div style={{ fontSize: '0.9em', color: '#991b1b', marginBottom: '0.5rem' }}>
              {error}
            </div>
            <div style={{ fontSize: '0.85em', color: '#7f1d1d' }}>
              💡 提示：点击上方"查看源码"按钮可以查看原始 Mermaid 代码
            </div>
          </div>
        ) : svg ? (
          // 显示渲染结果
          <div
            ref={elementRef}
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          // 加载中
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '2rem',
            color: '#666'
          }}>
            渲染中...
          </div>
        )}
      </div>
    </div>
  );
}

export default MermaidRenderer;