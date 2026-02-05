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
│           └── config.js         # Configuration utilities
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
