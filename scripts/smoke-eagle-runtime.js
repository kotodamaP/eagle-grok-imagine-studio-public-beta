const { execFileSync } = require('child_process');
const http = require('http');

function runPowerShell(script) {
  return execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function parseJsonMaybeArray(text) {
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function request(port, pathName, options = {}) {
  const body = options.body || '';
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathName,
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {}),
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
      },
      timeout: options.timeoutMs || 3000
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`HTTP timeout on ${port}${pathName}`));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function findEagleMcpPort() {
  const script = `
$ids = Get-Process -Name Eagle -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id
if (-not $ids) { '[]'; exit 0 }
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ids -contains $_.OwningProcess } |
  Select-Object LocalPort,OwningProcess |
  Sort-Object LocalPort -Unique |
  ConvertTo-Json -Compress
`;
  const rows = parseJsonMaybeArray(runPowerShell(script));
  const ports = [...new Set(rows.map((row) => Number(row.LocalPort)).filter(Boolean))];
  for (const port of ports) {
    try {
      const status = await request(port, '/api/status');
      if (status.statusCode !== 200) continue;
      const data = JSON.parse(status.body);
      if (data && data.mcpEnabled && data.endpoints && data.endpoints.mcp) {
        return { port, status: data, ports };
      }
    } catch (_) {
      // Keep scanning Eagle-owned ports.
    }
  }
  return { port: 0, status: null, ports };
}

function parseSseJson(body) {
  const dataLines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim());
  if (!dataLines.length) {
    throw new Error(`MCP response did not include SSE data: ${body.slice(0, 200)}`);
  }
  return JSON.parse(dataLines[dataLines.length - 1]);
}

async function callTool(port, name, args = {}) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args }
  });
  const response = await request(port, '/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json'
    },
    body: payload,
    timeoutMs: 5000
  });
  if (response.statusCode !== 200) {
    throw new Error(`MCP ${name} returned HTTP ${response.statusCode}: ${response.body.slice(0, 300)}`);
  }
  const message = parseSseJson(response.body);
  if (message.error) throw new Error(`MCP ${name} error: ${JSON.stringify(message.error)}`);
  const text = message.result && message.result.content && message.result.content[0] && message.result.content[0].text;
  return text ? JSON.parse(text) : message.result;
}

async function main() {
  const mcp = await findEagleMcpPort();
  const failures = [];
  if (!mcp.port) {
    failures.push(`Eagle MCP port was not found. Eagle-owned ports: ${mcp.ports.join(', ') || '(none)'}`);
  }

  let appInfo = null;
  if (mcp.port) {
    appInfo = await callTool(mcp.port, 'get_app_info');
    if (!appInfo.success) failures.push('get_app_info did not return success=true');
    if (!appInfo.data || !String(appInfo.data.version || '').startsWith('4.0.')) {
      failures.push(`expected Eagle 4.0.x, got ${appInfo.data && appInfo.data.version}`);
    }
    if (!appInfo.data || !appInfo.data.libraryPath) {
      failures.push('active Eagle library path was empty');
    }
    if (!appInfo.data || appInfo.data.platform !== 'win32') {
      failures.push(`expected win32 platform, got ${appInfo.data && appInfo.data.platform}`);
    }
  }

  if (failures.length) {
    console.error(JSON.stringify({ ok: false, failures, mcp, appInfo }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    mcpPort: mcp.port,
    enabledToolCount: mcp.status.enabledToolCount,
    app: {
      version: appInfo.data.version,
      platform: appInfo.data.platform,
      locale: appInfo.data.locale,
      libraryPath: appInfo.data.libraryPath
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
