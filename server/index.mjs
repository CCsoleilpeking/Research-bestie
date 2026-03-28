import express from 'express';
import cors from 'cors';
import { searchExa } from './tools/exa-search.mjs';
import { sortByTrust } from './tools/trusted-domains.mjs';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Provider configs (same as frontend)
const PROVIDER_CONFIGS = {
  openai: { baseUrl: 'https://api.openai.com/v1', type: 'openai' },
  claude: { baseUrl: 'https://api.anthropic.com/v1', type: 'claude' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', type: 'openai' },
  kimi: { baseUrl: 'https://api.moonshot.cn/v1', type: 'openai' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', type: 'openai' },
  ionet: { baseUrl: 'https://api.intelligence.io.solutions/api/v1', type: 'openai' },
};

const SYSTEM_PROMPT = `You are ResearchBestie — a helpful, top-tier powerhouse of intelligence.

You have access to a web search tool. When you need to search for information that you don't know or are not confident about (such as a paper title, URL, recent events, or any factual question), reply with ONLY this format on a single line:

[SEARCH: your search query here]

The system will automatically search and provide results, then you will answer based on those results.

Rules:
- Only use [SEARCH:] when you genuinely need external information
- Do not use [SEARCH:] for general knowledge you are confident about
- When you receive search results, synthesize them into a helpful answer
- Always cite sources with URLs when using search results`;

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', tools: ['exa-search'], hasChat: true });
});

// List available tools
app.get('/api/tools', (req, res) => {
  res.json([
    { name: 'exa-search', description: 'Search the web using Exa AI' },
  ]);
});

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  const { messages, provider, apiKey, model, stream } = req.body;

  if (!apiKey || !model || !provider) {
    return res.status(400).json({ error: 'Missing provider, apiKey, or model' });
  }

  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  console.log(`[Chat] provider=${provider}, model=${model}, messages=${messages.length}, stream=${!!stream}`);

  try {
    // Step 1: Send to LLM with search capability in system prompt
    const startTime = Date.now();
    const firstResponse = await callLLM(config, apiKey, model, [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ]);

    console.log(`[Chat] First LLM response (${Date.now() - startTime}ms):`, firstResponse.slice(0, 100));

    // Step 2: Check if LLM wants to search
    const searchMatch = firstResponse.match(/\[SEARCH:\s*(.+?)\]/);
    if (searchMatch) {
      const query = searchMatch[1].trim();
      console.log(`[Chat] LLM requested search: "${query}"`);

      // Step 3: Search via Exa
      const searchStart = Date.now();
      const searchResult = await searchExa({ query, numResults: 5 });
      console.log(`[Chat] Exa search done (${Date.now() - searchStart}ms), results: ${searchResult.results?.length || 0}`);

      // Step 4: Sort by trusted domains
      const sorted = sortByTrust(searchResult.results || []);
      console.log(`[Chat] After trust sort: ${sorted.length} results`);

      // Step 5: Format search results for LLM
      const searchContext = formatSearchResults(sorted);

      // Step 6: Send to LLM again with search results
      const secondStart = Date.now();
      const finalResponse = await callLLM(config, apiKey, model, [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
        { role: 'assistant', content: `[SEARCH: ${query}]` },
        { role: 'user', content: `Here are the search results:\n\n${searchContext}\n\nPlease answer the original question based on these search results. Cite sources with URLs.` },
      ]);

      console.log(`[Chat] Second LLM response (${Date.now() - secondStart}ms), total: ${Date.now() - startTime}ms`);
      return res.json({ content: finalResponse, searched: true, query });
    }

    // No search needed
    return res.json({ content: firstResponse, searched: false });

  } catch (err) {
    console.error('[Chat] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// --- LLM call functions ---

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
  // Extract system message
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const chatMsgs = messages.filter(m => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 4096, system: systemMsg, messages: chatMsgs }),
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
  console.log(`[MCP] Endpoints: /api/health, /api/tools, /api/chat`);
});
