#!/usr/bin/env node

/**
 * EverMem MCP Server
 * Exposes memory search and retrieval tools for Claude to use autonomously
 */

import { createInterface } from 'readline';
import { searchMemories, transformSearchResults } from '../hooks/scripts/utils/evermem-api.js';
import { getConfig } from '../hooks/scripts/utils/config.js';

// Tool definitions
const TOOLS = [
  {
    name: 'search_memories',
    description: 'Search past conversation memories using semantic and keyword matching. Use this to find relevant context from previous sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant memories'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of memories to return (default: 10, max: 20)',
          default: 10
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_memory',
    description: 'Get the full details of a specific memory by its ID',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: 'The unique identifier of the memory to retrieve'
        }
      },
      required: ['memory_id']
    }
  }
];

// In-memory cache for recent search results (to support get_memory)
const memoryCache = new Map();

/**
 * Handle search_memories tool call
 */
async function handleSearchMemories(args) {
  const config = getConfig();

  if (!config.isConfigured) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'EverMem API key not configured. Set EVERMEM_API_KEY environment variable.' }]
    };
  }

  const query = args.query;
  const limit = Math.min(args.limit || 10, 20);

  try {
    const response = await searchMemories(query, { topK: limit });
    const memories = transformSearchResults(response);

    if (memories.length === 0) {
      return {
        content: [{ type: 'text', text: 'No memories found matching your query.' }]
      };
    }

    // Cache memories for get_memory lookups
    memories.forEach((memory, index) => {
      const memoryId = `mem_${Date.now()}_${index}`;
      memory.id = memoryId;
      memoryCache.set(memoryId, memory);
    });

    // Keep cache size reasonable
    if (memoryCache.size > 100) {
      const keys = Array.from(memoryCache.keys());
      keys.slice(0, 50).forEach(key => memoryCache.delete(key));
    }

    // Format results
    const results = memories.map((mem, i) => {
      const date = new Date(mem.timestamp).toLocaleDateString();
      const score = Math.round(mem.score * 100);
      const preview = mem.text.length > 200 ? mem.text.substring(0, 200) + '...' : mem.text;
      return `[${i + 1}] ID: ${mem.id}\n    Type: ${mem.type} | Score: ${score}% | Date: ${date}\n    ${preview}`;
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${memories.length} memories:\n\n${results}\n\nUse get_memory with an ID to see full content.`
      }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error searching memories: ${error.message}` }]
    };
  }
}

/**
 * Handle get_memory tool call
 */
async function handleGetMemory(args) {
  const memoryId = args.memory_id;

  const memory = memoryCache.get(memoryId);

  if (!memory) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Memory not found: ${memoryId}. Try searching first with search_memories.` }]
    };
  }

  const date = new Date(memory.timestamp).toLocaleString();

  return {
    content: [{
      type: 'text',
      text: `Memory: ${memoryId}\nType: ${memory.type}\nDate: ${date}\nScore: ${Math.round(memory.score * 100)}%\n\n--- Content ---\n${memory.text}`
    }]
  };
}

/**
 * Handle incoming JSON-RPC request
 */
async function handleRequest(request) {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'evermem',
            version: '0.1.0'
          }
        }
      };

    case 'notifications/initialized':
      // No response needed for notifications
      return null;

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS
        }
      };

    case 'tools/call':
      const { name, arguments: args } = params;
      let result;

      switch (name) {
        case 'search_memories':
          result = await handleSearchMemories(args || {});
          break;
        case 'get_memory':
          result = await handleGetMemory(args || {});
          break;
        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          };
      }

      return {
        jsonrpc: '2.0',
        id,
        result
      };

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      };
  }
}

/**
 * Main MCP server loop
 */
async function main() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    if (!line.trim()) return;

    try {
      const request = JSON.parse(line);
      const response = await handleRequest(request);

      if (response) {
        console.log(JSON.stringify(response));
      }
    } catch (error) {
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${error.message}`
        }
      };
      console.log(JSON.stringify(errorResponse));
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch(error => {
  console.error('MCP server error:', error);
  process.exit(1);
});
