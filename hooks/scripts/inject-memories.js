#!/usr/bin/env node

/**
 * Memory Plugin - UserPromptSubmit Hook
 *
 * This hook automatically injects relevant memories from past sessions
 * into Claude's context when the user submits a prompt.
 *
 * Flow:
 * 1. Read prompt from stdin
 * 2. Skip if prompt is too short or API not configured
 * 3. Search EverMem Cloud for relevant memories
 * 4. Optionally filter with Claude SDK
 * 5. Display summary to user (via systemMessage)
 * 6. Inject context for Claude (via additionalContext)
 */

import { isConfigured } from './utils/config.js';
import { searchMemories, transformSearchResults } from './utils/evermem-api.js';
import { formatRelativeTime } from './utils/mock-store.js';

const MIN_WORDS = 3;
const MAX_MEMORIES = 5;
const MIN_SCORE = 0.1;  // Only show memories with relevance score above this threshold

/**
 * Count words in a string
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Main hook handler
 */
async function main() {
  try {
    // Read stdin
    const input = await readStdin();
    const data = JSON.parse(input);
    const prompt = data.prompt || '';

    // Set cwd from hook input for config.getGroupId()
    if (data.cwd) {
      process.env.EVERMEM_CWD = data.cwd;
    }

    // Skip short prompts silently
    if (countWords(prompt) < MIN_WORDS) {
      process.exit(0);
    }

    // Skip if not configured
    if (!isConfigured()) {
      outputMessage('⚠️ EverMem: API key not configured. Set EVERMEM_API_KEY environment variable.');
      process.exit(0);
    }

    // Search memories from EverMem Cloud
    let memories = [];
    let apiResponse = null;
    try {
      apiResponse = await searchMemories(prompt, {
        topK: 15,
        retrieveMethod: 'hybrid'
      });
      memories = transformSearchResults(apiResponse);
    } catch (error) {
      outputMessage(`❌ EverMem: API error - ${error.message}`);
      process.exit(0);
    }

    // Filter by minimum score threshold
    const relevantMemories = memories.filter(m => m.score >= MIN_SCORE);

    // No relevant memories above threshold - silently exit (this is normal)
    if (relevantMemories.length === 0) {
      process.exit(0);
    }

    // Take top memories
    const selectedMemories = relevantMemories.slice(0, MAX_MEMORIES);

    // Build context for Claude
    const context = buildContext(selectedMemories);

    // Build display message for user
    const displayMessage = buildDisplayMessage(selectedMemories);

    // Output JSON with systemMessage (displays to user) and additionalContext (for Claude)
    const output = {
      systemMessage: displayMessage,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: context
      }
    };

    process.stdout.write(JSON.stringify(output));
    process.exit(0);

  } catch (error) {
    outputMessage(`❌ EverMem: Hook error - ${error.message}`);
    process.exit(0);
  }
}

/**
 * Output a system message to the user
 * @param {string} message - Message to display
 */
function outputMessage(message) {
  const output = { systemMessage: message };
  process.stdout.write(JSON.stringify(output));
}

/**
 * Read all stdin input
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', chunk => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    process.stdin.on('error', reject);
  });
}

/**
 * Build display message for user (shown via systemMessage)
 * @param {Object[]} memories - Selected memories
 * @returns {string}
 */
function buildDisplayMessage(memories) {
  const header = `📝 Memory Recall by EverMem Plugin (${memories.length} memories):`;

  const lines = [header];

  for (const memory of memories) {
    const relTime = formatRelativeTime(memory.timestamp);
    const score = memory.score ? memory.score.toFixed(2) : '0.00';
    // Use subject as title if available, otherwise truncate text
    const title = memory.subject
      ? memory.subject
      : (memory.text.length > 60 ? memory.text.slice(0, 60) + '...' : memory.text);
    lines.push(`  • [${score}] (${relTime}) ${title}`);
  }

  return lines.join('\n');
}

/**
 * Build context string for Claude
 * @param {Object[]} memories - Selected memories
 * @returns {string}
 */
function buildContext(memories) {
  const lines = [];

  lines.push('<relevant-memories>');
  lines.push('The following memories from past sessions are relevant to the user\'s current task:');
  lines.push('');

  for (const memory of memories) {
    lines.push(memory.text);
    lines.push('');
  }

  lines.push('Use this context to inform your response. The user has already seen these memories displayed.');
  lines.push('</relevant-memories>');

  return lines.join('\n');
}

// Run
main();
