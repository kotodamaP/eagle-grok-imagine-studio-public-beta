const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pluginSource = fs.readFileSync(path.join(root, 'js', 'plugin.js'), 'utf8');

function defaultPath(key) {
  const literalPattern = new RegExp(`${key}:\\s*'([^']+)'`);
  const literalMatch = pluginSource.match(literalPattern);
  if (literalMatch) return literalMatch[1].replace(/\\\\/g, '\\');

  const envPattern = new RegExp(`${key}:\\s*envDefault\\('([^']+)',\\s*'([^']+)'\\)`);
  const envMatch = pluginSource.match(envPattern);
  if (envMatch) {
    return process.env[envMatch[1]] || envMatch[2].replace(/\\\\/g, '\\');
  }

  throw new Error(`DEFAULTS.${key} was not found in js/plugin.js`);
}

function run(exe, args) {
  return new Promise((resolve) => {
    execFile(exe, args, { timeout: 10000 }, (error, stdout, stderr) => {
      resolve({
        code: error && typeof error.code === 'number' ? error.code : 0,
        message: error ? error.message : '',
        stdout: stdout || '',
        stderr: stderr || ''
      });
    });
  });
}

function executableLooksConfigured(exe) {
  if (!exe) return false;
  if (!/[\\/]/.test(exe)) return true;
  return fs.existsSync(exe);
}

async function main() {
  const deps = {
    grokCli: defaultPath('grokCli'),
    ffmpeg: defaultPath('ffmpeg'),
    ffprobe: defaultPath('ffprobe'),
    upscaylBin: defaultPath('upscaylBin'),
    upscaylModels: defaultPath('upscaylModels')
  };
  const failures = [];
  for (const [name, filePath] of Object.entries(deps)) {
    if (!executableLooksConfigured(filePath)) failures.push(`${name} does not exist: ${filePath}`);
  }

  let grokVersion = null;
  let grokHelp = null;
  let ffmpegVersion = null;
  let ffprobeVersion = null;
  let upscaylHelp = null;

  if (executableLooksConfigured(deps.grokCli)) {
    grokVersion = await run(deps.grokCli, ['--version']);
    grokHelp = await run(deps.grokCli, ['--help']);
    const helpText = `${grokHelp.stdout}\n${grokHelp.stderr}`;
    for (const flag of ['--cwd', '--output-format', '--no-plan', '--max-turns', '--permission-mode', '-p']) {
      if (!helpText.includes(flag)) failures.push(`grok --help did not include ${flag}`);
    }
    if (!/grok\s+\d+\.\d+\.\d+/i.test(`${grokVersion.stdout}\n${grokVersion.stderr}`)) {
      failures.push('grok --version did not return a version string');
    }
  }

  if (executableLooksConfigured(deps.ffmpeg)) {
    ffmpegVersion = await run(deps.ffmpeg, ['-version']);
    if (!/ffmpeg version/i.test(`${ffmpegVersion.stdout}\n${ffmpegVersion.stderr}`)) {
      failures.push('ffmpeg -version did not return an ffmpeg version');
    }
  }
  if (executableLooksConfigured(deps.ffprobe)) {
    ffprobeVersion = await run(deps.ffprobe, ['-version']);
    if (!/ffprobe version/i.test(`${ffprobeVersion.stdout}\n${ffprobeVersion.stderr}`)) {
      failures.push('ffprobe -version did not return an ffprobe version');
    }
  }
  if (executableLooksConfigured(deps.upscaylBin)) {
    upscaylHelp = await run(deps.upscaylBin, ['--help']);
    const helpText = `${upscaylHelp.stdout}\n${upscaylHelp.stderr}`;
    for (const flag of ['-i input-path', '-o output-path', '-m model-path', '-n model-name']) {
      if (!helpText.includes(flag)) failures.push(`upscayl-bin --help did not include ${flag}`);
    }
  }

  if (failures.length) {
    console.error(JSON.stringify({ ok: false, failures, deps }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    deps,
    versions: {
      grok: `${grokVersion.stdout}${grokVersion.stderr}`.trim().split(/\r?\n/)[0],
      ffmpeg: `${ffmpegVersion.stdout}${ffmpegVersion.stderr}`.trim().split(/\r?\n/)[0],
      ffprobe: `${ffprobeVersion.stdout}${ffprobeVersion.stderr}`.trim().split(/\r?\n/)[0],
      upscaylHelp: `${upscaylHelp.stdout}${upscaylHelp.stderr}`.includes('Usage: upscayl-bin')
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
