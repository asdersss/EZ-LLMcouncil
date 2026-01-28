# 供应商管理功能使用指南

## 功能概述

供应商管理功能允许您：
1. 添加和管理多个AI供应商（OpenAI、Anthropic等）
2. 从供应商获取可用模型列表
3. 测试模型是否正常工作
4. 将供应商的模型添加到本地配置中

## 使用步骤

### 1. 打开供应商管理器

在主界面左侧边栏顶部，点击 🏢 图标打开供应商管理器。

### 2. 添加供应商

1. 点击"➕ 添加供应商"按钮
2. 填写以下信息：
   - **供应商名称**：例如 "OpenAI"、"DeepSeek" 等
   - **API类型**：选择 OpenAI 或 Anthropic
   - **API URL**：供应商的API地址
     - OpenAI兼容：`https://api.openai.com/v1/chat/completions`
     - DeepSeek：`https://api.deepseek.com/v1/chat/completions`
     - Anthropic：`https://api.anthropic.com/v1/messages`
   - **API Key**：您的API密钥
3. 点击"添加"按钮

### 3. 查看供应商模型

1. 在左侧供应商列表中点击一个供应商
2. 右侧会显示该供应商的所有可用模型

### 4. 测试模型

1. 在模型列表中找到要测试的模型
2. 点击"🧪 测试"按钮
3. 系统会发送"hello"消息测试模型
4. 测试结果会显示为：
   - ✓ 绿色对号：模型正常工作
   - ⚠ 黄色三角：有警告（鼠标悬停查看详情）
   - ✗ 红色叉号：模型不可用（鼠标悬停查看错误信息）

### 5. 添加模型到本地

1. 测试模型正常后，点击"➕ 添加"按钮
2. 输入模型的显示名称（例如："GPT-4"）
3. 输入模型描述（可选）
4. 点击确定，模型会被添加到本地配置中
5. 刷新后即可在模型选择器中看到新添加的模型

### 6. 删除供应商

1. 在供应商列表中找到要删除的供应商
2. 点击 🗑️ 图标
3. 确认删除

## 支持的API类型

### OpenAI 兼容 API
- 支持标准的 OpenAI API 格式
- 可以获取模型列表（通过 `/v1/models` 端点）
- 适用于：OpenAI、DeepSeek、智谱AI等

### Anthropic API
- 支持 Anthropic Claude API
- 使用预定义的模型列表
- 包含：Claude 3.5 Sonnet、Claude 3.5 Haiku、Claude 3 Opus等

## 配置文件

供应商配置保存在 `backend/providers.json` 文件中，该文件已添加到 `.gitignore`，不会提交到版本控制系统。

示例配置：
```json
{
  "providers": [
    {
      "name": "OpenAI",
      "url": "https://api.openai.com/v1/chat/completions",
      "api_key": "sk-xxx",
      "api_type": "openai",
      "created_at": "2026-01-28T02:00:00Z"
    }
  ]
}
```

## 注意事项

1. **API密钥安全**：API密钥会被加密存储，不会在界面中明文显示
2. **模型测试**：测试功能会消耗少量API配额（发送一条"hello"消息）
3. **供应商分类**：添加到本地的模型会自动按供应商分类
4. **自动初始化**：首次运行时，`start.bat` 会自动创建 `providers.json` 文件

## 故障排除

### 无法获取模型列表
- 检查API URL是否正确
- 确认API密钥有效
- 检查网络连接

### 模型测试失败
- 确认API密钥有足够的配额
- 检查模型名称是否正确
- 查看错误信息了解具体原因

### 添加的模型不显示
- 点击模型选择器中的"刷新模型列表"按钮
- 检查 `backend/config.json` 文件是否正确更新