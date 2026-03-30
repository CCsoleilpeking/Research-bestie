import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { searchExa, crawlExa, extractImagesFromUrl } from './tools/exa-search.mjs';
import { downloadArxivPdf, parsePdfWithMinerU } from './tools/mineru-parser.mjs';
import { sortByTrust } from './tools/trusted-domains.mjs';
import sessionRoutes from './routes/sessions.mjs';
import uploadRoutes from './routes/upload.mjs';
import dataRoutes from './routes/data.mjs';
import db, {
  getMessageCount,
  getSummaries, addSummary, clearSummaries, clearSessionMessages,
} from './db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadPrompt(name) {
  return readFileSync(join(__dirname, 'prompts', name), 'utf-8').trim();
}

// --- App setup ---

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Constants ---

const PROVIDER_CONFIGS = {
  openai:   { baseUrl: 'https://api.openai.com/v1', type: 'openai' },
  claude:   { baseUrl: 'https://api.anthropic.com/v1', type: 'claude' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', type: 'openai' },
  kimi:     { baseUrl: 'https://api.moonshot.cn/v1', type: 'openai' },
  gemini:   { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', type: 'openai' },
  ionet:    { baseUrl: 'https://api.intelligence.io.solutions/api/v1', type: 'openai' },
};

const COMPRESS_EVERY          = 20;
const TAG_QUICK_CHECK_LIMIT   = 20;   // If no [ in first 20 chars, start streaming
const TAG_DEEP_BUFFER_LIMIT   = 200;  // If [ found, buffer up to 200 chars to find complete tag
const FIGURE_CACHE_TTL_MS   = 30 * 60 * 1000;
const CONTENT_TRUNCATE_LIMIT = 30000;
const MAX_SEARCH_RESULTS    = 5;
const MIN_CRAWL_LENGTH      = 500;
const LLM_MAX_TOKENS        = 4096;

const TAG_CLEANUP_PATTERNS = [
  /\[SEARCH:[^\]]*\]/g,
  /\[RECALL:[^\]]*\]/g,
  /\[FORGET_HISTORY\]/g,
  /\[SUMMARY\][\s\S]*?\[\/SUMMARY\]/g,
];

// Load prompts from files
const SYSTEM_PROMPT        = loadPrompt('system.md');
const SEARCH_ANSWER_PROMPT = loadPrompt('search-answer.md');
const COMPRESS_PROMPT      = '\n\n' + loadPrompt('compress.md');

// --- Routes ---

app.use('/api/sessions', sessionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/figures', express.static(join(__dirname, '..', 'data', 'figures')));

// --- Figures (MinerU) ---

const pendingFigures  = new Map();  // sessionId -> { status, figures, error, createdAt }
const figureListeners = new Map();  // sessionId -> [res, ...]

// Periodically clean up stale entries
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pendingFigures) {
    if (now - entry.createdAt > FIGURE_CACHE_TTL_MS) {
      pendingFigures.delete(id);
    }
  }
}, FIGURE_CACHE_TTL_MS);

app.get('/api/figures-stream/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const existing = pendingFigures.get(sessionId);

  // Already completed — return result immediately
  if (existing?.status === 'done') {
    res.write(`event: figures\ndata: ${JSON.stringify({ figures: existing.figures })}\n\n`);
    res.end();
    return;
  }
  if (existing?.status === 'error') {
    res.write(`event: error\ndata: ${JSON.stringify({ error: existing.error })}\n\n`);
    res.end();
    return;
  }

  // No job pending — nothing to wait for
  if (!existing) {
    res.write(`event: status\ndata: ${JSON.stringify({ status: 'no_job' })}\n\n`);
    res.end();
    return;
  }

  // Job in progress — register listener only after all early-return checks
  if (!figureListeners.has(sessionId)) figureListeners.set(sessionId, []);
  figureListeners.get(sessionId).push(res);

  res.write(`event: status\ndata: ${JSON.stringify({ status: 'parsing' })}\n\n`);

  res.on('close', () => {
    const listeners = figureListeners.get(sessionId);
    if (listeners) {
      const idx = listeners.indexOf(res);
      if (idx >= 0) listeners.splice(idx, 1);
    }
  });
});

function notifyFigureListeners(sessionId, event, data) {
  const listeners = figureListeners.get(sessionId) || [];
  for (const res of listeners) {
    if (!res.writableFinished) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      res.end();
    }
  }
  figureListeners.delete(sessionId);
}

async function processArxivFigures(sessionId, arxivUrl) {
  pendingFigures.set(sessionId, {
    status: 'parsing', figures: [], error: null, createdAt: Date.now(),
  });
  console.log(`[MinerU] Starting async parse for session ${sessionId}: ${arxivUrl}`);

  try {
    const pdfPath = await downloadArxivPdf(arxivUrl);
    const { figures } = await parsePdfWithMinerU(pdfPath);
    console.log(`[MinerU] Done: ${figures.length} figures extracted`);

    pendingFigures.set(sessionId, {
      status: 'done', figures, error: null, createdAt: Date.now(),
    });
    notifyFigureListeners(sessionId, 'figures', { figures });
  } catch (err) {
    console.error(`[MinerU] Failed:`, err.message);
    pendingFigures.set(sessionId, {
      status: 'error', figures: [], error: err.message, createdAt: Date.now(),
    });
    notifyFigureListeners(sessionId, 'error', { error: err.message });
  }
}

// --- Health & Tools ---

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

  const abortController = new AbortController();

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Abort on client disconnect — must be after flushHeaders
  res.on('close', () => {
    if (!res.writableFinished) {
      abortController.abort();
      console.log('[Chat] Client disconnected, aborting LLM request');
    }
  });

  function sendSSE(event, data) {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }

  try {
    const startTime = Date.now();
    const lastUserMsg = messages[messages.length - 1]?.content || '';
    const hasDocument = lastUserMsg.includes('[File ') || lastUserMsg.includes('[Uploaded file:');

    let finalResponse = '';

    if (hasDocument) {
      // Document mode: use search-answer prompt, stream directly
      console.log(`[Chat] Document detected, using search-answer prompt`);
      await streamLLM(config, apiKey, model, abortController.signal, [
        { role: 'system', content: SEARCH_ANSWER_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ], (chunk) => {
        finalResponse += chunk;
        sendSSE('chunk', { content: chunk });
      });
    } else {
      // Normal flow: stream with smart tag detection
      const contextMessages = buildContext(messages, sessionId, shouldCompress);
      const { fullText, detectedTag } = await streamWithTagDetection(
        config, apiKey, model, abortController.signal, contextMessages, sendSSE,
      );

      // Always process DB tags from the first response — it may contain
      // [SUMMARY] (when shouldCompress) even if a search/recall tag was also present.
      processDbTags(fullText, sessionId, roundCount);

      if (detectedTag?.type === 'search') {
        finalResponse = await handleSearch(
          detectedTag.query, lastUserMsg,
          config, apiKey, model, abortController.signal, sendSSE,
        );
      } else if (detectedTag?.type === 'recall' && sessionId) {
        finalResponse = await handleRecall(
          detectedTag.query, sessionId, contextMessages,
          config, apiKey, model, abortController.signal, sendSSE,
        );
      } else {
        finalResponse = fullText;
      }
    }

    // Process DB tags for document mode (first response is finalResponse)
    if (hasDocument) {
      processDbTags(finalResponse, sessionId, roundCount);
    }

    // Strip all internal tags from the response sent to client
    const cleanedResponse = stripInternalTags(finalResponse);

    console.log(`[Chat] Done. total=${Date.now() - startTime}ms`);
    sendSSE('done', { content: cleanedResponse });
    res.end();

  } catch (err) {
    if (abortController.signal.aborted) {
      console.log('[Chat] Request aborted by client');
    } else {
      console.error('[Chat] Error:', err.message);
      sendSSE('error', { error: err.message });
    }
    if (!res.writableFinished) res.end();
  }
});

// --- Tag detection streaming ---
// Strategy (Approach B): quick check first 20 chars for [, deep buffer up to 200 if found.
// Handles tags that appear anywhere in the first 200 chars, tolerates leading whitespace/text.

async function streamWithTagDetection(config, apiKey, model, signal, messages, sendSSE) {
  let fullText = '';
  let buffer = '';
  let streaming = false;
  let detectedTag = null;
  let seenBracket = false;

  await streamLLM(config, apiKey, model, signal, messages, (chunk) => {
    fullText += chunk;

    // Already streaming directly to client
    if (streaming) {
      sendSSE('chunk', { content: chunk });
      return;
    }

    // Tag already detected — just accumulate the rest silently
    if (detectedTag) return;

    buffer += chunk;

    // Check for complete tag in buffer (works regardless of position)
    const searchMatch = buffer.match(/\[SEARCH:\s*(.+?)\]/);
    if (searchMatch) {
      detectedTag = { type: 'search', query: searchMatch[1].trim() };
      console.log(`[TagDetect] SEARCH detected: "${detectedTag.query}"`);
      return;
    }
    const recallMatch = buffer.match(/\[RECALL:\s*(.+?)\]/);
    if (recallMatch) {
      detectedTag = { type: 'recall', query: recallMatch[1].trim() };
      console.log(`[TagDetect] RECALL detected: "${detectedTag.query}"`);
      return;
    }

    // Track if we've seen a [ character
    if (!seenBracket && buffer.includes('[')) {
      seenBracket = true;
    }

    // Quick check: no [ in first N chars → definitely not a tag, start streaming
    if (!seenBracket && buffer.length >= TAG_QUICK_CHECK_LIMIT) {
      sendSSE('chunk', { content: buffer });
      buffer = '';
      streaming = true;
      return;
    }

    // Deep buffer: seen [ but no complete tag yet, keep buffering up to limit
    if (seenBracket && buffer.length >= TAG_DEEP_BUFFER_LIMIT) {
      // Gave up waiting for complete tag — flush and stream
      console.log(`[TagDetect] Deep buffer limit reached (${buffer.length}), no complete tag found`);
      sendSSE('chunk', { content: buffer });
      buffer = '';
      streaming = true;
    }
  });

  // Flush any remaining buffered content that wasn't a tag
  if (!streaming && !detectedTag && buffer) {
    sendSSE('chunk', { content: buffer });
  }

  return { fullText, detectedTag };
}

// --- Search handler ---

async function handleSearch(query, userQuestion, config, apiKey, model, signal, sendSSE) {
  console.log(`[Chat] Search requested: "${query}"`);
  sendSSE('status', { type: 'searching', query });

  const searchResult = await searchExa({ query, numResults: MAX_SEARCH_RESULTS });
  const sorted = sortByTrust(searchResult.results || []);
  const searchContext = formatSearchResults(sorted);

  // Crawl top result for full content + images in parallel
  let fullContent = '';
  let imageUrls = [];
  const topUrl = sorted[0]?.url;

  if (topUrl) {
    let crawlUrl = topUrl;
    if (crawlUrl.includes('arxiv.org/abs/')) {
      crawlUrl = crawlUrl.replace('/abs/', '/html/');
    }

    sendSSE('status', { type: 'crawling' });
    console.log(`[Chat] Crawling: ${crawlUrl}`);

    try {
      const [crawlResult, images] = await Promise.all([
        crawlExa(crawlUrl).catch(() => ''),
        extractImagesFromUrl(crawlUrl).catch(() => []),
      ]);

      fullContent = crawlResult;
      imageUrls = images;

      // If HTML version too short, fall back to original URL
      if (fullContent.length < MIN_CRAWL_LENGTH && crawlUrl !== topUrl) {
        console.log(`[Chat] HTML too short (${fullContent.length}), trying original URL`);
        fullContent = await crawlExa(topUrl).catch(() => '');
      }
      if (fullContent.length > CONTENT_TRUNCATE_LIMIT) {
        fullContent = fullContent.slice(0, CONTENT_TRUNCATE_LIMIT) + '\n\n[Content truncated]';
      }
      console.log(`[Chat] Crawled ${fullContent.length} chars, ${imageUrls.length} images`);
    } catch (err) {
      console.error(`[Chat] Crawl failed:`, err.message);
    }
  }

  sendSSE('status', { type: 'answering' });

  const materials = fullContent
    ? `Search results:\n\n${searchContext}\n\nFull content from top result (${topUrl}):\n\n${fullContent}`
    : `Search results:\n\n${searchContext}`;

  let answerResponse = '';
  await streamLLM(config, apiKey, model, signal, [
    { role: 'system', content: SEARCH_ANSWER_PROMPT },
    { role: 'user', content: `My question: ${userQuestion}\n\n${materials}` },
  ], (chunk) => {
    answerResponse += chunk;
    sendSSE('chunk', { content: chunk });
  });

  if (imageUrls.length > 0) {
    sendSSE('figures', {
      figures: imageUrls.map((url, i) => ({ id: `img_${i}`, url, caption: '' })),
    });
  }

  return answerResponse;
}

// --- Recall handler ---

async function handleRecall(query, sessionId, contextMessages, config, apiKey, model, signal, sendSSE) {
  console.log(`[Chat] Recall requested: "${query}"`);
  sendSSE('status', { type: 'recalling', query });

  const summaries = getSummaries(sessionId);
  const recallContext = summaries.length > 0
    ? summaries.map(s => s.summary).join('\n\n')
    : 'No previous conversation summaries found.';

  let recallResponse = '';
  await streamLLM(config, apiKey, model, signal, [
    ...contextMessages,
    { role: 'assistant', content: `[RECALL: ${query}]` },
    { role: 'user', content: `Here are the previous conversation summaries:\n\n${recallContext}\n\nPlease answer based on these memories.` },
  ], (chunk) => {
    recallResponse += chunk;
    sendSSE('chunk', { content: chunk });
  });

  return recallResponse;
}

// --- DB tag processing ---

function processDbTags(response, sessionId, roundCount) {
  const summaryMatch = response.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/);
  const hasForget = response.includes('[FORGET_HISTORY]') && sessionId;

  if (!hasForget && !summaryMatch) return;

  const transaction = db.transaction(() => {
    if (hasForget) {
      console.log(`[Chat] Forgetting history for session ${sessionId}`);
      clearSessionMessages(sessionId);
      clearSummaries(sessionId);
    }
    if (summaryMatch && sessionId) {
      const summary = summaryMatch[1].trim();
      console.log(`[Chat] Saving compressed summary (${summary.length} chars)`);
      addSummary(sessionId, summary, Math.max(0, roundCount - COMPRESS_EVERY), roundCount);
    }
  });
  transaction();
}

function stripInternalTags(text) {
  let result = text;
  for (const pattern of TAG_CLEANUP_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

// --- Streaming LLM calls ---

async function streamLLM(config, apiKey, model, signal, messages, onChunk) {
  if (config.type === 'claude') {
    return streamClaude(apiKey, model, messages, onChunk, signal);
  }
  return streamOpenAICompatible(config.baseUrl, apiKey, model, messages, onChunk, signal);
}

async function streamOpenAICompatible(baseUrl, apiKey, model, messages, onChunk, signal) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: LLM_MAX_TOKENS, stream: true }),
    signal,
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
      } catch { /* skip malformed SSE chunks */ }
    }
  }
}

async function streamClaude(apiKey, model, messages, onChunk, signal) {
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
    body: JSON.stringify({
      model, max_tokens: LLM_MAX_TOKENS, system: systemText,
      messages: chatMsgs, stream: true,
    }),
    signal,
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
      } catch { /* skip malformed SSE chunks */ }
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
      contextMessages.push({
        role: 'system',
        content: `Previous conversation summary:\n${summaryText}`,
      });
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

// --- Process error handlers ---

process.on('uncaughtException', (err) => {
  console.error('[Fatal] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] Unhandled rejection:', reason);
});

// --- Start server ---

app.listen(PORT, () => {
  console.log(`[MCP] Server running on http://localhost:${PORT}`);
  console.log(`[MCP] Endpoints: /api/health, /api/tools, /api/chat, /api/sessions, /api/upload`);
});
