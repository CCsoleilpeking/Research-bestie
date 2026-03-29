import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { searchExa, crawlExa } from './tools/exa-search.mjs';
import { sortByTrust } from './tools/trusted-domains.mjs';
import sessionRoutes from './routes/sessions.mjs';
import uploadRoutes from './routes/upload.mjs';
import {
  getMessages, addMessage, getMessageCount,
  getSummaries, addSummary, clearSummaries, clearSessionMessages,
} from './db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadPrompt(name) {
  return readFileSync(join(__dirname, 'prompts', name), 'utf-8').trim();
}

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Provider configs
const PROVIDER_CONFIGS = {
  openai: { baseUrl: 'https://api.openai.com/v1', type: 'openai' },
  claude: { baseUrl: 'https://api.anthropic.com/v1', type: 'claude' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', type: 'openai' },
  kimi: { baseUrl: 'https://api.moonshot.cn/v1', type: 'openai' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', type: 'openai' },
  ionet: { baseUrl: 'https://api.intelligence.io.solutions/api/v1', type: 'openai' },
};

const COMPRESS_EVERY = 20;

// Load prompts from files
const SYSTEM_PROMPT = loadPrompt('system.md');
const SEARCH_ANSWER_PROMPT = loadPrompt('search-answer.md');
const COMPRESS_PROMPT = '\n\n' + loadPrompt('compress.md');

// --- Routes ---
app.use('/api/sessions', sessionRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', tools: ['exa-search'], hasChat: true, hasDb: true });
});

app.get('/api/tools', (req, res) => {
  res.json([{ name: 'exa-search', description: 'Search the web using Exa AI' }]);
});

// --- Main chat endpoint (SSE streaming) ---
app.post('/api/chat', async (req, res) => {
  const { messages, provider, apiKey, model, sessionId } = req.body;

  if (!apiKey || !model || !provider) {
    return res.status(400).json({ error: 'Missing provider, apiKey, or model' });
  }

  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  let roundCount = 0;
  let shouldCompress = false;
  if (sessionId) {
    const msgCount = getMessageCount(sessionId);
    roundCount = Math.floor(msgCount / 2);
    shouldCompress = roundCount > 0 && roundCount % COMPRESS_EVERY === 0;
  }

  console.log(`[Chat] provider=${provider}, model=${model}, messages=${messages.length}, rounds=${roundCount}, compress=${shouldCompress}`);

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function sendSSE(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    const startTime = Date.now();
    const lastUserMsg = messages[messages.length - 1]?.content || '';
    const hasDocument = lastUserMsg.includes('[File ') || lastUserMsg.includes('[Uploaded file:');

    let firstResponse = '';

    if (hasDocument) {
      // Document uploaded: skip system prompt, go directly to search-answer prompt
      console.log(`[Chat] Document detected, using search-answer prompt`);
      await streamLLM(config, apiKey, model, [
        { role: 'system', content: SEARCH_ANSWER_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ], (chunk) => {
        firstResponse += chunk;
        sendSSE('chunk', { content: chunk });
      });
    } else {
      // Normal flow: collect first, check for tags
      const contextMessages = buildContext(messages, sessionId, shouldCompress);

      await streamLLM(config, apiKey, model, contextMessages, (chunk) => {
        firstResponse += chunk;
      });

      console.log(`[Chat] First response (${Date.now() - startTime}ms):`, firstResponse.slice(0, 100));

      const searchMatch = firstResponse.match(/\[SEARCH:\s*(.+?)\]/);
      const recallMatch = firstResponse.match(/\[RECALL:\s*(.+?)\]/);

      if (!searchMatch && !recallMatch) {
        // No tags, send full content at once — frontend will animate it
        sendSSE('chunk', { content: firstResponse });
      }

      if (searchMatch) {
        const searchQuery = searchMatch[1].trim();
        console.log(`[Chat] Search requested: "${searchQuery}"`);
        sendSSE('status', { type: 'searching', query: searchQuery });

        const searchResult = await searchExa({ query: searchQuery, numResults: 5 });
        const sorted = sortByTrust(searchResult.results || []);
        const searchContext = formatSearchResults(sorted);

        // Crawl the top result for full content
        let fullContent = '';
        const topUrl = sorted[0]?.url;
        if (topUrl) {
          try {
            console.log(`[Chat] Crawling top result: ${topUrl}`);
            fullContent = await crawlExa(topUrl);
            // Cap at 30000 chars to avoid token limit
            if (fullContent.length > 30000) fullContent = fullContent.slice(0, 30000) + '\n\n[Content truncated]';
            console.log(`[Chat] Crawled ${fullContent.length} chars`);
          } catch (err) {
            console.error(`[Chat] Crawl failed:`, err.message);
          }
        }

        const userQuestion = lastUserMsg;
        const materials = fullContent
          ? `Search results:\n\n${searchContext}\n\nFull content from top result (${topUrl}):\n\n${fullContent}`
          : `Search results:\n\n${searchContext}`;

        let secondResponse = '';
        await streamLLM(config, apiKey, model, [
          { role: 'system', content: SEARCH_ANSWER_PROMPT },
          { role: 'user', content: `My question: ${userQuestion}\n\n${materials}` },
        ], (chunk) => {
          secondResponse += chunk;
          sendSSE('chunk', { content: chunk });
        });

        firstResponse = secondResponse;
      }

      if (recallMatch && sessionId) {
        const recallQuery = recallMatch[1].trim();
        console.log(`[Chat] Recall requested: "${recallQuery}"`);
        sendSSE('status', { type: 'recalling', query: recallQuery });

        const summaries = getSummaries(sessionId);
        const recallContext = summaries.length > 0
          ? summaries.map(s => s.summary).join('\n\n')
          : 'No previous conversation summaries found.';

        let recallResponse = '';
        await streamLLM(config, apiKey, model, [
          ...contextMessages,
          { role: 'assistant', content: `[RECALL: ${recallQuery}]` },
          { role: 'user', content: `Here are the previous conversation summaries:\n\n${recallContext}\n\nPlease answer based on these memories.` },
        ], (chunk) => {
          recallResponse += chunk;
          sendSSE('chunk', { content: chunk });
        });

        firstResponse = recallResponse;
      }
    } // end of else (normal flow)

    // Process tags in final response
    let finalResponse = firstResponse;

    if (finalResponse.includes('[FORGET_HISTORY]') && sessionId) {
      console.log(`[Chat] Forgetting history for session ${sessionId}`);
      clearSessionMessages(sessionId);
      clearSummaries(sessionId);
      finalResponse = finalResponse.replace(/\[FORGET_HISTORY\]/g, '').trim();
    }

    const summaryMatch = finalResponse.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/);
    if (summaryMatch && sessionId) {
      const summary = summaryMatch[1].trim();
      console.log(`[Chat] Saving compressed summary (${summary.length} chars)`);
      addSummary(sessionId, summary, Math.max(0, roundCount - COMPRESS_EVERY), roundCount);
      finalResponse = finalResponse.replace(/\[SUMMARY\][\s\S]*?\[\/SUMMARY\]/g, '').trim();
    }

    finalResponse = finalResponse
      .replace(/\[SEARCH:[^\]]*\]/g, '')
      .replace(/\[RECALL:[^\]]*\]/g, '')
      .replace(/\[FORGET_HISTORY\]/g, '')
      .trim();

    console.log(`[Chat] Done. total=${Date.now() - startTime}ms`);
    sendSSE('done', { content: finalResponse });
    res.end();

  } catch (err) {
    console.error('[Chat] Error:', err.message);
    sendSSE('error', { error: err.message });
    res.end();
  }
});

// --- Streaming LLM calls ---

async function streamLLM(config, apiKey, model, messages, onChunk) {
  if (config.type === 'claude') {
    return streamClaude(apiKey, model, messages, onChunk);
  }
  return streamOpenAICompatible(config.baseUrl, apiKey, model, messages, onChunk);
}

async function streamOpenAICompatible(baseUrl, apiKey, model, messages, onChunk) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 4096, stream: true }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM Error (${response.status}): ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) onChunk(content);
      } catch { /* skip */ }
    }
  }
}

async function streamClaude(apiKey, model, messages, onChunk) {
  const systemMsgs = messages.filter(m => m.role === 'system');
  const systemText = systemMsgs.map(m => m.content).join('\n\n');
  const chatMsgs = messages.filter(m => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 4096, system: systemText, messages: chatMsgs, stream: true }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude Error (${response.status}): ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
          onChunk(event.delta.text);
        }
      } catch { /* skip */ }
    }
  }
}

// --- Helper functions ---

function buildContext(messages, sessionId, shouldCompress) {
  let systemPrompt = SYSTEM_PROMPT;
  if (shouldCompress) systemPrompt += COMPRESS_PROMPT;

  const contextMessages = [{ role: 'system', content: systemPrompt }];

  if (sessionId) {
    const summaries = getSummaries(sessionId);
    if (summaries.length > 0) {
      const summaryText = summaries.map(s => s.summary).join('\n\n');
      contextMessages.push({ role: 'system', content: `Previous conversation summary:\n${summaryText}` });
    }
  }

  contextMessages.push(...messages.map(m => ({ role: m.role, content: m.content })));
  return contextMessages;
}

function formatSearchResults(results) {
  if (!results.length) return 'No results found.';
  return results.map((r, i) => {
    let text = `[${i + 1}] ${r.title || 'Untitled'}`;
    if (r.url) text += `\nURL: ${r.url}`;
    if (r.highlights?.length) text += `\nHighlights: ${r.highlights.join(' ')}`;
    else if (r.text) text += `\nContent: ${r.text.slice(0, 500)}`;
    return text;
  }).join('\n\n---\n\n');
}

app.listen(PORT, () => {
  console.log(`[MCP] Server running on http://localhost:${PORT}`);
  console.log(`[MCP] Endpoints: /api/health, /api/tools, /api/chat, /api/sessions, /api/upload`);
});
