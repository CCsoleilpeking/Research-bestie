import { useState, useEffect, useCallback } from 'react';
import { getLLMConfig, saveLLMConfig, PROVIDER_MODELS, PROVIDER_LIST } from '../utils/llm';
import type { LLMConfig, LLMProvider } from '../types';

interface Props { open: boolean; onClose: () => void; }

export default function SettingsModal({ open, onClose }: Props) {
  const [config, setConfig] = useState<LLMConfig>(getLLMConfig());
  useEffect(() => { if (open) setConfig(getLLMConfig()); }, [open]);

  // Auto-save apiKeys whenever they change
  const autoSaveKeys = useCallback((newConfig: LLMConfig) => {
    setConfig(newConfig);
    // Persist apiKeys immediately so clearing a key is saved even without clicking "Use this model"
    const stored = getLLMConfig();
    saveLLMConfig({ ...stored, apiKeys: newConfig.apiKeys });
  }, []);

  function handleProviderChange(provider: LLMProvider) {
    const models = PROVIDER_MODELS[provider];
    const apiKeys = { ...config.apiKeys };
    // Save current provider's key before switching
    apiKeys[config.provider] = config.apiKey;
    // Load the new provider's saved key
    const newKey = apiKeys[provider] || '';
    const newConfig = { ...config, provider, model: models[0], apiKey: newKey, apiKeys };
    setConfig(newConfig);
  }

  function handleApiKeyChange(value: string) {
    // Strip non-ASCII characters to prevent header errors
    const clean = value.replace(/[^\x20-\x7E]/g, '').trim();
    const apiKeys = { ...config.apiKeys, [config.provider]: clean };
    const newConfig = { ...config, apiKey: clean, apiKeys };
    autoSaveKeys(newConfig);
  }

  function handleSave() { saveLLMConfig(config); onClose(); }
  if (!open) return null;
  const models = PROVIDER_MODELS[config.provider];

  const placeholders: Record<string, string> = {
    openai: 'sk-...',
    claude: 'sk-ant-...',
    deepseek: 'sk-...',
    kimi: 'sk-...',
    gemini: 'AIza...',
    ionet: 'io.net API key',
  };

  const helpTexts: Record<string, string> = {
    openai: 'Get your key at platform.openai.com/api-keys',
    claude: 'Get your key at console.anthropic.com/settings/keys',
    deepseek: 'Get your key at platform.deepseek.com/api_keys',
    kimi: 'Get your key at platform.moonshot.cn/console/api-keys',
    gemini: 'Get your key at aistudio.google.com/apikey',
    ionet: 'Get your key at cloud.io.net',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-dark-300 rounded-2xl shadow-2xl w-full max-w-lg mx-4 border border-dark-50/30" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-dark-50/30 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Settings</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Provider</label>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDER_LIST.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleProviderChange(key)}
                  className={`py-2 px-3 text-sm rounded-xl border transition-colors text-center ${
                    config.provider === key
                      ? 'bg-mint-400/10 border-mint-400/50 text-mint-400'
                      : 'border-dark-50/30 text-gray-500 hover:bg-dark-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">API Key</label>
            <input
              type="password"
              value={config.apiKey}
              onChange={e => handleApiKeyChange(e.target.value)}
              placeholder={placeholders[config.provider] || 'API key'}
              className="w-full border border-dark-50/30 rounded-xl px-3 py-2 text-sm bg-dark-400 text-white placeholder-gray-600 focus:ring-2 focus:ring-mint-400/30 focus:border-transparent focus:outline-none"
            />
            <p className="text-xs text-gray-600 mt-1">{helpTexts[config.provider]}</p>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Model</label>
            <select
              value={config.model}
              onChange={e => setConfig({ ...config, model: e.target.value })}
              className="w-full border border-dark-50/30 rounded-xl px-3 py-2.5 text-sm bg-dark-400 text-white focus:ring-2 focus:ring-mint-400/30 focus:border-transparent focus:outline-none"
            >
              {models.map(m => (<option key={m} value={m}>{m}</option>))}
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-dark-50/30 flex justify-end">
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-gradient-to-r from-mint-300 to-mint-600 text-dark-600 rounded-xl font-semibold hover:opacity-90">Use this model</button>
        </div>
      </div>
    </div>
  );
}
