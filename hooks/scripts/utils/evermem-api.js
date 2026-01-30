/**
 * EverMem Cloud API client
 * Handles memory search and storage operations
 */

import { getConfig } from './config.js';
import { appendFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

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
    // Build query params for GET request
    const params = new URLSearchParams({
      query,
      user_id: config.userId,
      retrieve_method: retrieveMethod,
      top_k: String(topK),
      include_metadata: 'true'
    });
    if (config.groupId) {
      params.append('group_id', config.groupId);
    }
    for (const memType of memoryTypes) {
      params.append('memory_types', memType);
    }

    const response = await fetch(`${config.apiBaseUrl}/api/v1/memories/search?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
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
  const memoryGroups = result.memories || [];
  const originalData = result.original_data || [];
  const scoreGroups = result.scores || [];

  // Iterate through memory groups and match with original_data for content
  for (let i = 0; i < memoryGroups.length; i++) {
    const memoryGroup = memoryGroups[i];
    const dataGroup = originalData[i] || {};
    const scoresForGroup = scoreGroups[i] || {};

    // Each group is keyed by group_id
    for (const [groupId, memoryItems] of Object.entries(memoryGroup)) {
      if (!Array.isArray(memoryItems)) continue;

      const dataItems = dataGroup[groupId] || [];
      const scores = scoresForGroup[groupId] || [];

      for (let j = 0; j < memoryItems.length; j++) {
        const memoryMeta = memoryItems[j];
        const dataItem = dataItems[j];
        const score = scores[j] || 0;

        // Extract content from original_data
        let content = '';
        if (dataItem?.messages && Array.isArray(dataItem.messages)) {
          // Combine all messages in the conversation
          content = dataItem.messages
            .map(msg => msg.content)
            .filter(Boolean)
            .join('\n\n');
        } else if (dataItem?.content) {
          content = dataItem.content;
        }

        if (!content) continue;

        memories.push({
          text: content,
          timestamp: memoryMeta.timestamp || new Date().toISOString(),
          type: mapMemoryType(memoryMeta.memory_type),
          score: score,
          metadata: {
            groupId: memoryMeta.group_id,
            type: memoryMeta.type,
            participants: memoryMeta.participants
          }
        });
      }
    }
  }

  // Sort by score descending
  memories.sort((a, b) => b.score - a.score);

  return memories;
}

/**
 * Map API memory types to display types
 * @param {string} apiType - API memory type
 * @returns {string} Display type
 */
function mapMemoryType(apiType) {
  const typeMap = {
    'episodic_memory': 'implementation',
    'profile': 'preference',
    'foresight': 'decision',
    'event_log': 'learning'
  };
  return typeMap[apiType] || 'implementation';
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

  debugLog('addMemory called', {
    role: message.role,
    contentLength: message.content?.length,
    messageId: message.messageId
  });

  if (!config.isConfigured) {
    debugLog('addMemory: Not configured');
    throw new Error('EverMem API key not configured');
  }

  debugLog('addMemory config', {
    apiBaseUrl: config.apiBaseUrl,
    userId: config.userId,
    groupId: config.groupId,
    hasApiKey: !!config.apiKey
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const requestBody = {
    message_id: message.messageId || generateMessageId(),
    create_time: new Date().toISOString(),
    sender: config.userId,
    sender_name: message.role === 'assistant' ? 'Claude' : 'User',
    role: message.role || 'user',
    content: message.content,
    group_id: config.groupId,
    group_name: 'Claude Code Session'
  };

  debugLog('addMemory request body', {
    message_id: requestBody.message_id,
    sender: requestBody.sender,
    role: requestBody.role,
    group_id: requestBody.group_id,
    contentPreview: requestBody.content?.substring(0, 100)
  });

  try {
    const url = `${config.apiBaseUrl}/api/v1/memories`;
    debugLog('addMemory POST', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    debugLog('addMemory response status', response.status);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      debugLog('addMemory error response', errorBody);
      throw new Error(`API error ${response.status}: ${errorBody}`);
    }

    const result = await response.json();
    debugLog('addMemory success', result);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    debugLog('addMemory exception', error.message);

    if (error.name === 'AbortError') {
      throw new Error(`API timeout after ${TIMEOUT_MS}ms`);
    }
    throw error;
  }
}

/**
 * Generate a unique message ID
 * @returns {string} Message ID
 */
function generateMessageId() {
  return `cc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
