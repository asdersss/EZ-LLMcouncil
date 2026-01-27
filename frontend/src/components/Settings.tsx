import { useState, useEffect } from 'react';
import './Settings.css';

/**
 * Settings 组件属性
 */
interface SettingsProps {
  onClose: () => void;
}

/**
 * 设置数据结构
 */
interface SettingsData {
  temperature: number;
  timeout: number;
  max_retries: number;
  max_concurrent: number;
  use_mineru: boolean;
  mineru_api_url: string;
  mineru_api_key: string;
}

/**
 * Settings 组件
 * 配置模型超时、重试次数和温度
 */
function Settings({ onClose }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsData>({
    temperature: 0.7,
    timeout: 120,
    max_retries: 4,
    max_concurrent: 10,
    use_mineru: false,
    mineru_api_url: 'https://mineru.net/api/v4',
    mineru_api_key: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 加载当前设置
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings');
      if (!response.ok) {
        throw new Error('加载设置失败');
      }
      const data = await response.json();
      setSettings(data);
    } catch (err: any) {
      setError('加载设置失败: ' + err.message);
      console.error('加载设置失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 保存设置
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        throw new Error('保存设置失败');
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError('保存设置失败: ' + err.message);
      console.error('保存设置失败:', err);
    } finally {
      setSaving(false);
    }
  };

  // 重置为默认值
  const handleReset = () => {
    setSettings({
      temperature: 0.7,
      timeout: 120,
      max_retries: 4,
      max_concurrent: 10,
      use_mineru: false,
      mineru_api_url: 'https://mineru.net/api/v4',
      mineru_api_key: ''
    });
  };

  if (loading) {
    return (
      <div className="settings-overlay">
        <div className="settings-modal">
          <div className="settings-loading">
            <div className="loading-spinner"></div>
            <p>加载设置中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>⚙️ 系统设置</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          {error && (
            <div className="settings-error">
              ❌ {error}
            </div>
          )}

          {success && (
            <div className="settings-success">
              ✅ 设置保存成功！
            </div>
          )}

          {/* 温度设置 */}
          <div className="setting-item">
            <label htmlFor="temperature">
              <span className="setting-label">模型温度 (Temperature)</span>
              <span className="setting-value">{settings.temperature}</span>
            </label>
            <input
              id="temperature"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature}
              onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
            />
            <div className="setting-description">
              控制输出的随机性。值越低，输出越确定；值越高，输出越有创造性。
              <br />
              <small>推荐范围: 0.0 - 2.0，默认: 0.7</small>
            </div>
          </div>

          {/* 超时时间设置 */}
          <div className="setting-item">
            <label htmlFor="timeout">
              <span className="setting-label">超时时间 (秒)</span>
              <span className="setting-value">{settings.timeout}s</span>
            </label>
            <input
              id="timeout"
              type="range"
              min="30"
              max="300"
              step="10"
              value={settings.timeout}
              onChange={(e) => setSettings({ ...settings, timeout: parseInt(e.target.value) })}
            />
            <div className="setting-description">
              单个模型请求的最大等待时间。超时后将自动重试。
              <br />
              <small>推荐范围: 30 - 300 秒，默认: 120 秒</small>
            </div>
          </div>

          {/* 尝试次数设置 */}
          <div className="setting-item">
            <label htmlFor="max_retries">
              <span className="setting-label">总尝试次数</span>
              <span className="setting-value">{settings.max_retries} 次</span>
            </label>
            <input
              id="max_retries"
              type="range"
              min="1"
              max="100"
              step="1"
              value={settings.max_retries}
              onChange={(e) => setSettings({ ...settings, max_retries: parseInt(e.target.value) })}
            />
            <div className="setting-description">
              总尝试次数（重试次数 + 1）。设置为 1 表示不重试，只尝试一次。
              <br />
              <small>推荐范围: 1 - 100 次，默认: 4 次（首次尝试 + 3次重试）</small>
            </div>
          </div>

          {/* 并发数设置 */}
          <div className="setting-item">
            <label htmlFor="max_concurrent">
              <span className="setting-label">最大并发数</span>
              <span className="setting-value">{settings.max_concurrent}</span>
            </label>
            <input
              id="max_concurrent"
              type="range"
              min="1"
              max="100"
              step="1"
              value={settings.max_concurrent}
              onChange={(e) => setSettings({ ...settings, max_concurrent: parseInt(e.target.value) })}
            />
            <div className="setting-description">
              控制 Stage 1 和 Stage 2 的最大并发请求数。值越大，并发越高，但可能增加服务器负载。
              <br />
              <small>推荐范围: 1 - 100，默认: 10</small>
            </div>
          </div>

          {/* MinerU 配置分隔线 */}
          <div className="setting-divider">
            <span>📄 文档解析配置 (MinerU)</span>
          </div>

          {/* 启用 MinerU */}
          <div className="setting-item">
            <label htmlFor="use_mineru" className="checkbox-label">
              <div>
                <span className="setting-label">启用 MinerU 高质量解析</span>
                <div className="setting-description" style={{ marginTop: '8px' }}>
                  MinerU 提供更高质量的文档解析,支持 PDF、Word、Excel 等格式。
                  <br />
                  <small>启用后将优先使用 MinerU API 解析文档,失败时自动降级到本地解析。</small>
                </div>
              </div>
              <input
                id="use_mineru"
                type="checkbox"
                checked={settings.use_mineru}
                onChange={(e) => setSettings({ ...settings, use_mineru: e.target.checked })}
                className="checkbox-input"
              />
            </label>
          </div>

          {/* MinerU API URL */}
          {settings.use_mineru && (
            <>
              <div className="setting-item">
                <label htmlFor="mineru_api_url">
                  <span className="setting-label">MinerU API 地址</span>
                </label>
                <input
                  id="mineru_api_url"
                  type="text"
                  value={settings.mineru_api_url}
                  onChange={(e) => setSettings({ ...settings, mineru_api_url: e.target.value })}
                  placeholder="https://mineru.net/api/v4"
                  className="text-input"
                />
                <div className="setting-description">
                  MinerU API 的完整地址。请确保地址正确且可访问。
                  <br />
                  <small>示例: https://mineru.net/api/v4</small>
                </div>
              </div>

              {/* MinerU API Key */}
              <div className="setting-item">
                <label htmlFor="mineru_api_key">
                  <span className="setting-label">MinerU API 密钥</span>
                </label>
                <input
                  id="mineru_api_key"
                  type="password"
                  value={settings.mineru_api_key}
                  onChange={(e) => setSettings({ ...settings, mineru_api_key: e.target.value })}
                  placeholder="输入您的 API 密钥"
                  className="text-input"
                />
                <div className="setting-description">
                  用于访问 MinerU API 的密钥。如果不需要密钥,可以留空。
                  <br />
                  <small>密钥将安全存储,不会在界面中显示。</small>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="settings-footer">
          <button className="btn-secondary" onClick={handleReset}>
            重置默认值
          </button>
          <div className="footer-actions">
            <button className="btn-secondary" onClick={onClose}>
              取消
            </button>
            <button 
              className="btn-primary" 
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;