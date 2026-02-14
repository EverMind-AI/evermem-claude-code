#!/usr/bin/env node

/**
 * EverMem Stop Hook - Store Memories
 *
 * Extracts Q&A pairs from the current turn and uploads to EverMem Cloud.
 *
 * Key Features:
 * - Identifies individual Q&A pairs within a turn (not just merge all content)
 * - Handles user interruptions ([Request interrupted by user])
 * - Distinguishes user questions (string) from tool results (array)
 * - Uploads all complete Q&A pairs
 */

process.on('uncaughtException', () => process.exit(0));
process.on('unhandledRejection', () => process.exit(0));

import { readFileSync, existsSync } from 'fs';
import { isConfigured } from './utils/config.js';
import { addMemory } from './utils/evermem-api.js';

// Content length limits
// User: truncate if too long (context compaction summaries are typically ~10KB)
// Assistant: truncate if too long (valuable content, keep but limit size)
const MAX_USER_LENGTH = 2000;              // User content > 2000 chars → truncate
const MAX_USER_CONCAT_LENGTH = 6000;       // Stop concatenating user content at this limit
const MAX_ASSISTANT_LENGTH = 4000;         // Assistant content > 4000 chars → truncate
const MAX_ASSISTANT_CONCAT_LENGTH = 15000; // Stop concatenating assistant text blocks at this limit

/**
 * Truncate content if it exceeds max length
 * @param {string} content - Content to truncate
 * @param {number} maxLength - Maximum length (default: MAX_ASSISTANT_LENGTH)
 */
function truncateContent(content, maxLength = MAX_ASSISTANT_LENGTH) {
  if (!content || content.length <= maxLength) {
    return { content, truncated: false, originalLength: content?.length || 0 };
  }
  const originalLength = content.length;
  return {
    content: content.substring(0, maxLength) + `\n\n[... truncated, original: ${originalLength} chars]`,
    truncated: true,
    originalLength
  };
}

/**
 * Check if line is a user question (new Q&A start)
 * Key: content must be a STRING (not array)
 */
function isUserQuestion(line) {
  return line.type === 'user'
    && line.message?.role === 'user'
    && typeof line.message?.content === 'string';
}

/**
 * Check if line is an interrupt marker
 */
function isInterruptMarker(line) {
  if (line.type !== 'user') return false;
  const content = line.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some(c =>
    c.type === 'text' && c.text === '[Request interrupted by user]'
  );
}

/**
 * Check if line is assistant text response
 */
function isAssistantText(line) {
  if (line.type !== 'assistant') return false;
  const content = line.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some(c => c.type === 'text');
}

/**
 * Extract text from assistant message
 */
function extractAssistantText(line) {
  const content = line.message?.content || [];
  return content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n\n');
}

/**
 * Check if content is meaningful (not system messages or empty responses)
 */
function hasContent(text) {
  if (!text || !text.trim()) return false;
  const trimmed = text.trim();

  // Filter out system messages (various XML-like tags)
  if (trimmed.startsWith('<local-command-')) return false;
  if (trimmed.startsWith('<system-reminder>')) return false;
  if (trimmed.startsWith('<command-name>')) return false;
  if (trimmed.startsWith('<local-command-caveat>')) return false;

  // Filter out no-op responses
  if (trimmed === 'No response requested.') return false;

  return true;
}

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const hookInput = JSON.parse(input);
  const transcriptPath = hookInput.transcript_path;

  if (hookInput.cwd) {
    process.env.EVERMEM_CWD = hookInput.cwd;
  }

  if (!transcriptPath || !existsSync(transcriptPath) || !isConfigured()) {
    process.exit(0);
  }

  /**
   * Read transcript file with retry logic
   */
  async function readTranscriptWithRetry(path, maxRetries = 5, delayMs = 100) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const content = readFileSync(path, 'utf8');
      const lines = content.trim().split('\n');

      let isComplete = false;
      try {
        const lastLine = JSON.parse(lines[lines.length - 1]);
        isComplete = lastLine.type === 'system' && lastLine.subtype === 'turn_duration';
      } catch {}

      if (isComplete) {
        return lines;
      }

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    const content = readFileSync(path, 'utf8');
    return content.trim().split('\n');
  }

  const lines = await readTranscriptWithRetry(transcriptPath);

  /**
   * Extract Q&A pairs from the last turn
   *
   * New Logic:
   * - user(string) starts a new Q&A
   * - [Request interrupted by user] discards current Q&A
   * - assistant(text) appends to current Q&A
   * - Only Q&A pairs with both user AND assistant content are saved
   */
  function extractQAPairs(lines) {
    // Find turn start: after the last turn_duration marker
    let turnStartIndex = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const e = JSON.parse(lines[i]);
        if (e.type === 'system' && e.subtype === 'turn_duration') {
          turnStartIndex = i + 1;
          break;
        }
      } catch {}
    }

    const qaPairs = [];
    let currentQA = null;

    for (let i = turnStartIndex; i < lines.length; i++) {
      let line;
      try {
        line = JSON.parse(lines[i]);
      } catch {
        continue;
      }

      // 1. User question starts a new Q&A
      if (isUserQuestion(line)) {
        // Save previous Q&A if it has an answer
        if (currentQA && hasContent(currentQA.assistant)) {
          qaPairs.push(currentQA);
        }
        // Start new Q&A
        currentQA = {
          user: line.message.content,
          assistant: '',
          timestamp: line.timestamp
        };
      }

      // 2. Interrupt marker - discard current Q&A
      else if (isInterruptMarker(line)) {
        currentQA = null;
      }

      // 3. Assistant text - append to current Q&A (with concat limit)
      else if (isAssistantText(line) && currentQA) {
        // Stop concatenating if already at limit
        if (currentQA.assistant.length >= MAX_ASSISTANT_CONCAT_LENGTH) {
          continue;
        }
        const text = extractAssistantText(line);
        if (text) {
          const newContent = (currentQA.assistant ? '\n\n' : '') + text;
          // Only add if it doesn't exceed concat limit too much
          if (currentQA.assistant.length + newContent.length <= MAX_ASSISTANT_CONCAT_LENGTH) {
            currentQA.assistant += newContent;
          } else {
            // Add partial content up to limit
            const remaining = MAX_ASSISTANT_CONCAT_LENGTH - currentQA.assistant.length;
            if (remaining > 100) {  // Only add if meaningful amount left
              currentQA.assistant += newContent.substring(0, remaining);
            }
          }
        }
      }
    }

    // Save last Q&A if it has an answer
    if (currentQA && hasContent(currentQA.assistant)) {
      qaPairs.push(currentQA);
    }

    return qaPairs;
  }

  // Extract Q&A pairs from the current turn
  const qaPairs = extractQAPairs(lines);

  if (qaPairs.length === 0) {
    // No complete Q&A pairs to save
    process.exit(0);
  }

  // Only save the LAST Q&A pair (current conversation)
  // This avoids duplicates from timing issues where turn_duration isn't written yet
  const lastQA = qaPairs[qaPairs.length - 1];
  const qaPairsToSave = [lastQA];

  // Upload Q&A pair(s)
  const promises = [];
  const results = [];

  for (let i = 0; i < qaPairsToSave.length; i++) {
    const qa = qaPairsToSave[i];
    const timestamp = Date.now() + i; // Ensure unique timestamps

    // Upload user content (truncate if too long)
    if (hasContent(qa.user)) {
      // Limit user content before truncation (in case of very long content)
      const limitedUser = qa.user.length > MAX_USER_CONCAT_LENGTH
        ? qa.user.substring(0, MAX_USER_CONCAT_LENGTH)
        : qa.user;
      const { content: userContent, truncated: userTruncated } = truncateContent(limitedUser, MAX_USER_LENGTH);
      const userLen = qa.user.length;
      promises.push(
        addMemory({ content: userContent, role: 'user', messageId: `u_${timestamp}` })
          .then(r => results.push({ type: 'USER', len: userLen, truncated: userTruncated || qa.user.length > MAX_USER_CONCAT_LENGTH, qaIndex: i, ...r }))
          .catch(e => results.push({ type: 'USER', len: userLen, truncated: userTruncated || qa.user.length > MAX_USER_CONCAT_LENGTH, qaIndex: i, ok: false, error: e.message }))
      );
    }

    // Upload assistant content (truncate if too long, but always save)
    if (hasContent(qa.assistant)) {
      const { content: assistantContent, truncated: assistantTruncated } = truncateContent(qa.assistant, MAX_ASSISTANT_LENGTH);
      const assistantLen = qa.assistant.length;
      promises.push(
        addMemory({ content: assistantContent, role: 'assistant', messageId: `a_${timestamp}` })
          .then(r => results.push({ type: 'ASSISTANT', len: assistantLen, truncated: assistantTruncated, qaIndex: i, ...r }))
          .catch(e => results.push({ type: 'ASSISTANT', len: assistantLen, truncated: assistantTruncated, qaIndex: i, ok: false, error: e.message }))
      );
    }
  }

  await Promise.all(promises);

  // Check results
  const allSuccess = results.length > 0 && results.every(r => r.ok && !r.error);

  let output = '';

  if (allSuccess) {
    // Build detailed output - sort by type to show user first, then assistant
    const sortedResults = [...results].sort((a, b) => {
      if (a.type === 'USER' && b.type === 'ASSISTANT') return -1;
      if (a.type === 'ASSISTANT' && b.type === 'USER') return 1;
      return 0;
    });

    const details = sortedResults.map(r => {
      let info = `${r.type.toLowerCase()}: ${r.len}`;
      if (r.truncated) info += ' (truncated)';
      return info;
    }).join(', ');

    output = `💾 Memory saved (${results.length}) [${details}]`;
    process.stdout.write(JSON.stringify({ systemMessage: output }));
    process.exit(0);
  } else if (results.length === 0) {
    process.exit(0);
  } else {
    // Partial failure
    const succeeded = results.filter(r => r.ok && !r.error).length;
    const failed = results.filter(r => !r.ok || r.error).length;

    output = `💾 EverMem: ${succeeded} saved, ${failed} failed\n`;
    for (const r of results) {
      if (r.error) {
        output += `  • ${r.type} (Q&A ${r.qaIndex + 1}): ERROR - ${r.error}\n`;
      } else if (!r.ok) {
        output += `  • ${r.type} (Q&A ${r.qaIndex + 1}): FAILED (${r.status})\n`;
      }
    }
    process.stdout.write(JSON.stringify({ systemMessage: output }));
  }

} catch (e) {
  process.exit(0);
}
