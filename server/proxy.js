#!/usr/bin/env node
/**
 * EverMem Dashboard Proxy Server
 *
 * Serves the dashboard and proxies API requests to EverMind,
 * working around the browser limitation of not supporting GET requests with body.
 *
 * Usage: node proxy.js
 * Or: EVERMEM_API_KEY=xxx node proxy.js
 */

import http from 'http';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.EVERMEM_PROXY_PORT || 3456;
const API_BASE = 'https://api.evermind.ai';

function sendCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, status, data) {
  sendCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    sendCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle POST /api/v0/memories (list) - forwards as GET with body
  if (req.method === 'POST' && req.url === '/api/v0/memories') {
    let body = '';

    req.on('data', chunk => { body += chunk; });

    req.on('end', () => {
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        sendJson(res, 401, { error: 'Missing Authorization header' });
        return;
      }

      try {
        // Forward as GET with body using curl
        const jsonBody = body.replace(/'/g, "'\\''");
        const curlCmd = `curl -s -X GET "${API_BASE}/api/v0/memories" -H "Authorization: ${authHeader}" -H "Content-Type: application/json" -d '${jsonBody}'`;

        const result = execSync(curlCmd, { timeout: 30000, encoding: 'utf8' });
        const data = JSON.parse(result);
        sendJson(res, 200, data);
      } catch (error) {
        console.error('Proxy error:', error.message);
        sendJson(res, 500, {
          error: 'Proxy request failed',
          message: error.message,
          stdout: error.stdout?.toString(),
          stderr: error.stderr?.toString()
        });
      }
    });
    return;
  }

  // Handle POST /api/v0/memories/search - forwards as GET with body
  if (req.method === 'POST' && req.url === '/api/v0/memories/search') {
    let body = '';

    req.on('data', chunk => { body += chunk; });

    req.on('end', () => {
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        sendJson(res, 401, { error: 'Missing Authorization header' });
        return;
      }

      try {
        // Forward as GET with body using curl
        const jsonBody = body.replace(/'/g, "'\\''");
        const curlCmd = `curl -s -X GET "${API_BASE}/api/v0/memories/search" -H "Authorization: ${authHeader}" -H "Content-Type: application/json" -d '${jsonBody}'`;

        const result = execSync(curlCmd, { timeout: 30000, encoding: 'utf8' });
        const data = JSON.parse(result);
        sendJson(res, 200, data);
      } catch (error) {
        console.error('Proxy error:', error.message);
        sendJson(res, 500, {
          error: 'Proxy request failed',
          message: error.message,
          stdout: error.stdout?.toString(),
          stderr: error.stderr?.toString()
        });
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { status: 'ok', port: PORT });
    return;
  }

  // Serve dashboard HTML
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url === '/dashboard' || req.url.startsWith('/dashboard?'))) {
    try {
      const dashboardPath = join(__dirname, '..', 'assets', 'dashboard.html');
      const html = readFileSync(dashboardPath, 'utf8');
      sendCorsHeaders(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (error) {
      sendJson(res, 500, { error: 'Failed to load dashboard', message: error.message });
    }
    return;
  }

  // Serve logo
  if (req.method === 'GET' && req.url === '/logo.png') {
    try {
      const logoPath = join(__dirname, '..', 'assets', 'logo.png');
      const logo = readFileSync(logoPath);
      sendCorsHeaders(res);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(logo);
    } catch (error) {
      sendJson(res, 404, { error: 'Logo not found' });
    }
    return;
  }

  // 404 for everything else
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`EverMem Dashboard Proxy running on http://localhost:${PORT}`);
  console.log('');
  console.log('The dashboard can now connect to this proxy to fetch memories.');
  console.log('Press Ctrl+C to stop.');
});
