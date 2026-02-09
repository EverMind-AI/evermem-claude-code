#!/usr/bin/env node

/**
 * EverMem SessionStart Hook
 * Retrieves recent memories and uses Claude Code SDK to generate a context summary
 */

// Check Node.js version early
const nodeVersion = process.versions?.node;
if (!nodeVersion) {
  console.error(JSON.stringify({
    continue: true,
    systemMessage: '⚠️ EverMem: Node.js environment not detected. Please install Node.js 18+ to use EverMem.'
  }));
  process.exit(0);
}

const [major] = nodeVersion.split('.').map(Number);
if (major < 18) {
  console.error(JSON.stringify({
    continue: true,
    systemMessage: `⚠️ EverMem: Node.js ${nodeVersion} is too old. Please upgrade to Node.js 18+.`
  }));
  process.exit(0);
}

import { getMemories, transformGetMemoriesResults } from './utils/evermem-api.js';
import { getConfig, getGroupId } from './utils/config.js';
import { saveGroup } from './utils/groups-store.js';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { execSync } from 'child_process';

const RECENT_MEMORY_COUNT = 5;  // Number of recent memories to load
const FETCH_LIMIT = 100;        // Fetch more to get the latest (API returns old to new)
const SUMMARIZE_TIMEOUT_MS = 15000;

/**
 * Find the Claude Code executable path
 */
function findClaudeExecutable() {
  try {
    const result = execSync('which claude', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.trim();
  } catch {
    try {
      const result = execSync('where claude', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      return result.trim().split('\n')[0];
    } catch {
      return null;
    }
  }
}

/**
 * Use Claude Code SDK to summarize recent memories into current task context
 */
async function summarizeContext(memories) {
  const claudePath = findClaudeExecutable();
  if (!claudePath) {
    return null;
  }

  const memoriesText = memories.map((m, i) => {
    const date = new Date(m.timestamp).toLocaleDateString();
    return `[${i + 1}] (${date}) ${m.subject}\n${m.text}`;
  }).join('\n\n---\n\n');

  const systemPrompt = `You are a concise context summarizer. Generate a brief summary of what tasks the user is currently working on based on their recent session memories.`;

  const userPrompt = `Based on these recent session memories, write a 1-2 sentence summary of the user's recent work. Focus on the main task/project.

RECENT MEMORIES:
${memoriesText}

Be concise and specific. Do not start with "Currently working on" or similar preamble.`;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), SUMMARIZE_TIMEOUT_MS);

  try {
    let responseText = '';

    const queryResult = query({
      prompt: userPrompt,
      options: {
        pathToClaudeCodeExecutable: claudePath,
        model: 'haiku',
        systemPrompt,
        allowedTools: [],
        abortController,
        maxTurns: 1
      }
    });

    for await (const message of queryResult) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            responseText += block.text;
          }
        }
      }
    }

    clearTimeout(timeoutId);
    return responseText.trim();
  } catch (error) {
    clearTimeout(timeoutId);
    return null;
  }
}

async function main() {
  // Read hook input to get cwd
  let hookInput = {};
  try {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
    }
    if (input) {
      hookInput = JSON.parse(input);
    }
  } catch (parseError) {
    console.log(JSON.stringify({
      continue: true,
      systemMessage: `⚠️ EverMem: Failed to parse hook input - ${parseError.message}`
    }));
    return;
  }

  // Set cwd from hook input for config.getGroupId()
  if (hookInput.cwd) {
    process.env.EVERMEM_CWD = hookInput.cwd;
  }

  const config = getConfig();

  // Save group to local storage (track which projects use EverMem)
  if (hookInput.cwd) {
    try {
      saveGroup(getGroupId(), hookInput.cwd);
    } catch (groupError) {
      // Non-blocking, but log for debugging
      console.error(`EverMem groups-store error: ${groupError.message}`);
    }
  }

  if (!config.isConfigured) {
    // Silently skip if not configured
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  try {
    // Fetch memories (API returns old to new, we'll reverse and take latest)
    const response = await getMemories({ limit: FETCH_LIMIT });
    const memories = transformGetMemoriesResults(response);

    if (memories.length === 0) {
      // No memories yet, skip
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Take the most recent memories
    const recentMemories = memories.slice(0, RECENT_MEMORY_COUNT);

    // Generate summary using Claude Code SDK
    const summary = await summarizeContext(recentMemories);

    // Build context message for Claude
    let contextMessage;
    if (summary) {
      contextMessage = `<session-context>
${summary}

Recent session memories (${recentMemories.length} most recent):

${recentMemories.map((m, i) => {
  const date = new Date(m.timestamp).toLocaleDateString();
  return `[${i + 1}] (${date}) ${m.subject}\n${m.text}`;
}).join('\n\n---\n\n')}
</session-context>`;
    } else {
      // Fallback if SDK summarization fails
      contextMessage = `<session-context>
Recent session memories from EverMem (${recentMemories.length} most recent):

${recentMemories.map((m, i) => {
  const date = new Date(m.timestamp).toLocaleDateString();
  return `[${i + 1}] (${date}) ${m.subject}\n${m.text}`;
}).join('\n\n---\n\n')}
</session-context>`;
    }

    const displayOutput = summary
      ? `💡 EverMem Reminder: ${summary}`
      : `💡 EverMem Reminder: ${recentMemories.length} recent memories loaded`;

    // Output: display to user and add to context
    console.log(JSON.stringify({
      continue: true,
      systemMessage: displayOutput,
      systemPrompt: contextMessage
    }));

  } catch (error) {
    // Don't block session start on errors, but provide detailed error info
    const errorDetails = {
      message: error.message,
      code: error.code,
      name: error.name
    };

    // Provide user-friendly error messages
    let userMessage = '⚠️ EverMem: ';
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      userMessage += `Network error - cannot reach EverMem server. Check your internet connection.`;
    } else if (error.code === 'ETIMEDOUT') {
      userMessage += `Request timeout - EverMem server is slow or unreachable.`;
    } else if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      userMessage += `Authentication failed. Check your EVERMEM_API_KEY in .env file.`;
    } else if (error.message?.includes('404')) {
      userMessage += `API endpoint not found. Check EVERMEM_BASE_URL in .env file.`;
    } else if (error.message?.includes('ENOENT')) {
      userMessage += `File not found: ${error.path || 'unknown'}`;
    } else {
      userMessage += `${error.name}: ${error.message}`;
    }

    console.log(JSON.stringify({
      continue: true,
      systemMessage: userMessage
    }));
  }
}

// Top-level error handler for uncaught exceptions during module load
process.on('uncaughtException', (error) => {
  let userMessage = '⚠️ EverMem SessionStart failed: ';

  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    const moduleName = error.message.match(/Cannot find package '([^']+)'/)?.[1] || 'unknown';
    userMessage += `Missing dependency '${moduleName}'. Run: cd ${process.cwd()} && npm install`;
  } else if (error.code === 'ERR_REQUIRE_ESM') {
    userMessage += `Module format error. Ensure package.json has "type": "module"`;
  } else {
    userMessage += `${error.name}: ${error.message}`;
  }

  console.log(JSON.stringify({
    continue: true,
    systemMessage: userMessage
  }));
  process.exit(0);
});

main();
