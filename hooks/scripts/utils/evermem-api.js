/**
 * EverMem Cloud API client
 * Handles memory search and storage operations
 */

import { getConfig } from './config.js';

const TIMEOUT_MS = 5000;

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
    const response = await fetch(`${config.apiBaseUrl}/api/v1/memories/search`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        user_id: config.userId,
        group_id: config.groupId,
        memory_types: memoryTypes,
        retrieve_method: retrieveMethod,
        top_k: topK,
        include_metadata: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('API timeout');
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
  if (!apiResponse?.result?.memories) {
    return [];
  }

  const memories = [];
  const memoryGroups = apiResponse.result.memories;
  const scores = apiResponse.result.scores || [];

  // Flatten memory groups
  for (let i = 0; i < memoryGroups.length; i++) {
    const group = memoryGroups[i];
    const groupScores = scores[i] || {};

    // Handle different memory type structures
    for (const [type, items] of Object.entries(group)) {
      if (!Array.isArray(items)) continue;

      const typeScores = groupScores[type] || [];

      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        memories.push({
          text: item.content || item.text || JSON.stringify(item),
          timestamp: item.created_at || item.timestamp || new Date().toISOString(),
          type: mapMemoryType(type),
          score: typeScores[j] || 0,
          metadata: item.metadata || {}
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

  if (!config.isConfigured) {
    throw new Error('EverMem API key not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${config.apiBaseUrl}/api/v1/memories`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message_id: message.messageId || generateMessageId(),
        create_time: new Date().toISOString(),
        sender: config.userId,
        sender_name: message.role === 'assistant' ? 'Claude' : 'User',
        role: message.role || 'user',
        content: message.content,
        group_id: config.groupId,
        group_name: 'Claude Code Session'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('API timeout');
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
