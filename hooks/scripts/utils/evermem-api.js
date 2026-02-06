/**
 * EverMem Cloud API client
 * Handles memory search and storage operations
 */

import { getConfig } from './config.js';
import { appendFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

const TIMEOUT_MS = 30000; // 30 seconds
const DEBUG = process.env.EVERMEM_DEBUG === '1';
const LOG_FILE = join(homedir(), '.evermem-debug.log');

function debugLog(msg, data = null) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [API] ${msg}`;
  if (data !== null) {
    line += `: ${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`;
  }
  appendFileSync(LOG_FILE, line + '\n');
}

/**
 * Search memories from EverMem Cloud
 * @param {string} query - Search query text
 * @param {Object} options - Additional options
 * @param {number} options.topK - Max results (default: 10)
 * @param {string} options.retrieveMethod - Search method (default: 'hybrid')
 * @returns {Promise<Object>} Search results
 */
export async function searchMemories(query, options = {}) {
  const config = getConfig();

  if (!config.isConfigured) {
    throw new Error('EverMem API key not configured');
  }

  const {
    topK = 10,
    retrieveMethod = 'hybrid',
    memoryTypes = ['episodic_memory']
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Build request body (API uses GET with body - need curl since fetch doesn't support it)
    const requestBody = {
      query,
      retrieve_method: retrieveMethod,
      top_k: topK,
      include_metadata: true,
      memory_types: memoryTypes
    };
    // Scope to user and group
    if (config.userId) {
      requestBody.user_id = config.userId;
    }
    if (config.groupId) {
      requestBody.group_id = config.groupId;
    }

    clearTimeout(timeoutId);

    // Use curl since Node.js fetch doesn't support GET with body
    // Escape single quotes in JSON for shell safety: ' -> '\''
    const jsonBody = JSON.stringify(requestBody).replace(/'/g, "'\\''");
    const curlCmd = `curl -s -X GET "${config.apiBaseUrl}/api/v0/memories/search" -H "Authorization: Bearer ${config.apiKey}" -H "Content-Type: application/json" -d '${jsonBody}'`;

    // Return debug info along with result
    let result, data;
    try {
      result = execSync(curlCmd, { timeout: TIMEOUT_MS, encoding: 'utf8' });
      data = JSON.parse(result);
    } catch (e) {
      // Return error info for debugging
      return {
        _debug: {
          curl: curlCmd.replace(config.apiKey, 'API_KEY_HIDDEN'),
          requestBody,
          error: e.message,
          stdout: e.stdout?.toString(),
          stderr: e.stderr?.toString()
        }
      };
    }

    // Attach debug info to response
    data._debug = {
      curl: curlCmd.replace(config.apiKey, 'API_KEY_HIDDEN'),
      requestBody
    };
    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error(`API timeout after ${TIMEOUT_MS}ms`);
    }
    throw error;
  }
}

/**
 * Transform API response to plugin memory format
 * @param {Object} apiResponse - Raw API response
 * @returns {Object[]} Formatted memories
 */
export function transformSearchResults(apiResponse) {
  if (!apiResponse?.result) {
    return [];
  }

  const memories = [];
  const result = apiResponse.result;
  const memoryList = result.memories || [];

  // API returns: memories[].episode for content, memories[].subject for title, memories[].score for relevance
  for (let i = 0; i < memoryList.length; i++) {
    const mem = memoryList[i];

    // Use episode as the content
    const content = mem.episode || '';
    if (!content) continue;

    memories.push({
      text: content,
      subject: mem.subject || '',  // Title for display
      timestamp: mem.timestamp || new Date().toISOString(),
      memoryType: mem.memory_type,  // Keep raw type if needed
      score: mem.score || 0,  // Score is now inside each memory object
      metadata: {
        groupId: mem.group_id,
        type: mem.type,
        participants: mem.participants
      }
    });
  }

  // Sort by score descending
  memories.sort((a, b) => b.score - a.score);

  return memories;
}


/**
 * Add a memory to EverMem Cloud
 * @param {Object} message - Message to store
 * @param {string} message.content - Message content
 * @param {string} message.role - 'user' or 'assistant'
 * @param {string} message.messageId - Unique message ID
 * @returns {Promise<Object>} API response
 */
export async function addMemory(message) {
  const config = getConfig();

  if (!config.isConfigured) {
    throw new Error('EverMem API key not configured');
  }

  const url = `${config.apiBaseUrl}/api/v0/memories`;
  const requestBody = {
    message_id: message.messageId || generateMessageId(),
    create_time: new Date().toISOString(),
    sender: message.role === 'assistant' ? 'claude-assistant' : config.userId,
    sender_name: message.role === 'assistant' ? 'Claude' : 'User',
    role: message.role || 'user',
    content: message.content,
    group_id: config.groupId,
    group_name: 'Claude Code Session'
  };

  // Make the actual API call
  let response, responseText, responseData, status, ok;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    status = response.status;
    ok = response.ok;
    responseText = await response.text();
    try {
      responseData = JSON.parse(responseText);
    } catch {}
  } catch (fetchError) {
    status = 0;
    ok = false;
    responseText = fetchError.message;
  }

  // Always return full info for debugging
  return {
    url,
    body: requestBody,
    status,
    ok,
    response: responseData || responseText
  };
}

/**
 * Generate a unique message ID
 * @returns {string} Message ID
 */
function generateMessageId() {
  return `cc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get memories from EverMem Cloud (ordered by time, old to new)
 * @param {Object} options - Options
 * @param {number} options.limit - Max results (default: 100)
 * @param {string} options.memoryType - Memory type filter (default: 'episodic_memory')
 * @returns {Promise<Object>} API response with memories
 */
export async function getMemories(options = {}) {
  const config = getConfig();

  if (!config.isConfigured) {
    throw new Error('EverMem API key not configured');
  }

  const {
    limit = 100,
    memoryType = 'episodic_memory'
  } = options;

  // Build query params
  const params = new URLSearchParams({
    user_id: config.userId,
    memory_type: memoryType,
    limit: limit.toString()
  });

  if (config.groupId) {
    params.append('group_id', config.groupId);
  }

  const url = `${config.apiBaseUrl}/api/v0/memories?${params}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Transform getMemories response to simple format
 * @param {Object} apiResponse - Raw API response
 * @returns {Object[]} Formatted memories (newest first, sorted by timestamp)
 */
export function transformGetMemoriesResults(apiResponse) {
  if (!apiResponse?.result?.memories) {
    return [];
  }

  const memories = apiResponse.result.memories.map(mem => ({
    text: mem.episode || '',
    subject: mem.subject || '',
    timestamp: mem.timestamp || mem.create_time || new Date().toISOString(),
    groupId: mem.group_id
  })).filter(m => m.text);

  // Sort by timestamp descending (newest first)
  memories.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return memories;
}
