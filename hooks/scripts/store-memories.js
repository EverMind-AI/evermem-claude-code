#!/usr/bin/env node

process.on('uncaughtException', (err) => {
  process.stdout.write(JSON.stringify({ systemMessage: `💾 UNCAUGHT: ${err.message}` }));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stdout.write(JSON.stringify({ systemMessage: `💾 UNHANDLED: ${reason}` }));
  process.exit(1);
});

import { readFileSync, existsSync } from 'fs';
import { isConfigured } from './utils/config.js';
import { addMemory } from './utils/evermem-api.js';

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const hookInput = JSON.parse(input);
  const transcriptPath = hookInput.transcript_path;

  if (!transcriptPath || !existsSync(transcriptPath) || !isConfigured()) {
    process.exit(0);
  }

  const content = readFileSync(transcriptPath, 'utf8');
  const lines = content.trim().split('\n');

  function extractText(c) {
    if (typeof c === 'string') return c;
    if (!Array.isArray(c)) return null;
    const t = c.filter(b => b.type === 'text').map(b => b.text).filter(Boolean);
    return t.length > 0 ? t.join('\n') : null;
  }

  let lastUser = null, lastAssistant = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      const text = extractText(e.message?.content);
      if (e.type === 'assistant' && !lastAssistant && text) lastAssistant = text;
      if (e.type === 'user' && !lastUser && text) lastUser = text;
      if (lastUser && lastAssistant) break;
    } catch {}
  }

  // Run both in parallel with Promise.all
  const promises = [];
  const results = [];

  if (lastUser) {
    promises.push(
      addMemory({ content: lastUser, role: 'user', messageId: `u_${Date.now()}` })
        .then(r => results.push({ type: 'USER', ...r }))
        .catch(e => results.push({ type: 'USER', ok: false, error: e.message }))
    );
  }

  if (lastAssistant) {
    promises.push(
      addMemory({ content: lastAssistant, role: 'assistant', messageId: `a_${Date.now()}` })
        .then(r => results.push({ type: 'ASSISTANT', ...r }))
        .catch(e => results.push({ type: 'ASSISTANT', ok: false, error: e.message }))
    );
  }

  await Promise.all(promises);

  // Check if all calls succeeded
  const allSuccess = results.length > 0 && results.every(r => r.ok && !r.error);

  let output;
  if (allSuccess) {
    output = `💾 EverMem: Memory saved (${results.length} messages)`;
  } else {
    // Show detailed errors
    function truncateBody(body) {
      if (!body) return body;
      const copy = { ...body };
      if (copy.content && typeof copy.content === 'string' && copy.content.length > 100) {
        copy.content = copy.content.substring(0, 100) + '... [truncated]';
      }
      return copy;
    }

    output = '💾 EverMem: Save failed\n';
    for (const r of results) {
      if (r.error) {
        output += `${r.type}: ERROR - ${r.error}\n`;
      } else if (!r.ok) {
        output += `${r.type}: FAILED (${r.status})\n`;
        output += `Request: ${JSON.stringify(truncateBody(r.body), null, 2)}\n`;
        output += `Response: ${JSON.stringify(r.response, null, 2)}\n`;
      }
    }
  }

  process.stdout.write(JSON.stringify({ systemMessage: output }));

} catch (e) {
  process.stdout.write(JSON.stringify({ systemMessage: `💾 ERROR: ${e.message}` }));
}
