# EverMem Plugin for Claude Code

Persistent memory for Claude Code. Automatically saves and recalls context from past coding sessions.

![Memory Hub Screenshot](assets/hub-screenshot.png)

## Features

- **Automatic Memory Retrieved** - Relevant memories are retrieved when you submit a prompt
- **Automatic Memory Save** - Conversations are saved when Claude finishes responding
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

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export EVERMEM_API_KEY="your-api-key-here"
```

Reload your shell:

```bash
source ~/.zshrc  # or source ~/.bashrc
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
| `/evermem:search <query>` | Search your memories for specific topics |
| `/evermem:ask <question>` | Ask about past work (combines memory + context) |
| `/evermem:hub` | Open the Memory Hub dashboard |

### Automatic Behavior

The plugin works automatically in the background:

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
💾 EverMem: Memory saved (4 messages)
```

### Memory Hub

The Memory Hub provides a visual interface to explore your memories:

- Activity heatmap (GitHub-style)
- Memory statistics
- Search and filter capabilities
- Timeline view

To use the hub, run `/evermem:hub` and follow the instructions.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Prompt                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  UserPromptSubmit Hook                                      │
│  • Searches EverMem Cloud for relevant memories             │
│  • Displays memory summary to user                          │
│  • Injects context into Claude's prompt                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Claude Response                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Stop Hook                                                  │
│  • Extracts conversation from transcript                    │
│  • Sends to EverMem Cloud for storage                       │
│  • Server generates summary and stores memory               │
└─────────────────────────────────────────────────────────────┘
```

### Claude Code Hooks Mechanism

> Reference: [Claude Code Hooks Documentation](https://code.claude.com/docs/zh-CN/hooks)

Claude Code provides a **hooks system** that allows plugins to execute custom scripts at specific lifecycle events. Hooks are **event-driven** - they don't run continuously but are triggered by Claude Code at specific moments.

#### How Hooks Work

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

#### Hook Events

| Event | Trigger | Use Case |
|-------|---------|----------|
| `SessionStart` | Claude Code starts | Load context, setup environment |
| `UserPromptSubmit` | User sends a message | Validate prompt, inject context |
| `PreToolUse` | Before tool execution | Approve/deny/modify tool calls |
| `PostToolUse` | After tool execution | Validate results, run linters |
| `Stop` | Claude finishes responding | Save conversation, cleanup |
| `Notification` | System notification | Custom alerts |

#### Plugin hooks.json Configuration

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

#### EverMem Plugin Hooks

```json
{
  "hooks": {
    "SessionStart": [...],        // Load session context
    "UserPromptSubmit": [...],    // Search & inject memories
    "Stop": [...]                 // Save conversation to cloud
  }
}
```

### Technical Details: Conversation Flow

Claude Code stores all conversations locally in JSONL (JSON Lines) format. The EverMem plugin reads this transcript and uploads the latest Q&A pair to the cloud.

#### 1. Hook Input

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

#### 2. Transcript File Format

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

#### 3. Turn Boundary & Segmentation

**Session Level:** One JSONL file = One Session (filename is session ID)

**Turn Level:** A "Turn" = User sends message → Claude fully responds

Turn boundaries are marked by:
```json
{"type":"system","subtype":"turn_duration","durationMs":30692}
```

**JSONL Structure:**
```
Line 1:      file-history-snapshot  ← Session marker
Line 2-21:   Turn 1
Line 22:     turn_duration          ← Turn 1 end
Line 23-43:  Turn 2
Line 44:     turn_duration          ← Turn 2 end
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

#### 4. Memory Extraction

The `store-memories.js` hook extracts the **last complete Turn**:

1. **Wait for completion** - Retry reading file until `turn_duration` marker appears (indicates turn is complete)
2. **Find turn boundaries** - Start after last `turn_duration`, end at current `turn_duration`
3. **Collect user text** - Original input only (skip `tool_result`)
4. **Collect assistant text** - All `text` blocks (skip `thinking`, `tool_use`)
5. **Merge content** - Join scattered text blocks with `\n\n` separator
6. **Upload to cloud** - Send both user and assistant content to EverMem API

**Race Condition Handling:**

The Stop hook runs before `turn_duration` is written. To ensure complete content extraction:

```javascript
// Retry until turn_duration appears (max 5 attempts, 100ms delay)
async function readTranscriptWithRetry(path) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const lines = readFile(path);
    const lastLine = JSON.parse(lines[lines.length - 1]);

    // turn_duration = turn complete
    if (lastLine.type === 'system' && lastLine.subtype === 'turn_duration') {
      return lines;
    }

    await sleep(100);  // Wait and retry
  }
}
```

**Why merge?** A single Claude response spans multiple JSONL lines:
- `thinking` → `tool_use` → `tool_result` → ... → `text` (final response)

The hook merges all `text` blocks to capture the complete response.

#### 5. API Upload

Each message is sent to `POST /api/v1/memories`:

```json
{
  "message_id": "u_1770367656189",
  "create_time": "2026-02-06T08:47:36.189Z",
  "sender": "claude-code-user",
  "role": "user",
  "content": "How do I add authentication?",
  "group_id": "claude-code:/path/to/project",
  "group_name": "Claude Code Session"
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

#### 5. Debug Mode

Enable debug logging to troubleshoot issues:

```bash
# Add to .env file in plugin directory
EVERMEM_DEBUG=1

# View logs in real-time
tail -f /tmp/evermem-debug.log

# Clear logs
> /tmp/evermem-debug.log
```

**Shared Debug Utility (`hooks/scripts/utils/debug.js`)**

Both `inject-memories.js` and `store-memories.js` use a shared debug utility:

```javascript
import { debug, setDebugPrefix } from './utils/debug.js';

setDebugPrefix('inject');  // Log lines will show [inject] prefix
debug('hookInput:', data); // Only writes when EVERMEM_DEBUG=1
```

**Debug output by script:**

| Script | Prefix | Debug Points |
|--------|--------|--------------|
| `inject-memories.js` | `[inject]` | hookInput, search query, search results, filtered/selected memories, output |
| `store-memories.js` | `[store]` | hookInput, read attempts, turn range, line types, extracted content, results |

**Example debug log:**

```log
# Memory injection (UserPromptSubmit hook)
[2026-02-06T08:47:30.100Z] [inject] hookInput: { "prompt": "How do I add auth?", ... }
[2026-02-06T08:47:30.150Z] [inject] searching memories for prompt: How do I add auth?
[2026-02-06T08:47:30.500Z] [inject] search results: {"total": 5, "memories": [...]}
[2026-02-06T08:47:30.520Z] [inject] selected memories: [{"score": 0.85, "subject": "JWT implementation"}]

# Memory storage (Stop hook)
[2026-02-06T08:47:36.184Z] [store] hookInput: { "transcript_path": "...jsonl", ... }

# Retry logic - waiting for turn_duration
[2026-02-06T08:47:36.200Z] [store] read attempt 1: { "totalLines": 525, "isComplete": false, "lastLineType": "progress" }
[2026-02-06T08:47:36.201Z] [store] turn not complete, waiting 100ms before retry...
[2026-02-06T08:47:36.310Z] [store] read attempt 2: { "totalLines": 527, "isComplete": false, "lastLineType": "system/stop_hook_summary" }
[2026-02-06T08:47:36.311Z] [store] turn not complete, waiting 100ms before retry...
[2026-02-06T08:47:36.420Z] [store] read attempt 3: { "totalLines": 528, "isComplete": true, "lastLineType": "system/turn_duration" }

# Content extraction
[2026-02-06T08:47:36.425Z] [store] turn range: { "turnStartIndex": 500, "turnEndIndex": 528, "totalLines": 528 }
[2026-02-06T08:47:36.430Z] [store] assistantTexts count: 3
[2026-02-06T08:47:36.435Z] [store] extracted: { "userLength": 59, "assistantLength": 847, ... }

# API upload results
[2026-02-06T08:47:36.970Z] [store] results: [
  {
    "type": "USER",
    "len": 59,
    "status": 202,
    "ok": true,
    "response": {
      "message": "Message accepted and queued for processing",
      "status": "queued"
    }
  },
  {
    "type": "ASSISTANT",
    "len": 127,
    "status": 202,
    "ok": true,
    "response": { ... }
  }
]
[2026-02-06T08:47:36.975Z] [store] skipped: []
```

**Using debug.js in your own hooks:**

```javascript
import { debug, setDebugPrefix, isDebugEnabled } from './utils/debug.js';

// Set prefix to identify your script in logs
setDebugPrefix('my-hook');

// Log objects (auto JSON stringified) or strings
debug('processing:', { key: 'value' });

// Check if debug is enabled
if (isDebugEnabled()) {
  // expensive debug operations
}
```

#### 6. Hook Output (stdout)

The hook returns JSON via stdout to communicate with Claude Code:

```json
{
  "systemMessage": "💾 Memory saved (2) [user: 59, assistant: 127]"
}
```

This message is displayed to the user after Claude finishes responding.

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `EVERMEM_API_KEY` | Your EverMem API key | Yes |

### Project-Specific Settings

Create `.claude/evermem.local.md` in your project root for per-project configuration:

```markdown
---
group_id: "my-project"
---

Project-specific notes here.
```

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

- **403 Forbidden**: Invalid or expired API key
- **502 Bad Gateway**: Server temporarily unavailable, try again

## Project Structure

```
evermem-plugin/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── commands/
│   ├── help.md               # /evermem:help command
│   ├── search.md             # /evermem:search command
│   └── hub.md                # /evermem:hub command
├── hooks/
│   ├── hooks.json            # Hook configuration
│   └── scripts/
│       ├── inject-memories.js    # Memory recall (UserPromptSubmit)
│       ├── store-memories.js     # Memory save (Stop)
│       └── utils/
│           ├── evermem-api.js    # EverMem Cloud API client
│           ├── config.js         # Configuration utilities
│           └── debug.js          # Shared debug logging utility
├── assets/
│   └── dashboard.html        # Memory Hub dashboard
├── server/
│   └── proxy.js              # Local proxy server for dashboard
└── README.md
```

## API Reference

The plugin uses the EverMem Cloud API at `https://api.evermind.ai`:

- `POST /api/v1/memories` - Store a new memory
- `POST /api/v1/memories/search` - Search memories (hybrid retrieval)

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

## Links

- **Console**: [console.evermind.ai](https://console.evermind.ai/)
- **API Documentation**: [docs.evermind.ai](https://docs.evermind.ai)
- **Issues**: [GitHub Issues](https://github.com/EverMind-AI/evermem-claude-code/issues)

## License

MIT
