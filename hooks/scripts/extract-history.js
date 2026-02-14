#!/usr/bin/env node

/**
 * EverMem Extract History Script
 *
 * Extracts all Q&A pairs from the current session and saves to a preview file.
 * Used by /evermem:addHistory command - Step 1.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const PREVIEW_FILE = join(DATA_DIR, 'history-preview.jsonl');

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
 * Check if content is meaningful
 */
function isValidContent(text) {
  if (!text || !text.trim()) return false;
  const trimmed = text.trim();
  // Filter out system messages (various XML-like tags)
  if (trimmed.startsWith('<local-command-')) return false;
  if (trimmed.startsWith('<system-reminder>')) return false;
  if (trimmed.startsWith('<command-name>')) return false;
  if (trimmed.startsWith('<local-command-caveat>')) return false;
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

    if (isUserQuestion(line)) {
      if (currentQA) {
        if (isValidContent(currentQA.user) && isValidContent(currentQA.assistant)) {
          qaPairs.push(currentQA);
        } else if (currentQA.assistant) {
          systemSkippedCount++;
        }
      }
      currentQA = {
        user: line.message.content,
        assistant: '',
        timestamp: line.timestamp
      };
    } else if (isInterruptMarker(line)) {
      if (currentQA) interruptedCount++;
      currentQA = null;
    } else if (isAssistantText(line) && currentQA) {
      const text = extractAssistantText(line);
      if (text) {
        currentQA.assistant += (currentQA.assistant ? '\n\n' : '') + text;
      }
    }
  }

  if (currentQA && isValidContent(currentQA.user) && isValidContent(currentQA.assistant)) {
    qaPairs.push(currentQA);
  }

  return { qaPairs, interruptedCount, systemSkippedCount };
}

// Main
async function main() {
  // Get transcript path from: 1) CLI argument, 2) env variable
  const transcriptPath = process.argv[2] || process.env.CLAUDE_TRANSCRIPT_PATH;

  if (!transcriptPath) {
    console.log(JSON.stringify({
      success: false,
      error: 'No transcript path provided. Usage: extract-history.js <path-to-transcript.jsonl>'
    }));
    return;
  }

  if (!existsSync(transcriptPath)) {
    console.log(JSON.stringify({
      success: false,
      error: `Transcript file not found: ${transcriptPath}`
    }));
    return;
  }

  // Read transcript
  const content = readFileSync(transcriptPath, 'utf8');
  const lines = content.trim().split('\n');

  // Extract Q&A pairs
  const { qaPairs, interruptedCount, systemSkippedCount } = extractAllQAPairs(lines);

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  // Save to preview file
  const outputLines = qaPairs.map((qa, i) => JSON.stringify({
    index: i + 1,
    user: qa.user,
    assistant: qa.assistant,
    timestamp: qa.timestamp,
    userLength: qa.user.length,
    assistantLength: qa.assistant.length
  }));

  writeFileSync(PREVIEW_FILE, outputLines.join('\n') + '\n');

  // Calculate stats
  const totalUserChars = qaPairs.reduce((sum, qa) => sum + qa.user.length, 0);
  const totalAssistantChars = qaPairs.reduce((sum, qa) => sum + qa.assistant.length, 0);

  // Output result as JSON
  console.log(JSON.stringify({
    success: true,
    previewFile: PREVIEW_FILE,
    stats: {
      totalLines: lines.length,
      qaPairsFound: qaPairs.length,
      interruptedSkipped: interruptedCount,
      systemSkipped: systemSkippedCount,
      totalUserChars,
      totalAssistantChars,
      totalChars: totalUserChars + totalAssistantChars
    }
  }));
}

main().catch(e => {
  console.log(JSON.stringify({
    success: false,
    error: e.message
  }));
});
