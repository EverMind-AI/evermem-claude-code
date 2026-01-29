#!/usr/bin/env node

/**
 * Memory Plugin - UserPromptSubmit Hook
 *
 * This hook automatically injects relevant memories from past sessions
 * into Claude's context when the user submits a prompt.
 *
 * Flow:
 * 1. Read prompt from stdin
 * 2. Skip if prompt is too short (< 3 words)
 * 3. Search mock memories for candidates
 * 4. Use Claude SDK to filter and summarize relevant memories
 * 5. Display summary to user (via systemMessage)
 * 6. Inject context for Claude (via additionalContext)
 */

import { loadMemories, formatRelativeTime } from './utils/mock-store.js';
import { searchMemories, countWords } from './utils/mock-search.js';
import { filterAndSummarize, createFallbackResult } from './utils/sdk-filter.js';

const MIN_WORDS = 3;

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

    // Load and search memories
    const memories = loadMemories();
    const candidates = searchMemories(prompt, memories);

    // No matches found
    if (candidates.length === 0) {
      process.exit(0);
    }

    // Try SDK filtering
    let result;
    let usedFallback = false;

    try {
      result = await filterAndSummarize(prompt, candidates);
    } catch (error) {
      // Fallback to raw top-3
      result = createFallbackResult(candidates, 3);
      usedFallback = true;
    }

    // No relevant memories after filtering
    if (!result.selected || result.selected.length === 0) {
      process.exit(0);
    }

    // Build context for Claude
    const context = buildContext(result, candidates);

    // Build display message for user (includes context text)
    const displayMessage = buildDisplayMessage(result.selected, usedFallback, context);

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
    process.exit(0);  // Non-blocking - continue without memories
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
 * @param {boolean} isFallback - Whether fallback mode was used
 * @param {string} contextText - The text added to Claude's context
 * @returns {string}
 */
function buildDisplayMessage(memories, isFallback, contextText) {
  const header = isFallback
    ? `📝 Memory Recall by EverMem Plugin (${memories.length} memories, fallback mode):`
    : `📝 Memory Recall by EverMem Plugin (${memories.length} memories):`;

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
 * @param {Object} result - SDK filter result
 * @param {Object[]} candidates - Original candidate memories
 * @returns {string}
 */
function buildContext(result, candidates) {
  const lines = [];

  lines.push('<relevant-memories>');
  lines.push('The following memories from past sessions are relevant to the user\'s current task:');
  lines.push('');

  // Add individual memories with full text
  for (const memory of result.selected) {
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
