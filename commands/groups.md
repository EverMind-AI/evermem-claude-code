---
description: View and manage your memory groups (projects)
---

# EverMem Groups

View all projects that have been tracked by EverMem.

## Instructions

Show the user their memory groups stored in the local groups.jsonl file.

1. Read the groups file from the plugin's data directory
2. Aggregate entries by groupId (count sessions, find first/last seen)
3. Display the list of groups with their statistics
4. If no groups file exists, explain that groups are tracked automatically

## Actions

Check and read the groups data file:

```bash
GROUPS_FILE="${CLAUDE_PLUGIN_ROOT}/data/groups.jsonl"
if [ -f "$GROUPS_FILE" ] && [ -s "$GROUPS_FILE" ]; then
  cat "$GROUPS_FILE"
else
  echo "NO_GROUPS_FILE"
fi
```

**Note:** The file uses JSONL format (one JSON object per line). Each line is a session start event.

Entry format: `{"keyId":"...","groupId":"...","name":"...","path":"...","timestamp":"..."}`

- `keyId`: SHA-256 hash (first 12 chars) of the API key - associates groups with accounts
- `groupId`: Unique identifier based on working directory path

Aggregate by `keyId + groupId` when displaying (same project under different API keys = separate entries):
- Count occurrences = sessionCount
- Earliest timestamp = firstSeen
- Latest timestamp = lastSeen

## Output Format

If groups exist:
```
📁 Your Memory Groups

| Project | Sessions | Last Active |
|---------|----------|-------------|
| project-a | 5 | 2h ago |
| project-b | 12 | 1d ago |
| evermem-claude-code | 3 | just now |

Total: 3 groups
```

If no groups file:
```
📁 Your Memory Groups

No groups tracked yet. Groups are automatically recorded when you use EverMem in different projects.

Each project directory creates a unique group ID for organizing memories.
```

## Notes

- Groups are identified by the working directory path + API key hash
- Each group has its own memory namespace in EverMem Cloud
- The groups.jsonl file is appended by the SessionStart hook (each session adds one line)
- Aggregation happens when reading the file
- Same project used with different API keys will appear as separate groups
- `keyId` is a SHA-256 hash (first 12 chars) of the API key - secure and unique
