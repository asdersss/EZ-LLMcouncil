"""
测试数据模型和存储层功能
"""

import sys
import json
from pathlib import Path

# 添加 backend 目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from models import (
    ChatRequest, Attachment, Message, Stage1Result, 
    Stage2Result, Stage3Result, Conversation, get_iso_timestamp
)
from storage import (
    save_conversation, load_conversation, list_conversations,
    delete_conversation, generate_conversation_title, ensure_data_directory
)


def test_models():
    """测试数据模型"""
    print("=" * 60)
    print("测试数据模型")
    print("=" * 60)
    
    # 测试 Attachment 模型
    print("\n1. 测试 Attachment 模型...")
    attachment = Attachment(
        name="test.txt",
        content="测试内容",
        type="text/plain"
    )
    print(f"✓ Attachment 创建成功: {attachment.name}")
    
    # 测试 ChatRequest 模型
    print("\n2. 测试 ChatRequest 模型...")
    try:
        # 正常请求
        request = ChatRequest(
            content="这是一个测试问题",
            models=["deepseek-chat", "qwen-turbo"],
            attachments=[attachment]
        )
        print(f"✓ ChatRequest 创建成功: {request.content[:20]}...")
        
        # 测试验证：空白内容
        try:
            ChatRequest(content="   ", models=["model1"])
            print("✗ 应该拒绝空白内容")
        except ValueError as e:
            print(f"✓ 正确拒绝空白内容: {e}")
        
        # 测试验证：模型列表为空
        try:
            ChatRequest(content="test", models=[])
            print("✗ 应该拒绝空模型列表")
        except ValueError as e:
            print(f"✓ 正确拒绝空模型列表: {e}")
            
    except Exception as e:
        print(f"✗ ChatRequest 测试失败: {e}")
    
    # 测试 Stage1Result 模型
    print("\n3. 测试 Stage1Result 模型...")
    stage1 = Stage1Result(
        model="deepseek-chat",
        response="这是模型的响应",
        timestamp=get_iso_timestamp()
    )
    print(f"✓ Stage1Result 创建成功: {stage1.model}")
    
    # 测试 Stage2Result 模型
    print("\n4. 测试 Stage2Result 模型...")
    stage2 = Stage2Result(
        model="deepseek-chat",
        ranking="A > B > C",
        parsed=["A", "B", "C"],
        timestamp=get_iso_timestamp()
    )
    print(f"✓ Stage2Result 创建成功: {stage2.ranking}")
    
    # 测试 Stage3Result 模型
    print("\n5. 测试 Stage3Result 模型...")
    stage3 = Stage3Result(
        response="这是最终答案",
        timestamp=get_iso_timestamp()
    )
    print(f"✓ Stage3Result 创建成功")
    
    # 测试 Message 模型
    print("\n6. 测试 Message 模型...")
    user_msg = Message(
        role="user",
        content="用户问题",
        models=["model1"],
        timestamp=get_iso_timestamp()
    )
    print(f"✓ 用户消息创建成功: {user_msg.role}")
    
    assistant_msg = Message(
        role="assistant",
        stage1=[stage1],
        stage2=[stage2],
        stage3=stage3,
        timestamp=get_iso_timestamp()
    )
    print(f"✓ 助手消息创建成功: {assistant_msg.role}")
    
    # 测试 Conversation 模型
    print("\n7. 测试 Conversation 模型...")
    conversation = Conversation(
        id="test-conv-001",
        title="测试对话",
        created_at=get_iso_timestamp(),
        updated_at=get_iso_timestamp(),
        messages=[user_msg, assistant_msg]
    )
    print(f"✓ Conversation 创建成功: {conversation.title}")
    print(f"  - ID: {conversation.id}")
    print(f"  - 消息数: {len(conversation.messages)}")
    
    return conversation


def test_storage(conversation):
    """测试存储层"""
    print("\n" + "=" * 60)
    print("测试存储层")
    print("=" * 60)
    
    conv_id = "test-conv-001"
    
    # 测试确保目录存在
    print("\n1. 测试 ensure_data_directory...")
    ensure_data_directory()
    print("✓ 数据目录创建成功")
    
    # 测试保存对话
    print("\n2. 测试 save_conversation...")
    conv_dict = conversation.model_dump()
    save_conversation(conv_id, conv_dict)
    print(f"✓ 对话保存成功: {conv_id}")
    
    # 测试加载对话
    print("\n3. 测试 load_conversation...")
    loaded = load_conversation(conv_id)
    if loaded:
        print(f"✓ 对话加载成功: {loaded['title']}")
        print(f"  - ID: {loaded['id']}")
        print(f"  - 消息数: {len(loaded['messages'])}")
    else:
        print("✗ 对话加载失败")
    
    # 测试加载不存在的对话
    print("\n4. 测试加载不存在的对话...")
    not_found = load_conversation("non-existent-id")
    if not_found is None:
        print("✓ 正确返回 None")
    else:
        print("✗ 应该返回 None")
    
    # 创建更多测试对话
    print("\n5. 创建更多测试对话...")
    for i in range(2, 4):
        test_conv = Conversation(
            id=f"test-conv-00{i}",
            title=f"测试对话 {i}",
            created_at=get_iso_timestamp(),
            updated_at=get_iso_timestamp(),
            messages=[]
        )
        save_conversation(test_conv.id, test_conv.model_dump())
        print(f"✓ 创建对话: {test_conv.id}")
    
    # 测试列出所有对话
    print("\n6. 测试 list_conversations...")
    conversations = list_conversations()
    print(f"✓ 找到 {len(conversations)} 个对话:")
    for conv in conversations:
        print(f"  - {conv['id']}: {conv['title']} (消息数: {conv['message_count']})")
    
    # 测试生成对话标题
    print("\n7. 测试 generate_conversation_title...")
    
    # 短消息
    short_msg = "这是一个短消息"
    short_title = generate_conversation_title(short_msg)
    print(f"✓ 短消息标题: '{short_title}'")
    
    # 长消息
    long_msg = "这是一个非常非常非常非常非常非常非常非常长的消息内容，应该被截断"
    long_title = generate_conversation_title(long_msg)
    print(f"✓ 长消息标题: '{long_title}'")
    if len(long_title) <= 33:  # 30 + "..."
        print("  ✓ 标题长度正确")
    else:
        print(f"  ✗ 标题过长: {len(long_title)} 字符")
    
    # 测试删除对话
    print("\n8. 测试 delete_conversation...")
    
    # 删除存在的对话
    result = delete_conversation("test-conv-002")
    if result:
        print("✓ 成功删除对话: test-conv-002")
    else:
        print("✗ 删除失败")
    
    # 删除不存在的对话
    result = delete_conversation("non-existent-id")
    if not result:
        print("✓ 正确返回 False (对话不存在)")
    else:
        print("✗ 应该返回 False")
    
    # 验证删除后的列表
    print("\n9. 验证删除后的对话列表...")
    conversations = list_conversations()
    print(f"✓ 剩余 {len(conversations)} 个对话")
    
    # 清理测试数据
    print("\n10. 清理测试数据...")
    for conv in conversations:
        delete_conversation(conv['id'])
    print("✓ 测试数据清理完成")


def test_edge_cases():
    """测试边界情况"""
    print("\n" + "=" * 60)
    print("测试边界情况")
    print("=" * 60)
    
    # 测试最小长度内容
    print("\n1. 测试最小长度内容...")
    try:
        request = ChatRequest(content="a", models=["model1"])
        print("✓ 接受 1 字符内容")
    except ValueError as e:
        print(f"✗ 拒绝 1 字符内容: {e}")
    
    # 测试最大长度内容
    print("\n2. 测试最大长度内容...")
    try:
        long_content = "a" * 10000
        request = ChatRequest(content=long_content, models=["model1"])
        print("✓ 接受 10000 字符内容")
    except ValueError as e:
        print(f"✗ 拒绝 10000 字符内容: {e}")
    
    # 测试超长内容
    print("\n3. 测试超长内容...")
    try:
        too_long = "a" * 10001
        request = ChatRequest(content=too_long, models=["model1"])
        print("✗ 应该拒绝超过 10000 字符的内容")
    except ValueError as e:
        print(f"✓ 正确拒绝超长内容")
    
    # 测试最多模型数
    print("\n4. 测试最多模型数...")
    try:
        many_models = [f"model{i}" for i in range(20)]
        request = ChatRequest(content="test", models=many_models)
        print("✓ 接受 20 个模型")
    except ValueError as e:
        print(f"✗ 拒绝 20 个模型: {e}")
    
    # 测试过多模型
    print("\n5. 测试过多模型...")
    try:
        too_many = [f"model{i}" for i in range(21)]
        request = ChatRequest(content="test", models=too_many)
        print("✗ 应该拒绝超过 20 个模型")
    except ValueError as e:
        print(f"✓ 正确拒绝过多模型")
    
    # 测试 JSON 序列化
    print("\n6. 测试 JSON 序列化...")
    try:
        conversation = Conversation(
            id="json-test",
            title="JSON 测试",
            created_at=get_iso_timestamp(),
            updated_at=get_iso_timestamp(),
            messages=[]
        )
        json_str = json.dumps(conversation.model_dump(), ensure_ascii=False)
        print("✓ JSON 序列化成功")
        
        # 反序列化
        data = json.loads(json_str)
        conv_restored = Conversation(**data)
        print("✓ JSON 反序列化成功")
    except Exception as e:
        print(f"✗ JSON 序列化/反序列化失败: {e}")


def main():
    """主测试函数"""
    print("\n" + "=" * 60)
    print("LLM 委员会 - 数据模型和存储层测试")
    print("=" * 60)
    
    try:
        # 测试数据模型
        conversation = test_models()
        
        # 测试存储层
        test_storage(conversation)
        
        # 测试边界情况
        test_edge_cases()
        
        print("\n" + "=" * 60)
        print("✓ 所有测试完成！")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())