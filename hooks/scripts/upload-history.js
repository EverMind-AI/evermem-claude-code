#!/usr/bin/env node

/**
 * EverMem Upload History Script
 *
 * Reads Q&A pairs from preview file and uploads to EverMem Cloud.
 * Used by /evermem:addHistory command - Step 4.
 *
 * Outputs progress with previews (max 20 lines).
 */

import { readFileSync, existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { isConfigured, getGroupId } from './utils/config.js';
import { addMemory } from './utils/evermem-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEW_FILE = join(__dirname, '../../data/history-preview.jsonl');
const MAX_CONTENT_LENGTH = 10000;
const MAX_OUTPUT_LINES = 20;  // Max preview lines to output

/**
 * Truncate content if it exceeds max length
 */
function truncateContent(content) {
  if (!content || content.length <= MAX_CONTENT_LENGTH) {
    return content;
  }
  return content.substring(0, MAX_CONTENT_LENGTH) + '\n\n[... content truncated]';
}

/**
 * Truncate text for preview display
 */
function preview(text, maxLen = 50) {
  if (!text) return '';
  const clean = text.replace(/\n/g, ' ').trim();
  return clean.length > maxLen ? clean.substring(0, maxLen) + '...' : clean;
}

// Main
async function main() {
  // Check configuration
  if (!isConfigured()) {
    console.log(JSON.stringify({
      success: false,
      error: 'EverMem API key not configured. Set EVERMEM_API_KEY in your shell profile.'
    }));
    return;
  }

  // Check preview file exists
  if (!existsSync(PREVIEW_FILE)) {
    console.log(JSON.stringify({
      success: false,
      error: 'Preview file not found. Run extraction step first.'
    }));
    return;
  }

  // Read Q&A pairs from preview file
  const content = readFileSync(PREVIEW_FILE, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);
  const qaPairs = lines.map(line => JSON.parse(line));

  if (qaPairs.length === 0) {
    console.log(JSON.stringify({
      success: false,
      error: 'No Q&A pairs to upload.'
    }));
    return;
  }

  // Calculate output interval (max 10 Q&A pairs = 20 lines)
  const outputInterval = Math.max(1, Math.floor(qaPairs.length / 10));

  // Upload results
  const results = {
    success: 0,
    failed: 0,
    previews: []
  };

  // Upload each Q&A pair
  for (let i = 0; i < qaPairs.length; i++) {
    const qa = qaPairs[i];
    const timestamp = new Date(qa.timestamp).getTime() || Date.now();
    let userOk = false, assistantOk = false;

    // Upload user content
    try {
      await addMemory({
        content: truncateContent(qa.user),
        role: 'user',
        messageId: `hist_u_${timestamp}_${i}`
      });
      userOk = true;
      results.success++;
    } catch {
      results.failed++;
    }

    // Upload assistant content
    try {
      await addMemory({
        content: truncateContent(qa.assistant),
        role: 'assistant',
        messageId: `hist_a_${timestamp}_${i}`
      });
      assistantOk = true;
      results.success++;
    } catch {
      results.failed++;
    }

    // Output preview at intervals
    if ((i + 1) % outputInterval === 0 || i === qaPairs.length - 1) {
      const status = (userOk && assistantOk) ? '✓' : (userOk || assistantOk) ? '~' : '✗';
      results.previews.push({
        index: i + 1,
        total: qaPairs.length,
        status,
        questionPreview: preview(qa.user, 40),
        answerPreview: preview(qa.assistant, 40)
      });
    }
  }

  // Clean up preview file
  try {
    unlinkSync(PREVIEW_FILE);
  } catch {}

  // Output final result
  console.log(JSON.stringify({
    success: true,
    uploaded: results.success,
    failed: results.failed,
    totalQAPairs: qaPairs.length,
    groupId: getGroupId(),
    previews: results.previews
  }));
}

main().catch(e => {
  console.log(JSON.stringify({
    success: false,
    error: e.message
  }));
});
