# EverMem Plugin for Claude Code

> 🧠 Automatic memory recall for Claude Code - remembers context from past sessions

EverMem gives Claude Code persistent memory. When you ask a question, relevant memories from past conversations are automatically injected into context, so Claude remembers your preferences, decisions, and project history.

## Quick Install

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/EverMind-AI/evermem-claude-code/main/install.sh)"
```

This will:
1. Prompt for your EverMem API key
2. Save it to your shell profile
3. Install the plugin via Claude Code's plugin system

**Get your API key:** [evermind.ai/dashboard/api-keys](https://evermind.ai/dashboard/api-keys)

## Manual Installation

### Step 1: Get API Key

1. Sign up at [evermind.ai](https://evermind.ai)
2. Go to Dashboard → API Keys
3. Create a new API key

### Step 2: Configure API Key

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export EVERMEM_API_KEY="your-api-key-here"
```

Then reload: `source ~/.zshrc`

### Step 3: Install Plugin

In Claude Code, run:

```
/plugin marketplace add EverMind-AI/evermem-claude-code
/plugin install evermem@evermem
```

## How It Works

```
You: "How should I handle token refresh?"
                    ↓
        [EverMem searches your memories]
                    ↓
📝 Memory Recall by EverMem Plugin (2 memories):
  • (2 days ago) We decided to use JWT with 15-minute expiry...
  • (1 week ago) Fixed the token refresh race condition...
                    ↓
        [Context injected into Claude]
                    ↓
Claude: "Based on your JWT setup with 15-minute expiry..."
```

### What Gets Remembered

- **Decisions** you've made ("We're using PostgreSQL", "JWT for auth")
- **Bug fixes** and solutions
- **Project preferences** and conventions
- **Technical context** from past sessions

### Privacy

- Memories are stored securely in EverMem Cloud
- Only you can access your memories
- Delete anytime from the dashboard

## Example Output

When memories are found, you'll see:

```
📝 Memory Recall by EverMem Plugin (2 memories):
  • (5h ago) We decided to use JWT tokens with 15-minute expiry for authenticati...
  • (1 day ago) Fixed the token refresh race condition bug. When multiple API calls...

Added to context:
<relevant-memories>
The following memories from past sessions are relevant to the user's current task:

[decision] We decided to use JWT tokens with 15-minute expiry for authentication...
</relevant-memories>
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `EVERMEM_API_KEY` | Your EverMem API key | Yes |

### Plugin Settings (Optional)

Create `.claude/evermem.local.md` in your project for per-project config:

```markdown
---
group_id: "my-project"
---
```

## Troubleshooting

### Plugin not loading

```bash
# Verify plugin is installed
/plugin list

# Re-install if needed
/plugin install evermem@evermem --scope user
```

### No memories appearing

1. Check API key is set: `echo $EVERMEM_API_KEY`
2. Ensure you have memories stored (use EverMem with other integrations first)
3. Check Claude Code verbose mode for errors

### API errors

- Verify your API key at [evermind.ai/dashboard](https://evermind.ai/dashboard)
- Check your usage quota

## Development

### Local Development

```bash
# Clone the repo
git clone https://github.com/EverMind-AI/evermem-claude-code.git
cd evermem-claude-code

# Install dependencies
npm install

# Run Claude Code with local plugin
claude --plugin-dir .
```

### Testing

```bash
# Test the hook script directly
echo '{"prompt":"How do I handle auth?"}' | node hooks/scripts/inject-memories.js
```

## File Structure

```
evermem-claude-code/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── hooks/
│   ├── hooks.json               # Hook configuration
│   └── scripts/
│       ├── inject-memories.js   # Memory recall hook
│       └── utils/
│           ├── evermem-api.js   # EverMem Cloud API client
│           ├── config.js        # Configuration loader
│           └── sdk-filter.js    # Claude SDK filtering
├── marketplace.json             # Marketplace definition
├── install.sh                   # One-line installer
├── package.json
└── README.md
```

## Links

- **Website:** [evermind.ai](https://evermind.ai)
- **Documentation:** [docs.evermind.ai](https://docs.evermind.ai)
- **Dashboard:** [evermind.ai/dashboard](https://evermind.ai/dashboard)
- **Issues:** [GitHub Issues](https://github.com/EverMind-AI/evermem-claude-code/issues)

## License

MIT
