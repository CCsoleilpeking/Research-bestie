import express from 'express';
import cors from 'cors';
import { searchExa } from './tools/exa-search.mjs';
import { sortByTrust } from './tools/trusted-domains.mjs';
import sessionRoutes from './routes/sessions.mjs';
import uploadRoutes from './routes/upload.mjs';
import {
  getMessages, addMessage, getMessageCount,
  getSummaries, addSummary, clearSummaries, clearSessionMessages,
} from './db.mjs';

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

const COMPRESS_EVERY = 20; // Compress every N rounds (1 round = 1 user + 1 assistant message)

const SYSTEM_PROMPT = `You are ResearchBestie — a helpful, top-tier powerhouse of intelligence.

## Web Search
You have access to a web search tool. When you need to search for information that you don't know or are not confident about (such as a paper title, URL, recent events, or any factual question), reply with ONLY this format on a single line:

[SEARCH: your search query here]

The system will automatically search and provide results, then you will answer based on those results.

Rules:
- Only use [SEARCH:] when you genuinely need external information
- Do not use [SEARCH:] for general knowledge you are confident about
- When you receive search results, synthesize them into a helpful answer
- Always cite sources with URLs when using search results

## Forget History
If the user asks to forget, clear, or reset previous conversation history, include this tag at the end of your response:

[FORGET_HISTORY]

## Memory Recall
You have access to a memory system that stores previous conversation history.
When the user asks about previous discussions, or when you need context from earlier in the conversation that you don't currently see, reply with:

[RECALL: keywords or topic to search for]

The system will search the memory and return relevant conversation summaries.`;

const COMPRESS_PROMPT = `\n\nIMPORTANT: This conversation has reached a milestone. At the very end of your response, after answering the user, generate a compressed summary of ALL the conversation above. Use this exact format:

[SUMMARY]
(Write a concise summary preserving role information. For each significant exchange, write: "User asked/did X. Assistant explained/did Y." Use the same language as the conversation.)
[/SUMMARY]`;

// --- Routes ---
app.use('/api/sessions', sessionRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', tools: ['exa-search'], hasChat: true, hasDb: true });
});

// List available tools
app.get('/api/tools', (req, res) => {
  res.json([
    { name: 'exa-search', description: 'Search the web using Exa AI' },
  ]);
});

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  const { messages, provider, apiKey, model, stream, sessionId } = req.body;

  if (!apiKey || !model || !provider) {
    return res.status(400).json({ error: 'Missing provider, apiKey, or model' });
  }

  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  // Count rounds for this session (1 round = 2 messages: user + assistant)
  let roundCount = 0;
  let shouldCompress = false;
  if (sessionId) {
    const msgCount = getMessageCount(sessionId);
    roundCount = Math.floor(msgCount / 2);
    // Check if we're at a compression milestone
    shouldCompress = roundCount > 0 && roundCount % COMPRESS_EVERY === 0;
  }

  console.log(`[Chat] provider=${provider}, model=${model}, messages=${messages.length}, rounds=${roundCount}, compress=${shouldCompress}`);

  try {
    // Build context: summaries + recent messages
    const contextMessages = buildContext(messages, sessionId, shouldCompress);

    const startTime = Date.now();

    // Step 1: Send to LLM
    const firstResponse = await callLLM(config, apiKey, model, contextMessages);
    console.log(`[Chat] First LLM response (${Date.now() - startTime}ms):`, firstResponse.slice(0, 100));

    // Step 2: Check for tags and process
    let finalResponse = firstResponse;
    let searched = false;
    let searchQuery = null;
    let recalled = false;

    // Check for [SEARCH:]
    const searchMatch = finalResponse.match(/\[SEARCH:\s*(.+?)\]/);
    if (searchMatch) {
      searchQuery = searchMatch[1].trim();
      console.log(`[Chat] LLM requested search: "${searchQuery}"`);

      const searchStart = Date.now();
      const searchResult = await searchExa({ query: searchQuery, numResults: 5 });
      console.log(`[Chat] Exa search done (${Date.now() - searchStart}ms)`);

      const sorted = sortByTrust(searchResult.results || []);
      const searchContext = formatSearchResults(sorted);

      const secondResponse = await callLLM(config, apiKey, model, [
        ...contextMessages,
        { role: 'assistant', content: `[SEARCH: ${searchQuery}]` },
        { role: 'user', content: `Here are the search results:\n\n${searchContext}\n\nPlease answer the original question based on these search results. Cite sources with URLs.` },
      ]);

      finalResponse = secondResponse;
      searched = true;
    }

    // Check for [RECALL:]
    const recallMatch = finalResponse.match(/\[RECALL:\s*(.+?)\]/);
    if (recallMatch && sessionId) {
      const recallQuery = recallMatch[1].trim();
      console.log(`[Chat] LLM requested recall: "${recallQuery}"`);

      const summaries = getSummaries(sessionId);
      const recallContext = summaries.length > 0
        ? summaries.map(s => s.summary).join('\n\n')
        : 'No previous conversation summaries found.';

      const recallResponse = await callLLM(config, apiKey, model, [
        ...contextMessages,
        { role: 'assistant', content: `[RECALL: ${recallQuery}]` },
        { role: 'user', content: `Here are the previous conversation summaries:\n\n${recallContext}\n\nPlease answer based on these memories.` },
      ]);

      finalResponse = recallResponse;
      recalled = true;
    }

    // Check for [FORGET_HISTORY]
    if (finalResponse.includes('[FORGET_HISTORY]') && sessionId) {
      console.log(`[Chat] Forgetting history for session ${sessionId}`);
      clearSessionMessages(sessionId);
      clearSummaries(sessionId);
      finalResponse = finalResponse.replace(/\[FORGET_HISTORY\]/g, '').trim();
    }

    // Check for [SUMMARY] (compression result)
    const summaryMatch = finalResponse.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/);
    if (summaryMatch && sessionId) {
      const summary = summaryMatch[1].trim();
      console.log(`[Chat] Saving compressed summary (${summary.length} chars)`);
      addSummary(sessionId, summary, Math.max(0, roundCount - COMPRESS_EVERY), roundCount);
      finalResponse = finalResponse.replace(/\[SUMMARY\][\s\S]*?\[\/SUMMARY\]/g, '').trim();
    }

    // Clean any remaining tags
    finalResponse = finalResponse
      .replace(/\[SEARCH:[^\]]*\]/g, '')
      .replace(/\[RECALL:[^\]]*\]/g, '')
      .replace(/\[FORGET_HISTORY\]/g, '')
      .trim();

    console.log(`[Chat] Done. total=${Date.now() - startTime}ms, searched=${searched}, recalled=${recalled}`);
    return res.json({ content: finalResponse, searched, searchQuery, recalled });

  } catch (err) {
    console.error('[Chat] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// --- Helper functions ---

function buildContext(messages, sessionId, shouldCompress) {
  let systemPrompt = SYSTEM_PROMPT;

  // Add compression instruction if at milestone
  if (shouldCompress) {
    systemPrompt += COMPRESS_PROMPT;
  }

  const contextMessages = [{ role: 'system', content: systemPrompt }];

  // Add summaries if available
  if (sessionId) {
    const summaries = getSummaries(sessionId);
    if (summaries.length > 0) {
      const summaryText = summaries.map(s => s.summary).join('\n\n');
      contextMessages.push({
        role: 'system',
        content: `Previous conversation summary:\n${summaryText}`,
      });
    }
  }

  // Add recent messages
  contextMessages.push(...messages.map(m => ({ role: m.role, content: m.content })));

  return contextMessages;
}

async function callLLM(config, apiKey, model, messages) {
  if (config.type === 'claude') {
    return callClaude(apiKey, model, messages);
  }
  return callOpenAICompatible(config.baseUrl, apiKey, model, messages);
}

async function callOpenAICompatible(baseUrl, apiKey, model, messages) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 4096 }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM Error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No response';
}

async function callClaude(apiKey, model, messages) {
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
    body: JSON.stringify({ model, max_tokens: 4096, system: systemText, messages: chatMsgs }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude Error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.content?.map(c => c.text).join('') || 'No response';
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
  console.log(`[MCP] Endpoints: /api/health, /api/tools, /api/chat, /api/sessions`);
});
