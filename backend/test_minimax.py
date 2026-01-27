"""
测试 MiniMaxAI/MiniMax-M2 模型配置
诊断 400 错误的原因
"""

import asyncio
import json
import httpx
from llm_client import query_model


async def test_minimax_config():
    """测试 MiniMax 模型配置"""
    print("=" * 60)
    print("MiniMaxAI/MiniMax-M2 配置诊断")
    print("=" * 60)
    
    # 加载配置
    with open("config.json", "r", encoding="utf-8") as f:
        config = json.load(f)
    
    # 找到 MiniMax 模型配置
    minimax_config = None
    for model in config["models"]:
        if model["name"] == "MiniMaxAI/MiniMax-M2":
            minimax_config = model
            break
    
    if not minimax_config:
        print("[错误] 未找到 MiniMaxAI/MiniMax-M2 配置")
        return
    
    print("\n[当前配置]")
    print(f"  name: {minimax_config.get('name')}")
    print(f"  url: {minimax_config.get('url')}")
    print(f"  api_key: {minimax_config.get('api_key')[:20]}...")
    print(f"  api_model_name: '{minimax_config.get('api_model_name')}'")
    
    # 检查 api_model_name
    api_model_name = minimax_config.get("api_model_name", minimax_config["name"])
    print(f"\n[检查] 实际使用的模型名: '{api_model_name}'")
    
    if not api_model_name or api_model_name.strip() == "":
        print("\n[问题诊断]")
        print("  api_model_name 为空字符串!")
        print("  这会导致请求体中 model 字段为空,引发 400 错误")
        print("\n[解决方案]")
        print("  1. 将 api_model_name 设置为实际的模型名称")
        print("  2. 或者删除 api_model_name 字段,让系统使用 name 字段")
        
        # 测试修复后的配置
        print("\n" + "=" * 60)
        print("测试修复方案")
        print("=" * 60)
        
        # 方案 1: 使用 name 作为 api_model_name
        fixed_config_1 = minimax_config.copy()
        fixed_config_1["api_model_name"] = minimax_config["name"]
        
        print("\n[方案 1] 使用 name 作为 api_model_name")
        print(f"  api_model_name: '{fixed_config_1['api_model_name']}'")
        
        messages = [{"role": "user", "content": "你好,请用一句话介绍你自己。"}]
        
        print("\n[测试] 发送测试请求...")
        result = await query_model(
            fixed_config_1,
            messages,
            temperature=0.7,
            timeout=30,
            max_retries=1
        )
        
        print("\n[结果]")
        print(f"  模型: {result['model']}")
        print(f"  时间戳: {result['timestamp']}")
        if "error" in result:
            print(f"  [失败] {result['error']}")
            
            # 如果还是失败,尝试查看详细的请求信息
            print("\n[详细诊断] 尝试直接调用 API 查看错误详情...")
            
            try:
                request_body = {
                    "model": fixed_config_1["api_model_name"],
                    "messages": messages,
                    "temperature": 0.7
                }
                
                headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {fixed_config_1['api_key']}"
                }
                
                print(f"\n  请求 URL: {fixed_config_1['url']}")
                print(f"  请求体: {json.dumps(request_body, ensure_ascii=False, indent=2)}")
                
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.post(
                        fixed_config_1["url"],
                        json=request_body,
                        headers=headers
                    )
                    
                    print(f"\n  响应状态码: {response.status_code}")
                    print(f"  响应头: {dict(response.headers)}")
                    
                    try:
                        error_data = response.json()
                        print(f"  响应体: {json.dumps(error_data, ensure_ascii=False, indent=2)}")
                    except:
                        print(f"  响应体 (文本): {response.text[:500]}")
                        
            except Exception as e:
                print(f"  详细诊断失败: {str(e)}")
        else:
            print(f"  [成功]")
            print(f"  响应: {result['response'][:200]}...")
    else:
        print("\n[正常] api_model_name 配置正常")
        
        # 测试实际请求
        print("\n[测试] 发送测试请求...")
        messages = [{"role": "user", "content": "你好,请用一句话介绍你自己。"}]
        
        result = await query_model(
            minimax_config,
            messages,
            temperature=0.7,
            timeout=30,
            max_retries=1
        )
        
        print("\n[结果]")
        print(f"  模型: {result['model']}")
        print(f"  时间戳: {result['timestamp']}")
        if "error" in result:
            print(f"  [失败] {result['error']}")
        else:
            print(f"  [成功]")
            print(f"  响应: {result['response'][:200]}...")


async def main():
    try:
        await test_minimax_config()
        print("\n" + "=" * 60)
        print("诊断完成")
        print("=" * 60)
    except FileNotFoundError:
        print("\n[错误] 找不到 config.json 文件")
        print("请确保在 backend 目录下运行此脚本")
    except Exception as e:
        print(f"\n[错误] 发生错误: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())