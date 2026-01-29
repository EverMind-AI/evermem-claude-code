#!/usr/bin/env node

/**
 * Memory Plugin - Stop Hook
 *
 * This hook stores conversation messages to EverMem Cloud
 * when Claude finishes responding.
 *
 * Flow:
 * 1. Read hook input from stdin
 * 2. Extract user message and assistant response
 * 3. Send to EverMem Cloud for storage
 * 4. Exit silently (non-blocking)
 */

import { isConfigured } from './utils/config.js';
import { addMemory } from './utils/evermem-api.js';

/**
 * Main hook handler
 */
async function main() {
  try {
    // Skip if not configured
    if (!isConfigured()) {
      process.exit(0);
    }

    // Read stdin
    const input = await readStdin();
    const data = JSON.parse(input);

    // Extract messages from Stop hook input
    const stopInput = data.stopHookInput;
    if (!stopInput?.messages || stopInput.messages.length === 0) {
      process.exit(0);
    }

    const messages = stopInput.messages;

    // Get the last user message and assistant response
    const lastMessages = getLastExchange(messages);

    if (!lastMessages.user && !lastMessages.assistant) {
      process.exit(0);
    }

    // Store messages to EverMem Cloud (fire and forget)
    const promises = [];

    if (lastMessages.user) {
      promises.push(
        addMemory({
          content: lastMessages.user.content,
          role: 'user',
          messageId: `user_${Date.now()}`
        }).catch(() => {}) // Ignore errors
      );
    }

    if (lastMessages.assistant) {
      promises.push(
        addMemory({
          content: lastMessages.assistant.content,
          role: 'assistant',
          messageId: `assistant_${Date.now()}`
        }).catch(() => {}) // Ignore errors
      );
    }

    // Wait for all storage operations (with timeout)
    await Promise.race([
      Promise.all(promises),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);

    process.exit(0);

  } catch (error) {
    // Non-blocking - exit silently
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
 * Extract the last user-assistant exchange from messages
 * @param {Object[]} messages - Array of message objects
 * @returns {Object} Last user and assistant messages
 */
function getLastExchange(messages) {
  let lastUser = null;
  let lastAssistant = null;

  // Iterate from end to find the last exchange
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const role = msg.role || (msg.type === 'human' ? 'user' : 'assistant');

    if (role === 'assistant' && !lastAssistant) {
      lastAssistant = {
        content: extractContent(msg),
        role: 'assistant'
      };
    } else if (role === 'user' && !lastUser) {
      lastUser = {
        content: extractContent(msg),
        role: 'user'
      };
    }

    // Stop once we have both
    if (lastUser && lastAssistant) {
      break;
    }
  }

  return { user: lastUser, assistant: lastAssistant };
}

/**
 * Extract text content from a message
 * @param {Object} msg - Message object
 * @returns {string} Text content
 */
function extractContent(msg) {
  // Handle different message formats
  if (typeof msg.content === 'string') {
    return msg.content;
  }

  if (Array.isArray(msg.content)) {
    // Extract text from content blocks
    return msg.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }

  if (msg.message?.content) {
    return extractContent(msg.message);
  }

  return '';
}

// Run
main();
