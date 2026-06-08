const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const pluginPath = path.join(root, 'js', 'plugin.js');
const source = fs.readFileSync(pluginPath, 'utf8');

const sandbox = {
  console,
  require,
  setTimeout,
  clearTimeout,
  window: { addEventListener() {}, eagle: null },
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; }
  },
  localStorage: {
    getItem() { return null; },
    setItem() {}
  }
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: pluginPath });

async function main() {
  const success = await sandbox.runProcess(process.execPath, [
    '-e',
    'process.stdout.write("success-out"); process.stderr.write("success-err");'
  ], { timeoutMs: 10000 });

  let failed;
  try {
    await sandbox.runProcess(process.execPath, [
      '-e',
      'process.stdout.write("blocked by moderation policy"); process.stderr.write("safety stderr"); process.exit(7);'
    ], { timeoutMs: 10000 });
  } catch (error) {
    failed = {
      message: error.message,
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr
    };
  }

  const failures = [];
  if (success.stdout !== 'success-out') failures.push('success stdout was not captured');
  if (success.stderr !== 'success-err') failures.push('success stderr was not captured');
  if (!failed) failures.push('non-zero child process did not reject');
  if (failed && failed.code !== 7) failures.push(`expected exit code 7, got ${failed.code}`);
  if (failed && failed.stdout !== 'blocked by moderation policy') failures.push('failure stdout was not retained on error');
  if (failed && failed.stderr !== 'safety stderr') failures.push('failure stderr was not retained on error');
  if (failed && !sandbox.isModerationErrorText(sandbox.moderationErrorText(failed))) {
    failures.push('retained stdout/stderr did not feed moderation detection');
  }

  if (failures.length) {
    console.error(JSON.stringify({ ok: false, failures, success, failed }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    success,
    failed
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
