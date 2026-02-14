#!/usr/bin/env node

/**
 * EverMem SessionStart Hook
 * Retrieves recent memories and displays last session summary
 * No AI summarization - uses local data only
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

 import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { getMemories, transformGetMemoriesResults, addMemory } from './utils/evermem-api.js';
import { getConfig, getGroupId } from './utils/config.js';
import { saveGroup } from './utils/groups-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_FILE = resolve(__dirname, '../../data/sessions.jsonl');

const RECENT_MEMORY_COUNT = 5;  // Number of recent memories to load
const PAGE_SIZE = 100;          // Fetch more to get the latest (API returns old to new)

// Debounce settings to prevent duplicate hook calls
// Note: File names are project-specific (using cwd hash) to isolate different projects
const DEBOUNCE_MS = 1000;  // Skip if called again within 1 second

/**
 * Get project-specific debounce file paths
 * Uses hash of cwd to isolate different projects
 */
function getDebounceFiles(cwd) {
  const cwdHash = createHash('sha256').update(cwd || 'default').digest('hex').substring(0, 8);
  return {
    lockFile: `/tmp/evermem-session-start-${cwdHash}.lock`,
    outputFile: `/tmp/evermem-session-start-${cwdHash}-output.json`
  };
}

/**
 * Check if we should skip this call (duplicate within debounce window)
 * @param {string} cwd - Current working directory (for project-specific cache)
 * @returns {string|null} Cached output if should skip, null if should proceed
 */
function getCachedOutputIfDebounced(cwd) {
  try {
    const { lockFile, outputFile } = getDebounceFiles(cwd);
    if (existsSync(lockFile)) {
      const stat = statSync(lockFile);
      if (Date.now() - stat.mtimeMs < DEBOUNCE_MS) {
        // Within debounce window, return cached output if available
        if (existsSync(outputFile)) {
          return readFileSync(outputFile, 'utf8');
        }
        return JSON.stringify({ continue: true, systemMessage: '💡 EverMem: Ready' });
      }
    }
    // Update lock file timestamp
    writeFileSync(lockFile, Date.now().toString());
    return null;  // Proceed with full execution
  } catch {
    return null;
  }
}

/**
 * Cache the output for debounced calls to reuse
 * @param {string} cwd - Current working directory (for project-specific cache)
 * @param {string} output - Output to cache
 */
function cacheOutput(cwd, output) {
  try {
    const { outputFile } = getDebounceFiles(cwd);
    writeFileSync(outputFile, output);
  } catch {}
}

/**
 * Get the most recent session summary for current group
 * @param {string} groupId - The group ID to filter by
 * @returns {Object|null} Most recent session summary or null
 */
function getLastSessionSummary(groupId) {
  try {
    if (!existsSync(SESSIONS_FILE)) {
      return null;
    }

    const content = readFileSync(SESSIONS_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Search from end (most recent first)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.groupId === groupId) {
          return entry;
        }
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Format relative time (e.g., "2h ago", "1d ago")
 */
function formatRelativeTime(isoTime) {
  const now = Date.now();
  const then = new Date(isoTime).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
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
  const cwd = hookInput.cwd || process.cwd();
  process.env.EVERMEM_CWD = cwd;

  // Debounce: skip duplicate API calls within 1 second
  // But reuse cached output to show valuable info
  // Note: Uses project-specific cache files to isolate different projects
  const cachedOutput = getCachedOutputIfDebounced(cwd);
  if (cachedOutput) {
    console.log(cachedOutput);
    return;
  }

  const config = getConfig();

  // Save group to local storage (track which projects use EverMem)
  // Also calls Set Conversation Metadata API for new groups
  if (hookInput.cwd) {
    saveGroup(getGroupId(), hookInput.cwd).catch(groupError => {
      // Non-blocking, but log for debugging
      console.error(`EverMem groups-store error: ${groupError.message}`);
    });
  }

  // Send session start memory to EverMem Cloud
  const { session_id, is_resumed } = hookInput;
  if (session_id && hookInput.cwd && config.isConfigured) {
    const action = is_resumed ? 'resumed' : 'created';
    const groupId = getGroupId();
    const content = `[Session Start] User ${action} session at ${new Date().toISOString()}. session_id: ${session_id}, group_id: ${groupId}, path: ${hookInput.cwd}`;
    addMemory({
      messageId: `session_start_${Date.now()}`,
      content,
      role: 'user',
      senderName: 'System'
    }).catch(() => {});
  }

  if (!config.isConfigured) {
    // Silently skip if not configured
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  try {
    const groupId = getGroupId();

    // Fetch memories (API returns old to new, we'll reverse and take latest)
    const response = await getMemories({ pageSize: PAGE_SIZE });
    const memories = transformGetMemoriesResults(response);

    // Get last session summary from local storage
    const lastSession = getLastSessionSummary(groupId);

    if (memories.length === 0 && !lastSession) {
      // No memories and no last session, skip
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Take the most recent memories
    const recentMemories = memories.slice(0, RECENT_MEMORY_COUNT);

    // Build context message for Claude (no AI summarization)
    let contextParts = [];

    // Add last session info if available
    if (lastSession) {
      const timeAgo = formatRelativeTime(lastSession.timestamp);
      contextParts.push(`Last session (${timeAgo}, ${lastSession.turnCount} turns): ${lastSession.summary}`);
    }

    // Add recent memories if available
    if (recentMemories.length > 0) {
      const memoriesText = recentMemories.map((m, i) => {
        const date = new Date(m.timestamp).toLocaleDateString();
        return `[${i + 1}] (${date}) ${m.subject}\n${m.text}`;
      }).join('\n\n---\n\n');
      contextParts.push(`Recent memories (${recentMemories.length}):\n\n${memoriesText}`);
    }

    const contextMessage = `<session-context>\n${contextParts.join('\n\n')}\n</session-context>`;

    // Build display output - show meaningful content, concise but informative
    let displayOutput;

    // Check if lastSession has a valid summary
    let validLastSession = null;
    if (lastSession) {
      // Clean summary: remove system tags
      let cleanSummary = lastSession.summary
        .replace(/<[^>]+>/g, '')  // Remove XML-like tags
        .replace(/\s+/g, ' ')     // Normalize whitespace
        .trim();

      // Secondary filter: skip if cleaned summary is still invalid
      // (e.g., starts with /, contains only command remnants, too short)
      const isValidSummary = cleanSummary.length > 5 &&
        !cleanSummary.startsWith('/') &&
        !cleanSummary.startsWith('Caveat:') &&
        !/^[a-z]+ [a-z]+$/i.test(cleanSummary);  // Skip "clear clear" patterns

      if (isValidSummary) {
        validLastSession = {
          ...lastSession,
          cleanSummary: cleanSummary.length > 60
            ? cleanSummary.substring(0, 60) + '...'
            : cleanSummary
        };
      }
    }

    // Extract meaningful subjects from cloud memories (max 2-3, truncated)
    // Filter out system-generated memories (session start/end, etc.)
    let memoryPreview = '';
    if (recentMemories.length > 0) {
      const MAX_PREVIEW_MEMORIES = 2;
      const MAX_SUBJECT_LENGTH = 40;

      // Filter out system messages (session lifecycle, system logs, etc.)
      const meaningfulMemories = recentMemories.filter(m => {
        const subject = (m.subject || '').toLowerCase();
        const text = (m.text || '').toLowerCase();
        // Skip session lifecycle messages
        if (subject.includes('session start') ||
            subject.includes('session end') ||
            subject.includes('session initialization') ||
            subject.includes('session creation') ||
            subject.includes('project session end') ||
            subject.includes('system log') ||
            subject.includes('user exited') ||
            subject.includes('user created session') ||
            subject.includes('user resumed session') ||
            text.includes('[session start]') ||
            text.includes('[session end]')) {
          return false;
        }
        return true;
      });

      const subjects = meaningfulMemories
        .slice(0, MAX_PREVIEW_MEMORIES)
        .map(m => {
          let subject = m.subject || '';
          // Remove date prefix patterns like "2026年2月14日" or "February 14, 2026"
          subject = subject.replace(/^\d{4}年\d{1,2}月\d{1,2}日[^:：]*[:：]\s*/i, '');
          subject = subject.replace(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}[^:]*:\s*/i, '');
          subject = subject.trim();
          // Truncate
          if (subject.length > MAX_SUBJECT_LENGTH) {
            subject = subject.substring(0, MAX_SUBJECT_LENGTH) + '...';
          }
          return subject;
        })
        .filter(s => s.length > 0);

      if (subjects.length > 0) {
        memoryPreview = subjects.join(' | ');
      }
    }

    if (validLastSession) {
      const timeAgo = formatRelativeTime(validLastSession.timestamp);
      // Format: "Previous session (time, N turns) | memory subjects"
      displayOutput = `💡 EverMem: Previous session (${timeAgo}, ${validLastSession.turnCount} turns)`;

      if (memoryPreview) {
        displayOutput += ` | ${memoryPreview}`;
      }
    } else if (memoryPreview) {
      // No valid local session, show cloud memory subjects
      displayOutput = `💡 EverMem: Recent work: ${memoryPreview}`;
    } else if (recentMemories.length > 0) {
      displayOutput = `💡 EverMem: ${recentMemories.length} cloud memories loaded`;
    } else {
      displayOutput = `💡 EverMem: Ready`;
    }

    // Output: display to user and add to context
    const output = JSON.stringify({
      continue: true,
      systemMessage: displayOutput,
      systemPrompt: contextMessage
    });
    cacheOutput(cwd, output);  // Cache for debounced calls (project-specific)
    console.log(output);

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
