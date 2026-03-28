import type { ChatMessage, LLMConfig, LLMProvider } from '../types';

const STORAGE_KEY = 'rb_llm_config';
const DEBUG = true;

function log(...args: unknown[]) {
  if (DEBUG) console.log('[LLM]', ...args);
}

function logError(...args: unknown[]) {
  console.error('[LLM]', ...args);
}

// --- Provider config ---
interface ProviderConfig {
  baseUrl: string;
  models: string[];
  label: string;
}

const PROVIDERS: Record<LLMProvider, ProviderConfig> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.2', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3', 'o3-mini'],
  },
  claude: {
    label: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5', 'claude-opus-4-5'],
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  kimi: {
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2.5', 'kimi-k2-0905-preview', 'kimi-k2-thinking', 'kimi-k2-thinking-turbo', 'kimi-k2-turbo-preview', 'moonshot-v1-128k'],
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
  },
  ionet: {
    label: 'io.net',
    baseUrl: 'https://api.intelligence.io.solutions/api/v1',
    models: [
      'zai-org/GLM-5', 'moonshotai/Kimi-K2.5', 'deepseek-ai/DeepSeek-V3.2',
      'deepseek-ai/DeepSeek-R1-0528', 'moonshotai/Kimi-K2-Thinking',
      'zai-org/GLM-4.7', 'zai-org/GLM-4.7-Flash',
      'meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen3-Next-80B-A3B-Instruct',
      'openai/gpt-oss-120b', 'mistralai/Mistral-Large-Instruct-2411',
    ],
  },
};

export const PROVIDER_LIST = Object.entries(PROVIDERS).map(([key, cfg]) => ({
  key: key as LLMProvider,
  label: cfg.label,
}));

export const PROVIDER_MODELS: Record<string, string[]> = Object.fromEntries(
  Object.entries(PROVIDERS).map(([k, v]) => [k, v.models])
);

export function getLLMConfig(): LLMConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const config = JSON.parse(stored);
      if (!config.provider) config.provider = 'openai';
      // Migrate old format: single apiKey → apiKeys map
      if (!config.apiKeys) {
        config.apiKeys = {};
        if (config.apiKey) {
          config.apiKeys[config.provider] = config.apiKey;
        }
      }
      // Always set apiKey from current provider's stored key
      config.apiKey = config.apiKeys[config.provider] || '';
      log('Config loaded:', { provider: config.provider, model: config.model, hasKey: !!config.apiKey });
      return config;
    }
  } catch (err) {
    logError('Failed to load config:', err);
  }
  log('Using default config');
  return { provider: 'openai', apiKey: '', apiKeys: {}, model: 'gpt-4o-mini' };
}

export function saveLLMConfig(config: LLMConfig) {
  log('Config saved:', { provider: config.provider, model: config.model, hasKey: !!config.apiKey });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export async function generateChatTitle(firstMessage: string, config: LLMConfig): Promise<string> {
  const fallback = firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '');
  const apiKey = config.apiKey?.trim();
  if (!apiKey) return fallback;
  // Validate apiKey is ASCII-safe for HTTP headers
  if (!/^[\x20-\x7E]+$/.test(apiKey)) {
    logError('API key contains non-ASCII characters, skipping title gen');
    return fallback;
  }
  try {
    log('Generating chat title for:', firstMessage.slice(0, 50));
    log('Title gen using provider:', config.provider, 'key length:', apiKey.length);
    const promptText = `Generate a short title (under 10 words) for a conversation that starts with this message. Use the same language as the message. Reply with ONLY the title, no quotes, no explanation:\n\n${firstMessage}`;

    let title: string;
    if (config.provider === 'claude') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: config.model, max_tokens: 50, messages: [{ role: 'user', content: promptText }] }),
      });
      if (!response.ok) throw new Error(`Claude title gen failed: ${response.status}`);
      const data = await response.json();
      title = data.content?.[0]?.text || fallback;
    } else {
      const provider = PROVIDERS[config.provider];
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: promptText }], max_tokens: 50 }),
      });
      if (!response.ok) throw new Error(`Title gen failed: ${response.status}`);
      const data = await response.json();
      title = data.choices?.[0]?.message?.content || fallback;
    }

    title = title.trim().replace(/^["']|["']$/g, '');
    log('Generated title:', title);
    return title || fallback;
  } catch (err) {
    logError('Title generation failed, using fallback:', err);
    return fallback;
  }
}

const SYSTEM_PROMPT = `You are ResearchBestie — a helpful, top-tier powerhouse of intelligence.`;

// Strip non-ASCII characters from API key (fixes ISO-8859-1 header errors)
function sanitizeApiKey(key: string): string {
  return key.replace(/[^\x20-\x7E]/g, '').trim();
}

const BACKEND_URL = 'http://localhost:3001';

async function sendViaBackend(messages: ChatMessage[], config: LLMConfig): Promise<string | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      logError('[Backend] Error:', err);
      return null;
    }

    const data = await response.json();
    if (data.searched) {
      log(`[Backend] Search was triggered for: "${data.query}"`);
    }
    return data.content;
  } catch (err) {
    log('[Backend] Not available, falling back to direct LLM call');
    return null;
  }
}

export async function sendChatMessage(
  messages: ChatMessage[],
  config: LLMConfig,
  onChunk?: (chunk: string) => void
): Promise<string> {
  config = { ...config, apiKey: sanitizeApiKey(config.apiKey || '') };
  if (!config.apiKey) {
    logError('No API key configured');
    throw new Error('Please configure your API key in settings.');
  }

  log(`Sending message: provider=${config.provider}, model=${config.model}, messages=${messages.length}, stream=${!!onChunk}`);
  const startTime = performance.now();

  try {
    // Try backend first (has search capability)
    if (!onChunk) {
      const backendResult = await sendViaBackend(messages, config);
      if (backendResult !== null) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        log(`[Backend] Response received in ${elapsed}s, length=${backendResult.length}`);
        return backendResult;
      }
    }

    // Fallback: direct LLM call (no search capability)
    let result: string;
    if (config.provider === 'claude') {
      result = await sendClaudeMessage(messages, config, onChunk);
    } else {
      result = await sendOpenAICompatible(config, messages, onChunk);
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    log(`Response received in ${elapsed}s, length=${result.length}`);
    return result;
  } catch (err) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    logError(`Request failed after ${elapsed}s:`, err);
    throw err;
  }
}

// --- OpenAI-compatible (OpenAI, DeepSeek, Kimi, Gemini, io.net) ---
async function sendOpenAICompatible(
  config: LLMConfig,
  messages: ChatMessage[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const provider = PROVIDERS[config.provider];
  const apiMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({ role: m.role, content: m.content }))
  ];

  const url = `${provider.baseUrl}/chat/completions`;
  const body = { model: config.model, messages: apiMessages, stream: !!onChunk };

  log(`[${provider.label}] POST ${url}`, { model: body.model, messageCount: apiMessages.length, stream: body.stream });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  log(`[${provider.label}] Response: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const err = await response.text();
    logError(`[${provider.label}] Error body:`, err);
    throw new Error(`${provider.label} Error (${response.status}): ${err}`);
  }

  if (onChunk && response.body) {
    log(`[${provider.label}] Reading stream...`);
    return readOpenAIStream(response.body, onChunk, provider.label);
  }

  const data = await response.json();
  log(`[${provider.label}] Response data:`, { finishReason: data.choices?.[0]?.finish_reason, usage: data.usage });
  return data.choices?.[0]?.message?.content || 'No response received.';
}

// --- Claude (Anthropic format) ---
async function sendClaudeMessage(
  messages: ChatMessage[],
  config: LLMConfig,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const chatMsgs = messages.map(m => ({ role: m.role, content: m.content }));

  const url = 'https://api.anthropic.com/v1/messages';
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: chatMsgs,
    stream: !!onChunk,
  };

  log(`[Claude] POST ${url}`, { model: body.model, messageCount: chatMsgs.length, stream: body.stream });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  log(`[Claude] Response: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const err = await response.text();
    logError(`[Claude] Error body:`, err);
    throw new Error(`Claude Error (${response.status}): ${err}`);
  }

  if (onChunk && response.body) {
    log('[Claude] Reading stream...');
    return readClaudeStream(response.body, onChunk);
  }

  const data = await response.json();
  log('[Claude] Response data:', { stopReason: data.stop_reason, usage: data.usage });
  return data.content?.map((c: { text: string }) => c.text).join('') || 'No response received.';
}

// --- Stream readers ---
async function readOpenAIStream(body: ReadableStream, onChunk: (chunk: string) => void, label: string = 'OpenAI'): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') {
        log(`[${label} Stream] Done after ${chunkCount} chunks, total length=${full.length}`);
        break;
      }
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          full += content;
          chunkCount++;
          onChunk(full);
        }
      } catch (err) {
        logError(`[${label} Stream] Parse error:`, err, 'raw:', data.slice(0, 100));
      }
    }
  }
  log(`[${label} Stream] Finished, total chunks=${chunkCount}, length=${full.length}`);
  return full;
}

async function readClaudeStream(body: ReadableStream, onChunk: (chunk: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'content_block_delta' && event.delta?.text) {
          full += event.delta.text;
          chunkCount++;
          onChunk(full);
        } else if (event.type === 'message_start') {
          log('[Claude Stream] Message started:', { model: event.message?.model, usage: event.message?.usage });
        } else if (event.type === 'message_delta') {
          log('[Claude Stream] Message delta:', { stopReason: event.delta?.stop_reason, usage: event.usage });
        }
      } catch (err) {
        logError('[Claude Stream] Parse error:', err);
      }
    }
  }
  log(`[Claude Stream] Finished, total chunks=${chunkCount}, length=${full.length}`);
  return full;
}
