# 配置文件说明

## 配置文件安全

本项目已经配置好了 Git 忽略规则，确保敏感信息不会被上传到 GitHub。

### 被忽略的文件和目录

以下文件和目录已被添加到 `.gitignore`，不会被提交到 Git 仓库：

1. **`backend/config.json`** - 包含 API 密钥的实际配置文件
2. **`backend/data/conversations/*.json`** - 用户对话记录
3. **`backend/backend/uploads/*`** - 用户上传的文件
4. **`backend/__pycache__/`** - Python 缓存文件
5. **`backend/venv/`** - Python 虚拟环境
6. **`frontend/node_modules/`** - Node.js 依赖包

### 保留的文件

以下文件会被提交到 Git 仓库：

1. **`backend/config.example.json`** - 配置文件模板（不包含真实 API 密钥）
2. **`backend/data/conversations/.gitkeep`** - 保持对话目录结构
3. **`backend/backend/uploads/.gitkeep`** - 保持上传目录结构

## 首次配置

### 自动配置（推荐）

直接运行 `start.bat`，脚本会自动检测并创建配置文件：

```bash
start.bat
```

启动脚本会：
1. 检查 `backend/config.json` 是否存在
2. 如果不存在，自动从 `backend/config.example.json` 复制
3. 提示您编辑配置文件填入 API 密钥

### 手动配置

如果您想手动配置，请按以下步骤操作：

#### Windows

```bash
copy backend\config.example.json backend\config.json
```

#### Linux/Mac

```bash
cp backend/config.example.json backend/config.json
```

然后编辑 `backend/config.json`，将所有 `your-api-key-here` 替换为您的真实 API 密钥。

## 配置文件格式

配置文件 `backend/config.json` 的格式如下：

```json
{
  "models": [
    {
      "name": "model-name",
      "display_name": "显示名称",
      "url": "https://api.example.com/v1/chat/completions",
      "api_key": "your-api-key-here"
    }
  ],
  "chairman": "model-name",
  "settings": {
    "temperature": 0.5,
    "max_concurrent": 100,
    "timeout": 200,
    "max_retries": 2,
    "context_turns": 3,
    "use_mineru": true,
    "mineru_api_url": "https://mineru.net/api/v4",
    "mineru_api_key": "your-mineru-api-key-here"
  }
}
```

### 配置项说明

- **models**: 模型列表
  - **name**: 模型标识符（用于 API 调用）
  - **display_name**: 显示名称（用于前端界面）
  - **url**: API 端点 URL
  - **api_key**: API 密钥（**请妥善保管**）

- **chairman**: 主席模型名称（用于最终综合答案）

- **settings**: 全局设置
  - **temperature**: 温度参数（0-1，控制随机性）
  - **max_concurrent**: 最大并发请求数
  - **timeout**: 请求超时时间（秒）
  - **max_retries**: 最大重试次数
  - **context_turns**: 上下文轮数
  - **use_mineru**: 是否使用 MinerU 服务（true/false）
  - **mineru_api_url**: MinerU API URL
  - **mineru_api_key**: MinerU API 密钥

## MinerU 配置详解

### 什么是 MinerU？

MinerU 是一个强大的文档解析服务，可以将各种格式的文档（PDF、Word、Excel、PPT 等）转换为文本，方便 AI 模型理解和处理。

### 是否需要配置 MinerU？

**不配置 MinerU（`use_mineru: false`）：**
- ✅ 可以上传：`.txt`、`.md` 文件
- ❌ 无法上传：PDF、Word、Excel、PPT 等其他格式
- ✅ 适合：只需要处理纯文本的场景

**配置 MinerU（`use_mineru: true`）：**
- ✅ 支持上传：`.pdf`、`.docx`、`.doc`、`.pptx`、`.ppt`、`.xlsx`、`.xls`、`.txt`、`.md` 等
- ✅ 自动解析文档内容并提取文本
- ✅ 适合：需要处理各种文档格式的场景

### 如何申请 MinerU API Key

1. **访问 MinerU 官网**
   - 打开 [https://mineru.net/apiManage/token](https://mineru.net/apiManage/token)

2. **注册并登录**
   - 如果没有账号，先注册一个账号
   - 使用邮箱或手机号登录

3. **生成 API Token**
   - 在 API 管理页面点击"生成 Token"
   - 复制生成的 API Key

4. **配置到项目中**
   - 编辑 `backend/config.json`
   - 将 API Key 填入 `mineru_api_key` 字段

### ⚠️ 重要提示

- **有效期限制**：MinerU API Key 的有效期为 **14 天**
- **到期处理**：API Key 到期后需要重新申请
- **定期检查**：建议定期检查 API Key 是否即将过期
- **备用方案**：如果 API Key 过期，系统会自动降级为只支持 `.txt` 和 `.md` 文件

### 配置示例

#### 启用 MinerU

```json
{
  "settings": {
    "temperature": 0.5,
    "max_concurrent": 100,
    "timeout": 200,
    "max_retries": 2,
    "context_turns": 3,
    "use_mineru": true,
    "mineru_api_url": "https://mineru.net/api/v4",
    "mineru_api_key": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9..."
  }
}
```

#### 禁用 MinerU

```json
{
  "settings": {
    "temperature": 0.5,
    "max_concurrent": 100,
    "timeout": 200,
    "max_retries": 2,
    "context_turns": 3,
    "use_mineru": false
  }
}
```

### 支持的文件格式

| 文件类型 | 扩展名 | 需要 MinerU | 说明 |
|---------|--------|-------------|------|
| 纯文本 | `.txt` | ❌ | 直接读取，无需解析 |
| Markdown | `.md` | ❌ | 直接读取，无需解析 |
| PDF | `.pdf` | ✅ | 需要 MinerU 解析 |
| Word | `.docx`, `.doc` | ✅ | 需要 MinerU 解析 |
| Excel | `.xlsx`, `.xls` | ✅ | 需要 MinerU 解析 |
| PowerPoint | `.pptx`, `.ppt` | ✅ | 需要 MinerU 解析 |

### 文件上传限制

- **文件大小**：建议不超过 10MB
- **并发限制**：同时上传的文件数量受 `max_concurrent` 参数限制
- **超时设置**：文件解析时间受 `timeout` 参数限制

## 安全提示

⚠️ **重要安全提示**：

1. **永远不要**将 `backend/config.json` 提交到 Git 仓库
2. **永远不要**在公开场合分享您的 API 密钥
3. 如果不小心泄露了 API 密钥，请立即在服务提供商处撤销并重新生成
4. 定期检查 `.gitignore` 文件，确保敏感文件被正确忽略

## 验证配置

在提交代码前，可以运行以下命令验证敏感文件是否被正确忽略：

```bash
git status --ignored
```

您应该看到 `backend/config.json` 在 "Ignored files" 列表中。

## 团队协作

当其他开发者克隆项目后：

1. 他们会看到 `backend/config.example.json` 模板文件
2. 运行 `start.bat` 时会自动创建 `backend/config.json`
3. 他们需要编辑 `backend/config.json` 填入自己的 API 密钥
4. 每个开发者的 `backend/config.json` 都是独立的，不会相互影响

## 故障排除

### 问题：启动时提示找不到配置文件

**解决方案**：
1. 确认 `backend/config.example.json` 存在
2. 手动复制配置文件：`copy backend\config.example.json backend\config.json`
3. 编辑 `backend/config.json` 填入 API 密钥

### 问题：API 调用失败

**解决方案**：
1. 检查 `backend/config.json` 中的 API 密钥是否正确
2. 确认 API 端点 URL 是否正确
3. 检查网络连接是否正常
4. 查看后端日志获取详细错误信息

### 问题：不小心提交了配置文件

**解决方案**：
1. 立即撤销 API 密钥
2. 从 Git 历史中删除敏感信息：
   ```bash
   git filter-branch --force --index-filter \
   "git rm --cached --ignore-unmatch backend/config.json" \
   --prune-empty --tag-name-filter cat -- --all
   ```
3. 强制推送到远程仓库：`git push origin --force --all`
4. 重新生成新的 API 密钥