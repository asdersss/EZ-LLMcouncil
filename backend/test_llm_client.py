"""
LLM 客户端测试脚本
用于验证 llm_client.py 的功能
"""

import asyncio
import json
from llm_client import query_model, query_models_parallel


async def test_single_query():
    """测试单个模型查询"""
    print("=" * 50)
    print("测试 1: 单个模型查询")
    print("=" * 50)
    
    # 加载配置
    with open("config.json", "r", encoding="utf-8") as f:
        config = json.load(f)
    
    # 获取第一个模型配置
    model_config = config["models"][0]
    
    # 构建测试消息
    messages = [
        {"role": "user", "content": "你好,请用一句话介绍你自己。"}
    ]
    
    print(f"\n查询模型: {model_config['name']}")
    print(f"问题: {messages[0]['content']}")
    print("\n等待响应...\n")
    
    # 查询模型
    result = await query_model(model_config, messages)
    
    # 显示结果
    print(f"模型: {result['model']}")
    print(f"时间戳: {result['timestamp']}")
    if "error" in result:
        print(f"错误: {result['error']}")
    else:
        print(f"响应: {result['response']}")
    
    return result


async def test_parallel_query():
    """测试并行查询多个模型"""
    print("\n" + "=" * 50)
    print("测试 2: 并行查询多个模型")
    print("=" * 50)
    
    # 加载配置
    with open("config.json", "r", encoding="utf-8") as f:
        config = json.load(f)
    
    # 获取所有模型配置
    model_configs = config["models"]
    
    # 构建测试消息
    messages = [
        {"role": "user", "content": "什么是人工智能?请用一句话回答。"}
    ]
    
    print(f"\n并行查询 {len(model_configs)} 个模型")
    print(f"问题: {messages[0]['content']}")
    print("\n等待响应...\n")
    
    # 并行查询
    results = await query_models_parallel(model_configs, messages)
    
    # 显示结果
    for i, result in enumerate(results, 1):
        print(f"\n--- 模型 {i}: {result['model']} ---")
        print(f"时间戳: {result['timestamp']}")
        if "error" in result:
            print(f"错误: {result['error']}")
        else:
            print(f"响应: {result['response']}")
    
    return results


async def main():
    """主测试函数"""
    print("\n" + "=" * 50)
    print("LLM 客户端功能测试")
    print("=" * 50)
    print("\n注意: 请确保 config.json 中已配置有效的 API 密钥")
    print("如果 API 密钥无效,测试将失败\n")
    
    try:
        # 测试 1: 单个模型查询
        await test_single_query()
        
        # 等待一下
        await asyncio.sleep(2)
        
        # 测试 2: 并行查询
        await test_parallel_query()
        
        print("\n" + "=" * 50)
        print("测试完成!")
        print("=" * 50)
        
    except FileNotFoundError:
        print("\n错误: 找不到 config.json 文件")
        print("请确保在 backend 目录下运行此脚本")
    except json.JSONDecodeError:
        print("\n错误: config.json 格式不正确")
    except Exception as e:
        print(f"\n发生错误: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())