---
description: Upload current session's conversation history to EverMem Cloud
arguments: []
---

Upload the current session's conversation history to EverMem Cloud.

## Step 1: Find transcript file

The current session's transcript is at:
```
~/.claude/projects/<project-hash>/<session-id>.jsonl
```

You can find it by checking the CLAUDE_TRANSCRIPT_PATH in the hook context, or by looking for the most recently modified `.jsonl` file in the project directory.

## Step 2: Extract Q&A pairs

Run the extraction script with the transcript path:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/extract-history.js" "<transcript-path>"
```

This will:
- Read the session's transcript file
- Extract all Q&A pairs
- Filter out system messages and interrupted conversations
- Save results to `${CLAUDE_PLUGIN_ROOT}/data/history-preview.jsonl`

## Step 3: Show preview to user

After extraction, read the preview file and show the user:
1. Total Q&A pairs found
2. Sample of Q&A pairs (show up to 10 representative examples, evenly distributed)
3. Statistics (total characters, skipped count, etc.)

Format each sample as:
```
[N] Q: <first 60 chars of question>...
    A: <first 60 chars of answer>...
```

## Step 4: Ask for confirmation

Ask the user: "Do you want to upload these N Q&A pairs to EverMem Cloud?"

If user confirms, proceed to Step 5. If not, delete the preview file and exit.

## Step 5: Upload with progress

Run the upload script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/upload-history.js"
```

Show upload progress with previews (max 20 lines total):
- Calculate interval: `interval = Math.max(1, Math.floor(totalQA / 10))`
- Every `interval` Q&A pairs, show: `[N/Total] Q: <preview> → A: <preview>`

## Use Cases

- **Old Claude Code projects** that didn't have EverMem installed
- **Retroactive memory import** - upload past conversations
- **Session migration** - transfer history to cloud

## For specific sessions

To upload a specific session (not current):

```bash
# Find session IDs
ls ~/.claude/projects/-path-to-project/*.jsonl

# Resume that session
claude --resume <session-id>

# Then run /evermem:addHistory
```
