"""
API 端点测试脚本
测试所有 5 个 API 端点的功能
"""

import requests
import json
import time
from typing import Dict, Any

# API 基础 URL
BASE_URL = "http://localhost:8007"


def print_section(title: str):
    """打印分节标题"""
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)


def print_result(success: bool, message: str):
    """打印测试结果"""
    status = "✅ 成功" if success else "❌ 失败"
    print(f"{status}: {message}")


def test_root():
    """测试根路径"""
    print_section("测试 1: GET / - 根路径")
    
    try:
        response = requests.get(f"{BASE_URL}/")
        
        if response.status_code == 200:
            data = response.json()
            print_result(True, f"根路径响应正常")
            print(f"响应数据: {json.dumps(data, ensure_ascii=False, indent=2)}")
            return True
        else:
            print_result(False, f"状态码: {response.status_code}")
            return False
            
    except Exception as e:
        print_result(False, f"请求失败: {e}")
        return False


def test_get_models():
    """测试获取模型列表"""
    print_section("测试 2: GET /api/models - 获取模型列表")
    
    try:
        response = requests.get(f"{BASE_URL}/api/models")
        
        if response.status_code == 200:
            data = response.json()
            models = data.get("models", [])
            chairman = data.get("chairman", "")
            
            print_result(True, f"获取到 {len(models)} 个模型")
            print(f"主席模型: {chairman}")
            
            for model in models:
                print(f"  - {model['name']}: {model['display_name']}")
            
            return True, models
        else:
            print_result(False, f"状态码: {response.status_code}")
            return False, []
            
    except Exception as e:
        print_result(False, f"请求失败: {e}")
        return False, []


def test_chat_stream(models: list):
    """测试聊天流式接口"""
    print_section("测试 3: POST /api/chat - 发送消息 (SSE 流式)")
    
    if not models:
        print_result(False, "没有可用的模型")
        return False, None
    
    # 选择前两个模型进行测试
    selected_models = [m["name"] for m in models[:2]]
    
    try:
        payload = {
            "content": "什么是人工智能?请简要回答。",
            "models": selected_models
        }
        
        print(f"发送请求: {json.dumps(payload, ensure_ascii=False)}")
        
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json=payload,
            stream=True,
            timeout=180
        )
        
        if response.status_code != 200:
            print_result(False, f"状态码: {response.status_code}")
            return False, None
        
        print_result(True, "开始接收 SSE 事件流...")
        
        conv_id = None
        events_received = []
        
        # 处理 SSE 事件流
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                
                # 解析事件类型
                if line.startswith('event: '):
                    event_type = line[7:].strip()
                    events_received.append(event_type)
                    print(f"\n📡 事件: {event_type}")
                
                # 解析数据
                elif line.startswith('data: '):
                    try:
                        data = json.loads(line[6:])
                        
                        # 提取对话 ID
                        if 'conv_id' in data:
                            conv_id = data['conv_id']
                        
                        # 打印关键信息
                        if 'message' in data:
                            print(f"   消息: {data['message']}")
                        elif 'model' in data:
                            print(f"   模型: {data['model']}")
                        elif 'response' in data and len(data['response']) < 100:
                            print(f"   响应: {data['response'][:100]}...")
                        elif 'error' in data:
                            print(f"   ⚠️ 错误: {data['error']}")
                            
                    except json.JSONDecodeError:
                        pass
        
        print(f"\n接收到的事件: {', '.join(events_received)}")
        
        # 验证是否接收到所有必要的事件
        required_events = ['stage1_start', 'stage1_complete', 'stage3_complete', 'complete']
        missing_events = [e for e in required_events if e not in events_received]
        
        if missing_events:
            print_result(False, f"缺少事件: {', '.join(missing_events)}")
            return False, conv_id
        else:
            print_result(True, f"所有事件接收完成，对话 ID: {conv_id}")
            return True, conv_id
            
    except Exception as e:
        print_result(False, f"请求失败: {e}")
        return False, None


def test_get_conversations():
    """测试获取对话列表"""
    print_section("测试 4: GET /api/conversations - 获取对话列表")
    
    try:
        response = requests.get(f"{BASE_URL}/api/conversations?limit=10")
        
        if response.status_code == 200:
            data = response.json()
            conversations = data.get("conversations", [])
            total = data.get("total", 0)
            
            print_result(True, f"获取到 {len(conversations)} 个对话 (总计: {total})")
            
            for conv in conversations[:3]:  # 只显示前 3 个
                print(f"  - {conv['id'][:8]}... : {conv['title']} ({conv['message_count']} 条消息)")
            
            return True, conversations
        else:
            print_result(False, f"状态码: {response.status_code}")
            return False, []
            
    except Exception as e:
        print_result(False, f"请求失败: {e}")
        return False, []


def test_get_conversation_detail(conv_id: str):
    """测试获取对话详情"""
    print_section("测试 5: GET /api/conversations/{id} - 获取对话详情")
    
    if not conv_id:
        print_result(False, "没有可用的对话 ID")
        return False
    
    try:
        response = requests.get(f"{BASE_URL}/api/conversations/{conv_id}")
        
        if response.status_code == 200:
            data = response.json()
            messages = data.get("messages", [])
            
            print_result(True, f"获取对话详情成功")
            print(f"对话 ID: {data['id']}")
            print(f"标题: {data['title']}")
            print(f"消息数: {len(messages)}")
            
            # 显示消息概要
            for i, msg in enumerate(messages, 1):
                role = msg['role']
                if role == 'user':
                    content = msg.get('content', '')[:50]
                    print(f"  {i}. 用户: {content}...")
                else:
                    stage3 = msg.get('stage3', {})
                    response_text = stage3.get('response', '')[:50]
                    print(f"  {i}. 助手: {response_text}...")
            
            return True
        elif response.status_code == 404:
            print_result(False, "对话不存在")
            return False
        else:
            print_result(False, f"状态码: {response.status_code}")
            return False
            
    except Exception as e:
        print_result(False, f"请求失败: {e}")
        return False


def test_delete_conversation(conv_id: str):
    """测试删除对话"""
    print_section("测试 6: DELETE /api/conversations/{id} - 删除对话")
    
    if not conv_id:
        print_result(False, "没有可用的对话 ID")
        return False
    
    try:
        response = requests.delete(f"{BASE_URL}/api/conversations/{conv_id}")
        
        if response.status_code == 200:
            data = response.json()
            print_result(True, f"删除对话成功: {data.get('message', '')}")
            return True
        elif response.status_code == 404:
            print_result(False, "对话不存在")
            return False
        else:
            print_result(False, f"状态码: {response.status_code}")
            return False
            
    except Exception as e:
        print_result(False, f"请求失败: {e}")
        return False


def test_error_handling():
    """测试错误处理"""
    print_section("测试 7: 错误处理")
    
    # 测试 1: 无效的请求参数
    print("\n7.1 测试无效的请求参数")
    try:
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={"content": ""}  # 空内容
        )
        
        if response.status_code == 400:
            print_result(True, "正确返回 400 错误")
        else:
            print_result(False, f"期望 400，实际: {response.status_code}")
    except Exception as e:
        print_result(False, f"请求失败: {e}")
    
    # 测试 2: 不存在的对话
    print("\n7.2 测试不存在的对话")
    try:
        response = requests.get(f"{BASE_URL}/api/conversations/nonexistent-id")
        
        if response.status_code == 404:
            print_result(True, "正确返回 404 错误")
        else:
            print_result(False, f"期望 404，实际: {response.status_code}")
    except Exception as e:
        print_result(False, f"请求失败: {e}")
    
    # 测试 3: 无效的模型
    print("\n7.3 测试无效的模型")
    try:
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={
                "content": "测试",
                "models": ["invalid-model"]
            }
        )
        
        if response.status_code == 400:
            print_result(True, "正确返回 400 错误")
        else:
            print_result(False, f"期望 400，实际: {response.status_code}")
    except Exception as e:
        print_result(False, f"请求失败: {e}")


def main():
    """主测试函数"""
    print("\n" + "🚀" * 30)
    print("  LLM Council API 测试脚本")
    print("🚀" * 30)
    
    print(f"\n📍 测试目标: {BASE_URL}")
    print("⏰ 开始时间:", time.strftime("%Y-%m-%d %H:%M:%S"))
    
    # 检查服务是否运行
    try:
        requests.get(f"{BASE_URL}/", timeout=5)
    except Exception as e:
        print(f"\n❌ 错误: 无法连接到服务器 {BASE_URL}")
        print(f"   请确保后端服务正在运行: uvicorn main:app --reload --port 8007")
        return
    
    results = []
    
    # 测试 1: 根路径
    results.append(("根路径", test_root()))
    
    # 测试 2: 获取模型列表
    success, models = test_get_models()
    results.append(("获取模型列表", success))
    
    # 测试 3: 聊天流式接口
    success, conv_id = test_chat_stream(models)
    results.append(("聊天流式接口", success))
    
    # 等待一下确保数据保存
    time.sleep(1)
    
    # 测试 4: 获取对话列表
    success, conversations = test_get_conversations()
    results.append(("获取对话列表", success))
    
    # 测试 5: 获取对话详情
    if conv_id:
        results.append(("获取对话详情", test_get_conversation_detail(conv_id)))
    
    # 测试 6: 删除对话
    if conv_id:
        results.append(("删除对话", test_delete_conversation(conv_id)))
    
    # 测试 7: 错误处理
    test_error_handling()
    
    # 总结
    print_section("测试总结")
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    print(f"\n总计: {total} 个测试")
    print(f"通过: {passed} 个")
    print(f"失败: {total - passed} 个")
    print(f"成功率: {passed / total * 100:.1f}%")
    
    print("\n详细结果:")
    for name, success in results:
        status = "✅" if success else "❌"
        print(f"  {status} {name}")
    
    print("\n⏰ 结束时间:", time.strftime("%Y-%m-%d %H:%M:%S"))
    
    if passed == total:
        print("\n🎉 所有测试通过!")
    else:
        print(f"\n⚠️ 有 {total - passed} 个测试失败，请检查日志")


if __name__ == "__main__":
    main()