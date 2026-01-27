import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import MermaidRenderer from './MermaidRenderer';
import './CodeBlock.css';

interface CodeBlockProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

/**
 * 代码块组件 - 支持语法高亮和 Mermaid 图表
 */
const CodeBlock = ({ node, inline, className, children, ...props }: CodeBlockProps) => {
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');
  
  // 如果是 mermaid 代码块，使用 MermaidRenderer
  if (!inline && language === 'mermaid') {
    return <MermaidRenderer chart={codeString} />;
  }
  
  // 行内代码
  if (inline) {
    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  }
  
  // 代码块 - 使用语法高亮
  if (match) {
    return (
      <div className="code-block-wrapper">
        <div className="code-block-header">
          <span className="code-language">{language}</span>
          <button
            className="code-copy-btn"
            onClick={() => {
              navigator.clipboard.writeText(codeString);
              // 可以添加复制成功的提示
              const btn = document.activeElement as HTMLButtonElement;
              if (btn) {
                const originalText = btn.textContent;
                btn.textContent = '✓ 已复制';
                setTimeout(() => {
                  btn.textContent = originalText;
                }, 2000);
              }
            }}
            title="复制代码"
          >
            📋 复制
          </button>
        </div>
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            borderRadius: '0 0 8px 8px',
            fontSize: '14px',
            lineHeight: '1.5'
          }}
          showLineNumbers={true}
          wrapLines={true}
          {...props}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    );
  }
  
  // 没有语言标识的代码块 - 使用 div 包裹避免 HTML 嵌套错误
  return (
    <div className="code-block-plain-wrapper">
      <pre className="code-block-plain" {...props}>
        <code>{children}</code>
      </pre>
    </div>
  );
};

export default CodeBlock;