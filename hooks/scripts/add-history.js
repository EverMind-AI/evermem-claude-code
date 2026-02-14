#!/usr/bin/env node

/**
 * EverMem Add History Script
 *
 * Extracts all Q&A pairs from the current session and uploads to EverMem Cloud.
 * Used by /evermem:addHistory command for retroactive memory import.
 */

import { readFileSync, existsSync } from 'fs';
import { isConfigured, getGroupId } from './utils/config.js';
import { addMemory } from './utils/evermem-api.js';

// Maximum content length for a single memory (10KB)
const MAX_CONTENT_LENGTH = 10000;

/**
 * Truncate content if it exceeds max length
 */
function truncateContent(content) {
  if (!content || content.length <= MAX_CONTENT_LENGTH) {
    return { content, truncated: false };
  }
  return {
    content: content.substring(0, MAX_CONTENT_LENGTH) + '\n\n[... content truncated]',
    truncated: true
  };
}

/**
 * Check if line is a user question (new Q&A start)
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
function isValidContent(text) {
  if (!text || !text.trim()) return false;
  const trimmed = text.trim();

  // Filter out system messages
  if (trimmed.startsWith('<local-command-')) return false;
  if (trimmed.startsWith('<system-reminder>')) return false;

  // Filter out no-op responses
  if (trimmed === 'No response requested.') return false;

  return true;
}

/**
 * Extract all Q&A pairs from transcript
 */
function extractAllQAPairs(lines) {
  const qaPairs = [];
  let currentQA = null;
  let interruptedCount = 0;
  let systemSkippedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    let line;
    try {
      line = JSON.parse(lines[i]);
    } catch {
      continue;
    }

    // User question starts a new Q&A
    if (isUserQuestion(line)) {
      // Save previous Q&A if valid
      if (currentQA && isValidContent(currentQA.user) && isValidContent(currentQA.assistant)) {
        qaPairs.push(currentQA);
      } else if (currentQA && currentQA.assistant && !isValidContent(currentQA.user)) {
        systemSkippedCount++;
      } else if (currentQA && currentQA.assistant && !isValidContent(currentQA.assistant)) {
        systemSkippedCount++;
      }

      currentQA = {
        user: line.message.content,
        assistant: '',
        timestamp: line.timestamp
      };
    }

    // Interrupt marker - discard current Q&A
    else if (isInterruptMarker(line)) {
      if (currentQA) {
        interruptedCount++;
      }
      currentQA = null;
    }

    // Assistant text - append to current Q&A
    else if (isAssistantText(line) && currentQA) {
      const text = extractAssistantText(line);
      if (text) {
        currentQA.assistant += (currentQA.assistant ? '\n\n' : '') + text;
      }
    }
  }

  // Save last Q&A if valid
  if (currentQA && isValidContent(currentQA.user) && isValidContent(currentQA.assistant)) {
    qaPairs.push(currentQA);
  }

  return { qaPairs, interruptedCount, systemSkippedCount };
}

/**
 * Upload Q&A pairs with progress
 */
async function uploadQAPairs(qaPairs) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  const totalMessages = qaPairs.length * 2;
  let uploaded = 0;

  for (let i = 0; i < qaPairs.length; i++) {
    const qa = qaPairs[i];
    const timestamp = new Date(qa.timestamp).getTime() || Date.now();

    // Upload user content
    try {
      const { content: userContent } = truncateContent(qa.user);
      await addMemory({
        content: userContent,
        role: 'user',
        messageId: `hist_u_${timestamp}_${i}`
      });
      results.success++;
      uploaded++;
    } catch (e) {
      results.failed++;
      results.errors.push(`Q&A ${i + 1} user: ${e.message}`);
    }

    // Upload assistant content
    try {
      const { content: assistantContent } = truncateContent(qa.assistant);
      await addMemory({
        content: assistantContent,
        role: 'assistant',
        messageId: `hist_a_${timestamp}_${i}`
      });
      results.success++;
      uploaded++;
    } catch (e) {
      results.failed++;
      results.errors.push(`Q&A ${i + 1} assistant: ${e.message}`);
    }

    // Progress update every 10 Q&A pairs
    if ((i + 1) % 10 === 0 || i === qaPairs.length - 1) {
      process.stderr.write(`\r   Uploading... ${uploaded}/${totalMessages} messages`);
    }
  }

  process.stderr.write('\n');
  return results;
}

// Main
async function main() {
  // Read command input
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let hookInput = {};
  try {
    hookInput = JSON.parse(input);
  } catch {}

  // Set cwd for config
  if (hookInput.cwd) {
    process.env.EVERMEM_CWD = hookInput.cwd;
  }

  console.log('📤 Uploading session history...\n');

  // Check configuration
  if (!isConfigured()) {
    console.log('❌ Error: EverMem API key not configured.');
    console.log('   Set EVERMEM_API_KEY in your shell profile.');
    return;
  }

  // Get transcript path
  const transcriptPath = hookInput.transcript_path;
  if (!transcriptPath || !existsSync(transcriptPath)) {
    console.log('❌ Error: No transcript file found for this session.');
    console.log('   This command requires an active session with conversation history.');
    return;
  }

  console.log(`   Source: ${transcriptPath}`);

  // Read transcript
  const content = readFileSync(transcriptPath, 'utf8');
  const lines = content.trim().split('\n');
  console.log(`   Total lines: ${lines.length}`);

  // Check if file is complete
  let lastLine;
  try {
    lastLine = JSON.parse(lines[lines.length - 1]);
  } catch {}
  const isComplete = lastLine?.type === 'system' && lastLine?.subtype === 'turn_duration';

  if (!isComplete) {
    console.log('   ⚠️  Warning: Last turn may be incomplete (session in progress)\n');
  }

  // Extract Q&A pairs
  const { qaPairs, interruptedCount, systemSkippedCount } = extractAllQAPairs(lines);
  console.log(`   Q&A pairs found: ${qaPairs.length}`);

  if (qaPairs.length === 0) {
    console.log('\n⚠️  No Q&A pairs to upload.');
    return;
  }

  // Upload
  const results = await uploadQAPairs(qaPairs);

  // Summary
  console.log('\n✅ History uploaded!');
  console.log(`   - ${qaPairs.length} Q&A pairs (${results.success} messages uploaded)`);
  if (systemSkippedCount > 0) {
    console.log(`   - ${systemSkippedCount} skipped (system messages)`);
  }
  if (interruptedCount > 0) {
    console.log(`   - ${interruptedCount} skipped (interrupted)`);
  }
  if (results.failed > 0) {
    console.log(`   - ${results.failed} failed`);
    for (const err of results.errors.slice(0, 3)) {
      console.log(`     • ${err}`);
    }
    if (results.errors.length > 3) {
      console.log(`     • ... and ${results.errors.length - 3} more`);
    }
  }

  console.log(`\n   Group ID: ${getGroupId()}`);
}

main().catch(e => {
  console.log(`❌ Error: ${e.message}`);
});
