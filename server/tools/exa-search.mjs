import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const EXA_MCP_URL = 'https://mcp.exa.ai/mcp';
let clientPromise = null;

async function initClient() {
  console.log('[Exa] Connecting to Exa MCP...');
  const c = new Client({ name: 'research-bestie', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(EXA_MCP_URL));
  await c.connect(transport);

  const tools = await c.listTools();
  console.log('[Exa] Available tools:', tools.tools.map(t => t.name));
  return c;
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = initClient().catch(err => {
      clientPromise = null; // Allow retry on next call
      throw err;
    });
  }
  return clientPromise;
}

async function resetClient() {
  console.log('[Exa] Resetting client connection');
  const oldPromise = clientPromise;
  clientPromise = null;
  // Gracefully close the old connection if it resolved
  if (oldPromise) {
    try {
      const oldClient = await oldPromise;
      await oldClient.close();
    } catch { /* already broken — nothing to close */ }
  }
}

export async function searchExa({ query, type = 'auto', numResults = 5 }) {
  if (!query) throw new Error('Query is required');

  console.log(`[Exa] Searching: "${query}" (type=${type}, numResults=${numResults})`);

  try {
    const mcpClient = await getClient();
    const result = await mcpClient.callTool({
      name: 'web_search_exa',
      arguments: {
        query,
        numResults: Math.min(Math.max(numResults, 1), 10),
      },
    });

    console.log(`[Exa] Got result`);
    const content = result.content || [];
    const textContent = content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    return {
      raw: textContent,
      results: parseSearchResults(textContent),
    };
  } catch (err) {
    resetClient();
    throw err;
  }
}

export async function crawlExa(url) {
  if (!url) throw new Error('URL is required');

  console.log(`[Exa] Crawling: ${url}`);

  try {
    const mcpClient = await getClient();
    const result = await mcpClient.callTool({
      name: 'crawling_exa',
      arguments: { urls: [url] },
    });

    const content = result.content || [];
    const text = content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    console.log(`[Exa] Crawled ${text.length} chars`);
    return text;
  } catch (err) {
    resetClient();
    throw err;
  }
}

export async function extractImagesFromUrl(url) {
  console.log(`[Exa] Extracting images from: ${url}`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[Exa] Failed to fetch HTML: ${response.status}`);
      return [];
    }
    const html = await response.text();

    // Ensure base URL ends with / for correct relative URL resolution
    const baseUrl = url.endsWith('/') ? url : url + '/';

    // Extract <img> src attributes
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const images = [];
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      let src = match[1];
      // Skip tiny icons, tracking pixels, data URIs
      if (src.startsWith('data:')) continue;
      if (src.includes('pixel') || src.includes('tracker') || src.includes('favicon')) continue;
      // Convert relative URL to absolute
      if (!src.startsWith('http')) {
        try {
          src = new URL(src, baseUrl).href;
        } catch { continue; }
      }
      images.push(src);
    }

    // Deduplicate
    const unique = [...new Set(images)];
    console.log(`[Exa] Found ${unique.length} images`);
    return unique;
  } catch (err) {
    console.error(`[Exa] Image extraction failed:`, err.message);
    return [];
  }
}

function parseSearchResults(text) {
  const results = [];
  const lines = text.split('\n');
  let current = null;

  for (const line of lines) {
    const titleMatch = line.match(/^(?:Title|##?\s*)\s*:?\s*(.+)/i);
    const urlMatch = line.match(/^(?:URL|Link|Source)\s*:?\s*(https?:\/\/.+)/i);

    if (titleMatch) {
      if (current) results.push(current);
      current = { title: titleMatch[1].trim(), url: '', text: '' };
    } else if (urlMatch && current) {
      current.url = urlMatch[1].trim();
    } else if (current && line.trim()) {
      current.text += (current.text ? ' ' : '') + line.trim();
    }
  }
  if (current) results.push(current);

  if (results.length === 0) {
    return [{ title: 'Search Results', url: '', text }];
  }

  return results;
}
