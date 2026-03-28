import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const EXA_MCP_URL = 'https://mcp.exa.ai/mcp';
let client = null;

async function getClient() {
  if (client) return client;

  console.log('[Exa] Connecting to Exa MCP...');
  client = new Client({ name: 'research-bestie', version: '1.0.0' });

  const transport = new StreamableHTTPClientTransport(new URL(EXA_MCP_URL));
  await client.connect(transport);

  // List available tools
  const tools = await client.listTools();
  console.log('[Exa] Available tools:', tools.tools.map(t => t.name));

  return client;
}

export async function searchExa({ query, type = 'auto', numResults = 5 }) {
  if (!query) throw new Error('Query is required');

  console.log(`[Exa] Searching: "${query}" (type=${type}, numResults=${numResults})`);

  const mcpClient = await getClient();

  const result = await mcpClient.callTool({
    name: 'web_search_exa',
    arguments: {
      query,
      numResults: Math.min(Math.max(numResults, 1), 10),
    },
  });

  console.log(`[Exa] Got result`);

  // Parse MCP result
  const content = result.content || [];
  const textContent = content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');

  return {
    raw: textContent,
    results: parseSearchResults(textContent),
  };
}

function parseSearchResults(text) {
  // Try to parse structured results from the text
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

  // If parsing didn't work well, return the raw text as a single result
  if (results.length === 0) {
    return [{ title: 'Search Results', url: '', text }];
  }

  return results;
}
