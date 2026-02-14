# EverMem Plugin for Claude Code

Persistent memory for Claude Code. Automatically saves and recalls context from past coding sessions.

![Memory Hub Screenshot](assets/hub-screenshot.png)

## Features

- **Automatic Memory Save** - Conversations are saved when Claude finishes responding
- **Automatic Memory Retrieval** - Relevant memories are retrieved when you submit a prompt
- **Session Context** - Recent work summary loaded on session start
- **Memory Search** - Manually search your memory history
- **Memory Hub** - Visual dashboard to explore and manage memories

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/EverMind-AI/evermem-claude-code/main/install.sh | bash
```

This will:
1. Prompt for your EverMem API key
2. Save it to your shell profile
3. Install the plugin via Claude Code's plugin system

**Get your API key:** [console.evermind.ai](https://console.evermind.ai/)

## Manual Installation

### 1. Get Your API Key

Visit [console.evermind.ai](https://console.evermind.ai/) to create an account and get your API key.

### 2. Configure Environment Variable

Run one of the following commands (replace `your-api-key-here` with your actual key):

```bash
# For zsh (default on macOS)
echo 'export EVERMEM_API_KEY="your-api-key-here"' >> ~/.zshrc && source ~/.zshrc

# For bash
echo 'export EVERMEM_API_KEY="your-api-key-here"' >> ~/.bashrc && source ~/.bashrc
```

**Verify configuration:**

```bash
echo $EVERMEM_API_KEY
# Should output your API key (e.g., xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
```

### 3. Install the Plugin

```bash
# Add marketplace from GitHub (tracks updates automatically)
claude plugin marketplace add https://github.com/EverMind-AI/evermem-claude-code

# Install the plugin
claude plugin install evermem@evermem --scope user
```

To update the plugin later:

```bash
claude plugin marketplace update evermem
claude plugin update evermem@evermem
```

### 4. Verify Installation

Run `/evermem:help` to check if the plugin is configured correctly.

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/evermem:help` | Show setup status and available commands |
| `/evermem:search <query>` | Search your memories for specific topics (use `Ctrl+O` to expand results) |
| `/evermem:ask <question>` | Ask about past work (combines memory + context) |
| `/evermem:hub` | Open the Memory Hub dashboard |
| `/evermem:projects` | View your Claude Code projects table |
| `/evermem:addHistory` | Upload current session's conversation history to cloud |

### Automatic Behavior

The plugin works automatically in the background:

**On Session Start:**
```
💡 EverMem: Previous session (2h ago, 5 turns) | JWT实现讨论 | API认证设计
```
Previous session info and meaningful cloud memory subjects are displayed. System messages (session start/end notifications) are filtered out.

**On Prompt Submit:**
```
You: "How should I handle authentication?"
         ↓
📝 Memory Retrieved (2):
  • [0.85] (2 days ago) Discussion about JWT token implementation
  • [0.72] (1 week ago) Auth middleware setup decisions
         ↓
Claude receives the relevant context and responds accordingly
```

**On Response Complete:**
```
💾 Memory saved (2) [user: 156, assistant: 10977 (truncated)]
```
- User content > 2000 chars is **truncated** (concat limit: 6000)
- Assistant content > 4000 chars is **truncated** (concat limit: 15000)

### Memory Hub

The Memory Hub provides a visual interface to explore your memories:

- Activity heatmap (GitHub-style, 6 months)
- Memory statistics (Total, Projects, Active Days, Avg/Day, Avg/Project)
- Last 7 Days growth chart
- Project-based memory grouping with expandable cards
- Timeline view within each project (grouped by date)
- Load more pagination for large projects

To use the hub, run `/evermem:hub` and follow the instructions.

### Retroactive Import (Old Projects)

For Claude Code projects that existed before installing EverMem, you can upload past conversation history using `/evermem:addHistory`.

**Upload current session:**
```bash
/evermem:addHistory
```

**Upload a specific session:**
```bash
# Find session IDs in your project
ls ~/.claude/projects/-path-to-project/*.jsonl

# Resume the specific session
claude --resume <session-id>

# Then run the command
/evermem:addHistory
```

**Handle multiple sessions:**

A Claude Code project may have multiple sessions (each `/exit` creates a new session file). To upload all of them:

```bash
# List all sessions for a project
ls ~/.claude/projects/-Users-me-myproject/*.jsonl

# For each session, resume and upload
claude --resume abc-123-def
# Run /evermem:addHistory, then /exit

claude --resume xyz-456-ghi
# Run /evermem:addHistory, then /exit
```

**Output example:**
```
📤 Uploading session history...
   Source: ~/.claude/projects/-xxx/abc-123.jsonl
   Total lines: 1500
   Q&A pairs found: 45
   Uploading... 90/90 messages

✅ History uploaded!
   - 45 Q&A pairs (90 messages uploaded)
   - 3 skipped (system messages)
   - 2 skipped (interrupted)
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `EVERMEM_API_KEY` | Your EverMem API key | Yes |

## Troubleshooting

### API Key Not Configured

```bash
# Check if the key is set
echo $EVERMEM_API_KEY

# If empty, add to your shell profile and reload
export EVERMEM_API_KEY="your-key-here"
source ~/.zshrc
```

### No Memories Found

1. Memories are only recalled after you've had previous conversations
2. Short prompts (less than 3 words) are skipped
3. Check that your API key is valid at [console.evermind.ai](https://console.evermind.ai/)

### API Errors

- **400 Bad Request**: Missing required parameters (user_id or group_ids). Check API configuration.
- **403 Forbidden**: Invalid or expired API key
- **502 Bad Gateway**: Server temporarily unavailable, try again

## Security

The plugin implements the following security measures:

### API Communication
- All HTTP requests use Node.js native `https` module (no shell command execution)
- No use of `execSync` with user-controlled input to prevent command injection
- API keys are never logged or included in error responses
- `Content-Length` header is always set for requests with body (required for GET with body)

### Input Validation
- Authorization headers are validated with strict regex: `Bearer [a-zA-Z0-9_\-\.]+`
- Hook inputs from Claude Code are parsed safely with JSON.parse

### Local Storage
- API key is hashed (SHA-256, first 12 chars) before storing in local files
- Session data stays local in `data/sessions.jsonl`
- Group data stays local in `data/groups.jsonl`

### Reporting Issues
If you discover a security vulnerability, please report it via [GitHub Issues](https://github.com/EverMind-AI/evermem-claude-code/issues) with the "security" label.

## Links

- **Console**: [console.evermind.ai](https://console.evermind.ai/)
- **API Documentation**: [docs.evermind.ai](https://docs.evermind.ai)
- **Issues**: [GitHub Issues](https://github.com/EverMind-AI/evermem-claude-code/issues)

## License

MIT

---

# Technical Details

The following sections explain how EverMem works internally. This is useful for developers who want to understand the implementation or contribute to the project.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     Session Start                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  SessionStart Hook                                          │
│  • Sends session start memory to Cloud (create/resume)      │
│  • Saves group to local storage (first time: calls API)     │
│  • Fetches recent memories from EverMem Cloud               │
│  • Loads last session summary from local storage            │
│  • Injects session context into Claude's prompt             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Your Prompt                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  UserPromptSubmit Hook                                      │
│  • Searches EverMem Cloud for relevant memories             │
│  • Displays memory summary to user                          │
│  • Injects relevant context into Claude's prompt            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Claude Response                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Stop Hook                                                  │
│  • Extracts conversation from transcript                    │
│  • Sends Q&A pair to EverMem Cloud for storage              │
│  • Server generates summary and stores memory               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Session End                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  SessionEnd Hook                                            │
│  • Parses transcript to extract first user prompt           │
│  • Saves session summary to local storage                   │
│  • No cloud API call (quota optimization)                   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

| Hook | Local Actions | Cloud Actions |
|------|---------------|---------------|
| **SessionStart** | Save group (groups.jsonl) | Send session start memory, Fetch recent memories, Set conversation metadata (first time) |
| **UserPromptSubmit** | - | Search relevant memories |
| **Stop** | - | Send Q&A pair for storage |
| **SessionEnd** | Save session summary (sessions.jsonl) | None (local only) |

## Claude Code Hooks Mechanism

> Reference: [Claude Code Hooks Documentation](https://docs.anthropic.com/en/docs/claude-code/hooks)

Claude Code provides a **hooks system** that allows plugins to execute custom scripts at specific lifecycle events. Hooks are **event-driven** - they don't run continuously but are triggered by Claude Code at specific moments.

### How Hooks Work

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code (Main Process)                   │
│                                                                 │
│  1. Event occurs (e.g., user sends message, Claude responds)    │
│  2. Claude Code reads hooks.json                                │
│  3. Finds matching hooks for the event                          │
│  4. Spawns child process: node <script.js>                      │
│  5. Sends JSON data via stdin pipe ─────────────┐               │
│  6. Reads response from stdout                  │               │
└─────────────────────────────────────────────────│───────────────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Hook Script (Child Process)                  │
│                                                                 │
│  // Read JSON from stdin (sent by Claude Code)                  │
│  let input = '';                                                │
│  for await (const chunk of process.stdin) {                     │
│    input += chunk;                                              │
│  }                                                              │
│  const hookInput = JSON.parse(input);                           │
│                                                                 │
│  // Process and return result via stdout                        │
│  console.log(JSON.stringify({ ... }));                          │
└─────────────────────────────────────────────────────────────────┘
```

### Hook Events

| Event | Trigger | Use Case |
|-------|---------|----------|
| `SessionStart` | Claude Code starts | Load context, setup environment |
| `UserPromptSubmit` | User sends a message | Validate prompt, inject context |
| `PreToolUse` | Before tool execution | Approve/deny/modify tool calls |
| `PostToolUse` | After tool execution | Validate results, run linters |
| `Stop` | Claude finishes responding | Save conversation, cleanup |
| `Notification` | System notification | Custom alerts |

### Plugin hooks.json Configuration

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "*",           // Pattern to match (for tool events)
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/my-hook.js",
            "timeout": 30         // Timeout in seconds
          }
        ]
      }
    ]
  }
}
```

**Environment Variables:**
- `${CLAUDE_PLUGIN_ROOT}` - Plugin directory path (for plugins)
- `${CLAUDE_PROJECT_DIR}` - Project root directory

### EverMem Plugin Hooks

```json
{
  "hooks": {
    "SessionStart": [...],        // Send session start memory + Load context + Track groups
    "UserPromptSubmit": [...],    // Search & inject relevant memories
    "Stop": [...],                // Save Q&A pair to cloud
    "SessionEnd": [...]           // Save summary locally + Send session end memory (flush)
  }
}
```

## SessionStart Hook

The SessionStart hook runs when Claude Code starts a new session. It records the session start event, loads recent memories from the cloud, and last session summary from local storage.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code Session Start                     │
│                                                                  │
│  1. Claude Code spawns: session-context-wrapper.sh              │
│  2. Wrapper checks npm dependencies                              │
│  3. Wrapper executes: node session-context.js                   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    session-context.js                            │
│                                                                  │
│  1. Read hook input from stdin (contains cwd, session_id)       │
│  2. Save group to local storage (groups.jsonl)                  │
│     - First time: calls Set Conversation Metadata API           │
│  3. Send session start memory to EverMem Cloud                  │
│     - Records: timestamp, session_id, group_id, path, action    │
│     - Action: "created" (new session) or "resumed" (continued)  │
│  4. Fetch recent memories from EverMem API (limit: 100)         │
│  5. Take the 5 most recent memories                             │
│  6. Get last session summary from sessions.jsonl                │
│  7. Output systemMessage + systemPrompt via stdout              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code Receives                          │
│                                                                  │
│  • systemMessage: "💡 EverMem: Previous session (2h ago, 5 turns) | 记忆主题1 | 记忆主题2"│
│  • systemPrompt: <session-context>...</session-context>         │
│                                                                  │
│  The systemPrompt is injected into Claude's context window      │
└─────────────────────────────────────────────────────────────────┘
```

### Hook Input (stdin)

```json
{
  "session_id": "<session-uuid>",
  "cwd": "/path/to/your/project",
  "permission_mode": "default",
  "hook_event_name": "SessionStart",
  "is_resumed": false
}
```

**is_resumed Field:**
- `false` - New session created (user runs `claude` command fresh)
- `true` - Session resumed (user continues from a previous session)

Claude Code sets this based on whether the session ID already exists in the transcript history.

### Hook Output (stdout)

```json
{
  "continue": true,
  "systemMessage": "💡 EverMem: Previous session (2h ago, 5 turns) | JWT实现讨论 | API认证设计",
  "systemPrompt": "<session-context>\nLast session (2h ago, 5 turns): Implementing JWT authentication for the API\n\nRecent memories (5):\n\n[1] (2/9/2026) JWT token implementation\n...\n</session-context>"
}
```

### Output Fields

| Field | Description |
|-------|-------------|
| `continue` | Always `true` - never block session start |
| `systemMessage` | Displayed to user in terminal |
| `systemPrompt` | Injected into Claude's context (invisible to user) |

### Data Sources

The hook combines two data sources:

1. **Cloud Memories** - Recent memories from EverMem API (5 most recent)
2. **Local Session Summary** - Last session from `data/sessions.jsonl` (saved by SessionEnd hook)

No AI summarization is used - pure local data extraction for zero latency and no additional API costs.

### Display Format

The systemMessage shows meaningful memory subjects extracted from cloud memories:

```
💡 EverMem: Previous session (2h ago, 5 turns) | JWT实现讨论 | API认证设计
```

**Subject Filtering:**
- System messages are filtered out (session start/end, initialization, creation)
- Date prefixes are removed from subjects (e.g., "2026年2月14日关于..." → extracted topic)
- Only meaningful work topics are displayed

### Session Start Memory (Cloud)

The hook sends a session start event to EverMem Cloud, with action based on `is_resumed`:

```
# New session (is_resumed: false)
[Session Start] User created session at 2026-02-13T10:00:00Z. session_id: abc-123, group_id: ever_a3f2c, path: /path/to/project

# Resumed session (is_resumed: true)
[Session Start] User resumed session at 2026-02-13T10:00:00Z. session_id: abc-123, group_id: ever_a3f2c, path: /path/to/project
```

This records:
- **Timestamp** - When the session started
- **Session ID** - Unique identifier for this session
- **Group ID** - Project identifier (10 chars)
- **Path** - Working directory
- **Action** - "created" (`is_resumed: false`) or "resumed" (`is_resumed: true`)

This allows the cloud to track session lifecycle events and provide accurate session analytics.

### Error Handling

| Error Type | User Message |
|------------|--------------|
| Network error | "Cannot reach EverMem server. Check your internet connection." |
| Timeout | "EverMem server is slow or unreachable." |
| 401/Unauthorized | "Authentication failed. Check your EVERMEM_API_KEY." |
| 404 | "API endpoint not found. Check EVERMEM_BASE_URL." |
| Module not found | "Missing dependency. Run: npm install" |

All errors return `continue: true` to ensure session starts normally.

### Node.js Version Check

The hook requires Node.js 18+ for ES modules support. If an older version is detected:

```json
{
  "continue": true,
  "systemMessage": "⚠️ EverMem: Node.js 16.x is too old. Please upgrade to Node.js 18+."
}
```

### Debounce & Project Isolation

SessionStart uses debounce to prevent duplicate API calls when Claude Code triggers the hook multiple times in quick succession.

**Project-Specific Cache Files:**

Cache files are isolated per project using a hash of the working directory:

```
/tmp/evermem-session-start-{cwd_hash}.lock      # Debounce lock
/tmp/evermem-session-start-{cwd_hash}-output.json  # Cached output
```

Example for two concurrent projects:
```
/tmp/evermem-session-start-d097cb8a.lock  ← /Users/admin/Desktop/shanda
/tmp/evermem-session-start-8d8d53b2.lock  ← /Users/admin/Desktop/evermem-claude-code
```

**Why Project Isolation Matters:**

Without project-specific cache files, running two Claude Code instances simultaneously could cause:
- Project A's cached output being returned for Project B
- Wrong `group_id` being used (memories sent to wrong project)
- Incorrect session statistics displayed

The `cwd_hash` (first 8 chars of SHA-256 hash of cwd) ensures each project has isolated cache files.

## SessionEnd Hook

The SessionEnd hook runs when a Claude Code session ends. It saves a session summary to **local storage only** (no cloud API call).

> **Note**: SessionEnd previously sent a memory to cloud with `flush=true` to force memory extraction. This was removed because `flush=true` forces MemoryCell creation, which consumes quota too quickly (free tier: 100 cells). A single `/exit` would create a MemoryCell even with minimal conversation.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code Session End                       │
│                                                                  │
│  Triggers: /exit, closing terminal, idle timeout                 │
│  Claude Code spawns: node session-summary.js                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    session-summary.js                            │
│                                                                  │
│  1. Read hook input from stdin (contains transcript_path)       │
│  2. Check if session already summarized (skip if yes)           │
│  3. Parse transcript JSONL file                                 │
│  4. Extract: first user prompt, turn count, timestamps          │
│  5. Save to data/sessions.jsonl (local only)                    │
│                                                                  │
│  Note: No cloud API call (quota optimization)                   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local Storage                                 │
│                                                                  │
│  data/sessions.jsonl:                                           │
│  {"sessionId":"abc","groupId":"...","summary":"First user       │
│   prompt truncated to 200 chars","turnCount":5,...}             │
└─────────────────────────────────────────────────────────────────┘
```

### Hook Input (stdin)

```json
{
  "session_id": "<session-uuid>",
  "transcript_path": "~/.claude/projects/<hash>/<session-uuid>.jsonl",
  "cwd": "/path/to/your/project",
  "reason": "user_exit",
  "hook_event_name": "SessionEnd"
}
```

### Hook Output (stdout)

```json
{
  "systemMessage": "📝 Session saved (5 turns): Implementing JWT authentication for the..."
}
```

### Session Summary Format

Each session is saved as a single line in `data/sessions.jsonl`:

```json
{
  "sessionId": "<session-uuid>",
  "groupId": "ever_a3f2c",
  "summary": "First user prompt truncated to 200 characters",
  "turnCount": 5,
  "reason": "user_exit",
  "startTime": "2026-02-09T10:00:00.000Z",
  "endTime": "2026-02-09T10:30:00.000Z",
  "timestamp": "2026-02-09T10:30:05.000Z"
}
```

### Fields

| Field | Description |
|-------|-------------|
| `sessionId` | Unique session identifier (from Claude Code) |
| `groupId` | Project identifier (based on working directory) |
| `summary` | First user prompt (truncated to 200 chars) |
| `turnCount` | Number of conversation turns |
| `reason` | Why session ended (user_exit, idle_timeout, etc.) |
| `startTime` | First message timestamp |
| `endTime` | Last message timestamp |
| `timestamp` | When summary was saved |

### Deduplication

Each session is only saved once. Before saving, the hook checks if the sessionId already exists in `sessions.jsonl`.

### No AI Summarization (Local)

The SessionEnd hook uses a simple approach: the first user prompt becomes the session summary. This provides:

- **Zero latency** - No API calls needed for local storage
- **Zero cost** - No Haiku or other model usage
- **Reliability** - Works offline, no external dependencies

The first user prompt typically describes what the user wanted to accomplish, making it a natural summary of the session's purpose.

### Cloud Memory Extraction (Removed)

> **Important**: SessionEnd previously sent a memory to cloud with `flush=true`. This feature was **removed** due to quota concerns.

**Why it was removed:**

The `flush: true` parameter forces the server to immediately create a MemoryCell from the conversation buffer. This means:

- Every `/exit` creates a MemoryCell, even with minimal conversation
- Free tier quota (100 MemoryCells) gets consumed very quickly
- A simple "hello" + "/exit" would cost 1 MemoryCell

**Current behavior:**

SessionEnd now only saves to local `sessions.jsonl`. Memories are created naturally through the Stop hook when Claude responds to your prompts, which is more quota-efficient.

### Design Philosophy: Deferred Display Pattern

The SessionEnd and SessionStart hooks work together using a **"save now, display later"** pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│  Session A (ending)                                             │
│                                                                 │
│  SessionEnd Hook:                                               │
│  • Extracts first user prompt, turn count, duration             │
│  • Saves to sessions.jsonl                                      │
│  • Output NOT displayed (session already closed)                │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │  sessions.jsonl (local storage)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Session B (starting)                                           │
│                                                                 │
│  SessionStart Hook:                                             │
│  • Reads last session from sessions.jsonl                       │
│  • Displays: "Previous session (2h ago, 5 turns): Your question..."│
│  • Provides continuity across sessions                          │
└─────────────────────────────────────────────────────────────────┘
```

**Why this design?**

1. **SessionEnd can't display messages** - When a session ends (`/exit`, `Ctrl+D`), the terminal is closing. Any `systemMessage` output would be lost or not visible to the user.

2. **SessionStart is the right moment** - The next time the user opens Claude Code, they see what they were working on. This creates a natural "welcome back" experience.

3. **Local-first architecture** - Session summaries are stored locally in `sessions.jsonl`, not in the cloud. This ensures:
   - Instant access (no API latency)
   - Works offline
   - No additional API costs
   - Privacy (session data stays on your machine)

4. **Graceful degradation** - If SessionEnd fails to run (e.g., `Ctrl+C` force quit), the next SessionStart still works with cloud memories. No single point of failure.

**Data Flow Summary:**

| Event | Action | Storage | Display |
|-------|--------|---------|---------|
| SessionEnd | Save summary | Local (sessions.jsonl) | None |
| SessionStart | Read summary | Local + Cloud | Yes |

## Local Groups Tracking

The SessionStart hook automatically records project groups to `data/groups.jsonl` (JSONL format):

```jsonl
{"keyId":"9a823d2f8ea5","groupId":"proj_a1b2c","name":"project-a","path":"/path/to/project-a","timestamp":"2026-02-09T06:00:00Z"}
{"keyId":"9a823d2f8ea5","groupId":"apis_d3e4f","name":"api-server","path":"/path/to/api-server","timestamp":"2026-02-09T08:00:00Z"}
```

**Fields:**
- `keyId`: SHA-256 hash (first 12 chars) of the API key - associates groups with accounts
- `groupId`: Unique identifier (10 chars), format: `{name4}_{hash5}` (e.g., `ever_a3f2c`)
  - First 4 chars: project folder name (lowercase, alphanumeric)
  - `_`: separator
  - Last 5 chars: SHA-256 hash of the full path
- `name`: Project folder name
- `path`: Full path to the project
- `timestamp`: When the group was first recorded

**Deduplication:** Each `keyId + groupId` combination is stored only once (no duplicates).

View tracked projects with `/evermem:projects` command.

## Stop Hook: Conversation Flow

Claude Code stores all conversations locally in JSONL (JSON Lines) format. The EverMem plugin reads this transcript and uploads the latest Q&A pair to the cloud.

### Hook Input

When Claude finishes responding, the Stop hook receives input like this:

```json
{
  "session_id": "<session-uuid>",
  "transcript_path": "~/.claude/projects/<project-hash>/<session-uuid>.jsonl",
  "cwd": "/path/to/your/project",
  "permission_mode": "default",
  "hook_event_name": "Stop",
  "stop_hook_active": false
}
```

### Transcript File Format

The transcript file (`*.jsonl`) contains one JSON object per line, recording every message and event in the session. **Important:** A single Claude response may span multiple lines with different content types.

**Common Fields:**

| Field | Description |
|-------|-------------|
| `type` | Line type: `user`, `assistant`, `progress`, `system`, `file-history-snapshot` |
| `uuid` | Unique message ID |
| `parentUuid` | Parent message ID (for threading) |
| `timestamp` | ISO 8601 timestamp |
| `sessionId` | Session UUID |
| `message.role` | `user` or `assistant` |
| `message.content` | String or array of content blocks |

**Content Block Types (in `message.content` array):**

| Type | Description |
|------|-------------|
| `text` | Final text response to user |
| `thinking` | Claude's internal reasoning (extended thinking) |
| `tool_use` | Tool invocation (Read, Write, Bash, etc.) |
| `tool_result` | Result returned from tool execution |

**Complete Conversation Example:**

A single Q&A turn generates multiple JSONL lines:

```jsonl
// 1. User message
{"type":"user","message":{"role":"user","content":"debug.js 如何使用"},"uuid":"696034a3-...","timestamp":"2026-02-09T02:20:16.540Z"}

// 2. Assistant thinking (extended thinking mode)
{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"用户希望了解 debug.js 的使用方法...","signature":"EuAC..."}]},"uuid":"b375ff09-...","timestamp":"2026-02-09T02:20:26.866Z"}

// 3. Assistant tool use (e.g., Read file)
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_01Qur8BnkKD9t53JSSorDLbm","name":"Read","input":{"file_path":"/path/to/README.md"}}]},"uuid":"f01ec15c-..."}

// 4. Progress event (hook execution)
{"type":"progress","data":{"type":"hook_progress","hookEvent":"PostToolUse","hookName":"PostToolUse:Read"},"uuid":"f4219b83-..."}

// 5. Tool result (returned as user message)
{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_01Qur8BnkKD9t53JSSorDLbm","type":"tool_result","content":"file contents here..."}]},"uuid":"f5c5f7c6-..."}

// 6. Assistant final text response
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"完成！README 已更新..."}]},"uuid":"cae1b79c-..."}

// 7. System events (stop hook, timing)
{"type":"system","subtype":"stop_hook_summary","hookCount":1,"hasOutput":true,"uuid":"25a25edf-..."}
{"type":"system","subtype":"turn_duration","durationMs":81371,"uuid":"55418b2c-..."}
```

**Simplified View:**

```
User Input
    ↓
[thinking] → [tool_use] → [tool_result] → [tool_use] → ... → [text]
    ↓
System Events (hooks, timing)
```

### Turn Boundary & Segmentation

**Session Level:** One JSONL file = One Session (filename is session ID)

**Turn Level:** A "Turn" = User sends message → Claude fully responds

**Turn boundary marker (ONLY this one):**
```json
{"type":"system","subtype":"turn_duration","durationMs":30692}
```

> **Note:** `file-history-snapshot` is NOT a turn boundary. It's a session-level marker that can appear anywhere in the file.

**JSONL Structure:**
```
Line 1:      file-history-snapshot  ← Session marker (NOT turn boundary)
Line 2-21:   Turn 1
Line 22:     turn_duration          ← Turn 1 end ✓
Line 23:     file-history-snapshot  ← Can appear mid-session (NOT turn boundary)
Line 24-43:  Turn 2
Line 44:     turn_duration          ← Turn 2 end ✓
...
```

**Message Chain (parentUuid):**
```
user (uuid: aaa, parent: None)     ← Turn start
  ↓
assistant/thinking (parent: aaa)
  ↓
assistant/tool_use (parent: ...)
  ↓
user/tool_result (parent: ...)     ← NOT user input, skip!
  ↓
assistant/text (parent: ...)       ← Final response
  ↓
system/turn_duration (parent: ...) ← Turn end
```

**Key Insight: Distinguishing User Questions from Tool Results**

Both appear as `type: "user"` in JSONL, but have different `content` structures:

| Message Type | `message.content` Type | Example |
|--------------|------------------------|---------|
| User Question | `string` | `"How do I add auth?"` |
| Tool Result | `array` | `[{"type":"tool_result",...}]` |
| Interrupt | `array` with text | `[{"type":"text","text":"[Request interrupted by user]"}]` |

The plugin uses this distinction to identify real user input vs system-generated tool results:
```javascript
function isUserQuestion(line) {
  return line.type === 'user'
    && typeof line.message?.content === 'string';  // STRING = question
}
```

### Memory Extraction

The `store-memories.js` hook extracts the **last complete Turn**:

1. **Wait for completion** - Retry reading file until `turn_duration` marker appears (indicates turn is complete)
2. **Find turn boundaries** - Start after last `turn_duration`, end at current `turn_duration`
   - **ONLY** `turn_duration` is used as boundary (NOT `file-history-snapshot`)
3. **Collect user text** - Original input only (skip `tool_result`)
4. **Collect assistant text** - All `text` blocks (skip `thinking`, `tool_use`)
5. **Merge content** - Join scattered text blocks with `\n\n` separator
6. **Filter invalid content** - Skip system messages and empty responses
7. **Apply length limits** (two-phase):
   - Concat phase: User <= 6000 chars, Assistant <= 15000 chars (stop adding blocks after limit)
   - Truncate phase: User > 2000 → truncate, Assistant > 4000 → truncate
   - Truncation adds `[... truncated, original: N chars]` marker
9. **Upload to cloud** - Send both user and assistant content to EverMem API

**Content Filtering:**

The plugin filters out system-generated messages that aren't useful as memories:

| Pattern | Description | Example |
|---------|-------------|---------|
| `<local-command-*>` | CLI command output markers | `<local-command-stdout>See ya!</local-command-stdout>` |
| `<system-reminder>` | System-injected reminders | `<system-reminder>Check memory...</system-reminder>` |
| `<command-name>` | Slash command markers | `<command-name>/clear</command-name>` |
| `<local-command-caveat>` | Command caveat markers | - |
| `No response requested.` | Empty turn marker | - |

**Content Length Limits:**

| Role | Concat Limit | Final Limit | Action |
|------|--------------|-------------|--------|
| User | 6000 chars | 2000 chars | **Truncate** |
| Assistant | 15000 chars | 4000 chars | **Truncate** |

Processing flow:
1. **Concatenation phase**: Text blocks are joined up to concat limit (stops adding more after limit)
2. **Truncation phase**: Final content is truncated to final limit with `[... truncated, original: N chars]` marker

This two-phase approach:
- Limits memory usage during text block concatenation
- Ensures final stored content is reasonably sized
- Preserves the beginning of content (usually most important)

**Race Condition Handling (Timing Issue):**

> ⚠️ **Important**: The Stop hook runs BEFORE `turn_duration` is written to the JSONL file.

**Execution Timeline:**
```
1. Claude finishes responding (all text/tool_use written to JSONL)
2. Claude Code triggers Stop hook
3. Stop hook reads JSONL file ← turn_duration NOT present yet
4. stop_hook_summary is written
5. Stop hook completes
6. turn_duration is written ← Only available AFTER hook finishes
```

**Why this matters:**
- The retry mechanism waiting for `turn_duration` will always timeout (5 attempts × 100ms = 500ms)
- Content extraction must work WITHOUT relying on `turn_duration` for the current turn

**Our Solution - Boundary-based Extraction:**
```javascript
function extractLastTurn(lines) {
  // Find START: line after the PREVIOUS turn's turn_duration
  let turnStartIndex = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const e = JSON.parse(lines[i]);
    if (e.type === 'system' && e.subtype === 'turn_duration') {
      turnStartIndex = i + 1;  // Start AFTER this marker
      break;
    }
  }

  // END: Always the end of file (current turn is incomplete by definition)
  const turnEndIndex = lines.length;

  // Extract content between these boundaries
  return extractContent(lines, turnStartIndex, turnEndIndex);
}
```

**Key Insight:**
- We use the PREVIOUS turn's `turn_duration` as the START boundary
- We use end-of-file as the END boundary
- This captures the current (incomplete) turn without waiting for its `turn_duration`

**Risk Mitigation:**
- Claude Code flushes all assistant messages to disk before triggering the Stop hook
- The 500ms retry provides a safety buffer for slow I/O
- If content is still missing, it will be captured in the next turn's extraction

**For Batch Processing (Test Scripts):**
When analyzing historical JSONL files, skip the last turn if it doesn't end with `turn_duration`:
```javascript
// Only process complete turns for historical analysis
const lastLine = JSON.parse(lines[lines.length - 1]);
if (lastLine.type !== 'system' || lastLine.subtype !== 'turn_duration') {
  console.warn('Last turn is incomplete, skipping...');
  // Process only up to the last turn_duration
}
```

**Why merge?** A single Claude response spans multiple JSONL lines:
- `thinking` → `tool_use` → `tool_result` → ... → `text` (final response)

The hook merges all `text` blocks to capture the complete response.

### API Upload

Each message is sent to `POST /api/v0/memories`:

```json
{
  "message_id": "u_1770367656189",
  "create_time": "2026-02-06T08:47:36.189Z",
  "sender": "claude-code-user",
  "role": "user",
  "content": "How do I add authentication?",
  "group_id": "ever_a3f2c"
}
```

Response on success:
```json
{
  "message": "Message accepted and queued for processing",
  "request_id": "<request-uuid>",
  "status": "queued"
}
```

### Hook Output (stdout)

The hook returns JSON via stdout to communicate with Claude Code:

```json
{
  "systemMessage": "💾 Memory saved (2) [user: 59, assistant: 127]"
}
```

This message is displayed to the user after Claude finishes responding.

## Memory Hub Implementation

The `/evermem:hub` command opens a web dashboard for visualizing memories. Due to browser limitations (GET requests can't have body), a local proxy server bridges the dashboard and EverMem API.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           /evermem:hub Command                               │
│  1. Start proxy server: node server/proxy.js &                              │
│  2. Generate URL: http://localhost:3456/?key=${EVERMEM_API_KEY}             │
│  3. User opens URL in browser                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Browser (dashboard.html)                             │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Stats     │  │  Heatmap    │  │  7-Day      │  │  Project    │        │
│  │   Cards     │  │  (6 months) │  │  Chart      │  │   Cards     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
│  Data Flow:                                                                  │
│  1. GET /api/groups → Local groups.jsonl (filtered by keyId)                │
│  2. For each group: POST /api/v0/memories → Fetch memories                  │
│  3. Render dashboard with aggregated data                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Proxy Server (localhost:3456)                           │
│                                                                              │
│  Routes:                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  GET  /              → Serve dashboard.html                          │   │
│  │  GET  /api/groups    → Read groups.jsonl, filter by keyId           │   │
│  │  POST /api/v0/memories → Convert to GET+body, forward to API        │   │
│  │  GET  /health        → Health check                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Why Proxy?                                                                  │
│  - Browser limitation: GET requests can't have body                         │
│  - EverMem API uses GET /api/v0/memories with JSON body                     │
│  - Proxy receives POST, converts to GET+body using native https             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EverMem Cloud API                                    │
│                      https://api.evermind.ai                                 │
│                                                                              │
│  GET /api/v0/memories (with body)                                           │
│  Request:  { user_id, group_id, memory_type, limit, offset }                │
│  Response: { result: { memories[], total_count, has_more } }                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Proxy Server (`server/proxy.js`)

```javascript
// Key function: Convert API key to keyId (for groups filtering)
function computeKeyId(apiKey) {
  const hash = createHash('sha256').update(apiKey).digest('hex');
  return hash.substring(0, 12);  // First 12 chars of SHA-256
}

// Key function: Read groups.jsonl and filter by keyId
function getGroupsForKey(keyId) {
  const content = readFileSync(GROUPS_FILE, 'utf8');
  const lines = content.trim().split('\n');

  const groupMap = new Map();
  for (const line of lines) {
    const entry = JSON.parse(line);
    if (entry.keyId !== keyId) continue;  // Filter by current API key

    // Aggregate: count sessions, track first/last seen
    // ...
  }
  return Array.from(groupMap.values());
}

// Key route: Forward POST as GET+body (browser workaround)
// Browser sends:  POST /api/v0/memories { body }
// Proxy sends:    GET  /api/v0/memories { body } via native https
```

### Dashboard (`assets/dashboard.html`)

**Data Loading Flow:**

```javascript
async function loadGroups() {
  // 1. Fetch groups from local storage (via proxy)
  const groupsData = await fetch('/api/groups', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  // 2. For each group, fetch memories with pagination
  for (const group of groups) {
    const data = await fetch('/api/v0/memories', {
      method: 'POST',
      body: JSON.stringify({
        user_id: 'claude-code-user',
        group_id: group.id,
        memory_type: 'episodic_memory',
        limit: 100,
        offset: 0
      })
    });

    // Store: memories[], totalCount, hasMore, offset
    groupMemories[group.id] = { ... };
  }

  // 3. Render dashboard
  renderDashboard(totalMemories);
}
```

**UI Components:**

| Component | Description |
|-----------|-------------|
| Stats Grid | 5 cards: Total Memories, Projects, Active Days, Avg/Day, Avg/Project |
| Heatmap | GitHub-style 6-month activity grid with tooltips |
| Growth Chart | Last 7 days bar chart |
| Project Cards | Expandable cards showing memories per project |
| Timeline | Within each project, memories grouped by date |
| Load More | Pagination button when `has_more: true` |

**Timeline within Project:**

```
📁 evermem-claude-code (25 memories)
├── ● Sun, Feb 9 [Today]               3 memories
│   ├── 💭 Discussion about JWT...     10:30 AM
│   ├── 🔧 Fixed authentication...     09:15 AM
│   └── ✨ Created new API endpoint    08:00 AM
│
├── ● Sat, Feb 8                       5 memories
│   ├── 📝 Updated README...           16:20 PM
│   └── ...
│
└── [Load more (17 remaining)]
```

## Project Structure

```
evermem-plugin/
├── plugin.json               # Plugin manifest
├── commands/
│   ├── help.md               # /evermem:help command
│   ├── search.md             # /evermem:search command
│   ├── hub.md                # /evermem:hub command
│   ├── ask.md                # /evermem:ask command
│   ├── projects.md           # /evermem:projects command
│   └── addHistory.md         # /evermem:addHistory command (retroactive import)
├── data/
│   ├── groups.jsonl          # Local storage for tracked projects (JSONL format)
│   ├── sessions.jsonl        # Local storage for session summaries (JSONL format)
│   └── history-preview.jsonl # Temporary file for /evermem:addHistory (auto-deleted)
├── hooks/
│   ├── hooks.json            # Hook configuration
│   └── scripts/
│       ├── inject-memories.js    # Memory recall (UserPromptSubmit)
│       ├── store-memories.js     # Memory save (Stop)
│       ├── session-context.js    # Session context (SessionStart)
│       ├── session-summary.js    # Session summary (SessionEnd)
│       ├── add-history.js        # Retroactive history upload (main script)
│       ├── extract-history.js    # Q&A extraction from transcript
│       ├── upload-history.js     # Upload extracted Q&A to cloud
│       └── utils/
│           ├── evermem-api.js    # EverMem Cloud API client
│           ├── config.js         # Configuration utilities
│           └── groups-store.js   # Local groups persistence
├── assets/
│   └── dashboard.html        # Memory Hub dashboard
├── server/
│   └── proxy.js              # Local proxy server for dashboard
└── README.md
```

## API Reference

The plugin uses the EverMem Cloud API at `https://api.evermind.ai`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v0/memories` | POST | Store a new memory (Q&A pairs, session events) |
| `/api/v0/memories` | GET | Get memories (with query params) |
| `/api/v0/memories/search` | GET | Search memories (hybrid retrieval, with JSON body, requires Content-Length header, radius=0.1) |
| `/api/v0/memories/conversation-meta` | POST | Set conversation metadata (first time group creation) |

**Note on API Call Ordering:**

The `POST /api/v0/memories` endpoint uses queue-based processing. When a memory is submitted, the API returns immediately:

```json
{
  "status": "queued",
  "message": "Message accepted and queued for processing",
  "request_id": "<request-uuid>"
}
```

This means actual memory extraction happens asynchronously on the server. When viewing API call logs at [console.evermind.ai/req-logs](https://console.evermind.ai/req-logs), the requests may not appear in strict "1 search + 2 add" order for each Q&A turn. The search request (from UserPromptSubmit hook) and the two add requests (user message + assistant response from Stop hook) are processed independently and may complete in any order.

**Dual-Threshold Filtering (Memory Search):**

The plugin uses a dual-threshold approach for memory retrieval:

| Layer | Parameter | Value | Location |
|-------|-----------|-------|----------|
| Server-side | `radius` | `0.1` | `evermem-api.js` (sent to API) |
| Client-side | `MIN_SCORE` | `0.1` | `inject-memories.js` (local filter) |

1. **Server-side (`radius: 0.1`)**: The EverMem API filters memories by cosine similarity threshold during vector/hybrid retrieval. Only memories with similarity >= 0.1 are returned.

2. **Client-side (`MIN_SCORE: 0.1`)**: After receiving results, the plugin filters again locally. This provides double insurance in case server behavior changes.

If no memories pass the threshold, the user sees: `📝 Memory: Found N memories, 0 above threshold (0.1)`

**Session Event Messages:**

| Event | Content Format | Special Params |
|-------|----------------|----------------|
| Session Start | `[Session Start] User {created/resumed} session at {time}. session_id: {id}, group_id: {gid}, path: {path}` | - |
| Session End | _(No cloud message - local only)_ | - |

## Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/EverMind-AI/evermem-claude-code.git
cd evermem-claude-code

# Install dependencies
npm install

# Run Claude Code with local plugin
claude --plugin-dir .
```

### Testing Hooks

```bash
# Test memory recall
echo '{"prompt":"How do I handle authentication?"}' | node hooks/scripts/inject-memories.js

# Test memory save (requires transcript file)
echo '{"transcript_path":"/path/to/transcript.json"}' | node hooks/scripts/store-memories.js
```

