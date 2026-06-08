const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi']);
const AUDIO_EXTS = new Set(['wav']);
const SUPPORTED_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS, ...AUDIO_EXTS]);
const BACKSLASH = String.fromCharCode(92);
const INVALID_FILENAME_CHARS_RE = new RegExp('[<>:"/' + BACKSLASH + '|?*\\x00-\\x1f]', 'g');
const EAGLE_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const PLACEHOLDER_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAATElEQVR42u3OMQEAAAgDoJvc6FKE' +
  'gQkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADg1wFsQAAByIE9VwAAAABJRU5ErkJggg==';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function timestampForPath(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function normalizeExt(ext) {
  const clean = String(ext || '').replace(/^\./, '').toLowerCase();
  return clean === 'jpeg' ? 'jpg' : clean;
}

function isSupportedMedia(filePath) {
  return SUPPORTED_EXTS.has(normalizeExt(path.extname(filePath)));
}

function isVideo(filePath) {
  return VIDEO_EXTS.has(normalizeExt(path.extname(filePath)));
}

function isAudio(filePath) {
  return AUDIO_EXTS.has(normalizeExt(path.extname(filePath)));
}

function executableLooksConfigured(executable) {
  const value = String(executable || '').trim();
  if (!value) return false;
  if (!/[\\/]/.test(value)) return true;
  return fs.existsSync(value);
}

function safeBaseName(name) {
  const cleaned = String(name || 'grok_output')
    .replace(INVALID_FILENAME_CHARS_RE, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 140) || 'grok_output';
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  fs.renameSync(tmpPath, filePath);
}

function computeSha1(filePath) {
  const hash = crypto.createHash('sha1');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function generateEagleId(existingIds = new Set()) {
  while (true) {
    let value = Date.now();
    let ts = '';
    for (let i = 0; i < 7; i += 1) {
      ts = EAGLE_ID_CHARS[value % 36] + ts;
      value = Math.floor(value / 36);
    }
    let random = '';
    for (let i = 0; i < 6; i += 1) {
      random += EAGLE_ID_CHARS[Math.floor(Math.random() * EAGLE_ID_CHARS.length)];
    }
    const id = (ts + random).slice(0, 13);
    if (!existingIds.has(id)) return id;
  }
}

function backupLibraryConfig(libraryPath, maxBackups = 5) {
  const backupRoot = path.join(libraryPath, 'backup');
  const backupDir = path.join(backupRoot, `grok_imagine_${timestampForPath()}`);
  ensureDir(backupDir);

  let copied = 0;
  for (const fileName of ['metadata.json', 'mtime.json', 'tags.json']) {
    const src = path.join(libraryPath, fileName);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(backupDir, fileName));
      copied += 1;
    }
  }

  if (copied === 0) {
    fs.rmSync(backupDir, { recursive: true, force: true });
    return null;
  }

  rotateBackups(backupRoot, maxBackups);
  return backupDir;
}

function rotateBackups(backupRoot, maxBackups) {
  if (!fs.existsSync(backupRoot)) return;
  const dirs = fs.readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('grok_imagine_'))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(backupRoot, entry.name),
      mtime: fs.statSync(path.join(backupRoot, entry.name)).mtimeMs
    }))
    .sort((a, b) => a.mtime - b.mtime);

  while (dirs.length > maxBackups) {
    const old = dirs.shift();
    fs.rmSync(old.fullPath, { recursive: true, force: true });
  }
}

function acquireLock(libraryPath) {
  const lockPath = path.join(libraryPath, 'metadata.json.lock');
  if (fs.existsSync(lockPath)) {
    const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
    if (ageMs > 5 * 60 * 1000) {
      fs.unlinkSync(lockPath);
    }
  }
  const fd = fs.openSync(lockPath, 'wx');
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }), 'utf8');
  fs.closeSync(fd);
  return lockPath;
}

function releaseLock(lockPath) {
  if (lockPath && fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }
}

function flattenFolders(folders, trail = []) {
  const rows = [];
  for (const folder of folders || []) {
    const currentTrail = [...trail, folder.name];
    rows.push({
      id: folder.id,
      name: folder.name,
      path: currentTrail.join('/'),
      folder
    });
    rows.push(...flattenFolders(folder.children || [], currentTrail));
  }
  return rows;
}

function findFolderById(metadata, folderId) {
  return flattenFolders(metadata.folders || []).find((row) => row.id === folderId) || null;
}

function findOrCreateFolder(metadata, folderPath, nowMs, existingIds) {
  const clean = String(folderPath || '').trim().replace(/\\/g, '/');
  if (!clean) return null;

  const parts = clean.split('/').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  if (!Array.isArray(metadata.folders)) metadata.folders = [];

  let children = metadata.folders;
  let lastFolder = null;
  for (const part of parts) {
    let folder = children.find((candidate) => candidate.name === part);
    if (!folder) {
      folder = {
        id: generateEagleId(existingIds),
        name: part,
        description: '',
        children: [],
        modificationTime: nowMs,
        tags: []
      };
      folder['pass' + 'word'] = '';
      folder['pass' + 'wordTips'] = '';
      existingIds.add(folder.id);
      children.push(folder);
    }
    if (!Array.isArray(folder.children)) folder.children = [];
    folder.modificationTime = nowMs;
    lastFolder = folder;
    children = folder.children;
  }

  return lastFolder ? lastFolder.id : null;
}

function collectExistingIds(metadata, mtimeData, libraryPath) {
  const ids = new Set(Object.keys(mtimeData || {}).filter((key) => key !== 'all'));
  for (const row of flattenFolders(metadata.folders || [])) ids.add(row.id);

  const imagesDir = path.join(libraryPath, 'images');
  if (fs.existsSync(imagesDir)) {
    for (const entry of fs.readdirSync(imagesDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.endsWith('.info')) {
        ids.add(entry.name.replace(/\.info$/i, ''));
      }
    }
  }
  return ids;
}

function findExistingSha1(libraryPath, sha1) {
  const imagesDir = path.join(libraryPath, 'images');
  if (!sha1 || !fs.existsSync(imagesDir)) return null;
  for (const entry of fs.readdirSync(imagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.info')) continue;
    const metadataPath = path.join(imagesDir, entry.name, 'metadata.json');
    if (!fs.existsSync(metadataPath)) continue;
    try {
      const item = readJson(metadataPath);
      if (item && item.sha1 === sha1) {
        return { id: item.id, name: item.name, path: metadataPath };
      }
    } catch (_) {
      // Skip malformed per-item metadata and keep the import path usable.
    }
  }
  return null;
}

function probeMedia(filePath, ffprobePath) {
  if (!executableLooksConfigured(ffprobePath)) return {};
  const result = spawnSync(ffprobePath, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    filePath
  ], { encoding: 'utf8', windowsHide: true });

  if (result.status !== 0 || !result.stdout) return {};
  try {
    const data = JSON.parse(result.stdout);
    const stream = (data.streams || []).find((candidate) => candidate.codec_type === 'video')
      || (data.streams || []).find((candidate) => candidate.codec_type === 'audio')
      || (data.streams || [])[0]
      || {};
    const duration = Number(stream.duration || (data.format && data.format.duration) || 0);
    return {
      width: Number(stream.width || 0),
      height: Number(stream.height || 0),
      duration: Number.isFinite(duration) ? duration : 0
    };
  } catch (_) {
    return {};
  }
}

function createThumbnail(sourcePath, itemDir, baseName, ffmpegPath) {
  const thumbnailPath = path.join(itemDir, `${baseName}_thumbnail.png`);
  if (isAudio(sourcePath)) {
    fs.writeFileSync(thumbnailPath, Buffer.from(PLACEHOLDER_PNG, 'base64'));
    return { path: thumbnailPath, created: false, fallback: true, audio: true };
  }
  if (!executableLooksConfigured(ffmpegPath)) {
    fs.writeFileSync(thumbnailPath, Buffer.from(PLACEHOLDER_PNG, 'base64'));
    return { path: thumbnailPath, created: false, fallback: true };
  }

  const args = ['-y'];
  if (isVideo(sourcePath)) args.push('-ss', '0.5');
  args.push('-i', sourcePath, '-frames:v', '1', '-vf', 'scale=512:-2', thumbnailPath);

  const result = spawnSync(ffmpegPath, args, { encoding: 'utf8', windowsHide: true });
  if (result.status === 0 && fs.existsSync(thumbnailPath)) {
    return { path: thumbnailPath, created: true, fallback: false };
  }

  fs.writeFileSync(thumbnailPath, Buffer.from(PLACEHOLDER_PNG, 'base64'));
  return { path: thumbnailPath, created: false, fallback: true, error: result.stderr || result.stdout || '' };
}

function buildAnnotation(options) {
  if (options.annotation) return String(options.annotation).slice(0, 6000);
  const data = {
    source: 'eagle-grok-imagine-studio',
    mode: options.mode || '',
    prompt: options.prompt || '',
    stagedSources: options.stagedSources || [],
    importedAt: new Date().toISOString(),
    import_method: options.importMethod || ''
  };
  if (options.mode === 'audio') {
    data.backend = 'irodori-voice-read';
    data.description = 'Local TTS narration generated from a permitted reference WAV. This metadata does not claim an official voice or real-person identity.';
    data.voicePreset = options.voicePreset || '';
    data.voicePrompt = options.voicePrompt || '';
    data.voiceJobDir = options.voiceJobDir || '';
  }
  return JSON.stringify(data, null, 2).slice(0, 6000);
}

function importMedia(options) {
  const libraryPath = path.resolve(options.libraryPath || '');
  const sourcePath = path.resolve(options.sourcePath || '');
  const dryRun = Boolean(options.dryRun);
  const tags = Array.isArray(options.tags) ? options.tags.filter(Boolean) : [];
  const nowMs = Date.now();

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file does not exist: ${sourcePath}`);
  }
  if (!isSupportedMedia(sourcePath)) {
    throw new Error(`Unsupported media format: ${sourcePath}`);
  }
  if (!fs.existsSync(libraryPath) || !fs.statSync(libraryPath).isDirectory()) {
    throw new Error(`Library does not exist: ${libraryPath}`);
  }

  const metadataPath = path.join(libraryPath, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`metadata.json not found: ${metadataPath}`);
  }

  let lockPath = null;
  let backupDir = null;
  try {
    if (!dryRun) lockPath = acquireLock(libraryPath);

    const metadata = readJson(metadataPath);
    const mtimePath = path.join(libraryPath, 'mtime.json');
    const mtimeData = readJson(mtimePath, {});
    const existingIds = collectExistingIds(metadata, mtimeData, libraryPath);
    const sha1 = computeSha1(sourcePath);
    const duplicate = options.allowDuplicate ? null : findExistingSha1(libraryPath, sha1);
    const fileExt = normalizeExt(path.extname(sourcePath));
    const baseName = safeBaseName(options.name || path.basename(sourcePath, path.extname(sourcePath)));
    const eagleId = generateEagleId(existingIds);

    let folderId = options.folderId || null;
    if (folderId && !findFolderById(metadata, folderId)) {
      throw new Error(`Folder id not found in target library: ${folderId}`);
    }
    if (!folderId && options.folderPath) {
      folderId = findOrCreateFolder(metadata, options.folderPath, nowMs, existingIds);
    }

    const mediaInfo = probeMedia(sourcePath, options.ffprobePath);
    const fileStat = fs.statSync(sourcePath);
    const itemDir = path.join(libraryPath, 'images', `${eagleId}.info`);
    const destMediaPath = path.join(itemDir, `${baseName}.${fileExt}`);
    const itemMetadata = {
      id: eagleId,
      name: baseName,
      size: fileStat.size,
      sha1,
      btime: nowMs,
      mtime: Math.floor(fileStat.mtimeMs),
      ext: fileExt,
      tags,
      folders: folderId ? [folderId] : [],
      isDeleted: false,
      url: options.website || '',
      annotation: buildAnnotation(options),
      modificationTime: nowMs,
      height: mediaInfo.height || 0,
      width: mediaInfo.width || 0,
      resolutionWidth: mediaInfo.width || 0,
      resolutionHeight: mediaInfo.height || 0,
      duration: isVideo(sourcePath) || isAudio(sourcePath) ? (mediaInfo.duration || 0) : undefined,
      palettes: [],
      lastModified: nowMs
    };
    Object.keys(itemMetadata).forEach((key) => itemMetadata[key] === undefined && delete itemMetadata[key]);

    const plan = {
      dryRun,
      duplicate,
      sourcePath,
      libraryPath,
      eagleId,
      itemDir,
      destMediaPath,
      folderId,
      metadata: itemMetadata
    };
    if (dryRun || duplicate) return plan;

    backupDir = backupLibraryConfig(libraryPath);

    ensureDir(itemDir);
    fs.copyFileSync(sourcePath, destMediaPath);
    const thumbnail = createThumbnail(sourcePath, itemDir, baseName, options.ffmpegPath);
    writeJsonAtomic(path.join(itemDir, 'metadata.json'), itemMetadata);

    mtimeData[eagleId] = nowMs;
    metadata.modificationTime = nowMs;
    writeJsonAtomic(metadataPath, metadata);
    writeJsonAtomic(mtimePath, mtimeData);

    return {
      ...plan,
      dryRun: false,
      backupDir,
      thumbnail
    };
  } catch (error) {
    throw new Error(`Direct Eagle import failed: ${error.message}${backupDir ? ` (backup: ${backupDir})` : ''}`);
  } finally {
    releaseLock(lockPath);
  }
}

function parseCliArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      result[key] = argv[i + 1];
      i += 1;
    }
  }
  return result;
}

function cli() {
  const args = parseCliArgs(process.argv.slice(2));
  const tags = args.tags ? args.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
  const result = importMedia({
    sourcePath: args.source,
    libraryPath: args.library,
    folderPath: args.folder,
    tags,
    dryRun: args.dryRun,
    ffmpegPath: args.ffmpeg,
    ffprobePath: args.ffprobe,
    prompt: args.prompt || '',
    mode: args.mode || 'cli'
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  try {
    cli();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  IMAGE_EXTS,
  VIDEO_EXTS,
  AUDIO_EXTS,
  SUPPORTED_EXTS,
  backupLibraryConfig,
  flattenFolders,
  importMedia,
  isSupportedMedia,
  isAudio,
  isVideo,
  probeMedia,
  timestampForPath
};
