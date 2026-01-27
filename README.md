# EZ LLM 委员会

一个基于多模型协作的智能对话系统，通过三阶段流程（并行查询、匿名评审、主席综合）提供高质量的 AI 响应。

## 项目简介

EZ LLM 委员会通过协调多个大语言模型进行协作讨论，为用户提供更全面、更可靠的答案。

### 工作流程

```
用户提问 → 并行查询多个模型 → 匿名评审 → 主席综合 → 展示给用户
```

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+

### 安装步骤

1. **配置 API 密钥**

   复制配置文件模板并填入您的 API 密钥：

   ```bash
   # Windows
   copy backend\config.example.json backend\config.json
   
   # Linux/Mac
   cp backend/config.example.json backend/config.json
   ```

   然后编辑 `backend/config.json`，将所有 `your-api-key-here` 替换为您的真实 API 密钥。

   **注意**: `config.json` 文件已被添加到 `.gitignore`，不会被提交到 Git 仓库，请妥善保管您的 API 密钥。

   您也可以在启动后通过前端界面进行配置。

2. **配置 MinerU（可选）**

   MinerU 是一个文档解析服务，用于支持更多文件格式的上传和解析。

   **不配置 MinerU 的情况：**
   - ✅ 可以上传：`.txt`、`.md` 文件
   - ❌ 无法上传：PDF、Word、Excel、PPT 等其他格式

   **配置 MinerU 后：**
   - ✅ 支持上传：`.pdf`、`.docx`、`.doc`、`.pptx`、`.ppt`、`.xlsx`、`.xls`、`.txt`、`.md` 等多种格式
   - ✅ 自动解析文档内容并提取文本

   **如何配置 MinerU：**

   a. 申请 API Key：
      - 访问 [MinerU API 管理页面](https://mineru.net/apiManage/token)
      - 注册并登录账号
      - 生成 API Token
      - ⚠️ **注意**：API Key 有效期为 **14 天**，到期后需要重新申请

   b. 在 `backend/config.json` 中配置（或在前端系统设置中配置）：
      ```json
      {
        "settings": {
          "use_mineru": true,
          "mineru_api_url": "https://mineru.net/api/v4",
          "mineru_api_key": "your-mineru-api-key-here"
        }
      }
      ```

   c. 如果不使用 MinerU，设置为：
      ```json
      {
        "settings": {
          "use_mineru": false
        }
      }
      ```

3. **启动应用**

   双击运行 `start.bat` 即可自动安装依赖并启动服务。

3. **访问应用**

   - 前端界面: http://localhost:5173

## 主要功能

- **多模型支持**: 当前支持OpenAi格式的端点，后续有开发Anthropic端点的打算
- **智能协作**: 并行查询、匿名评审、主席综合、打分排名四阶段流程
- **对话管理**: 创建、保存、删除对话
- **实时交互**: 流式响应、Markdown 渲染、代码高亮
- **文件上传**: 支持多种文档格式（需配置 MinerU）
- **上下文管理**: 智能管理对话上下文，支持长对话

## 使用说明

### 基本使用

1. 选择要使用的模型（可多选）
2. 在输入框输入问题
3. 点击发送或按 `Ctrl+Enter`
4. 查看各模型回答和最终综合答案

### 文件上传

1. **不配置 MinerU**：
   - 点击上传按钮，选择 `.txt` 或 `.md` 文件
   - 系统会直接读取文本内容

2. **配置 MinerU 后**：
   - 支持上传 PDF、Word、Excel、PPT 等多种格式
   - 系统会自动解析文档内容
   - 解析后的文本会作为对话上下文

### 支持的文件格式

| 格式 | 扩展名 | 需要 MinerU |
|------|--------|-------------|
| 纯文本 | `.txt` | ❌ 不需要 |
| Markdown | `.md` | ❌ 不需要 |
| PDF | `.pdf` | ✅ 需要 |
| Word | `.docx`, `.doc` | ✅ 需要 |
| Excel | `.xlsx`, `.xls` | ✅ 需要 |
| PowerPoint | `.pptx`, `.ppt` | ✅ 需要 |

### 注意事项

- MinerU API Key 有效期为 14 天，到期后需要重新申请
- 文件上传大小限制：建议不超过 10MB
- 上传的文件会被解析为文本，作为对话的上下文信息

## 许可证

本项目采用 MIT 许可证。

---

**版本**: 1.0.0
**最后更新**: 2026-01-28