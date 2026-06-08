const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || 8787);
const root = path.resolve(process.argv[3] || path.resolve(__dirname, '..'));

const mockScript = `
<script>
window.require = function(name) {
  if (name === 'fs') return {
    existsSync: () => true,
    statSync: () => ({ size: 123456, mtimeMs: Date.now() }),
    mkdirSync: () => {},
    copyFileSync: () => {},
    writeFileSync: () => {},
    appendFileSync: () => {},
    readdirSync: () => []
  };
  if (name === 'path') return {
    resolve: (...parts) => parts.filter(Boolean).join('\\\\').replace(/\\\\+/g, '\\\\'),
    basename: (p, ext) => {
      const b = String(p || '').split(/[\\\\/]/).pop() || '';
      return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
    },
    extname: (p) => {
      const b = String(p || '').split(/[\\\\/]/).pop() || '';
      const i = b.lastIndexOf('.');
      return i >= 0 ? b.slice(i) : '';
    },
    dirname: (p) => String(p || '').replace(/[\\\\/][^\\\\/]*$/, '') || '.',
    join: (...parts) => parts.filter(Boolean).join('\\\\').replace(/\\\\+/g, '\\\\')
  };
  if (name === 'os') return { homedir: () => '/mock/home', tmpdir: () => '/mock/tmp' };
  if (name === 'child_process') return { spawn: null };
  if (name.includes('media_importer')) return {
    IMAGE_EXTS: new Set(['jpg','jpeg','png','webp','bmp','gif','tif','tiff']),
    probeMedia: () => ({ width: 640, height: 480, duration: 0 }),
    flattenFolders: () => []
  };
  return null;
};
window.eagle = {
  library: { path: '/mock/eagle-library.library', name: 'Mock Eagle Library' },
  folder: { getAll: async () => [{ id: 'folder-a', name: 'GrokTest', children: [] }] },
  item: { getSelected: async () => [] },
  window: { close: async () => { window.__codexClosed = true; }, minimize: async () => {} },
  notification: { show: () => {} },
  clipboard: { writeText: () => {}, copyFiles: () => {} },
  shell: { openPath: async () => {}, openExternal: async () => {} },
  onPluginCreate: (cb) => cb()
};
</script>`;

const testScript = `
<script>
window.addEventListener('load', () => setTimeout(() => {
  const result = { ok: true, checks: [] };
  const check = (name, ok, detail = '') => {
    result.checks.push({ name, ok: Boolean(ok), detail });
    if (!ok) result.ok = false;
  };
  try {
    const statusText = document.getElementById('statusPill').textContent;
    check('booted', !/error|エラー|繧ｨ繝ｩ繝ｼ/i.test(statusText), statusText);
    check('generate disabled without refs', document.getElementById('runGrokBuildBtn').disabled, document.getElementById('runGrokBuildBtn').title);
    addRefs([
      { id:'r1', source:'smoke', filePath:'/mock/tmp/ref1.png', stagedPath:'', name:'ref1', ext:'png', size:1, tags:['alpha'], width:640, height:480 },
      { id:'r2', source:'smoke', filePath:'/mock/tmp/ref2.png', stagedPath:'', name:'ref2', ext:'png', size:1, tags:['beta'], width:800, height:600 }
    ]);
    check('two refs rendered', document.querySelectorAll('.ref-item').length === 2, document.getElementById('refCount').textContent);
    check('prompt contains @1 @2', document.getElementById('finalPrompt').value.includes('@1') && document.getElementById('finalPrompt').value.includes('@2'));
    removeReferenceAt(0);
    check('one ref after removal', document.querySelectorAll('.ref-item').length === 1, document.getElementById('refCount').textContent);
    addRefs([{ id:'r3', source:'smoke', filePath:'/mock/tmp/ref3.png', stagedPath:'', name:'ref3', ext:'png', size:1, tags:['gamma'], width:512, height:512 }]);
    check('two refs after add', document.querySelectorAll('.ref-item').length === 2, document.getElementById('refCount').textContent);
    setMode('video');
    document.getElementById('dialogueTimeline').value = '0-2s: 「ここにいるよ」 close-up slow push-in';
    document.getElementById('dialogueTimeline').dispatchEvent(new Event('input', { bubbles: true }));
    buildPrompt();
    const videoPrompt = document.getElementById('finalPrompt').value;
    check('video prompt contains dialogue camera', /ここにいるよ|close-up|push-in/.test(videoPrompt));
    check('video retry visible', !document.getElementById('retryVideoBtn').classList.contains('hidden'));
    const wm = getComputedStyle(document.getElementById('grokWatermark'));
    check('watermark laid out', Number(wm.opacity) >= 0, 'opacity=' + wm.opacity);
    const fakeEvent = buildModerationEvent({
      attempt: 1,
      prompt: 'Create a safe test image with @1.',
      retryPrompt: 'Create a safe test image with @1.\\nModeration-safe retry constraints:\\n- Keep the scene fictional, non-explicit, non-graphic, and suitable for a general audience.',
      errorText: 'blocked by moderation policy',
      retryPlanned: true
    });
    const fakeFailure = moderationFailureFromEvent(fakeEvent, ['/mock/tmp/moderation-errors.jsonl'], 'Moderation smoke failure card');
    upsertFailedResult(fakeFailure);
    upsertFailedResult(fakeFailure);
    const failureCards = Array.from(document.querySelectorAll('.failed-candidate'));
    const failureText = failureCards[0] ? failureCards[0].textContent : '';
    check('moderation failure card rendered once', failureCards.length === 1, String(failureCards.length));
    check('moderation failure card has controls', /Retry/.test(failureText) && /Prompt/.test(failureText) && /Log/.test(failureText));
    check('moderation failure card keeps prompt preview', /Create a safe test image/.test(failureText));
  } catch (error) {
    result.ok = false;
    result.error = error.stack || String(error);
  }
  const pre = document.createElement('pre');
  pre.id = 'codexSmokeResult';
  pre.textContent = JSON.stringify(result, null, 2);
  pre.style.position = 'fixed';
  pre.style.right = '10px';
  pre.style.bottom = '10px';
  pre.style.zIndex = '999999';
  pre.style.maxWidth = '560px';
  pre.style.maxHeight = '460px';
  pre.style.overflow = 'auto';
  pre.style.background = '#111827';
  pre.style.color = '#e5e7eb';
  pre.style.padding = '12px';
  pre.style.border = '1px solid #374151';
  document.body.appendChild(pre);
}, 800));
</script>`;

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(root, rel);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) return send(res, 404, 'not found', 'text/plain');
  if (rel === '/index.html') {
    let html = fs.readFileSync(filePath, 'utf8');
    html = html.replace('<script src="js/plugin.js"></script>', `${mockScript}<script src="js/plugin.js"></script>${testScript}`);
    return send(res, 200, html, 'text/html; charset=utf-8');
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = ext === '.js' ? 'text/javascript; charset=utf-8'
    : ext === '.png' ? 'image/png'
    : ext === '.json' ? 'application/json; charset=utf-8'
    : 'text/plain; charset=utf-8';
  send(res, 200, fs.readFileSync(filePath), type);
}).listen(port, '127.0.0.1', () => {
  console.log(`smoke browser server http://127.0.0.1:${port}/index.html root=${root}`);
});
