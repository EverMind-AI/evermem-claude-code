/**
 * EverMem Cloud API client
 * Handles memory search and storage operations
 */

import { getConfig, getKeyId } from './config.js';
import https from 'https';
import http from 'http';

/**
 * Make HTTP/HTTPS request with body (supports GET with body)
 * @param {string} url - Full URL
 * @param {Object} options - Request options (method, headers)
 * @param {string} body - Request body
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<{status: number, data: Object}>}
 */
function httpRequest(url, options, body, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    // Add Content-Length header if body is provided
    if (body) {
      options.headers = options.headers || {};
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = client.request(urlObj, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms`));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

const TIMEOUT_MS = 30000; // 30 seconds

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
      radius: 0.1,  // Server-side similarity threshold (local MIN_SCORE provides double filtering)
      include_metadata: true,
      memory_types: memoryTypes
    };
    // Scope to user and group
    if (config.userId) {
      requestBody.user_id = config.userId;
    }
    if (config.groupId) {
      requestBody.group_ids = [config.groupId];
    }
    clearTimeout(timeoutId);

    // Use native https module (supports GET with body, no shell injection risk)
    const url = `${config.apiBaseUrl}/api/v0/memories/search`;
    const jsonBody = JSON.stringify(requestBody);

      try {
      const { status, data } = await httpRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      }, jsonBody, TIMEOUT_MS);

      return data;
    } catch (e) {
      // Return empty result on error
      return { error: e.message };
    }
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
 * @param {string} [message.messageId] - Unique message ID (auto-generated if not provided)
 * @param {string} [message.senderName] - Custom sender name (default: 'User' or 'Claude')
 * @param {boolean} [message.flush] - Force memory extraction (for session end)
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
    sender_name: message.senderName || (message.role === 'assistant' ? 'Claude' : 'User'),
    role: message.role || 'user',
    content: message.content,
    group_id: config.groupId
  };

  // Add flush parameter if specified (forces memory extraction)
  if (message.flush) {
    requestBody.flush = true;
  }

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
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.pageSize - Results per page (default: 100, max: 100)
 * @param {string} options.memoryType - Memory type filter (default: 'episodic_memory')
 * @returns {Promise<Object>} API response with memories
 */
export async function getMemories(options = {}) {
  const config = getConfig();

  if (!config.isConfigured) {
    throw new Error('EverMem API key not configured');
  }

  const {
    page = 1,
    pageSize = 100,
    memoryType = 'episodic_memory'
  } = options;

  // Build query params
  const params = new URLSearchParams({
    user_id: config.userId,
    memory_type: memoryType,
    page: page.toString(),
    page_size: pageSize.toString()
  });

  if (config.groupId) {
    params.append('group_ids', [config.groupId]);
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

/**
 * Set conversation metadata in EverMem Cloud
 * Called when a new group is created for the first time
 * @param {Object} options - Metadata options
 * @param {string} options.groupId - The group ID
 * @param {string} options.projectName - Project folder name
 * @param {string} options.projectPath - Full path to the project
 * @param {string} options.keyId - Hashed API key identifier
 * @returns {Promise<Object>} API response with status
 */
export async function setConversationMetadata(options) {
  const config = getConfig();

  if (!config.isConfigured) {
    return { ok: false, error: 'API key not configured' };
  }

  const { groupId, projectName, projectPath, keyId } = options;
  const url = `${config.apiBaseUrl}/api/v0/memories/conversation-meta`;
  const timestamp = new Date().toISOString();

  // This is the same info written to groups.jsonl
  const groupEntry = {
    keyId,
    groupId,
    name: projectName,
    path: projectPath,
    timestamp
  };

  const requestBody = {
    created_at: timestamp,
    description: `Claude Code project: ${projectPath}`,
    tags: ['claude-plugin', 'claude-code', projectName],
    user_details: {
      [config.userId]: {
        full_name: 'User',
        role: 'user',
        custom_role: 'developer'
      },
      'claude-assistant': {
        full_name: 'Claude',
        role: 'assistant',
        custom_role: 'ai-assistant',
        extra: {
          scene_desc: groupEntry,
          scene: 'assistant'
        }
      }
    },
    group_id: groupId,
    name: 'Claude ' + projectName
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}
