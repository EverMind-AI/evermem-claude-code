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

    // Skip short prompts
    if (countWords(prompt) < MIN_WORDS) {
      process.exit(0);
    }

    // Skip if not configured
    if (!isConfigured()) {
      process.exit(0);
    }

    // Search memories from EverMem Cloud
    let memories = [];
    try {
      const apiResponse = await searchMemories(prompt, {
        topK: 15,
        retrieveMethod: 'hybrid'
      });
      memories = transformSearchResults(apiResponse);
    } catch (error) {
      // API error - skip silently
      process.exit(0);
    }

    // No memories found
    if (memories.length === 0) {
      process.exit(0);
    }

    // Take top memories
    const selectedMemories = memories.slice(0, MAX_MEMORIES);

    // Build context for Claude
    const context = buildContext(selectedMemories);

    // Build display message for user
    const displayMessage = buildDisplayMessage(selectedMemories, context);

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
    // Non-blocking - continue without memories
    process.exit(0);
  }
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
 * @param {string} contextText - The text added to Claude's context
 * @returns {string}
 */
function buildDisplayMessage(memories, contextText) {
  const header = `📝 Memory Recall by EverMem Plugin (${memories.length} memories):`;

  const lines = [header];

  for (const memory of memories) {
    const relTime = formatRelativeTime(memory.timestamp);
    const shortText = memory.text.length > 80
      ? memory.text.slice(0, 80) + '...'
      : memory.text;
    lines.push(`  • (${relTime}) ${shortText}`);
  }

  lines.push('');
  lines.push('Added to context:');
  lines.push(contextText);

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
    const typeName = memory.type.replace('_', ' ');
    lines.push(`[${typeName}] ${memory.text}`);
    lines.push('');
  }

  lines.push('Use this context to inform your response. The user has already seen these memories displayed.');
  lines.push('</relevant-memories>');

  return lines.join('\n');
}

// Run
main();
