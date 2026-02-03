---
description: Open the EverMem Memory Hub to view statistics, search memories, and explore timeline
---

Open the EverMem Memory Hub to visualize your memory statistics, search and filter memories, and explore your memory timeline.

**Important:** The Memory Hub requires a local server to be running.

First, start the server in a separate terminal:

```bash
node "${CLAUDE_PLUGIN_ROOT}/server/proxy.js"
```

Then get the API key and construct the hub URL:

```bash
API_KEY="${EVERMEM_API_KEY:-}"

if [ -z "$API_KEY" ]; then
  echo "Warning: EVERMEM_API_KEY not set. You'll need to enter it manually in the hub."
  echo ""
  echo "Memory Hub URL:"
  echo "http://localhost:3456/"
else
  echo "Memory Hub URL (with API key):"
  echo "http://localhost:3456/?key=$API_KEY"
fi
```

Share the Memory Hub URL with the user. Remind them to start the server first if they haven't already. If the API key is available, the hub will automatically load their memories when opened.

**Features:**
- GitHub-style activity heatmap (click to jump to day)
- Search memories by content
- Filter by project
- Click memory cards to view full content
- Manual refresh button
