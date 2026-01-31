# 导出功能说明

## 📄 Markdown导出

### Mermaid图表说明

导出的Markdown文件中包含Mermaid代码块（用于绘制流程图、时序图等），这是**正常现象**。

#### 为什么Mermaid图表不能直接显示？

Markdown本身是纯文本格式，不支持动态渲染Mermaid图表。Mermaid需要JavaScript引擎来解析和渲染。

#### 如何查看Mermaid图表？

您可以使用以下任一工具打开导出的MD文件：

**推荐工具：**

1. **Typora** (推荐) ⭐
   - 官网：https://typora.io/
   - 原生支持Mermaid渲染
   - 所见即所得编辑器

2. **VS Code** + Markdown Preview Mermaid Support插件
   - 安装插件：在VS Code中搜索 "Markdown Preview Mermaid Support"
   - 打开MD文件后按 `Ctrl+Shift+V` 预览

3. **在线Markdown编辑器**
   - StackEdit: https://stackedit.io/
   - Dillinger: https://dillinger.io/
   - 直接粘贴内容即可预览

4. **GitHub/GitLab**
   - 将MD文件上传到GitHub或GitLab
   - 这些平台原生支持Mermaid渲染

#### Mermaid代码示例

导出的MD文件中，Mermaid图表格式如下：

```markdown
\`\`\`mermaid
flowchart TD
    A[开始] --> B{判断}
    B -->|是| C[执行]
    B -->|否| D[结束]
\`\`\`
```

在支持Mermaid的编辑器中，这段代码会自动渲染为流程图。

## 🖼️ 图片导出（PNG/JPG）

### 颜色优化

截图导出已优化为**白色背景 + 深色文字**，确保：
- ✅ 文字清晰可读
- ✅ 高对比度
- ✅ 适合打印和分享

### 特点

- **高分辨率**：2倍缩放，确保清晰度
- **完整内容**：包含所有可见元素
- **即时可用**：无需额外处理

## 💡 使用建议

1. **需要编辑内容** → 导出MD格式
2. **需要分享/演示** → 导出PNG/JPG格式
3. **需要查看图表** → 使用支持Mermaid的编辑器打开MD文件

## 🔧 技术说明

- Markdown导出：纯文本格式，保留所有格式标记
- PNG导出：使用html2canvas库，2x分辨率
- JPG导出：使用html2canvas库，95%质量压缩
- 文件命名：自动添加时间戳，避免覆盖

## ❓ 常见问题

**Q: 为什么导出的MD文件中Mermaid图表显示为代码？**
A: 这是正常的。Markdown本身不支持渲染Mermaid，需要使用支持Mermaid的编辑器（如Typora、VS Code等）。

**Q: 可以导出为PDF吗？**
A: 目前不支持直接导出PDF。您可以：
   1. 先导出为MD，用Typora打开后导出为PDF
   2. 或导出为PNG/JPG后转换为PDF

**Q: 导出的图片能否保持深色主题？**
A: 为了确保可读性和打印效果，图片导出统一使用白色背景和深色文字。如需深色主题，建议直接截图。

**Q: 导出的文件保存在哪里？**
A: 文件保存在浏览器的默认下载目录（通常是"下载"文件夹）。