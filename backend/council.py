"""
四阶段协作核心逻辑
实现 Stage 1 (并行查询)、Stage 2 (匿名打分)、Stage 3 (主席综合)、Stage 4 (打分汇总和排名)
"""

import asyncio
import logging
import re
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from llm_client import query_model, query_models_parallel
from models import Stage1Result, Stage2Result, Stage3Result, Attachment

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
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
    
    original_text = text  # 保存原始文本用于调试
    
    # 转换 \[ ... \] 为 $$ ... $$
    text = re.sub(r'\\\[(.*?)\\\]', r'$$\1$$', text, flags=re.DOTALL)
    
    # 转换 \( ... \) 为 $ ... $
    text = re.sub(r'\\\((.*?)\\\)', r'$\1$', text, flags=re.DOTALL)
    
    # 转换单独行的 [ ... ] 为 $$ ... $$（更智能的检测）
    # 常见的 LaTeX 数学命令和符号
    math_indicators = [
        # LaTeX 命令
        r'\\boxed', r'\\frac', r'\\sqrt', r'\\sum', r'\\int', r'\\prod',
        r'\\lim', r'\\exp', r'\\log', r'\\sin', r'\\cos', r'\\tan',
        r'\\alpha', r'\\beta', r'\\gamma', r'\\delta', r'\\epsilon',
        r'\\theta', r'\\lambda', r'\\mu', r'\\pi', r'\\sigma', r'\\omega',
        # 关系符号
        r'\\le', r'\\ge', r'\\leq', r'\\geq', r'\\ne', r'\\approx',
        r'\\in', r'\\notin', r'\\subset', r'\\supset', r'\\to', r'\\rightarrow',
        # 括号和修饰
        r'\\left', r'\\right', r'\\bigl', r'\\bigr', r'\\Bigl', r'\\Bigr',
        # 其他
        r'\\tag', r'\\qquad', r'\\quad', r'\\forall', r'\\exists',
        r'\\mathbb', r'\\mathcal', r'\\mathrm',
        # 上下标（简单检测）
        r'\^', r'_'
    ]
    
    def is_likely_math(content: str) -> bool:
        """检查内容是否可能是数学公式"""
        # 如果内容很短（少于3个字符），可能是引用编号，不转换
        if len(content.strip()) < 3:
            return False
        
        # 检查是否包含任何数学指示符
        for indicator in math_indicators:
            if re.search(indicator, content):
                logger.debug(f"检测到数学符号: {indicator} in [{content[:50]}...]")
                return True
        
        # 检查是否包含多个数学运算符
        math_ops = ['+', '-', '*', '/', '=', '<', '>', '|']
        op_count = sum(1 for op in math_ops if op in content)
        if op_count >= 2:
            logger.debug(f"检测到 {op_count} 个数学运算符 in [{content[:50]}...]")
            return True
        
        logger.debug(f"未检测到数学符号 in [{content[:50]}...]")
        return False
    
    # 处理 [ ... ] 格式的公式
    # 策略：匹配所有 [...]，但只转换看起来像数学公式的
    def replace_bracket_formula(match):
        full_match = match.group(0)
        content = match.group(1)  # 公式内容
        
        # 如果内容看起来像数学公式，转换它
        if is_likely_math(content):
            # 检查是否是独立成行的（前后有换行）
            # 如果是，使用块级公式 $$...$$
            # 否则使用行内公式 $...$
            return f'$${content}$$'
        return full_match
    
    # 匹配所有 [ ... ]，但要避免：
    # 1. 代码块中的（用 (?<!`) 排除）
    # 2. Markdown 链接（用 (?!\() 排除）
    converted_count = 0
    
    def replace_and_count(match):
        nonlocal converted_count
        result = replace_bracket_formula(match)
        if result != match.group(0):
            converted_count += 1
            logger.debug(f"转换公式 #{converted_count}: [{match.group(1)[:50]}...] -> $${match.group(1)[:50]}...$$")
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


def build_context(history: List[dict], max_turns: int = 3) -> str:
    """
    从历史对话中提取最近 N 轮对话并格式化为上下文字符串
    
    Args:
        history: 历史消息列表,每个元素包含 role 和 content
        max_turns: 最多提取的对话轮数
    
    Returns:
        格式化的上下文字符串
    """
    if not history:
        return ""
    
    # 提取最近的对话轮次
    recent_history = history[-max_turns * 2:] if len(history) > max_turns * 2 else history
    
    # 构建上下文
    context_parts = []
    user_msg = None
    
    for msg in recent_history:
        role = msg.get("role")
        
        if role == "user":
            user_msg = msg.get("content", "")
        elif role == "assistant" and user_msg:
            # 提取 stage3 的最终答案
            stage3 = msg.get("stage3")
            if stage3:
                assistant_msg = stage3.get("response", "")
                if assistant_msg:
                    context_parts.append(f"Q: {user_msg}\nA: {assistant_msg}")
                    user_msg = None
    
    return "\n\n".join(context_parts)


def parse_scores(score_text: str, response_labels: List[str], reviewer_label: Optional[str] = None) -> Dict[str, float]:
    """
    解析打分文本,支持多种格式
    
    支持的格式:
    - "#1: 8分, #2: 9分, #3: 7分"
    - "#1=8, #2=9, #3=7"
    - "#1: 8\n#2: 9\n#3: 7"
    - "1: 8分, 2: 9分, 3: 7分" (兼容旧格式)
    
    Args:
        score_text: 原始打分文本
        response_labels: 有效的响应标签列表 (如 ["#1", "#2", "#3"])
        reviewer_label: 评审者自己的标签(不对自己打分)
    
    Returns:
        打分字典,格式: {label: score}
    """
    if not score_text or not response_labels:
        return {}
    
    scores = {}
    valid_labels = set(response_labels)
    
    # 移除评审者自己的标签
    if reviewer_label:
        valid_labels.discard(reviewer_label)
    
    # 尝试多种解析模式
    
    # 模式 1: "#1: 8分" 或 "#1: 8"
    pattern1 = r'#?(\d+)\s*[:：]\s*(\d+(?:\.\d+)?)\s*分?'
    matches = re.findall(pattern1, score_text)
    for num, score in matches:
        label = f"#{num}"
        if label in valid_labels:
            try:
                score_val = float(score)
                if 0 <= score_val <= 10:
                    scores[label] = score_val
            except ValueError:
                continue
    
    # 模式 2: "#1=8" 或 "#1 = 8"
    if not scores:
        pattern2 = r'#?(\d+)\s*=\s*(\d+(?:\.\d+)?)'
        matches = re.findall(pattern2, score_text)
        for num, score in matches:
            label = f"#{num}"
            if label in valid_labels:
                try:
                    score_val = float(score)
                    if 0 <= score_val <= 10:
                        scores[label] = score_val
                except ValueError:
                    continue
    
    # 如果解析失败，返回空字典，让调用方处理
    if not scores:
        logger.warning(f"无法解析打分文本: {score_text[:200]}...")
        logger.warning(f"期望的标签: {valid_labels}")
    
    logger.info(f"解析打分: 找到 {len(scores)} 个有效评分")
    return scores


async def collect_responses(
    query: str,
    context: str,
    attachments: Optional[List[Dict[str, Any]]],
    models: List[str],
    model_configs: Dict[str, Any],
    temperature: float = 0.7,
    timeout: int = 120,
    max_retries: int = 3,
    max_concurrent: int = 10
) -> List[Dict[str, Any]]:
    """
    Stage 1: 并行查询选定的模型
    
    Args:
        query: 用户问题
        context: 历史对话上下文
        attachments: 附件列表
        models: 参会模型名称列表
        model_configs: 模型配置字典
        max_concurrent: 最大并发数
    
    Returns:
        Stage1Result 列表
    """
    logger.info(f"Stage 1: 开始收集 {len(models)} 个模型的响应")
    
    # 构建提示词
    prompt_parts = []
    
    prompt_parts.append("你是一个专业的AI助手。请根据以下信息回答用户的问题。")
    
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
    prompt_parts.append("2. **代码块**：使用 ```语言名 代码 ``` 格式，支持语法高亮（如 ```python, ```javascript 等）")
    prompt_parts.append("3. **流程图 Mermaid**：使用 ```mermaid 图表代码 ``` 格式")
    prompt_parts.append("2. **表格**：使用 Markdown 表格语法 (| 列1 | 列2 |)")
    prompt_parts.append("3. **代码块**：使用 ```语言名 代码 ``` 格式，支持语法高亮（如 ```python, ```javascript 等）")
    prompt_parts.append("4. **流程图 Mermaid**：使用 ```mermaid 图表代码 ``` 格式")
    prompt_parts.append("   支持的图表类型：flowchart、sequenceDiagram、classDiagram、stateDiagram、erDiagram、gantt 等")
    prompt_parts.append("   ")
    prompt_parts.append("   【Mermaid 语法规范 - 必须严格遵守】：")
    prompt_parts.append("   a) 节点文本规范：")
    prompt_parts.append("      - 使用方括号 [] 包裹节点文本，如：A[开始]")
    prompt_parts.append("      - 节点文本必须简短（建议不超过15个字符）")
    prompt_parts.append("      - 禁止使用特殊字符：& < > \" ' : ; ( ) { } [ ] 等")
    prompt_parts.append("      - 禁止使用中文标点符号（如：、。！？：；）")
    prompt_parts.append("      - 如需表达复杂内容，用简短关键词代替，详细说明写在流程图外")
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
        return []
    
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
                
                if not url or not api_key:
                    error_msg = f"模型 {model_name} 配置不完整"
                    logger.error(error_msg)
                    return {
                        "model": model_name,
                        "response": "",
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                        "error": error_msg
                    }
                
                # 构建请求体
                api_model_name = config.get("api_model_name", model_name)
                request_body = {
                    "model": api_model_name,
                    "messages": messages,
                    "temperature": temperature
                }
                
                headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}"
                }
                
                # 重试逻辑
                last_error = None
                for attempt in range(max_retries):
                    try:
                        logger.info(f"查询模型 {model_name} (尝试 {attempt + 1}/{max_retries})")
                        
                        response = await shared_client.post(
                            url,
                            json=request_body,
                            headers=headers
                        )
                        
                        response.raise_for_status()
                        data = response.json()
                        
                        # 提取响应内容
                        content = ""
                        if "choices" in data and len(data["choices"]) > 0:
                            choice = data["choices"][0]
                            if "message" in choice:
                                content = choice["message"].get("content", "")
                            elif "text" in choice:
                                content = choice.get("text", "")
                        
                        logger.info(f"模型 {model_name} 响应成功")
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
        
        # 创建所有任务并立即启动(不等待)
        tasks = [asyncio.create_task(query_with_semaphore(config)) for config in selected_configs]
        # 等待所有任务完成
        results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 处理异常结果
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            model_name = selected_configs[i].get("name", "unknown")
            logger.error(f"模型 {model_name} 查询异常: {str(result)}")
            processed_results.append({
                "model": model_name,
                "response": "",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "error": f"查询异常: {str(result)}"
            })
        else:
            processed_results.append(result)
    
    results = processed_results
    
    # 转换为 Stage1Result 格式，并转换 LaTeX 公式格式
    stage1_results = []
    for result in results:
        response = result.get("response", "")
        # 转换 LaTeX 公式格式
        if response:
            response = convert_latex_format(response)
        
        stage1_results.append({
            "model": result.get("model", "unknown"),
            "response": response,
            "timestamp": result.get("timestamp", datetime.utcnow().isoformat() + "Z"),
            "error": result.get("error")
        })
    
    logger.info(f"Stage 1: 完成,收集到 {len(stage1_results)} 个响应")
    return stage1_results


async def collect_scores_with_progress(
    query: str,
    stage1_results: List[Dict[str, Any]],
    context: str,
    models: List[str],
    model_configs: Dict[str, Any],
    temperature: float = 0.7,
    timeout: int = 120,
    max_retries: int = 3,
    max_concurrent: int = 10
):
    """
    Stage 2: 并行进行匿名打分(满分10分,不对自己打分) - 生成器版本,实时返回进度
    
    只使用 Stage 1 中成功的模型进行打分，并验证打分数量是否正确
    
    Args:
        query: 用户问题
        stage1_results: Stage 1 的响应结果
        context: 历史对话上下文
        models: 参会模型名称列表（原始选择的所有模型）
        model_configs: 模型配置字典
        max_concurrent: 最大并发数
    
    Yields:
        每个模型的打分结果(Stage2Result)，包含参与状态和原因
    """
    logger.info(f"Stage 2: 开始收集模型的匿名打分")
    
    # 过滤出有效的响应(没有错误的)
    valid_responses = [r for r in stage1_results if not r.get("error")]
    successful_models = [r.get("model") for r in valid_responses]
    
    logger.info(f"Stage 1 成功的模型: {successful_models} (共 {len(successful_models)} 个)")
    
    if len(valid_responses) < 2:
        logger.warning("Stage 2: 有效响应少于2个,跳过打分")
        # 为所有模型返回未参与评分的结果
        for model_name in models:
            yield {
                "model": model_name,
                "scores": {},
                "raw_text": "",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "participated": False,
                "skip_reason": "Stage 1 成功模型少于2个，无法进行评分",
                "error": None
            }
        return
    
    # 匿名化响应 (使用 #1, #2, #3 等标识，支持任意数量)
    labels = [f"#{i+1}" for i in range(len(valid_responses))]  # #1, #2, #3, ...
    # 创建标签到模型的映射
    label_to_model = {labels[i]: valid_responses[i].get("model") for i in range(len(valid_responses))}
    
    # 首先发送 label_to_model 映射，让前端立即知道标签对应关系
    logger.info(f"Stage 2: 发送 label_to_model 映射: {label_to_model}")
    yield {
        "type": "label_mapping",
        "label_to_model": label_to_model,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    
    anonymized_responses = []
    for i, result in enumerate(valid_responses):
        label = labels[i]
        response = result.get("response", "")
        anonymized_responses.append(f"[{label}]\n{response}")
    
    # 创建信号量控制并发
    semaphore = asyncio.Semaphore(max_concurrent)
    
    # 为每个模型构建打分任务（只为 Stage 1 成功的模型）
    async def score_with_model(model_name: str):
        """单个模型的打分任务"""
        async with semaphore:
            # 检查该模型是否在 Stage 1 中成功
            if model_name not in successful_models:
                logger.info(f"模型 {model_name} 在 Stage 1 中失败，跳过打分")
                return {
                    "model": model_name,
                    "scores": {},
                    "raw_text": "",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "participated": False,
                    "skip_reason": "该模型在 Stage 1 中执行失败",
                    "error": None
                }
            
            # 找到该模型对应的标签
            reviewer_label = None
            for label, m in label_to_model.items():
                if m == model_name:
                    reviewer_label = label
                    break
            
            # 构建打分提示词
            prompt_parts = []
            
            prompt_parts.append("你是一个公正的评审专家。请对以下回答进行打分(满分10分)。")
            prompt_parts.append(f"\n用户问题: {query}")
            
            # 添加历史对话上下文
            if context:
                prompt_parts.append(f"\n历史对话:\n{context}")
            
            prompt_parts.append("\n候选回答:")
            prompt_parts.append("\n\n".join(anonymized_responses))
            
            prompt_parts.append("\n请根据以下标准对每个回答打分(满分10分):")
            prompt_parts.append("1. 准确性 (是否正确回答问题)")
            prompt_parts.append("2. 完整性 (是否全面覆盖问题要点)")
            prompt_parts.append("3. 清晰度 (表达是否清晰易懂)")
            prompt_parts.append("4. 实用性 (是否有实际应用价值)")
            
            prompt_parts.append("\n【重要】请严格按照以下格式输出评价：")
            prompt_parts.append("```")
            prompt_parts.append("#1: 8.5分 - 回答准确且详细，逻辑清晰，但可以更简洁。")
            prompt_parts.append("#2: 9.0分 - 非常全面的回答，覆盖了所有要点，表达清晰。")
            prompt_parts.append("#3: 7.5分 - 回答基本正确，但缺少一些细节。")
            prompt_parts.append("```")
            prompt_parts.append("\n格式说明：")
            prompt_parts.append("- 每个评价独占一行")
            prompt_parts.append("- 格式：#编号: 分数 - 评价内容")
            prompt_parts.append("- 分数后必须加空格和短横线(-)，然后是评价")
            prompt_parts.append("- 评价要简短明确，一句话说明优缺点")
            
            if reviewer_label:
                prompt_parts.append(f"\n注意: 请不要对 [{reviewer_label}] 打分(这是你自己的回答)，跳过该编号。")
            
            prompt_parts.append("\n请现在开始评分：")
            
            prompt = "\n".join(prompt_parts)
            
            # 构建消息列表
            messages = [{"role": "user", "content": prompt}]
            
            # 获取模型配置
            model_config = model_configs.get(model_name)
            if not model_config:
                logger.warning(f"模型 {model_name} 配置不存在")
                return {
                    "model": model_name,
                    "scores": {},
                    "raw_text": "",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "error": "模型配置不存在"
                }
            
            # 查询模型
            result = await query_model(
                model_config,
                messages,
                temperature=temperature,
                timeout=timeout,
                max_retries=max_retries
            )
            
            # 如果查询失败，返回错误结果
            if result.get("error"):
                return {
                    "model": model_name,
                    "scores": {},
                    "raw_text": "",
                    "label_to_model": label_to_model,
                    "timestamp": result.get("timestamp", datetime.utcnow().isoformat() + "Z"),
                    "participated": False,
                    "skip_reason": f"查询失败: {result.get('error')}",
                    "error": result.get("error")
                }
            
            # 解析打分
            score_text = result.get("response", "")
            scores = parse_scores(score_text, labels, reviewer_label)
            
            # Stage 2 不再验证打分数量，只记录解析结果
            # 验证工作推迟到 Stage 4 统一处理
            actual_score_count = len(scores)
            expected_score_count = len(successful_models) - 1
            
            logger.info(
                f"模型 {model_name} 打分完成: "
                f"解析到 {actual_score_count} 个评分（期望 {expected_score_count} 个）"
            )
            
            # 返回打分结果，不管数量是否正确
            # participated 表示是否成功完成打分查询（不表示打分是否有效）
            return {
                "model": model_name,
                "scores": scores,
                "raw_text": score_text,
                "label_to_model": label_to_model,
                "timestamp": result.get("timestamp", datetime.utcnow().isoformat() + "Z"),
                "participated": True,  # 查询成功就算参与
                "expected_count": expected_score_count,  # 记录期望数量，供 Stage 4 验证
                "actual_count": actual_score_count,  # 记录实际数量
                "error": None
            }
    
    # 并行执行所有打分任务,并实时yield结果
    # 只为 Stage 1 成功的模型创建打分任务
    tasks = [asyncio.create_task(score_with_model(model_name)) for model_name in successful_models]
    
    # 使用 asyncio.as_completed 来实时获取完成的任务
    for task in asyncio.as_completed(tasks):
        try:
            result = await task
            yield result
        except Exception as e:
            logger.error(f"打分任务异常: {str(e)}")
            # 找出是哪个模型的任务失败了
            for model_name in models:
                yield {
                    "model": model_name,
                    "scores": {},
                    "raw_text": "",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "error": f"打分异常: {str(e)}"
                }
                break
    
    logger.info(f"Stage 2: 完成")


async def collect_scores(
    query: str,
    stage1_results: List[Dict[str, Any]],
    context: str,
    models: List[str],
    model_configs: Dict[str, Any],
    temperature: float = 0.7,
    timeout: int = 120,
    max_retries: int = 3,
    max_concurrent: int = 10
) -> List[Dict[str, Any]]:
    """
    Stage 2: 并行进行匿名打分(满分10分,不对自己打分) - 非生成器版本
    
    Args:
        query: 用户问题
        stage1_results: Stage 1 的响应结果
        context: 历史对话上下文
        models: 参会模型名称列表
        model_configs: 模型配置字典
        max_concurrent: 最大并发数
    
    Returns:
        Stage2Result 列表(打分制)
    """
    # 使用生成器版本收集所有结果
    results = []
    async for result in collect_scores_with_progress(
        query, stage1_results, context, models, model_configs,
        temperature, timeout, max_retries, max_concurrent
    ):
        results.append(result)
    return results


async def synthesize_final(
    query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]],
    context: str,
    chairman_model: str,
    model_configs: Dict[str, Any],
    temperature: float = 0.7,
    timeout: int = 120,
    max_retries: int = 3
) -> Dict[str, Any]:
    """
    Stage 3: 主席模型综合答案和解析
    
    Args:
        query: 用户问题
        stage1_results: Stage 1 的响应结果
        stage2_results: Stage 2 的打分结果
        context: 历史对话上下文
        chairman_model: 主席模型名称
        model_configs: 模型配置字典
    
    Returns:
        Stage3Result (包含综合答案和解析)
    """
    logger.info(f"Stage 3: 主席模型 {chairman_model} 开始综合答案和解析")
    
    # 构建综合提示词
    prompt_parts = []
    
    prompt_parts.append("你是委员会主席,需要综合所有专家的意见给出最终答案和详细解析。")
    prompt_parts.append(f"\n用户问题: {query}")
    
    # 添加历史对话上下文
    if context:
        prompt_parts.append(f"\n历史对话:\n{context}")
    
    # 添加专家回答
    prompt_parts.append("\n专家回答:")
    for i, result in enumerate(stage1_results, 1):
        model = result.get("model", "unknown")
        response = result.get("response", "")
        error = result.get("error")
        
        if error:
            prompt_parts.append(f"\n[专家 {i} - {model}] (出现错误: {error})")
        else:
            prompt_parts.append(f"\n[专家 {i} - {model}]\n{response}")
    
    # 添加打分结果
    if stage2_results:
        prompt_parts.append("\n专家打分:")
        for i, result in enumerate(stage2_results, 1):
            model = result.get("model", "unknown")
            scores = result.get("scores", {})
            error = result.get("error")
            
            if error:
                prompt_parts.append(f"\n[评审 {i} - {model}] (出现错误: {error})")
            else:
                score_str = ", ".join([f"{label}: {score}分" for label, score in scores.items()])
                prompt_parts.append(f"\n[评审 {i} - {model}] {score_str}")
    
    prompt_parts.append("\n请综合以上信息,给出一个全面、准确、清晰的最终答案,并提供详细的解析说明。")
    
    prompt = "\n".join(prompt_parts)
    
    # 构建消息列表
    messages = [{"role": "user", "content": prompt}]
    
    # 获取主席模型配置
    chairman_config = model_configs.get(chairman_model)
    if not chairman_config:
        error_msg = f"主席模型 {chairman_model} 配置不存在"
        logger.error(error_msg)
        return {
            "response": "",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "error": error_msg
        }
    
    # 查询主席模型
    result = await query_model(
        chairman_config,
        messages,
        temperature=temperature,
        timeout=timeout,
        max_retries=max_retries
    )
    
    # 转换为 Stage3Result 格式，并转换 LaTeX 公式格式
    response = result.get("response", "")
    if response:
        response = convert_latex_format(response)
    
    stage3_result = {
        "response": response,
        "timestamp": result.get("timestamp", datetime.utcnow().isoformat() + "Z"),
        "error": result.get("error")
    }
    
    logger.info("Stage 3: 完成")
    return stage3_result


async def calculate_final_ranking(
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Stage 4: 汇总打分结果并排名,输出最终答案
    
    在这里统一验证所有打分的有效性，只使用有效打分来计算平均分
    所有 Stage 1 成功的模型都参与排名（即使它们的打分无效）
    
    Args:
        stage1_results: Stage 1 的响应结果
        stage2_results: Stage 2 的打分结果
    
    Returns:
        Stage4Result (包含排名、最佳答案和打分有效性信息)
    """
    logger.info("Stage 4: 开始汇总打分结果并排名")
    
    # 过滤出有效的响应（Stage 1 成功的模型）
    valid_responses = [r for r in stage1_results if not r.get("error")]
    
    if not valid_responses:
        logger.error("Stage 4: 没有有效的响应")
        return {
            "rankings": [],
            "best_answer": "",
            "scoring_summary": {},
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "error": "没有有效的响应"
        }
    
    # 创建标签到响应的映射 (使用数字编号)
    labels = [f"#{i+1}" for i in range(len(valid_responses))]
    label_to_response = {labels[i]: valid_responses[i] for i in range(len(valid_responses))}
    
    # 期望的打分数量（每个模型应该给其他所有模型打分）
    expected_score_count = len(valid_responses) - 1
    
    # 验证每个模型的打分有效性
    valid_scorers = []  # 有效的评分者
    invalid_scorers = []  # 无效的评分者
    scoring_summary = {}  # 打分摘要信息
    
    for stage2_result in stage2_results:
        model_name = stage2_result.get("model", "unknown")
        scores = stage2_result.get("scores", {})
        actual_count = len(scores)
        
        # 检查是否查询失败
        if stage2_result.get("error"):
            invalid_scorers.append(model_name)
            scoring_summary[model_name] = {
                "valid": False,
                "reason": f"查询失败: {stage2_result.get('error')}",
                "expected": expected_score_count,
                "actual": 0
            }
            logger.info(f"模型 {model_name} 打分无效: 查询失败")
            continue
        
        # 检查打分数量是否正确
        if actual_count == 0:
            invalid_scorers.append(model_name)
            scoring_summary[model_name] = {
                "valid": False,
                "reason": "打分格式错误，无法解析评分内容",
                "expected": expected_score_count,
                "actual": 0
            }
            logger.info(f"模型 {model_name} 打分无效: 解析失败")
            continue
        
        if actual_count != expected_score_count:
            invalid_scorers.append(model_name)
            scoring_summary[model_name] = {
                "valid": False,
                "reason": f"打分数量不正确（期望{expected_score_count}个，实际{actual_count}个）",
                "expected": expected_score_count,
                "actual": actual_count
            }
            logger.info(f"模型 {model_name} 打分无效: 数量不正确")
            continue
        
        # 打分有效
        valid_scorers.append(model_name)
        scoring_summary[model_name] = {
            "valid": True,
            "reason": None,
            "expected": expected_score_count,
            "actual": actual_count
        }
        logger.info(f"模型 {model_name} 打分有效: {actual_count} 个评分")
    
    logger.info(f"Stage 4: 有效评分者 {len(valid_scorers)} 个，无效评分者 {len(invalid_scorers)} 个")
    
    # 汇总每个答案的得分（只使用有效的打分）
    total_scores = {label: [] for label in labels}
    
    for stage2_result in stage2_results:
        model_name = stage2_result.get("model", "unknown")
        
        # 只使用有效评分者的打分
        if model_name not in valid_scorers:
            continue
            
        scores = stage2_result.get("scores", {})
        for label, score in scores.items():
            if label in total_scores:
                total_scores[label].append(score)
    
    # 计算平均分（只除以实际收到的有效打分数量）
    avg_scores = {}
    for label, scores in total_scores.items():
        if scores:
            avg_scores[label] = sum(scores) / len(scores)
            logger.info(f"{label} 收到 {len(scores)} 个有效评分，平均分: {avg_scores[label]:.2f}")
        else:
            avg_scores[label] = 0.0
            logger.warning(f"{label} 没有收到任何有效评分")
    
    # 按平均分排序
    sorted_labels = sorted(avg_scores.keys(), key=lambda x: avg_scores[x], reverse=True)
    
    # 构建排名列表（所有 Stage 1 成功的模型都参与排名）
    # 注意：response 已经在 Stage 1 中转换过格式了，这里不需要再转换
    rankings = []
    for rank, label in enumerate(sorted_labels, 1):
        response_data = label_to_response[label]
        model_name = response_data.get("model", "unknown")
        
        # 检查该模型的打分是否有效
        scorer_info = scoring_summary.get(model_name, {})
        
        rankings.append({
            "rank": rank,
            "label": label,
            "model": model_name,
            "avg_score": round(avg_scores[label], 2),
            "score_count": len(total_scores[label]),  # 收到的有效评分数量
            "response": response_data.get("response", ""),  # 已经转换过格式
            "scorer_valid": scorer_info.get("valid", False),  # 该模型作为评分者是否有效
            "scorer_reason": scorer_info.get("reason")  # 如果无效，原因是什么
        })
    
    # 获取得分最高的答案(已经在 Stage 1 中转换过格式)
    best_answer = rankings[0]["response"] if rankings else ""
    
    logger.info(f"Stage 4: 完成,共 {len(rankings)} 个答案参与排名")
    logger.info(f"最佳答案来自: {rankings[0]['model'] if rankings else 'N/A'}")
    logger.info(f"有效评分者: {valid_scorers}")
    logger.info(f"无效评分者: {invalid_scorers}")
    
    return {
        "rankings": rankings,
        "best_answer": best_answer,
        "scoring_summary": scoring_summary,  # 添加打分摘要信息
        "valid_scorer_count": len(valid_scorers),  # 有效评分者数量
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


async def run_council(
    query: str,
    history: List[dict],
    attachments: Optional[List[Dict[str, Any]]],
    models: List[str],
    chairman: str,
    model_configs: Dict[str, Any],
    temperature: float = 0.7,
    timeout: int = 120,
    max_retries: int = 3
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    """
    完整的四阶段协作流程编排
    
    Args:
        query: 用户问题
        history: 历史消息列表
        attachments: 附件列表
        models: 参会模型名称列表
        chairman: 主席模型名称
        model_configs: 模型配置字典
        temperature: 温度参数
        timeout: 超时时间
        max_retries: 最大重试次数
    
    Returns:
        (stage1_results, stage2_results, stage3_result, stage4_result) 元组
    """
    logger.info("=" * 60)
    logger.info("开始四阶段协作流程")
    logger.info(f"用户问题: {query}")
    logger.info(f"参会模型: {models}")
    logger.info(f"主席模型: {chairman}")
    logger.info("=" * 60)
    
    # 构建上下文
    context = build_context(history, max_turns=3)
    if context:
        logger.info(f"上下文: {len(context)} 字符")
    
    # Stage 1: 并行查询
    stage1_results = await collect_responses(
        query=query,
        context=context,
        attachments=attachments,
        models=models,
        model_configs=model_configs,
        temperature=temperature,
        timeout=timeout,
        max_retries=max_retries
    )
    
    # Stage 2: 匿名打分
    stage2_results = await collect_scores(
        query=query,
        stage1_results=stage1_results,
        context=context,
        models=models,
        model_configs=model_configs,
        temperature=temperature,
        timeout=timeout,
        max_retries=max_retries
    )
    
    # Stage 3: 主席综合答案和解析
    stage3_result = await synthesize_final(
        query=query,
        stage1_results=stage1_results,
        stage2_results=stage2_results,
        context=context,
        chairman_model=chairman,
        model_configs=model_configs,
        temperature=temperature,
        timeout=timeout,
        max_retries=max_retries
    )
    
    # Stage 4: 汇总打分和排名
    stage4_result = await calculate_final_ranking(
        stage1_results=stage1_results,
        stage2_results=stage2_results
    )
    
    logger.info("=" * 60)
    logger.info("四阶段协作流程完成")
    logger.info("=" * 60)
    
    return stage1_results, stage2_results, stage3_result, stage4_result