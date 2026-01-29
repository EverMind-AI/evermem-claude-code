#!/usr/bin/env node

/**
 * Memory Plugin - Stop Hook
 *
 * This hook stores conversation messages to EverMem Cloud
 * when Claude finishes responding.
 *
 * Flow:
 * 1. Read hook input from stdin (contains transcript_path)
 * 2. Read transcript file to get messages
 * 3. Extract user message and assistant response
 * 4. Send to EverMem Cloud for storage
 * 5. Exit silently (non-blocking)
 */

import { isConfigured } from './utils/config.js';
import { addMemory } from './utils/evermem-api.js';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DEBUG = process.env.EVERMEM_DEBUG === '1';
const LOG_FILE = join(homedir(), '.evermem-debug.log');

function debugLog(msg, data = null) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] ${msg}`;
  if (data !== null) {
    line += `: ${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`;
  }
  appendFileSync(LOG_FILE, line + '\n');
}

/**
 * Main hook handler
 */
async function main() {
  try {
    debugLog('Stop hook started');

    // Skip if not configured
    if (!isConfigured()) {
      debugLog('Not configured, skipping');
      process.exit(0);
    }

    // Read stdin to get hook input
    const input = await readStdin();
    debugLog('Received input length', input.length);

    const hookInput = JSON.parse(input);
    debugLog('Hook input keys', Object.keys(hookInput));

    // Get transcript path from hook input
    const transcriptPath = hookInput.transcript_path;
    debugLog('Transcript path', transcriptPath);

    if (!transcriptPath || !existsSync(transcriptPath)) {
      debugLog('Transcript file not found');
      process.exit(0);
    }

    // Read and parse transcript file (JSONL format - one JSON object per line)
    const transcriptContent = readFileSync(transcriptPath, 'utf8');
    const lines = transcriptContent.trim().split('\n').filter(line => line.trim());
    debugLog('Transcript lines count', lines.length);

    const messages = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'user' || entry.type === 'assistant') {
          messages.push(entry);
        }
      } catch (e) {
        // Skip invalid JSON lines
      }
    }
    debugLog('Parsed messages count', messages.length);

    if (messages.length === 0) {
      debugLog('No messages found in transcript');
      process.exit(0);
    }

    // Get the last user message and assistant response
    const lastMessages = getLastExchange(messages);
    debugLog('Last exchange', {
      hasUser: !!lastMessages.user,
      hasAssistant: !!lastMessages.assistant,
      userContentLength: lastMessages.user?.content?.length,
      assistantContentLength: lastMessages.assistant?.content?.length
    });

    if (!lastMessages.user && !lastMessages.assistant) {
      debugLog('No user or assistant messages extracted');
      process.exit(0);
    }

    // Store messages to EverMem Cloud (fire and forget)
    const promises = [];

    if (lastMessages.user) {
      debugLog('Storing user message', lastMessages.user.content.substring(0, 100));
      promises.push(
        addMemory({
          content: lastMessages.user.content,
          role: 'user',
          messageId: `user_${Date.now()}`
        }).then(() => debugLog('User message stored successfully'))
          .catch((err) => debugLog('User message store error', err.message))
      );
    }

    if (lastMessages.assistant) {
      debugLog('Storing assistant message', lastMessages.assistant.content.substring(0, 100));
      promises.push(
        addMemory({
          content: lastMessages.assistant.content,
          role: 'assistant',
          messageId: `assistant_${Date.now()}`
        }).then(() => debugLog('Assistant message stored successfully'))
          .catch((err) => debugLog('Assistant message store error', err.message))
      );
    }

    // Wait for all storage operations (with timeout)
    await Promise.race([
      Promise.all(promises),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);

    debugLog('Stop hook completed');
    process.exit(0);

  } catch (error) {
    debugLog('Stop hook error', error.message);
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
    const role = msg.type || msg.role;

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

  // Direct message content
  if (msg.message) {
    // Transcript format: { type: "user", message: { role: "user", content: [...] } }
    const content = msg.message.content;
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
    }
  }

  // Direct content field
  if (typeof msg.content === 'string') {
    return msg.content;
  }

  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }

  return '';
}

// Run
main();
