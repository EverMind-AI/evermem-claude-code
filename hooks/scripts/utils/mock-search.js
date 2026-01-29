/**
 * Simple substring search for mock memories
 * To be replaced with semantic retrieval in production
 */

const MAX_CANDIDATES = 15;

/**
 * @typedef {Object} Memory
 * @property {string} text - The memory content
 * @property {string} timestamp - ISO timestamp when memory was created
 */

/**
 * Search memories for matches to query terms
 * @param {string} query - User's prompt
 * @param {Memory[]} memories - Array of memory objects
 * @returns {Memory[]} Matching memories (max 15)
 */
export function searchMemories(query, memories) {
  if (!query || !memories || memories.length === 0) {
    return [];
  }

  // Split query into terms, filter out very short terms
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 2);

  if (queryTerms.length === 0) {
    return [];
  }

  // Find memories that match any query term
  const matches = memories.filter(memory => {
    const memoryLower = memory.text.toLowerCase();
    return queryTerms.some(term => memoryLower.includes(term));
  });

  // Return up to MAX_CANDIDATES
  return matches.slice(0, MAX_CANDIDATES);
}

/**
 * Count words in a string
 * @param {string} text - Input text
 * @returns {number} Word count
 */
export function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
