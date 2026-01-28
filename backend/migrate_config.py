"""
配置文件迁移脚本
将旧的config.json格式迁移到新的供应商管理格式
"""

import json
import os
import shutil
from datetime import datetime


def migrate_config(old_config_path: str = "backend/config.json", backup: bool = True):
    """
    迁移配置文件
    
    Args:
        old_config_path: 旧配置文件路径
        backup: 是否备份旧配置文件
    """
    print("=" * 60)
    print("配置文件迁移工具")
    print("=" * 60)
    
    # 检查配置文件是否存在
    if not os.path.exists(old_config_path):
        print(f"错误: 配置文件 {old_config_path} 不存在")
        return False
    
    # 读取旧配置
    try:
        with open(old_config_path, 'r', encoding='utf-8') as f:
            old_config = json.load(f)
        print(f"✓ 成功读取配置文件: {old_config_path}")
    except Exception as e:
        print(f"错误: 读取配置文件失败: {e}")
        return False
    
    # 检查是否已经是新格式
    if "providers" in old_config and isinstance(old_config.get("providers"), list):
        print("配置文件已经是新格式，无需迁移")
        return True
    
    # 备份旧配置
    if backup:
        backup_path = f"{old_config_path}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        try:
            shutil.copy2(old_config_path, backup_path)
            print(f"✓ 已备份旧配置文件到: {backup_path}")
        except Exception as e:
            print(f"警告: 备份配置文件失败: {e}")
    
    # 开始迁移
    print("\n开始迁移配置...")
    
    # 提取旧配置中的模型列表
    old_models = old_config.get("models", [])
    chairman = old_config.get("chairman", "")
    settings = old_config.get("settings", {})
    
    print(f"  - 找到 {len(old_models)} 个模型")
    print(f"  - 主席模型: {chairman}")
    
    # 按供应商分组模型
    providers_dict = {}
    
    for model in old_models:
        model_name = model.get("name", "")
        display_name = model.get("display_name", model_name)
        description = model.get("description", "")
        url = model.get("url", "")
        api_key = model.get("api_key", "")
        api_type = model.get("api_type", "openai")
        provider_name = model.get("provider", "")
        
        # 如果没有provider字段，尝试从URL推断
        if not provider_name:
            if "deepseek" in url.lower():
                provider_name = "DeepSeek"
            elif "openai" in url.lower():
                provider_name = "OpenAI"
            elif "anthropic" in url.lower():
                provider_name = "Anthropic"
            else:
                # 使用模型名称作为供应商名称
                provider_name = display_name.split()[0] if display_name else "Unknown"
        
        # 创建或更新供应商
        if provider_name not in providers_dict:
            providers_dict[provider_name] = {
                "name": provider_name,
                "url": url,
                "api_key": api_key,
                "api_type": api_type,
                "models": [],
                "created_at": datetime.utcnow().isoformat() + "Z"
            }
        
        # 添加模型到供应商
        providers_dict[provider_name]["models"].append({
            "name": model_name,
            "display_name": display_name,
            "description": description
        })
    
    # 转换为列表
    providers = list(providers_dict.values())
    
    print(f"  - 创建了 {len(providers)} 个供应商")
    for provider in providers:
        print(f"    * {provider['name']}: {len(provider['models'])} 个模型")
    
    # 更新主席模型名称格式
    new_chairman = chairman
    if chairman and "/" not in chairman:
        # 查找主席模型所属的供应商
        for provider in providers:
            for model in provider["models"]:
                if model["name"] == chairman:
                    new_chairman = f"{chairman}/{provider['name']}"
                    print(f"  - 更新主席模型: {chairman} -> {new_chairman}")
                    break
            if "/" in new_chairman:
                break
    
    # 构建新配置
    new_config = {
        "providers": providers,
        "chairman": new_chairman,
        "settings": settings
    }
    
    # 保存新配置
    try:
        with open(old_config_path, 'w', encoding='utf-8') as f:
            json.dump(new_config, f, ensure_ascii=False, indent=2)
        print(f"\n✓ 成功保存新配置文件: {old_config_path}")
    except Exception as e:
        print(f"\n错误: 保存配置文件失败: {e}")
        return False
    
    print("\n" + "=" * 60)
    print("迁移完成！")
    print("=" * 60)
    print("\n注意事项:")
    print("1. 请检查新配置文件中的供应商和模型是否正确")
    print("2. 如果有问题，可以从备份文件恢复")
    print("3. 重启后端服务以使用新配置")
    
    return True


if __name__ == "__main__":
    import sys
    
    # 尝试多个可能的配置文件路径
    config_paths = [
        "config.json",
        "backend/config.json",
        "../backend/config.json"
    ]
    
    config_path = None
    for path in config_paths:
        if os.path.exists(path):
            config_path = path
            break
    
    if not config_path:
        print("错误: 未找到配置文件")
        print("请确保在项目根目录或backend目录下运行此脚本")
        sys.exit(1)
    
    success = migrate_config(config_path)
    sys.exit(0 if success else 1)