/**
 * 导出工具模块
 * 支持导出Markdown和截图
 */

import html2canvas from 'html2canvas';

/**
 * 导出为Markdown文件
 */
export async function exportAsMarkdown(content: string, filename: string): Promise<void> {
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('导出Markdown失败:', error);
    throw new Error('导出Markdown失败');
  }
}

/**
 * 导出为PNG截图
 */
export async function exportAsPNG(element: HTMLElement, filename: string): Promise<void> {
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#1a1b26',  // 保持深色背景
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
      onclone: (clonedDoc) => {
        // 确保所有文字都是白色
        const clonedElement = clonedDoc.body;
        
        // 调整所有文本元素的颜色为白色
        const allElements = clonedElement.querySelectorAll('*');
        allElements.forEach((el: any) => {
          if (el.style) {
            const computedStyle = window.getComputedStyle(el);
            const originalColor = computedStyle.color;
            
            // 将深色文字改为白色
            if (originalColor.includes('rgb')) {
              const rgb = originalColor.match(/\d+/g);
              if (rgb && rgb.length >= 3) {
                const r = parseInt(rgb[0]);
                const g = parseInt(rgb[1]);
                const b = parseInt(rgb[2]);
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                
                // 如果是深色文字（亮度<180），改为白色
                if (brightness < 180) {
                  el.style.color = '#ffffff';
                }
              }
            }
          }
        });
      }
    });
    
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  } catch (error) {
    console.error('导出PNG失败:', error);
    throw new Error('导出PNG失败');
  }
}

/**
 * 导出为JPG截图
 */
export async function exportAsJPG(element: HTMLElement, filename: string): Promise<void> {
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#1a1b26',  // 保持深色背景
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
      onclone: (clonedDoc) => {
        // 确保所有文字都是白色
        const clonedElement = clonedDoc.body;
        
        // 调整所有文本元素的颜色为白色
        const allElements = clonedElement.querySelectorAll('*');
        allElements.forEach((el: any) => {
          if (el.style) {
            const computedStyle = window.getComputedStyle(el);
            const originalColor = computedStyle.color;
            
            // 将深色文字改为白色
            if (originalColor.includes('rgb')) {
              const rgb = originalColor.match(/\d+/g);
              if (rgb && rgb.length >= 3) {
                const r = parseInt(rgb[0]);
                const g = parseInt(rgb[1]);
                const b = parseInt(rgb[2]);
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                
                // 如果是深色文字（亮度<180），改为白色
                if (brightness < 180) {
                  el.style.color = '#ffffff';
                }
              }
            }
          }
        });
      }
    });
    
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    }, 'image/jpeg', 0.95);
  } catch (error) {
    console.error('导出JPG失败:', error);
    throw new Error('导出JPG失败');
  }
}

/**
 * 生成安全的文件名
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

/**
 * 格式化时间戳为文件名
 */
export function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
}