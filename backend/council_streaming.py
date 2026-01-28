"""
流式版本的 council 函数
用于实时返回 Stage 1 的进度
"""

import asyncio
import logging
import re
from typing import List, Dict, Any, Optional, AsyncGenerator
from datetime import datetime

logger = logging.getLogger(__name__)


def convert_latex_format(text: str) -> str:
    """
    转换 LaTeX 数学公式格式，使其与 Markdown/KaTeX 兼容
    
    转换规则：
    - \[ ... \] 转换为 $$ ... $$（块级公式）
    - \( ... \) 转换为 $ ... $（行内公式）
    - [ ... ] 转换为 $$ ... $$（某些模型使用的简化格式，智能检测）
    
    Args:
        text: 原始文本
    
    Returns:
        转换后的文本
    """
    if not text:
        return text
    
    # 转换 \[ ... \] 为 $$ ... $$
    text = re.sub(r'\\\[(.*?)\\\]', r'$$\1$$', text, flags=re.DOTALL)
    
    # 转换 \( ... \) 为 $ ... $
    text = re.sub(r'\\\((.*?)\\\)', r'$\1$', text, flags=re.DOTALL)
    
    # 常见的 LaTeX 数学命令和符号
    math_indicators = [
        r'\\boxed', r'\\frac', r'\\sqrt', r'\\sum', r'\\int', r'\\prod',
        r'\\lim', r'\\exp', r'\\log', r'\\sin', r'\\cos', r'\\tan',
        r'\\alpha', r'\\beta', r'\\gamma', r'\\delta', r'\\epsilon',
        r'\\theta', r'\\lambda', r'\\mu', r'\\pi', r'\\sigma', r'\\omega',
        r'\\le', r'\\ge', r'\\leq', r'\\geq', r'\\ne', r'\\approx',
        r'\\in', r'\\notin', r'\\subset', r'\\supset', r'\\to', r'\\rightarrow',
        r'\\left', r'\\right', r'\\bigl', r'\\bigr', r'\\Bigl', r'\\Bigr',
        r'\\tag', r'\\qquad', r'\\quad', r'\\forall', r'\\exists',
        r'\\mathbb', r'\\mathcal', r'\\mathrm',
        r'\^', r'_'
    ]
    
    def is_likely_math(content: str) -> bool:
        """检查内容是否可能是数学公式"""
        if len(content.strip()) < 3:
            return False
        for indicator in math_indicators:
            if re.search(indicator, content):
                return True
        math_ops = ['+', '-', '*', '/', '=', '<', '>', '|']
        op_count = sum(1 for op in math_ops if op in content)
        if op_count >= 2:
            return True
        return False
    
    def replace_bracket_formula(match):
        full_match = match.group(0)
        content = match.group(1)
        if is_likely_math(content):
            return f'$${content}$$'
        return full_match
    
    converted_count = 0
    def replace_and_count(match):
        nonlocal converted_count
        result = replace_bracket_formula(match)
        if result != match.group(0):
            converted_count += 1
            logger.info(f"转换公式 #{converted_count}: [{match.group(1)[:50]}...]")
        return result
    
    text = re.sub(
        r'(?<!`)\[\s*(.*?)\s*\](?!\()',
        replace_and_count,
        text,
        flags=re.DOTALL
    )
    
    if converted_count > 0:
        logger.info(f"LaTeX 格式转换: 共转换 {converted_count} 个公式")
    
    return text


async def collect_responses_with_progress(
    query: str,
    context: str,
    attachments: Optional[List[Dict[str, Any]]],
    models: List[str],
    model_configs: Dict[str, Any],
    temperature: float = 0.7,
    timeout: int = 120,
    max_retries: int = 3,
    max_concurrent: int = 10
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Stage 1: 并行查询选定的模型 - 生成器版本，实时返回进度
    
    Args:
        query: 用户问题
        context: 历史对话上下文
        attachments: 附件列表
        models: 参会模型名称列表
        model_configs: 模型配置字典
        max_concurrent: 最大并发数
    
    Yields:
        每个模型的响应结果(Stage1Result)或重试进度
    """
    logger.info(f"Stage 1: 开始收集 {len(models)} 个模型的响应")
    
    # 构建提示词
    prompt_parts = []
    
    prompt_parts.append("你是一个专业的AI助手。请根据以下信息回答用户的问题。")
    
    prompt_parts.append("\n" + "="*60)
    prompt_parts.append("⚠️ 关键警告：Mermaid 流程图中绝对禁止使用任何数学符号！")
    prompt_parts.append("="*60)
    prompt_parts.append("")
    prompt_parts.append("如果你在 Mermaid 流程图的节点中使用了以下任何内容，流程图将无法渲染：")
    prompt_parts.append("  • $...$ 或 $$...$$ 包裹")
    prompt_parts.append("  • 数学符号：= + - * / ^ | < > ≤ ≥")
    prompt_parts.append("  • 括号：( ) { } [ ]")
    prompt_parts.append("  • 任何标点符号")
    prompt_parts.append("")
    prompt_parts.append("正确做法：在 Mermaid 中只用纯文字描述，数学公式写在流程图外面！")
    prompt_parts.append("="*60)
    prompt_parts.append("")
    prompt_parts.append("\n【数学公式格式规范 - 必须严格遵守】")
    prompt_parts.append("在回答中使用数学公式时，必须使用以下标准格式：")
    prompt_parts.append("")
    prompt_parts.append("✅ 正确格式：")
    prompt_parts.append("  • 行内公式：$f(x) = x^2$")
    prompt_parts.append("  • 块级公式（独立成行）：")
    prompt_parts.append("    $$")
    prompt_parts.append("    f(x) = \\int_{0}^{\\infty} e^{-x^2} dx")
    prompt_parts.append("    $$")
    prompt_parts.append("")
    prompt_parts.append("❌ 错误格式（禁止使用）：")
    prompt_parts.append("  • 不要使用 \\[...\\] 格式")
    prompt_parts.append("  • 不要使用 \\(...\\) 格式")
    prompt_parts.append("  • 不要使用 [...] 格式")
    prompt_parts.append("  • 不要使用 (f) 这种括号表示变量")
    prompt_parts.append("")
    prompt_parts.append("示例对比：")
    prompt_parts.append("  ❌ 错误：设 (f) 为整函数，满足 [|f(z)| \\le e^{|z|^{3/2}}]")
    prompt_parts.append("  ✅ 正确：设 $f$ 为整函数，满足 $$|f(z)| \\le e^{|z|^{3/2}}$$")
    prompt_parts.append("")
    prompt_parts.append("支持的 LaTeX 命令：\\frac、\\sqrt、\\sum、\\int、\\prod、\\lim、\\sin、\\cos、\\exp、\\log、\\alpha、\\beta、\\pi、\\theta、\\le、\\ge、\\in、\\to 等")
    prompt_parts.append("")
    prompt_parts.append("\n【其他富文本格式】")
    prompt_parts.append("1. **表格**：使用 Markdown 表格语法 (| 列1 | 列2 |)")
    prompt_parts.append("   - 表格中的数学公式必须使用行内格式 $...$")
    prompt_parts.append("   - 如果公式包含竖线 |（绝对值），必须转义为 \\| 或使用 \\vert")
    prompt_parts.append("   - 示例：$\\vert x \\vert$ 或 $\\|x\\|$")
    prompt_parts.append("2. **代码块**：使用 ```语言名 代码 ``` 格式，支持语法高亮（如 ```python, ```javascript 等）")
    prompt_parts.append("3. **流程图 Mermaid**：使用 ```mermaid 图表代码 ``` 格式")
    prompt_parts.append("   支持的图表类型：flowchart、sequenceDiagram、classDiagram、stateDiagram、erDiagram、gantt 等")
    prompt_parts.append("   ")
    prompt_parts.append("   【Mermaid 语法规范 - 必须严格遵守】：")
    prompt_parts.append("   ")
    prompt_parts.append("   ⚠️ 重要警告：Mermaid 流程图不支持数学公式和特殊符号！")
    prompt_parts.append("   ")
    prompt_parts.append("   a) 节点文本规范：")
    prompt_parts.append("      - 使用方括号 [] 包裹节点文本，如：A[开始]")
    prompt_parts.append("      - 节点文本必须简短（建议不超过15个字符）")
    prompt_parts.append("      - 只能使用：汉字、英文字母、数字、空格")
    prompt_parts.append("      ")
    prompt_parts.append("   b) 严格禁止的内容：")
    prompt_parts.append("      ❌ 不能使用 $...$ 或 $$...$$ 包裹文本")
    prompt_parts.append("      ❌ 不能使用数学符号：| = < > ≤ ≥ ∈ ∀ π ^ 等")
    prompt_parts.append("      ❌ 不能使用括号：( ) { } [ ]")
    prompt_parts.append("      ❌ 不能使用标点符号：: ; , . ! ?")
    prompt_parts.append("      ❌ 不能使用特殊字符：& \" ' * # @ 等")
    prompt_parts.append("      ")
    prompt_parts.append("   c) 错误示例（禁止）：")
    prompt_parts.append("      ❌ A$$选取因子 Φ_m$$ → 包含 $$")
    prompt_parts.append("      ❌ B[g(n)=0] → 包含括号和等号")
    prompt_parts.append("      ❌ C[|f(z)|≤exp] → 包含竖线和数学符号")
    prompt_parts.append("      ❌ D[设定目标 (★)] → 包含括号和特殊符号")
    prompt_parts.append("      ")
    prompt_parts.append("   d) 正确示例：")
    prompt_parts.append("      ✅ A[选取衰减因子]")
    prompt_parts.append("      ✅ B[构造差函数]")
    prompt_parts.append("      ✅ C[检查增长条件]")
    prompt_parts.append("      ✅ D[设定目标]")
    prompt_parts.append("      ")
    prompt_parts.append("   e) 如需表达数学内容：")
    prompt_parts.append("      - 在流程图中用简短文字描述")
    prompt_parts.append("      - 详细的数学公式写在流程图外面")
    prompt_parts.append("   ")
    prompt_parts.append("   b) 连接线文本规范：")
    prompt_parts.append("      - 使用竖线包裹，如：A -->|是| B")
    prompt_parts.append("      - 文本必须极简（建议不超过5个字符）")
    prompt_parts.append("      - 避免使用任何标点符号")
    prompt_parts.append("   ")
    prompt_parts.append("   c) 决策节点规范：")
    prompt_parts.append("      - 使用花括号，如：B{是否通过}")
    prompt_parts.append("      - 问题描述要简短明确")
    prompt_parts.append("   ")
    prompt_parts.append("   d) 正确示例：")
    prompt_parts.append("      ```mermaid")
    prompt_parts.append("      flowchart TD")
    prompt_parts.append("          A[收到告警] --> B{包含关键词}")
    prompt_parts.append("          B -->|端口告警| C[端口流量告警]")
    prompt_parts.append("          B -->|NQA| D[NQA告警]")
    prompt_parts.append("          C --> E[提取端口描述]")
    prompt_parts.append("          E --> F[反查专线号]")
    prompt_parts.append("      ```")
    prompt_parts.append("   ")
    prompt_parts.append("   e) 错误示例（禁止）：")
    prompt_parts.append("      - B{告警内容是否包含\"端口\"?}  ❌ 包含引号")
    prompt_parts.append("      - C[提取\"端口描述:xxxx\"]  ❌ 包含冒号和引号")
    prompt_parts.append("      - D -->|是: 匹配成功| E  ❌ 包含冒号")
    prompt_parts.append("   ")
    prompt_parts.append("5. **其他 Markdown**：支持标题、列表、引用、粗体、斜体、链接等标准 Markdown 语法")
    prompt_parts.append("\n请充分利用这些格式来提供更清晰、更专业的回答。")
    
    # 添加历史对话上下文
    if context:
        prompt_parts.append(f"\n历史对话:\n{context}")
    
    # 添加附件内容
    if attachments:
        prompt_parts.append("\n附件内容:")
        for i, att in enumerate(attachments, 1):
            name = att.get("name", f"附件{i}")
            content = att.get("content", "")
            prompt_parts.append(f"\n[{name}]\n{content}")
    
    prompt_parts.append(f"\n用户问题: {query}")
    prompt_parts.append("\n请提供详细、准确的回答。")
    
    prompt = "\n".join(prompt_parts)
    
    # 构建消息列表
    messages = [{"role": "user", "content": prompt}]
    
    # 获取模型配置
    selected_configs = []
    for model_name in models:
        config = model_configs.get(model_name)
        if config:
            selected_configs.append(config)
        else:
            logger.warning(f"模型 {model_name} 配置不存在")
    
    if not selected_configs:
        logger.error("没有有效的模型配置")
        return
    
    # 创建一个队列用于在任务间传递重试进度
    progress_queue = asyncio.Queue()
    
    # 并行查询模型 - 使用信号量控制并发数
    semaphore = asyncio.Semaphore(max_concurrent)
    
    # 创建共享的HTTP客户端以提高并发性能
    import httpx
    async with httpx.AsyncClient(timeout=timeout) as shared_client:
        async def query_with_semaphore(config):
            async with semaphore:
                # 使用共享客户端进行查询
                model_name = config.get("name", "unknown")
                url = config.get("url")
                api_key = config.get("api_key")
                api_type = config.get("api_type", "openai")  # 默认为 openai
                
                if not url or not api_key:
                    error_msg = f"模型 {model_name} 配置不完整"
                    logger.error(error_msg)
                    return {
                        "model": model_name,
                        "response": "",
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                        "error": error_msg
                    }
                
                # 提取实际的模型名称（去掉供应商后缀）
                # 模型名称格式为 "model_name/provider"，需要去掉最后的 "/provider"
                # 注意：model_name 本身可能包含 '/'，如 "Qwen/Qwen3-VL-30B/provider"
                # 所以我们需要去掉最后一个 '/' 及其后面的内容
                if '/' in model_name:
                    # 找到最后一个 '/' 的位置，去掉供应商部分
                    parts = model_name.rsplit('/', 1)  # 从右边分割，只分割一次
                    actual_model_name = parts[0]  # 取前面的部分作为实际模型名
                else:
                    actual_model_name = model_name
                
                # 构建请求体
                request_body = {
                    "model": actual_model_name,
                    "messages": messages,
                    "temperature": temperature
                }
                
                # 根据 API 类型设置请求头
                if api_type == "anthropic":
                    headers = {
                        "Content-Type": "application/json",
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01"
                    }
                    # Anthropic API 需要 max_tokens 参数
                    if "max_tokens" not in request_body:
                        request_body["max_tokens"] = 4096
                else:  # openai 或其他兼容 OpenAI 的 API
                    headers = {
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {api_key}"
                    }
                
                # 重试逻辑
                last_error = None
                for attempt in range(max_retries):
                    try:
                        # 如果是重试（不是第一次尝试），发送重试进度到队列
                        if attempt > 0:
                            await progress_queue.put({
                                "type": "retry",
                                "model": model_name,
                                "status": "retrying",
                                "current_retry": attempt,  # 第几次重试（1, 2, ...）
                                "max_retries": max_retries - 1  # 总共会重试几次
                            })
                        
                        logger.info(f"查询模型 {model_name} (尝试 {attempt + 1}/{max_retries})")
                        
                        response = await shared_client.post(
                            url,
                            json=request_body,
                            headers=headers
                        )
                        
                        response.raise_for_status()
                        data = response.json()
                        
                        # 根据 API 类型提取响应内容
                        content = ""
                        if api_type == "anthropic":
                            # Anthropic API 响应格式
                            if "content" in data and len(data["content"]) > 0:
                                content = data["content"][0].get("text", "")
                        else:
                            # OpenAI API 响应格式
                            if "choices" in data and len(data["choices"]) > 0:
                                choice = data["choices"][0]
                                if "message" in choice:
                                    content = choice["message"].get("content", "")
                                elif "text" in choice:
                                    content = choice.get("text", "")
                        
                        logger.info(f"模型 {model_name} 响应成功")
                        # 转换 LaTeX 公式格式
                        if content:
                            content = convert_latex_format(content)
                        return {
                            "model": model_name,
                            "response": content,
                            "timestamp": datetime.utcnow().isoformat() + "Z"
                        }
                        
                    except Exception as e:
                        last_error = str(e)
                        logger.warning(f"模型 {model_name} 查询失败 (尝试 {attempt + 1}/{max_retries}): {last_error}")
                        
                        if attempt < max_retries - 1:
                            await asyncio.sleep(1 * (2 ** attempt))
                
                # 所有重试都失败
                error_msg = f"查询失败,已重试 {max_retries} 次: {last_error}"
                logger.error(f"模型 {model_name} {error_msg}")
                return {
                    "model": model_name,
                    "response": "",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "error": error_msg
                }
        
        # 创建所有任务并立即启动
        tasks = [asyncio.create_task(query_with_semaphore(config)) for config in selected_configs]
        
        # 同时监听任务完成和重试进度
        pending_tasks = set(tasks)
        while pending_tasks:
            # 等待任何一个任务完成，同时检查进度队列
            done, pending_tasks = await asyncio.wait(
                pending_tasks,
                timeout=0.1,  # 短超时以便检查进度队列
                return_when=asyncio.FIRST_COMPLETED
            )
            
            # 先处理所有重试进度
            while not progress_queue.empty():
                try:
                    retry_info = progress_queue.get_nowait()
                    yield retry_info
                except asyncio.QueueEmpty:
                    break
            
            # 然后处理完成的任务
            for task in done:
                try:
                    result = await task
                    yield result
                except Exception as e:
                    logger.error(f"查询任务异常: {str(e)}")
                    # 找出是哪个模型的任务失败了
                    for config in selected_configs:
                        model_name = config.get("name", "unknown")
                        yield {
                            "model": model_name,
                            "response": "",
                            "timestamp": datetime.utcnow().isoformat() + "Z",
                            "error": f"查询异常: {str(e)}"
                        }
                        break
        
        # 处理剩余的重试进度
        while not progress_queue.empty():
            try:
                retry_info = progress_queue.get_nowait()
                yield retry_info
            except asyncio.QueueEmpty:
                break
    
    logger.info(f"Stage 1: 完成")