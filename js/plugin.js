const nativeRequire = typeof require === 'function' ? require : null;
const fs = nativeRequire ? nativeRequire('fs') : null;
const path = nativeRequire ? nativeRequire('path') : null;
const os = nativeRequire ? nativeRequire('os') : null;
const { spawn } = nativeRequire ? nativeRequire('child_process') : { spawn: null };
function optionalRequire(modulePath) {
  if (!nativeRequire) return null;
  try {
    return nativeRequire(modulePath);
  } catch (_) {
    return null;
  }
}

const importer = optionalRequire('./js/media_importer') || optionalRequire('./media_importer');

const PLUGIN_ID = 'eagle-grok-imagine-studio';
const BACKSLASH = String.fromCharCode(92);
const INVALID_FILENAME_CHARS_RE = new RegExp('[<>:"/' + BACKSLASH + '|?*\\x00-\\x1f]', 'g');
const WINDOWS_MEDIA_PATH_RE = new RegExp('[A-Za-z]:' + BACKSLASH + BACKSLASH + '[^"\\r\\n<>|]+?\\.(?:png|jpg|jpeg|webp|mp4)', 'gi');
function envDefault(name, fallback) {
  const env = typeof process !== 'undefined' && process.env ? process.env : {};
  const value = env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

const DEFAULTS = {
  targetLibrary: '',
  grokCli: envDefault('GROK_CLI_COMMAND', 'grok'),
  grokWeb: 'https://grok.com/imagine',
  ffmpeg: envDefault('FFMPEG_PATH', 'ffmpeg'),
  ffprobe: envDefault('FFPROBE_PATH', 'ffprobe'),
  grokDownloads: '',
  upscaylBin: envDefault('UPSCAYL_BIN', ''),
  upscaylModels: envDefault('UPSCAYL_MODELS', '')
};
const IMAGE_EXTS = importer && importer.IMAGE_EXTS
  ? importer.IMAGE_EXTS
  : new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff']);
const VIDEO_REF_EXTS = new Set(['mp4', 'mov', 'webm', 'm4v']);
const VOICE_SEED_EXTS = new Set(['wav']);
const VOICE_LONG_TEXT_WARNING_CHARS = 420;
const VOICE_WRAPPER_RELATIVE_PATH = ['scripts', 'run_irodori_narration_from_plugin.ps1'];
const EMOTION_TEMPLATES = [
  { id: 'calm-soft', label: '穏やか / 柔らかい', prompt: 'calm and soft, gentle breath, warm relaxed intonation' },
  { id: 'whisper-anxious', label: '不安 / 囁き', prompt: 'anxious whisper, airy voice, slightly trembling ending' },
  { id: 'bright-happy', label: '嬉しい / 明るい', prompt: 'bright and happy, lively rhythm, smiling voice' },
  { id: 'sad-breathy', label: '悲しい / 息混じり', prompt: 'sad and breathy, restrained volume, fragile pauses' },
  { id: 'angry-low', label: '怒り / 低く抑える', prompt: 'controlled anger, low voice, clipped emphasis' },
  { id: 'determined-steady', label: '決意 / まっすぐ', prompt: 'determined and steady, clear articulation, rising confidence' },
  { id: 'surprised-short', label: '驚き / 短く跳ねる', prompt: 'surprised, short sharp intake of breath, quick lifted tone' },
  { id: 'tender-intimate', label: '親密 / 優しく近い', prompt: 'tender and intimate, quiet close-mic feeling, soft prosody' },
  { id: 'mysterious-quiet', label: '神秘的 / 静か', prompt: 'mysterious and quiet, slow measured cadence, subtle echo of emotion' }
];
const CAMERA_ANGLE_TEMPLATES = [
  { id: 'eye-medium', label: '目線 / ミディアム', prompt: 'eye-level medium shot, natural dialogue framing' },
  { id: 'medium-close', label: 'ミディアム寄り', prompt: 'medium close-up, face and upper body clearly readable' },
  { id: 'close-up', label: 'クローズアップ', prompt: 'close-up on the face, eyes and mouth readable for emotion and speech' },
  { id: 'extreme-close-up', label: '超クローズアップ', prompt: 'extreme close-up on eyes or lips for intense emotion' },
  { id: 'wide-establishing', label: 'ワイド / 状況', prompt: 'wide establishing shot showing subject and environment' },
  { id: 'full-body', label: '全身', prompt: 'full-body shot showing pose, outfit, and movement' },
  { id: 'low-angle', label: 'ローアングル', prompt: 'low-angle shot, subject feels powerful or dramatic' },
  { id: 'high-angle', label: 'ハイアングル', prompt: 'high-angle shot, subject feels delicate, vulnerable, or observed' },
  { id: 'profile-side', label: '横顔 / プロファイル', prompt: 'profile side shot at roughly 90 degrees, contemplative mood' },
  { id: 'three-quarter', label: '斜め前 3/4', prompt: 'three-quarter front angle, cinematic face shape and body depth' },
  { id: 'over-shoulder', label: '肩越し', prompt: 'over-the-shoulder angle, intimate conversation perspective' },
  { id: 'pov', label: 'POV', prompt: 'point-of-view angle, camera feels like the viewer is in the scene' },
  { id: 'overhead', label: '俯瞰 / 真上', prompt: 'overhead bird-eye angle, graphic composition from above' },
  { id: 'dutch', label: 'ダッチアングル', prompt: 'subtle Dutch angle, uneasy dramatic tension without disorienting the subject' }
];
const CAMERA_MOVE_TEMPLATES = [
  { id: 'locked-off', label: '固定', prompt: 'locked-off static camera, only the character moves naturally' },
  { id: 'slow-push-in', label: 'ゆっくり寄る', prompt: 'slow dolly push-in toward the face to build emotional focus' },
  { id: 'slow-pull-out', label: 'ゆっくり引く', prompt: 'slow dolly pull-out revealing the environment and emotional distance' },
  { id: 'pan-left', label: 'パン左', prompt: 'slow pan left, horizontal reveal while keeping the subject stable' },
  { id: 'pan-right', label: 'パン右', prompt: 'slow pan right, horizontal reveal while keeping the subject stable' },
  { id: 'tilt-up', label: 'ティルト上', prompt: 'slow tilt up, vertical reveal from body to face or skyward detail' },
  { id: 'tilt-down', label: 'ティルト下', prompt: 'slow tilt down, vertical reveal from face to hands or object detail' },
  { id: 'tracking-follow', label: '追従トラッキング', prompt: 'smooth tracking follow shot, camera follows the subject at a steady distance' },
  { id: 'side-track', label: '横移動トラック', prompt: 'side tracking movement, camera glides parallel to the subject' },
  { id: 'pedestal-up', label: 'ペデスタル上', prompt: 'pedestal up, camera position rises vertically without changing angle' },
  { id: 'pedestal-down', label: 'ペデスタル下', prompt: 'pedestal down, camera position lowers vertically without changing angle' },
  { id: 'crane-up', label: 'クレーン上昇', prompt: 'gentle crane up, camera rises to reveal scale and atmosphere' },
  { id: 'orbit-left', label: '左オービット', prompt: 'subtle left orbit around the subject, maintaining stable face and silhouette' },
  { id: 'orbit-right', label: '右オービット', prompt: 'subtle right orbit around the subject, maintaining stable face and silhouette' },
  { id: 'handheld-subtle', label: '微細手持ち', prompt: 'subtle handheld drift, organic but not shaky' },
  { id: 'zoom-in', label: 'ズームイン', prompt: 'gentle zoom in, lens-based emphasis without physical camera travel' },
  { id: 'zoom-out', label: 'ズームアウト', prompt: 'gentle zoom out, lens-based reveal of the scene' },
  { id: 'dolly-zoom', label: 'ドリーズーム', prompt: 'subtle dolly zoom for shock or realization, keep subject scale readable' }
];
const SCRIPT_PRESETS = [
  { id: 'quiet-dialogue', label: '会話: 近く柔らかく', timeRange: '0-6s', dialogue: 'ここにいるよ', emotion: 'tender-intimate', angle: 'medium-close', movement: 'slow-push-in' },
  { id: 'realization', label: '決意: ゆっくり寄る', timeRange: '0-6s', dialogue: 'もう迷わない', emotion: 'determined-steady', angle: 'close-up', movement: 'slow-push-in' },
  { id: 'surprise', label: '驚き: 短く反応', timeRange: '0-3s', dialogue: 'えっ', emotion: 'surprised-short', angle: 'close-up', movement: 'dolly-zoom' },
  { id: 'lonely-reveal', label: '孤独: 引いて見せる', timeRange: '0-6s', dialogue: '', emotion: 'sad-breathy', angle: 'wide-establishing', movement: 'slow-pull-out' },
  { id: 'walk-follow', label: '歩き: 追従', timeRange: '0-6s', dialogue: '', emotion: 'calm-soft', angle: 'full-body', movement: 'tracking-follow' },
  { id: 'side-profile', label: '横顔: パン', timeRange: '0-6s', dialogue: '', emotion: 'mysterious-quiet', angle: 'profile-side', movement: 'pan-right' },
  { id: 'power-low', label: '強さ: ローアングル', timeRange: '0-6s', dialogue: '任せて', emotion: 'determined-steady', angle: 'low-angle', movement: 'crane-up' },
  { id: 'vulnerable-high', label: '繊細: ハイアングル', timeRange: '0-6s', dialogue: '大丈夫', emotion: 'whisper-anxious', angle: 'high-angle', movement: 'slow-push-in' },
  { id: 'orbit-showcase', label: '衣装: オービット', timeRange: '0-6s', dialogue: '', emotion: 'bright-happy', angle: 'three-quarter', movement: 'orbit-left' },
  { id: 'object-detail', label: '手元: ティルト下', timeRange: '0-4s', dialogue: '', emotion: 'calm-soft', angle: 'close-up', movement: 'tilt-down' }
];

const STORAGE_KEYS = {
  settings: `${PLUGIN_ID}:settings`,
  usage: `${PLUGIN_ID}:usage`,
  moderation: `${PLUGIN_ID}:moderation-events`,
  voiceProfiles: `${PLUGIN_ID}:voice-profiles`
};
const MODERATION_LOG_FILE = 'moderation-errors.jsonl';
const MODERATION_HISTORY_LIMIT = 80;
const MODERATION_RETRY_LIMIT = 1;
const MODERATION_RETRY_CONSTRAINTS = [
  'Moderation-safe retry constraints:',
  '- Keep all characters clearly adult if any age context is present.',
  '- Avoid nudity, lingerie, erotic framing, fetish emphasis, explicit body focus, or suggestive camera language.',
  '- Avoid graphic violence, gore, injury detail, self-harm, hate symbols, illegal acts, and real-person impersonation.',
  '- Keep the scene fictional, non-explicit, non-graphic, and suitable for a general audience.',
  '- Preserve the original identity, composition, style, camera direction, and dialogue intent only where they fit these safety constraints.'
];

const state = {
  mode: 'image',
  references: [],
  stagedDir: '',
  stagedManifest: null,
  activeLibraryPath: '',
  candidates: [],
  voiceSeedPath: '',
  voiceSeedOriginalPath: '',
  voiceJobDir: '',
  voiceLastResult: null,
  voiceProfiles: [],
  watchTimer: null,
  watchSince: 0,
  seenDownloads: new Map(),
  settings: {},
  usage: {},
  failedResults: [],
  moderationEvents: [],
  libraryOptions: [],
  folderOptions: [],
  scriptRows: [],
  scriptTimingWarning: '',
  initializing: false,
  eventsBound: false,
  initialized: false,
  isOptimizing: false,
  isGenerating: false,
  watermarkLayoutRaf: 0,
  watermarkResizeObserver: null
};

const $ = (id) => document.getElementById(id);

const els = {};

function cacheDom() {
  [
    'activeLibrary', 'addFilesBtn', 'addScriptRowBtn', 'armWatchBtn', 'buildPromptBtn', 'cameraMotion',
    'candidateList', 'chooseLibraryBtn', 'chooseSeedAudioBtn', 'clearLogBtn', 'clearRefsBtn', 'clearSeedAudioBtn', 'closeBtn',
    'copyFilesBtn', 'copyPromptBtn', 'dialogueTimeline', 'downloadsPath', 'dropZone', 'dryRunImportBtn', 'editStrength',
    'fileInput', 'finalPrompt', 'grokCliPath', 'grokWebUrl', 'imageAspect',
    'imageCount', 'imageOptions', 'imageResolution', 'importSelectedBtn',
    'grokOptimizerOptions', 'grokPromptActions', 'grokPromptField', 'grokUserIntentField', 'grokWatermark', 'loadSelectionBtn', 'log', 'logPanel', 'minimizeBtn', 'modeChecklist',
    'modeImage', 'modeSpec', 'modeSpecBadge', 'modeVideo', 'modeVoice',
    'openStagingBtn', 'optimizePromptBtn', 'optimizerBackend', 'optimizerModelName', 'optimizerStatus', 'refCount', 'refHint',
    'refs', 'refreshVoiceProfilesBtn', 'resultUpscaleSetting', 'retryVideoBtn', 'saveSeedVoiceProfileBtn', 'scanNowBtn', 'scriptPresetSelect', 'scriptRows', 'scriptTimingWarning', 'stageBtn', 'stagingPath', 'stagingStatus', 'statusPill',
    'stopWatchBtn', 'targetFolderSelect', 'targetLibrarySelect',
    'saveTargetPanel', 'usagePanel', 'usageDateText', 'usageImageCount', 'usageText', 'usageVideo480Count', 'usageVideo720Count',
    'userIntent', 'videoDuration', 'videoOptions', 'videoResolution',
    'videoUpscale', 'voiceDirection', 'voiceName', 'voiceOptions', 'voicePreset', 'voiceProfileSelect', 'voicePromptPreview', 'voicePromptPreviewStatus',
    'voiceSeedDropZone', 'voiceSeedInput', 'voiceSeedStatus', 'voiceText', 'voiceTextWarning',
    'watchStatus', 'runGrokBuildBtn', 'refreshFoldersBtn'
  ].forEach((id) => {
    els[id] = $(id);
    if (!els[id]) {
      throw new Error(`UI element not found: ${id}`);
    }
  });
}

function moveReferencePanelUnderModeSpec() {
  const refPanel = els.refCount.closest('.panel');
  const modeSpecPanel = els.modeSpec.closest('.panel');
  if (!refPanel || !modeSpecPanel || refPanel.previousElementSibling === modeSpecPanel) return;
  modeSpecPanel.insertAdjacentElement('afterend', refPanel);
}

function updateWatermarkLayout() {
  if (!els.grokWatermark) return;
  const content = document.querySelector('.content');
  const sideColumn = document.querySelector('.side-column');
  const anchorPanel = state.mode === 'voice'
    ? els.saveTargetPanel
    : (els.logPanel || (els.log ? els.log.closest('.panel') : null));
  if (!content || !sideColumn || !anchorPanel) return;

  const contentRect = content.getBoundingClientRect();
  const sideRect = sideColumn.getBoundingClientRect();
  const anchorRect = anchorPanel.getBoundingClientRect();
  const gapTop = Math.max(anchorRect.bottom + 14, contentRect.top + 14);
  const gapBottom = contentRect.bottom - 18;
  const gapHeight = gapBottom - gapTop;

  if (window.innerWidth <= 860 || gapHeight < 110 || sideRect.width < 180) {
    els.grokWatermark.style.opacity = '0';
    return;
  }

  const size = Math.round(Math.min(250, Math.max(130, Math.min(sideRect.width * 0.62, gapHeight * 0.76))));
  const left = Math.round(sideRect.left + ((sideRect.width - size) / 2));
  const top = Math.round(gapTop + ((gapHeight - size) / 2));

  els.grokWatermark.style.setProperty('--watermark-left', `${left}px`);
  els.grokWatermark.style.setProperty('--watermark-top', `${top}px`);
  els.grokWatermark.style.setProperty('--watermark-size', `${size}px`);
  els.grokWatermark.style.opacity = '0.085';
}

function scheduleWatermarkLayout() {
  if (state.watermarkLayoutRaf) {
    const cancelFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
    cancelFrame(state.watermarkLayoutRaf);
  }
  const requestFrame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 0);
  state.watermarkLayoutRaf = requestFrame(() => {
    state.watermarkLayoutRaf = 0;
    updateWatermarkLayout();
  });
}

function bindWatermarkLayout() {
  window.addEventListener('resize', scheduleWatermarkLayout);
  if (typeof ResizeObserver !== 'undefined') {
    state.watermarkResizeObserver = new ResizeObserver(scheduleWatermarkLayout);
    const content = document.querySelector('.content');
    const sideColumn = document.querySelector('.side-column');
    [content, sideColumn, els.saveTargetPanel, els.usagePanel, els.logPanel].filter(Boolean).forEach((element) => {
      state.watermarkResizeObserver.observe(element);
    });
  }
  scheduleWatermarkLayout();
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function log(message, level = 'info') {
  const stamp = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  const prefix = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
  els.log.textContent += `[${stamp}] ${prefix} ${message}\n`;
  els.log.scrollTop = els.log.scrollHeight;
  els.statusPill.textContent = message;
}

function showError(error) {
  const message = error && error.message ? error.message : String(error);
  log(message, 'error');
  if (window.eagle && eagle.notification) {
    eagle.notification.show({ title: 'Grok Imagine Studio', body: message });
  }
}

function moderationHistoryRoot() {
  if (!fs || !os || !path) return '';
  const root = path.join(os.tmpdir(), PLUGIN_ID);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function loadModerationEvents() {
  const events = loadJson(STORAGE_KEYS.moderation, []);
  state.moderationEvents = Array.isArray(events) ? events.slice(0, MODERATION_HISTORY_LIMIT) : [];
}

function saveModerationEvents() {
  saveJson(STORAGE_KEYS.moderation, state.moderationEvents.slice(0, MODERATION_HISTORY_LIMIT));
}

function moderationErrorText(errorOrText) {
  if (!errorOrText) return '';
  if (typeof errorOrText === 'string') return errorOrText;
  return [
    errorOrText.message || '',
    errorOrText.stdout || '',
    errorOrText.stderr || ''
  ].filter(Boolean).join('\n');
}

function isModerationErrorText(text) {
  const value = String(text || '');
  if (!value.trim()) return false;
  return [
    /(moderation|moderated|safety|policy|content)[\s\S]{0,120}(blocked|failed|error|rejected|violation|disallowed|unsafe|denied|not allowed)/i,
    /(blocked|failed|rejected|violation|disallowed|unsafe|denied|not allowed)[\s\S]{0,120}(moderation|safety|policy|content)/i,
    /\bcontent policy\b/i,
    /\bsafety system\b/i,
    /\bNSFW\b/i,
    /モデレート|モデレーション|安全性|ポリシー違反|拒否|ブロック|不許可/
  ].some((pattern) => pattern.test(value));
}

function moderationCategories(prompt, errorText) {
  const text = `${prompt || ''}\n${errorText || ''}`.toLowerCase();
  const categories = [];
  const checks = [
    ['sexual', /(nude|nudity|nsfw|sexual|erotic|lingerie|bikini|cleavage|fetish|seductive|裸|性的|下着|露出|胸|谷間)/i],
    ['minor_age', /(minor|young girl|schoolgirl|child|teen|underage|loli|幼い|少女|未成年|学生|制服)/i],
    ['violence', /(gore|blood|bloody|wound|kill|killing|weapon|knife|gun|violence|violent|流血|出血|傷|殺|銃|ナイフ)/i],
    ['self_harm', /(self-harm|suicide|cutting|自傷|自殺)/i],
    ['hate_or_extremism', /(hate symbol|nazi|extremist|terror|差別|ヘイト|ナチ|テロ)/i],
    ['real_person', /(real person|celebrity|impersonate|deepfake|実在|有名人)/i],
    ['visible_text', /(subtitle|caption|speech bubble|text overlay|文字|字幕|吹き出し)/i]
  ];
  for (const [name, pattern] of checks) {
    if (pattern.test(text)) categories.push(name);
  }
  return categories.length ? categories : ['uncategorized'];
}

function moderationReferenceSnapshot() {
  return state.references.map((ref, index) => ({
    refMarker: `@${index + 1}`,
    fileName: path.basename(ref.stagedPath || ref.filePath || ''),
    ext: ref.ext,
    width: ref.width || 0,
    height: ref.height || 0,
    tags: (ref.tags || []).slice(0, 12)
  }));
}

function createModerationSafePrompt(originalPrompt) {
  const modeLine = state.mode === 'video'
    ? '- For video, keep dialogue as safe spoken acting only; do not create visible captions or sexualized/graphic motion.'
    : '- For image editing, keep the edit non-explicit and non-graphic while preserving the safe visual intent.';
  return [
    String(originalPrompt || '').trim(),
    '',
    ...MODERATION_RETRY_CONSTRAINTS,
    modeLine
  ].filter(Boolean).join('\n');
}

function buildModerationEvent({ attempt, prompt, retryPrompt, errorText, retryPlanned }) {
  const categories = moderationCategories(prompt, errorText);
  const event = {
    at: new Date().toISOString(),
    plugin: PLUGIN_ID,
    type: 'moderation_error',
    mode: state.mode,
    attempt,
    retryPlanned: Boolean(retryPlanned),
    categories,
    options: state.mode === 'video'
      ? { resolution: els.videoResolution.value, duration: els.videoDuration.value, upscale: els.videoUpscale.value }
      : { aspect: els.imageAspect.value, resolution: els.imageResolution.value, count: els.imageCount.value, editStrength: els.editStrength.value },
    userIntent: els.userIntent.value.trim(),
    prompt,
    retryPrompt: retryPrompt || '',
    errorText: String(errorText || '').slice(0, 12000),
    references: moderationReferenceSnapshot()
  };
  event.fingerprint = moderationEventFingerprint(event);
  return event;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function moderationEventFingerprint(event) {
  return hashString(stableStringify({
    type: event.type,
    mode: event.mode,
    attempt: event.attempt,
    retryPlanned: event.retryPlanned,
    categories: event.categories,
    options: event.options,
    userIntent: event.userIntent,
    prompt: event.prompt,
    retryPrompt: event.retryPrompt,
    references: event.references
  }));
}

function jsonlContainsFingerprint(filePath, fingerprint) {
  if (!fs || !filePath || !fingerprint || !fs.existsSync(filePath)) return false;
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.some((line) => {
      try {
        const entry = JSON.parse(line);
        return entry && entry.fingerprint === fingerprint;
      } catch (_) {
        return false;
      }
    });
  } catch (_) {
    return false;
  }
}

function appendJsonLine(filePath, event) {
  if (!fs || !filePath) return false;
  if (event.fingerprint && jsonlContainsFingerprint(filePath, event.fingerprint)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, 'utf8');
  return true;
}

function recordModerationEvent(event) {
  const written = [];
  const summary = {
    at: event.at,
    type: event.type,
    mode: event.mode,
    attempt: event.attempt,
    retryPlanned: event.retryPlanned,
    categories: event.categories,
    fingerprint: event.fingerprint,
    promptLength: String(event.prompt || '').length
  };
  state.moderationEvents = state.moderationEvents.filter((entry) => entry.fingerprint !== summary.fingerprint);
  state.moderationEvents.unshift(summary);
  state.moderationEvents = state.moderationEvents.slice(0, MODERATION_HISTORY_LIMIT);
  saveModerationEvents();

  if (fs && path) {
    const root = moderationHistoryRoot();
    if (root) {
      const aggregatePath = path.join(root, MODERATION_LOG_FILE);
      if (appendJsonLine(aggregatePath, event)) written.push(aggregatePath);
    }
    if (state.stagedDir) {
      const jobPath = path.join(state.stagedDir, MODERATION_LOG_FILE);
      if (appendJsonLine(jobPath, event)) written.push(jobPath);
    }
  }
  return written;
}

function upsertFailedResult(failure) {
  const fingerprint = failure.fingerprint || hashString(stableStringify(failure));
  const entry = {
    ...failure,
    fingerprint,
    at: failure.at || new Date().toISOString()
  };
  state.failedResults = (state.failedResults || []).filter((item) => item.fingerprint !== fingerprint);
  state.failedResults.unshift(entry);
  state.failedResults = state.failedResults.slice(0, 20);
  renderCandidates();
  return entry;
}

function moderationFailureFromEvent(event, logPaths, message) {
  return {
    type: 'moderation_failure',
    mode: event.mode,
    attempt: event.attempt,
    retryPlanned: event.retryPlanned,
    categories: event.categories || [],
    prompt: event.prompt || '',
    retryPrompt: event.retryPrompt || '',
    errorText: event.errorText || '',
    references: event.references || [],
    logPaths: logPaths || [],
    message: message || 'Moderation error',
    fingerprint: event.fingerprint
  };
}

function moderationTrendSummary(limit = 20) {
  const counts = {};
  for (const event of state.moderationEvents.slice(0, limit)) {
    for (const category of event.categories || ['uncategorized']) {
      counts[category] = (counts[category] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => `${category}:${count}`)
    .join(', ');
}

function todayFolderName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function todayUsageKey() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function getDefaultDownloadsPath() {
  if (!os) return '';
  return path.join(os.homedir(), 'Downloads');
}

function normalizePath(value) {
  if (!value || !path) return '';
  try {
    return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  } catch (_) {
    return String(value).replace(/[\\/]+$/, '').toLowerCase();
  }
}

function samePath(a, b) {
  return normalizePath(a) === normalizePath(b);
}

function templateById(templates, id) {
  return templates.find((template) => template.id === id) || templates[0];
}

function getVideoDurationSeconds() {
  const duration = Number(els.videoDuration ? els.videoDuration.value : 6);
  return Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 6;
}

function clampSecond(value, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, number));
}

function parseTimeRange(value, fallbackEnd = getVideoDurationSeconds()) {
  const text = String(value || '');
  const matches = text.match(/\d+/g) || [];
  const start = matches.length ? Number(matches[0]) : 0;
  const end = matches.length > 1 ? Number(matches[1]) : fallbackEnd;
  return { startSecond: start, endSecond: end };
}

function normalizeRowTiming(row = {}) {
  const duration = getVideoDurationSeconds();
  const parsed = row.startSecond === undefined && row.endSecond === undefined
    ? parseTimeRange(row.timeRange, duration)
    : {
        startSecond: Number(row.startSecond),
        endSecond: Number(row.endSecond)
      };
  let startSecond = clampSecond(parsed.startSecond, duration);
  let endSecond = clampSecond(parsed.endSecond, duration);
  let adjusted = Boolean(row.timingAdjusted) || startSecond !== parsed.startSecond || endSecond !== parsed.endSecond;
  if (endSecond <= startSecond) {
    adjusted = true;
    if (startSecond >= duration) {
      startSecond = Math.max(0, duration - 1);
      endSecond = duration;
    } else {
      endSecond = Math.min(duration, startSecond + 1);
    }
  }
  return { startSecond, endSecond, adjusted };
}

function normalizeScriptRow(row = {}) {
  const timing = normalizeRowTiming(row);
  return {
    startSecond: timing.startSecond,
    endSecond: timing.endSecond,
    dialogue: String(row.dialogue || '').trim(),
    emotion: templateById(EMOTION_TEMPLATES, row.emotion || 'calm-soft').id,
    angle: templateById(CAMERA_ANGLE_TEMPLATES, row.angle || 'medium-close').id,
    movement: templateById(CAMERA_MOVE_TEMPLATES, row.movement || 'slow-push-in').id,
    timingAdjusted: timing.adjusted
  };
}

function defaultScriptRow() {
  return normalizeScriptRow({
    startSecond: 0,
    endSecond: getVideoDurationSeconds(),
    dialogue: '',
    emotion: 'calm-soft',
    angle: 'medium-close',
    movement: 'slow-push-in'
  });
}

function scriptPresetToRow(preset) {
  const timing = parseTimeRange(preset.timeRange, getVideoDurationSeconds());
  return normalizeScriptRow({
    startSecond: timing.startSecond,
    endSecond: timing.endSecond,
    dialogue: preset.dialogue,
    emotion: preset.emotion,
    angle: preset.angle,
    movement: preset.movement
  });
}

function templateOptionsHtml(templates, selectedId) {
  return templates.map((template) => {
    const selected = template.id === selectedId ? ' selected' : '';
    return `<option value="${escapeHtml(template.id)}"${selected}>${escapeHtml(template.label)}</option>`;
  }).join('');
}

function timeOptionsHtml(selectedSecond) {
  const duration = getVideoDurationSeconds();
  let html = '';
  for (let second = 0; second <= duration; second += 1) {
    const selected = second === Number(selectedSecond) ? ' selected' : '';
    html += `<option value="${second}"${selected}>${second}秒</option>`;
  }
  return html;
}

function populateScriptPresetSelect() {
  els.scriptPresetSelect.innerHTML = '<option value="">推奨テンプレを追加</option>';
  for (const preset of SCRIPT_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    els.scriptPresetSelect.appendChild(option);
  }
}

function renderScriptRows() {
  els.scriptRows.innerHTML = '';
  if (!state.scriptRows.length) {
    state.scriptRows = [defaultScriptRow()];
  }
  let adjustedTiming = false;
  state.scriptRows.forEach((row, index) => {
    const normalized = normalizeScriptRow(row);
    if (normalized.timingAdjusted) adjustedTiming = true;
    state.scriptRows[index] = normalized;
    const div = document.createElement('div');
    div.className = 'script-row';
    div.dataset.index = String(index);
    div.innerHTML = `
      <div class="script-order">#${index + 1}</div>
      <div class="script-row-main">
        <div class="script-row-primary">
          <div class="field">
            <label>セリフ</label>
            <input data-script-field="dialogue" value="${escapeHtml(normalized.dialogue)}" placeholder="セリフなしも可">
          </div>
          <div class="field">
            <label>感情 / 抑揚</label>
            <select data-script-field="emotion">${templateOptionsHtml(EMOTION_TEMPLATES, normalized.emotion)}</select>
          </div>
        </div>
        <div class="script-row-secondary">
          <div class="field">
            <label>指定位置</label>
            <div class="time-pair">
              <select data-script-field="startSecond">${timeOptionsHtml(normalized.startSecond)}</select>
              <select data-script-field="endSecond">${timeOptionsHtml(normalized.endSecond)}</select>
            </div>
          </div>
          <div class="field">
            <label>カメラアングル</label>
            <select data-script-field="angle">${templateOptionsHtml(CAMERA_ANGLE_TEMPLATES, normalized.angle)}</select>
          </div>
          <div class="field">
            <label>カメラの動き</label>
            <select data-script-field="movement">${templateOptionsHtml(CAMERA_MOVE_TEMPLATES, normalized.movement)}</select>
          </div>
        </div>
      </div>
      <button class="btn ghost" data-action="remove-script-row" data-index="${index}" type="button" title="この行を外す">x</button>`;
    els.scriptRows.appendChild(div);
  });
  if (adjustedTiming) {
    state.scriptTimingWarning = `指定位置が動画秒数（${getVideoDurationSeconds()}秒）を超えたため、範囲内に調整しました。`;
  }
  renderScriptTimingWarning();
}

function addScriptRow(row = null) {
  state.scriptTimingWarning = '';
  state.scriptRows.push(normalizeScriptRow(row || defaultScriptRow()));
  renderScriptRows();
  buildPrompt();
}

function updateScriptRowField(target) {
  const rowElement = target.closest('.script-row');
  if (!rowElement) return;
  const index = Number(rowElement.dataset.index);
  const field = target.dataset.scriptField;
  if (!Number.isInteger(index) || !field || !state.scriptRows[index]) return;
  state.scriptRows[index][field] = field === 'startSecond' || field === 'endSecond'
    ? Number(target.value)
    : String(target.value || '').trim();
  state.scriptRows[index] = normalizeScriptRow(state.scriptRows[index]);
  state.scriptTimingWarning = '';
  renderScriptRows();
  buildPrompt();
}

function removeScriptRow(index) {
  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= state.scriptRows.length) return;
  state.scriptRows.splice(numericIndex, 1);
  if (!state.scriptRows.length) state.scriptRows.push(defaultScriptRow());
  state.scriptTimingWarning = '';
  renderScriptRows();
  buildPrompt();
}

function resolvedScriptRows() {
  return (state.scriptRows || []).map((row, index) => {
    const normalized = normalizeScriptRow(row);
    if (normalized.timingAdjusted) {
      state.scriptTimingWarning = `指定位置が動画秒数（${getVideoDurationSeconds()}秒）を超えたため、範囲内に調整しました。`;
      renderScriptTimingWarning();
    }
    const emotion = templateById(EMOTION_TEMPLATES, normalized.emotion);
    const angle = templateById(CAMERA_ANGLE_TEMPLATES, normalized.angle);
    const movement = templateById(CAMERA_MOVE_TEMPLATES, normalized.movement);
    return {
      index: index + 1,
      startSecond: normalized.startSecond,
      endSecond: normalized.endSecond,
      timeRange: `${normalized.startSecond}-${normalized.endSecond}s`,
      dialogue: normalized.dialogue,
      emotion: emotion.label,
      emotionPrompt: emotion.prompt,
      cameraAngle: angle.label,
      cameraAnglePrompt: angle.prompt,
      cameraMovement: movement.label,
      cameraMovementPrompt: movement.prompt
    };
  });
}

function renderScriptTimingWarning(message = '') {
  if (!els.scriptTimingWarning) return;
  const adjusted = (state.scriptRows || []).some((row) => row.timingAdjusted);
  const warning = message || state.scriptTimingWarning || (adjusted
    ? `指定位置が動画秒数（${getVideoDurationSeconds()}秒）を超えたため、範囲内に調整しました。`
    : '');
  els.scriptTimingWarning.textContent = warning;
  els.scriptTimingWarning.classList.toggle('hidden', !warning);
}

function getTargetLibraryPath() {
  return els.targetLibrarySelect ? els.targetLibrarySelect.value : DEFAULTS.targetLibrary;
}

function getTargetFolderId() {
  return els.targetFolderSelect ? els.targetFolderSelect.value : '';
}

function getTargetFolderPath() {
  if (!els.targetFolderSelect) return '';
  const selected = els.targetFolderSelect.options[els.targetFolderSelect.selectedIndex];
  return selected ? (selected.dataset.folderPath || '') : '';
}

function addLibraryOption(libraryPath, label) {
  if (!libraryPath) return;
  const full = path.resolve(libraryPath);
  if (!fs.existsSync(full)) return;
  if (state.libraryOptions.some((entry) => samePath(entry.path, full))) return;
  state.libraryOptions.push({
    path: full,
    label: label || path.basename(full)
  });
}

function renderLibrarySelect(preferredPath = '') {
  const preferred = preferredPath || state.settings.targetLibraryPath || DEFAULTS.targetLibrary;
  els.targetLibrarySelect.innerHTML = '';
  for (const option of state.libraryOptions) {
    const node = document.createElement('option');
    node.value = option.path;
    node.textContent = option.label;
    node.title = option.path;
    if (samePath(option.path, preferred)) node.selected = true;
    els.targetLibrarySelect.appendChild(node);
  }
  if (!els.targetLibrarySelect.value && state.libraryOptions.length) {
    els.targetLibrarySelect.selectedIndex = 0;
  }
}

function flattenEagleFolders(folders, trail = []) {
  const rows = [];
  for (const folder of folders || []) {
    const currentTrail = [...trail, folder.name];
    rows.push({
      id: folder.id,
      name: folder.name,
      path: currentTrail.join('/'),
      folder
    });
    rows.push(...flattenEagleFolders(folder.children || [], currentTrail));
  }
  return rows;
}

function renderFolderSelect(preferredId = '') {
  els.targetFolderSelect.innerHTML = '';
  const rootOption = document.createElement('option');
  rootOption.value = '';
  rootOption.textContent = '(ライブラリ直下)';
  rootOption.dataset.folderPath = '';
  els.targetFolderSelect.appendChild(rootOption);

  for (const folder of state.folderOptions) {
    const node = document.createElement('option');
    node.value = folder.id;
    node.textContent = folder.path;
    node.title = folder.path;
    node.dataset.folderPath = folder.path;
    if (folder.id === preferredId) node.selected = true;
    els.targetFolderSelect.appendChild(node);
  }
}

async function loadFolderOptionsForTarget(preferredId = '') {
  const targetLibrary = getTargetLibraryPath();
  state.folderOptions = [];
  if (!targetLibrary) {
    renderFolderSelect('');
    return;
  }

  if (window.eagle && state.activeLibraryPath && samePath(targetLibrary, state.activeLibraryPath)) {
    const folders = await eagle.folder.getAll();
    state.folderOptions = flattenEagleFolders(folders || []);
  } else {
    const metadataPath = path.join(targetLibrary, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8').replace(/^\uFEFF/, ''));
      state.folderOptions = importer && importer.flattenFolders
        ? importer.flattenFolders(metadata.folders || [])
        : flattenEagleFolders(metadata.folders || []);
    }
  }

  renderFolderSelect(preferredId || state.settings.targetFolderId || '');
  log(`登録フォルダ候補を読み込みました: ${state.folderOptions.length}件`);
}

function fileExists(filePath) {
  return fs && filePath && fs.existsSync(filePath);
}

function executableLooksConfigured(executable) {
  const value = String(executable || '').trim();
  if (!value) return false;
  if (!/[\\/]/.test(value)) return true;
  return fileExists(value);
}

function isImageRefExt(ext) {
  return IMAGE_EXTS.has(String(ext || '').toLowerCase());
}

function isVideoRefExt(ext) {
  return VIDEO_REF_EXTS.has(String(ext || '').toLowerCase());
}

function isVoiceSeedExt(ext) {
  return VOICE_SEED_EXTS.has(String(ext || '').toLowerCase());
}

function isAudioCandidateExt(ext) {
  return String(ext || '').toLowerCase() === 'wav';
}

function verifyWavHeader(filePath) {
  if (!fs || !filePath || !fs.existsSync(filePath)) return false;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buffer, 0, 12, 0);
    if (bytesRead < 12) return false;
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
  } finally {
    fs.closeSync(fd);
  }
}

function verifyWavBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
}

function isAllowedReferenceExt(ext) {
  const normalized = String(ext || '').toLowerCase();
  if (state.mode === 'image') return isImageRefExt(normalized);
  if (state.mode === 'voice') return isVoiceSeedExt(normalized);
  return isImageRefExt(normalized) || isVideoRefExt(normalized);
}

function invalidateStaging() {
  state.stagedDir = '';
  state.stagedManifest = null;
  for (const ref of state.references || []) {
    ref.stagedPath = '';
    ref.extractedFromVideo = false;
  }
  if (els.stagingStatus) els.stagingStatus.textContent = '未作成';
  if (els.stagingPath) els.stagingPath.textContent = '';
}

function setMode(mode) {
  if (!['image', 'video', 'voice'].includes(mode)) mode = 'image';
  const previousMode = state.mode;
  state.mode = mode;
  if (previousMode && previousMode !== mode) invalidateStaging();
  els.modeImage.classList.toggle('active', mode === 'image');
  els.modeVideo.classList.toggle('active', mode === 'video');
  els.modeVoice.classList.toggle('active', mode === 'voice');
  els.imageOptions.classList.toggle('hidden', mode !== 'image');
  els.videoOptions.classList.toggle('hidden', mode !== 'video');
  els.voiceOptions.classList.toggle('hidden', mode !== 'voice');
  els.resultUpscaleSetting.classList.toggle('hidden', mode !== 'video');
  if (els.usagePanel) els.usagePanel.classList.toggle('hidden', mode === 'voice');
  if (els.logPanel) els.logPanel.classList.toggle('hidden', mode === 'voice');
  if (els.grokOptimizerOptions) els.grokOptimizerOptions.classList.toggle('hidden', mode === 'voice');
  if (els.grokPromptField) els.grokPromptField.classList.toggle('hidden', mode === 'voice');
  if (els.grokUserIntentField) els.grokUserIntentField.classList.toggle('hidden', mode === 'voice');
  const refPanel = els.refCount ? els.refCount.closest('.panel') : null;
  if (refPanel) refPanel.classList.toggle('hidden', mode === 'voice');
  els.modeSpecBadge.textContent = mode === 'image' ? '画像編集' : '動画生成';
  if (mode === 'voice') els.modeSpecBadge.textContent = '音声ナレーション';
  renderModeSpec();
  renderScriptRows();
  renderRefs();
  renderCandidates();
  buildPrompt();
  updateGenerateButtonState();
  scheduleWatermarkLayout();
  if (state.initialized) persistSettings();
}

function renderModeSpec() {
  if (state.mode === 'voice') {
    els.modeSpec.textContent = 'Seed WAV、読み上げテキスト、脚色指示からIrodori-TTS VoiceDesignでナレーションWAVを生成します。v1は単発WAV生成のみで、長文分割や音声結合は行いません。';
    setChecklist([
      'Seed音声はRIFF/WAVE形式の .wav のみ対応します。',
      '読み上げテキストと脚色指示はジョブフォルダへ保存してからPowerShell wrapperへ渡します。',
      '生成結果はWAV候補として表示し、選択したEagleライブラリ/フォルダへ保存します。'
    ]);
    return;
  }
  if (state.mode === 'image') {
    els.modeSpec.textContent = 'Eagleで選択中の画像、またはドロップした画像1〜3枚を参照素材として使い、Grok Imagineの画像編集へ渡すプロンプトを作ります。';
    setChecklist([
      '参照画像は1〜3枚。画像本体は最適化エンジンへ送りません。',
      'aspect ratio、1k/2k意図、生成枚数、編集強度をプロンプトへ明記します。',
      '生成はGrok Buildで実行します。参照ファイルの一時コピーは内部で自動準備します。'
    ]);
  } else {
    els.modeSpec.textContent = '1枚目を開始フレーム、2枚目以降を参照素材として扱い、Grok Buildの動画生成へ渡すプロンプトを作ります。';
    setChecklist([
      '1枚目は開始フレームとして明記します。複数枚はキャラクター/衣装/構図の参照として扱います。',
      '480p/720p意図、秒数、アップスケール、カメラ/動き、セリフの感情と抑揚をプロンプトへ明記します。動画を参照した場合は最終フレームを抽出して続き生成の開始フレームにします。',
      'セリフは音声と口の動きとして扱い、字幕・吹き出し・画面内テキストとして描画しないように指定します。',
      'アップスケールは生成後のMP4候補に対してローカルFFmpegで実行できます。'
    ]);
  }
}

function setChecklist(items) {
  els.modeChecklist.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    els.modeChecklist.appendChild(li);
  }
}

function persistSettings() {
  state.settings = {
    mode: state.mode,
    targetLibraryPath: getTargetLibraryPath(),
    targetFolderId: getTargetFolderId(),
    downloadsPath: els.downloadsPath.value.trim(),
    grokWebUrl: els.grokWebUrl.value.trim(),
    grokCliPath: els.grokCliPath.value.trim(),
    optimizerBackend: els.optimizerBackend.value,
    imageAspect: els.imageAspect.value,
    imageResolution: els.imageResolution.value,
    editStrength: els.editStrength.value,
    imageCount: els.imageCount.value,
    videoResolution: els.videoResolution.value,
    videoDuration: els.videoDuration.value,
    videoUpscale: els.videoUpscale.value,
    voiceText: els.voiceText.value,
    voiceDirection: els.voiceDirection.value,
    voiceName: els.voiceName.value,
    voicePreset: els.voicePreset.value,
    cameraMotion: '',
    dialogueTimeline: els.dialogueTimeline.value,
    scriptRows: state.scriptRows.map((row) => {
      const normalized = normalizeScriptRow(row);
      return {
        startSecond: normalized.startSecond,
        endSecond: normalized.endSecond,
        dialogue: normalized.dialogue,
        emotion: normalized.emotion,
        angle: normalized.angle,
        movement: normalized.movement
      };
    })
  };
  saveJson(STORAGE_KEYS.settings, state.settings);
}

function loadSettings() {
  state.settings = loadJson(STORAGE_KEYS.settings, {});
  const backend = ['grok_cli', 'eagle_ai'].includes(state.settings.optimizerBackend)
    ? state.settings.optimizerBackend
    : 'grok_cli';
  els.downloadsPath.value = state.settings.downloadsPath || getDefaultDownloadsPath();
  els.grokWebUrl.value = state.settings.grokWebUrl || DEFAULTS.grokWeb;
  els.grokCliPath.value = state.settings.grokCliPath || DEFAULTS.grokCli;
  els.optimizerBackend.value = backend;
  els.imageAspect.value = state.settings.imageAspect || 'auto';
  els.imageResolution.value = state.settings.imageResolution || '1k';
  els.editStrength.value = state.settings.editStrength || 'medium';
  els.imageCount.value = state.settings.imageCount || '2';
  els.videoResolution.value = state.settings.videoResolution || '720p';
  els.videoDuration.value = state.settings.videoDuration || '6';
  els.videoUpscale.value = state.settings.videoUpscale || 'none';
  els.voiceText.value = state.settings.voiceText || '';
  els.voiceDirection.value = state.settings.voiceDirection || '';
  els.voiceName.value = state.settings.voiceName || '';
  els.voicePreset.value = ['fast', 'balanced', 'quality'].includes(state.settings.voicePreset) ? state.settings.voicePreset : 'balanced';
  els.cameraMotion.value = '';
  els.dialogueTimeline.value = state.settings.dialogueTimeline || state.settings.cameraMotion || '';
  state.scriptRows = Array.isArray(state.settings.scriptRows) && state.settings.scriptRows.length
    ? state.settings.scriptRows.map((row) => normalizeScriptRow(row))
    : [defaultScriptRow()];
  renderScriptRows();
  buildVoicePromptPreview();
  updateVoiceTextWarning();
  setMode(state.settings.mode || 'image');
  updateOptimizerModelName();
}

function loadUsage() {
  state.usage = loadJson(STORAGE_KEYS.usage, {
    imageUsed: 0,
    video480Used: 0,
    video720Used: 0,
    date: todayUsageKey(),
    events: []
  });
  normalizeUsageState();
  if (state.usage.date !== todayUsageKey()) {
    state.usage.events = state.usage.events || [];
    state.usage.events.push({
      at: new Date().toISOString(),
      type: 'daily_rollover',
      fromDate: state.usage.date || '',
      previousCounts: getUsageCounts()
    });
    state.usage.date = todayUsageKey();
    state.usage.imageUsed = 0;
    state.usage.video480Used = 0;
    state.usage.video720Used = 0;
  }
  renderUsage();
}

function normalizeUsageState() {
  const legacyUsed = Number(state.usage.used || 0);
  state.usage.imageUsed = Math.max(0, Number(state.usage.imageUsed ?? state.usage.image ?? legacyUsed));
  state.usage.video480Used = Math.max(0, Number(state.usage.video480Used ?? state.usage.video480 ?? 0));
  state.usage.video720Used = Math.max(0, Number(state.usage.video720Used ?? state.usage.video720 ?? 0));
  state.usage.events = state.usage.events || [];
}

function getUsageCounts() {
  return {
    image: Math.max(0, Number(state.usage.imageUsed || 0)),
    video480: Math.max(0, Number(state.usage.video480Used || 0)),
    video720: Math.max(0, Number(state.usage.video720Used || 0))
  };
}

function saveUsage() {
  normalizeUsageState();
  state.usage.date = todayUsageKey();
  saveJson(STORAGE_KEYS.usage, state.usage);
  renderUsage();
}

function renderUsage() {
  normalizeUsageState();
  const counts = getUsageCounts();
  els.usageDateText.textContent = state.usage.date || todayUsageKey();
  els.usageText.textContent = `画像 ${counts.image}件 / 動画480p ${counts.video480}件 / 動画720p ${counts.video720}件`;
  els.usageImageCount.textContent = `${counts.image}`;
  els.usageVideo480Count.textContent = `${counts.video480}`;
  els.usageVideo720Count.textContent = `${counts.video720}`;
  saveJson(STORAGE_KEYS.usage, {
    ...state.usage,
    date: state.usage.date || todayUsageKey(),
    imageUsed: counts.image,
    video480Used: counts.video480,
    video720Used: counts.video720
  });
}

function incrementUsageBucket(bucket, count = 1, type = 'generated') {
  const value = Math.max(1, Number(count || 1));
  normalizeUsageState();
  if (state.usage.date !== todayUsageKey()) {
    state.usage.date = todayUsageKey();
    state.usage.imageUsed = 0;
    state.usage.video480Used = 0;
    state.usage.video720Used = 0;
  }
  if (bucket === 'video480') {
    state.usage.video480Used += value;
  } else if (bucket === 'video720') {
    state.usage.video720Used += value;
  } else {
    state.usage.imageUsed += value;
  }
  state.usage.events = state.usage.events || [];
  state.usage.events.push({
    at: new Date().toISOString(),
    date: todayUsageKey(),
    type,
    bucket,
    count: value,
    counts: getUsageCounts()
  });
  saveUsage();
}

function usageBucketForMediaPath(mediaPath) {
  const ext = path.extname(mediaPath).replace(/^\./, '').toLowerCase();
  if (ext === 'mp4') {
    return els.videoResolution.value === '480p' ? 'video480' : 'video720';
  }
  if (IMAGE_EXTS.has(ext)) return 'image';
  return '';
}

function incrementUsageForMediaPaths(mediaPaths, type = 'generated') {
  const buckets = { image: 0, video480: 0, video720: 0 };
  for (const mediaPath of mediaPaths || []) {
    const bucket = usageBucketForMediaPath(mediaPath);
    if (bucket) buckets[bucket] += 1;
  }
  for (const [bucket, count] of Object.entries(buckets)) {
    if (count) incrementUsageBucket(bucket, count, type);
  }
}

function makeRefFromPath(filePath, source = 'file', item = null) {
  const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
  const stat = fs.statSync(filePath);
  let mediaInfo = {};
  try {
    mediaInfo = importer && importer.probeMedia ? importer.probeMedia(filePath, DEFAULTS.ffprobe) : {};
  } catch (_) {
    mediaInfo = {};
  }
  return {
    id: item && item.id ? item.id : `${source}:${filePath}`,
    source,
    filePath,
    stagedPath: '',
    name: item && item.name ? item.name : path.basename(filePath, path.extname(filePath)),
    ext,
    size: stat.size,
    tags: Array.isArray(item && item.tags) ? item.tags : [],
    width: (item && item.width) || mediaInfo.width || 0,
    height: (item && item.height) || mediaInfo.height || 0
  };
}

function addRefs(refs) {
  const existing = new Set(state.references.map((ref) => normalizePath(ref.filePath)));
  let added = false;
  for (const ref of refs) {
    if (!existing.has(normalizePath(ref.filePath))) {
      state.references.push(ref);
      existing.add(normalizePath(ref.filePath));
      added = true;
    }
  }
  if (added) invalidateStaging();
  renderRefs();
  buildPrompt();
}

function validateReferenceLimit() {
  const message = getReferenceValidationMessage();
  if (message) throw new Error(message);
}

function getReferenceValidationMessage() {
  if (state.references.length < 1) {
    return state.mode === 'video'
      ? '参照画像から動画生成モードは、開始フレーム画像または続き生成用動画が1件以上必要です。'
      : '参照画像編集モードは、参照画像が1件以上必要です。';
  }
  if (state.mode === 'image') {
    if (state.references.length > 3) return '参照画像編集モードの参照画像は1〜3件にしてください。';
    if (state.references.some((ref) => !isImageRefExt(ref.ext))) {
      return '参照画像編集モードでは動画参照は使えません。画像だけを追加してください。';
    }
  }
  if (state.mode === 'video' && state.references.some((ref) => !isAllowedReferenceExt(ref.ext))) {
    return '参照画像から動画生成モードでは、画像または mp4/mov/webm/m4v 動画を参照できます。';
  }
  return '';
}

function renderRefs() {
  els.refCount.textContent = `${state.references.length}件`;
  els.refs.innerHTML = '';
  const limitText = state.mode === 'image' ? '参照画像 1〜3件' : '参照画像または動画 1件以上';
  els.refHint.textContent = state.mode === 'video'
    ? `現在のモードでは ${limitText} を使います。追加順の @1, @2 を生成意図に書いて参照できます。動画参照は最終フレームを抽出して続き生成に使います。`
    : `現在のモードでは ${limitText} を使います。追加順の @1, @2 を生成意図に書いて参照できます。`;

  state.references.forEach((ref, index) => {
    const div = document.createElement('div');
    div.className = 'ref-item';
    const refMarker = `@${index + 1}`;
    const role = state.mode === 'video' && index === 0
      ? (isVideoRefExt(ref.ext) ? '続き生成元動画' : '開始フレーム')
      : `参照 ${index + 1}`;
    const dims = ref.width && ref.height ? `${ref.width}x${ref.height}` : 'dimensions unknown';
    const preview = isVideoRefExt(ref.ext)
      ? `<video src="${escapeHtml(fileUrl(ref.filePath))}" muted></video>`
      : `<img src="${escapeHtml(fileUrl(ref.filePath))}" alt="">`;
    div.innerHTML = `
      <div class="ref-preview">
        ${preview}
        <button class="ref-badge" data-action="insert-ref-token" data-index="${index}" type="button" title="${escapeHtml(refMarker)}を入力">${escapeHtml(refMarker)}</button>
      </div>
      <div class="ref-name" title="${escapeHtml(ref.filePath)}">${escapeHtml(role)}: ${escapeHtml(ref.name)}</div>
      <div class="meta">${escapeHtml(ref.ext.toUpperCase())} / ${escapeHtml(dims)}</div>
      <div class="meta">${escapeHtml((ref.tags || []).slice(0, 6).join(', ') || 'tagsなし')}</div>
      <div class="row" style="margin-top:8px">
        <button class="btn ghost" data-action="remove-ref" data-index="${index}" type="button">外す</button>
      </div>`;
    els.refs.appendChild(div);
  });
  els.stageBtn.disabled = state.references.length === 0;
  updateGenerateButtonState();
}

function updateGenerateButtonState() {
  if (!els.runGrokBuildBtn) return;
  const validationMessage = state.mode === 'voice' ? getVoiceValidationMessage() : getReferenceValidationMessage();
  els.runGrokBuildBtn.textContent = state.mode === 'video' ? '動画を生成' : '画像を生成';
  if (state.mode === 'voice') els.runGrokBuildBtn.textContent = '音声を生成';
  els.runGrokBuildBtn.disabled = Boolean(validationMessage) || state.isGenerating;
  els.runGrokBuildBtn.title = validationMessage || '';
  els.retryVideoBtn.classList.toggle('hidden', state.mode !== 'video');
  els.retryVideoBtn.disabled = state.mode !== 'video' || Boolean(validationMessage) || state.isGenerating;
  els.retryVideoBtn.title = state.mode === 'video' ? (validationMessage || '同じ参照素材・設定・プロンプトで動画を再生成します') : '';
  updateVoiceInputLock();
}

function updateVoiceInputLock() {
  if (!els.voiceOptions) return;
  const locked = state.isGenerating;
  [
    els.chooseSeedAudioBtn,
    els.clearSeedAudioBtn,
    els.saveSeedVoiceProfileBtn,
    els.refreshVoiceProfilesBtn,
    els.voiceSeedInput,
    els.voiceProfileSelect,
    els.voiceName,
    els.voiceText,
    els.voiceDirection,
    els.voicePreset
  ].filter(Boolean).forEach((element) => {
    element.disabled = locked;
  });
  if (els.voiceSeedDropZone) {
    els.voiceSeedDropZone.classList.toggle('disabled', locked);
    els.voiceSeedDropZone.style.pointerEvents = locked ? 'none' : '';
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadEagleSelection(options = {}) {
  const silent = Boolean(options.silent);
  if (!window.eagle || !eagle.item) {
    throw new Error('Eagle APIが見つかりません。Eagle内で起動してください。');
  }
  const items = await eagle.item.getSelected();
  const refs = [];
  let skipped = 0;
  for (const item of items || []) {
    const filePath = item.filePath || item.path;
    const ext = path.extname(filePath || '').replace(/^\./, '').toLowerCase();
    if (!filePath || !fileExists(filePath) || !isAllowedReferenceExt(ext)) {
      skipped += 1;
      continue;
    }
    refs.push(makeRefFromPath(filePath, 'eagle', item));
  }
  addRefs(refs);
  if (!silent || refs.length || skipped) {
    log(`Eagle選択から画像 ${refs.length}件を追加しました${skipped ? `、非画像/不明 ${skipped}件を除外` : ''}。`);
  }
}

async function autoLoadInitialSelection() {
  if (!window.eagle || !eagle.item) return;
  try {
    await loadEagleSelection({ silent: true });
  } catch (error) {
    log(`Eagle選択の自動取得をスキップしました: ${error.message}`, 'warn');
  }
}

async function addFilesViaDialog() {
  if (window.eagle && eagle.dialog && eagle.dialog.showOpenDialog) {
    const result = await eagle.dialog.showOpenDialog({
      title: '参照画像を選択',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: state.mode === 'video' ? 'Images and Videos' : 'Images', extensions: state.mode === 'video' ? ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'mp4', 'mov', 'webm', 'm4v'] : ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'] }
      ]
    });
    const filePaths = result && result.filePaths ? result.filePaths : [];
    addFilePaths(filePaths);
  } else {
    els.fileInput.click();
  }
}

function addFilePaths(filePaths) {
  const refs = [];
  let skipped = 0;
  for (const filePath of filePaths || []) {
    const ext = path.extname(filePath || '').replace(/^\./, '').toLowerCase();
    if (!fileExists(filePath) || !isAllowedReferenceExt(ext)) {
      skipped += 1;
      continue;
    }
    refs.push(makeRefFromPath(filePath, 'file'));
  }
  addRefs(refs);
  log(`追加ファイルから画像 ${refs.length}件を追加しました${skipped ? `、${skipped}件を除外` : ''}。`);
}

function decodeDroppedPath(value) {
  const text = String(value || '').trim();
  if (!text || text.startsWith('#')) return '';
  if (text.startsWith('file:///')) {
    const withoutScheme = text.replace(/^file:\/+/, '');
    const decoded = decodeURIComponent(withoutScheme);
    return decoded.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\');
  }
  return text;
}

function extractDroppedPaths(dataTransfer) {
  const paths = [];
  for (const file of Array.from(dataTransfer.files || [])) {
    if (file.path) paths.push(file.path);
  }
  if (!paths.length) {
    const raw = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain') || '';
    for (const line of raw.split(/\r?\n/)) {
      const decoded = decodeDroppedPath(line);
      if (decoded) paths.push(decoded);
    }
  }
  return paths;
}

function fileUrl(filePath) {
  if (!filePath) return '';
  return encodeURI(`file:///${filePath.replace(/\\/g, '/').replace(/^\/?([A-Za-z]:)/, '$1')}`);
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const value = textarea.value;
  textarea.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  const next = start + text.length;
  textarea.focus();
  textarea.setSelectionRange(next, next);
  buildPrompt();
}

function removeReferenceAt(index) {
  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= state.references.length) {
    log(`参照画像の削除indexが不正です: ${index}`, 'warn');
    return;
  }
  const [removed] = state.references.splice(numericIndex, 1);
  invalidateStaging();
  renderRefs();
  buildPrompt();
  log(`参照画像を外しました: @${numericIndex + 1} ${removed ? removed.name : ''}`);
}

function createStagingDir() {
  if (!fs || !os || !path) throw new Error('Node.js APIが使えないため参照ファイルの内部準備ができません。');
  const stamp = importer && importer.timestampForPath ? importer.timestampForPath() : todayFolderName() + '_' + Date.now();
  const dir = path.join(os.tmpdir(), PLUGIN_ID, `job-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createVoiceJobDir() {
  if (!fs || !os || !path) throw new Error('Node.js APIが使えないため、音声ジョブを作成できません。');
  const stamp = importer && importer.timestampForPath ? importer.timestampForPath() : todayFolderName() + '_' + Date.now();
  const voiceStamp = String(stamp).replace('_', '-');
  const dir = path.join(os.tmpdir(), PLUGIN_ID, `voice-read-job-${voiceStamp}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureVoiceJobDir() {
  if (state.voiceJobDir && fs.existsSync(state.voiceJobDir)) return state.voiceJobDir;
  state.voiceJobDir = createVoiceJobDir();
  return state.voiceJobDir;
}

function pluginRootPath() {
  if (!path || !window.location) return '';
  if (window.location.protocol === 'file:') {
    const decoded = decodeURIComponent(window.location.pathname || '')
      .replace(/^\/([A-Za-z]:)/, '$1')
      .replace(/\//g, '\\');
    return path.dirname(decoded);
  }
  return path.resolve('.');
}

function voiceWrapperScriptPath() {
  const root = pluginRootPath();
  return root ? path.join(root, ...VOICE_WRAPPER_RELATIVE_PATH) : '';
}

function safeFileNamePart(value, fallback = 'voice') {
  const fallbackName = String(fallback || 'voice');
  let cleaned = String(value || fallbackName)
    .replace(INVALID_FILENAME_CHARS_RE, '_')
    .replace(/\s+/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 60);
  cleaned = cleaned.replace(/[. ]+$/g, '');
  if (!cleaned || !cleaned.replace(/[_-]/g, '')) cleaned = fallbackName;
  const reservedStem = cleaned.split('.')[0];
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(reservedStem)) cleaned = `voice-${cleaned}`;
  return cleaned || 'voice';
}

function voiceJobStamp(jobDir) {
  return String(path.basename(jobDir || '') || '')
    .replace(/^voice-read-job-/, '')
    .replace(/[^0-9A-Za-z_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function defaultVoiceName(jobDir) {
  return `narration-${voiceJobStamp(jobDir) || todayFolderName()}`;
}

function voiceOutputBaseName(jobDir) {
  return safeFileNamePart(els.voiceName.value.trim(), defaultVoiceName(jobDir));
}

function voiceProfileDir() {
  if (!fs || !path || !os) throw new Error('Node.js API is required for voice presets.');
  const env = typeof process !== 'undefined' && process.env ? process.env : {};
  const baseDir = env.APPDATA
    ? path.join(env.APPDATA, 'Eagle', 'Plugins', PLUGIN_ID)
    : path.join(os.homedir(), '.eagle-grok-imagine-studio');
  const dir = path.join(baseDir, 'voice-presets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadVoiceProfiles() {
  const profiles = loadJson(STORAGE_KEYS.voiceProfiles, []);
  state.voiceProfiles = Array.isArray(profiles)
    ? profiles.filter((profile) => profile && profile.id && profile.filePath && fileExists(profile.filePath))
    : [];
  renderVoiceProfiles();
}

function persistVoiceProfiles() {
  saveJson(STORAGE_KEYS.voiceProfiles, state.voiceProfiles);
  renderVoiceProfiles();
}

function renderVoiceProfiles() {
  if (!els.voiceProfileSelect) return;
  els.voiceProfileSelect.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = state.voiceProfiles.length ? 'ボイスプリセットを選択' : '保存済みプリセットなし';
  els.voiceProfileSelect.appendChild(empty);
  state.voiceProfiles.forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.label || path.basename(profile.filePath);
    option.title = profile.filePath;
    els.voiceProfileSelect.appendChild(option);
  });
}

function createVoiceProfileFromWav(sourcePath, options = {}) {
  validateVoiceSeedPath(sourcePath);
  const dir = voiceProfileDir();
  const label = String(options.label || path.basename(sourcePath, path.extname(sourcePath)) || 'voice').trim();
  const stamp = importer && importer.timestampForPath ? importer.timestampForPath() : todayFolderName() + '_' + Date.now();
  const id = `${String(stamp).replace(/[^0-9A-Za-z_-]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
  const profilePath = path.join(dir, `${safeFileNamePart(label)}-${id}.wav`);
  fs.copyFileSync(sourcePath, profilePath);
  const profile = {
    id,
    label,
    filePath: profilePath,
    sourcePath,
    createdAt: new Date().toISOString(),
    sourceKind: options.sourceKind || 'seed',
    voicePrompt: options.voicePrompt || '',
    voicePreset: options.voicePreset || ''
  };
  state.voiceProfiles = [profile].concat(state.voiceProfiles.filter((entry) => entry.id !== id)).slice(0, 80);
  persistVoiceProfiles();
  log(`ボイスプリセットを保存しました: ${label}`);
  return profile;
}

function saveCurrentSeedVoiceProfile() {
  if (!state.voiceSeedPath || !fileExists(state.voiceSeedPath)) throw new Error('保存するSeed WAVを選択してください。');
  const defaultName = state.voiceSeedOriginalPath
    ? path.basename(state.voiceSeedOriginalPath, path.extname(state.voiceSeedOriginalPath))
    : 'voice-seed';
  const label = window.prompt('ボイスプリセット名', defaultName);
  if (label === null) return null;
  return createVoiceProfileFromWav(state.voiceSeedPath, {
    label: label.trim() || defaultName,
    sourceKind: 'seed'
  });
}

function saveCandidateVoiceProfile(candidate) {
  if (!candidate || candidateMediaMode(candidate) !== 'audio') throw new Error('音声候補だけをボイスプリセット化できます。');
  const defaultName = candidate.voiceName || candidate.name || 'generated-voice';
  const label = window.prompt('ボイスプリセット名', defaultName);
  if (label === null) return null;
  return createVoiceProfileFromWav(candidate.filePath, {
    label: label.trim() || defaultName,
    sourceKind: 'generated',
    voicePrompt: candidate.voicePrompt || '',
    voicePreset: candidate.voicePreset || ''
  });
}

function applyVoiceProfile(profileId) {
  const profile = state.voiceProfiles.find((entry) => entry.id === profileId);
  if (!profile) return;
  setVoiceSeedFromPath(profile.filePath);
  state.voiceSeedOriginalPath = profile.filePath;
  els.voiceSeedStatus.textContent = `プリセット選択済み: ${profile.label} -> ${state.voiceSeedPath}`;
  log(`ボイスプリセットをSeedとして選択しました: ${profile.label}`);
}

function writeJsonPretty(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function textTail(text, maxLength = 4000) {
  const value = String(text || '');
  return value.length > maxLength ? value.slice(value.length - maxLength) : value;
}

async function extractLastFrameFromVideo(videoPath, outputPath) {
  if (!fileExists(DEFAULTS.ffmpeg)) throw new Error(`FFmpegが見つかりません: ${DEFAULTS.ffmpeg}`);
  await runProcess(DEFAULTS.ffmpeg, [
    '-y',
    '-sseof', '-0.1',
    '-i', videoPath,
    '-frames:v', '1',
    outputPath
  ], {
    timeoutMs: 60000
  });
  if (!fileExists(outputPath)) throw new Error(`動画の最終フレーム抽出に失敗しました: ${videoPath}`);
}

async function stageReferences() {
  validateReferenceLimit();
  const dir = createStagingDir();
  const stagedSources = [];
  for (const [index, ref] of state.references.entries()) {
    const ext = path.extname(ref.filePath).toLowerCase();
    const isVideoReference = state.mode === 'video' && isVideoRefExt(ref.ext);
    const safeExt = isVideoReference ? '.png' : ext;
    const suffix = isVideoReference ? '-last-frame' : '';
    const safeName = `${String(index + 1).padStart(2, '0')}-${ref.name.replace(INVALID_FILENAME_CHARS_RE, '_')}${suffix}${safeExt}`;
    const stagedPath = path.join(dir, safeName);
    if (isVideoReference) {
      await extractLastFrameFromVideo(ref.filePath, stagedPath);
      ref.extractedFromVideo = true;
    } else {
      fs.copyFileSync(ref.filePath, stagedPath);
      ref.extractedFromVideo = false;
    }
    ref.stagedPath = stagedPath;
    stagedSources.push({
      index: index + 1,
      role: state.mode === 'video' && index === 0
        ? (isVideoReference ? 'continuation last frame' : 'start frame')
        : (isVideoReference ? 'video last frame reference' : 'reference'),
      fileName: path.basename(stagedPath),
      originalName: ref.name,
      originalPath: ref.filePath,
      originalExt: ref.ext,
      extractedFromVideo: isVideoReference,
      tags: ref.tags || [],
      width: ref.width || 0,
      height: ref.height || 0
    });
  }

  state.stagedDir = dir;
  state.stagedManifest = {
    plugin: PLUGIN_ID,
    mode: state.mode,
    createdAt: new Date().toISOString(),
    sources: stagedSources
  };
  fs.writeFileSync(path.join(dir, 'reference-manifest.json'), JSON.stringify(state.stagedManifest, null, 2), 'utf8');
  els.stagingStatus.textContent = '作成済み';
  els.stagingPath.textContent = dir;
  renderRefs();
  buildPrompt();
  log(`参照ファイルの内部準備を作成しました: ${dir}`);
  return dir;
}

function clearVoiceSeed() {
  if (state.isGenerating) throw new Error('音声生成中はSeed音声を変更できません。');
  state.voiceSeedPath = '';
  state.voiceSeedOriginalPath = '';
  state.voiceJobDir = '';
  state.voiceLastResult = null;
  if (els.voiceSeedStatus) els.voiceSeedStatus.textContent = '未選択。v1は .wav のみ対応します。';
  updateGenerateButtonState();
}

function validateVoiceSeedPath(filePath) {
  const ext = path.extname(filePath || '').replace(/^\./, '').toLowerCase();
  if (!isVoiceSeedExt(ext)) throw new Error('Seed音声はv1では .wav のみ対応します。');
  if (!fileExists(filePath)) throw new Error(`Seed音声が見つかりません: ${filePath}`);
  if (!verifyWavHeader(filePath)) throw new Error(`Seed音声はRIFF/WAVE形式の .wav ではありません: ${filePath}`);
}

function setVoiceSeedFromPath(filePath) {
  if (state.isGenerating) throw new Error('音声生成中はSeed音声を変更できません。');
  validateVoiceSeedPath(filePath);
  const jobDir = ensureVoiceJobDir();
  const seedPath = path.join(jobDir, 'seed.wav');
  fs.copyFileSync(filePath, seedPath);
  state.voiceSeedPath = seedPath;
  state.voiceSeedOriginalPath = filePath;
  els.voiceSeedStatus.textContent = `選択済み: ${path.basename(filePath)} -> ${seedPath}`;
  updateGenerateButtonState();
  log(`Seed音声を準備しました: ${seedPath}`);
  return seedPath;
}

async function setVoiceSeedFromFile(file) {
  if (state.isGenerating) throw new Error('音声生成中はSeed音声を変更できません。');
  const ext = path.extname(file && file.name ? file.name : '').replace(/^\./, '').toLowerCase();
  if (!isVoiceSeedExt(ext)) throw new Error('Seed音声はv1では .wav のみ対応します。');
  if (file.path) return setVoiceSeedFromPath(file.path);
  if (!file.arrayBuffer) throw new Error('Seed音声の絶対パスまたは読み取り可能なFileが取得できませんでした。');
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!verifyWavBuffer(buffer)) throw new Error('Seed音声はRIFF/WAVE形式の .wav ではありません。');
  const jobDir = ensureVoiceJobDir();
  const seedPath = path.join(jobDir, 'seed.wav');
  fs.writeFileSync(seedPath, buffer);
  state.voiceSeedPath = seedPath;
  state.voiceSeedOriginalPath = file.name || seedPath;
  els.voiceSeedStatus.textContent = `選択済み: ${file.name || 'seed.wav'} -> ${seedPath}`;
  updateGenerateButtonState();
  log(`Seed音声をジョブフォルダへコピーしました: ${seedPath}`);
  return seedPath;
}

async function chooseVoiceSeedAudio() {
  if (window.eagle && eagle.dialog && eagle.dialog.showOpenDialog) {
    const result = await eagle.dialog.showOpenDialog({
      title: 'Seed WAVを選択',
      properties: ['openFile'],
      filters: [{ name: 'WAV', extensions: ['wav'] }]
    });
    const selected = result && result.filePaths && result.filePaths[0];
    if (selected) setVoiceSeedFromPath(selected);
    return;
  }
  els.voiceSeedInput.click();
}

async function setVoiceSeedFromDrop(dataTransfer) {
  if (state.isGenerating) throw new Error('音声生成中はSeed音声を変更できません。');
  const paths = extractDroppedPaths(dataTransfer || {});
  if (paths.length) {
    setVoiceSeedFromPath(paths[0]);
    return;
  }
  const files = Array.from((dataTransfer && dataTransfer.files) || []);
  if (files.length) {
    await setVoiceSeedFromFile(files[0]);
    return;
  }
  throw new Error('Seed音声のパスを取得できませんでした。');
}

function setVoicePreviewStatus(message, tone = 'info') {
  if (!els.voicePromptPreviewStatus) return;
  els.voicePromptPreviewStatus.textContent = message;
  els.voicePromptPreviewStatus.style.borderColor = tone === 'warn' ? 'rgba(238, 117, 108, 0.45)' : 'var(--line)';
  els.voicePromptPreviewStatus.style.color = tone === 'warn' ? '#ffd1cd' : 'var(--info)';
}

function buildVoicePromptPreview(options = {}) {
  const updateStatus = options.updateStatus !== false && !state.isGenerating;
  const updatePreview = options.updatePreview !== false;
  const direction = els.voiceDirection.value.trim();
  const text = els.voiceText ? els.voiceText.value.trim() : '';
  const cues = [];
  if (direction) cues.push(`演技指示: ${direction}`);
  cues.push('参照音声の声質、距離感、話者らしさを保つ。');
  cues.push('自然な日本語ナレーションとして、聞き取りやすく、過度に誇張しない。');
  if (/["“”「」『』]/.test(text)) {
    cues.push('セリフ部分は字幕ではなく、声の演技とイントネーションで表現する。');
  }
  cues.push('感情、間、語尾、強弱、息づかいを脚色指示に合わせて整える。');
  const caption = direction ? cues.join(' ') : '';
  if (updatePreview) els.voicePromptPreview.value = caption;
  if (updateStatus) {
    setVoicePreviewStatus(
      caption
        ? '仮プレビューです。生成ボタンを押すとGrok CLIで最適化します。'
        : '脚色指示を入力すると仮プレビューを表示します。'
    );
  }
  if (state.initialized) persistSettings();
  return caption;
}

function cleanVoiceCaption(text) {
  return String(text || '')
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^["'「『]|["'」』]$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

function buildVoiceCaptionOptimizationPrompt(payload) {
  return [
    'You are an Irodori-TTS VoiceDesign caption optimizer for an Eagle plugin.',
    'Create one Japanese caption for local TTS inference.',
    '',
    'Goal:',
    '- Convert the target text and acting direction into a concise caption for --caption.',
    '- The caption controls delivery, emotion, intonation, distance, rhythm, pauses, and voice texture.',
    '- Preserve the reference voice identity and speaker likeness. Do not claim it is an official or real-person voice.',
    '',
    'Rules:',
    '- Return only the final Japanese caption text.',
    '- Do not include markdown, labels, JSON, quotes, explanations, or alternatives.',
    '- Do not restate the whole target text.',
    '- Do not ask questions.',
    '- Keep it 1-2 sentences.',
    '- Prefer restrained, natural acting over exaggerated acting.',
    '- If the acting direction is vague, make a conservative assumption and encode it directly in the caption.',
    '- If the text contains dialogue, treat it as spoken performance, not subtitles.',
    '- Avoid impossible guarantees and real-person impersonation claims.',
    '',
    'Useful caption dimensions:',
    '- emotional state',
    '- intonation and prosody',
    '- speaking speed',
    '- pauses and breath',
    '- distance from microphone/listener',
    '- strength of delivery',
    '- speaker similarity to the reference audio',
    '',
    'Payload:',
    JSON.stringify(payload, null, 2)
  ].join('\n');
}

async function optimizeVoiceCaptionWithGrok(jobDir, paths, text, direction, deterministicCaption) {
  const exe = els.grokCliPath.value.trim() || DEFAULTS.grokCli;
  if (!executableLooksConfigured(exe)) {
    setVoicePreviewStatus('Grok CLIが見つからないため、仮プレビューをIrodori-TTSへ渡します。', 'warn');
    return {
      caption: deterministicCaption,
      status: 'fallback',
      backend: 'deterministic',
      error: `Grok CLI not found: ${exe}`,
      stdout_tail: '',
      stderr_tail: ''
    };
  }

  const optimizerPrompt = buildVoiceCaptionOptimizationPrompt({
    target_text: text,
    acting_direction: direction,
    deterministic_caption: deterministicCaption,
    seed_audio_original_path: state.voiceSeedOriginalPath || '',
    preset: els.voicePreset.value || 'balanced'
  });
  fs.writeFileSync(paths.optimizerPrompt, optimizerPrompt, 'utf8');
  try {
    setVoicePreviewStatus('Grok CLIで読み上げ指示を最適化中です。入力欄はこの生成が終わるまで固定されます。');
    log('Grok CLIで読み上げ指示を裏最適化します。');
    const result = await runProcess(exe, [
      '--cwd', jobDir,
      '-m', 'grok-composer-2.5-fast',
      '--disable-web-search',
      '--no-plan',
      '--no-subagents',
      '--max-turns', '4',
      '--output-format', 'plain',
      '--prompt-file', paths.optimizerPrompt
    ], {
      cwd: jobDir,
      timeoutMs: 3 * 60 * 1000
    });
    const optimized = cleanVoiceCaption(extractOptimizerText(result.stdout));
    if (!optimized) throw new Error('Grok CLI returned no voice caption text.');
    els.voicePromptPreview.value = optimized;
    setVoicePreviewStatus('Grok CLIで最適化済みです。この最終指示をIrodori-TTSへ渡します。');
    log('Grok CLIで読み上げ指示を最適化しました。');
    return {
      caption: optimized,
      status: 'success',
      backend: 'grok-composer-2.5-fast',
      error: '',
      stdout_tail: textTail(result.stdout),
      stderr_tail: textTail(result.stderr)
    };
  } catch (error) {
    els.voicePromptPreview.value = deterministicCaption;
    setVoicePreviewStatus('Grok CLI最適化に失敗しました。仮プレビューをIrodori-TTSへ渡します。', 'warn');
    log(`Grok CLI読み上げ指示最適化に失敗。deterministic指示へ戻します: ${error.message}`, 'warn');
    return {
      caption: deterministicCaption,
      status: 'fallback',
      backend: 'deterministic',
      error: error.message,
      stdout_tail: textTail(error.stdout),
      stderr_tail: textTail(error.stderr)
    };
  }
}

function updateVoiceTextWarning() {
  const length = els.voiceText.value.trim().length;
  if (length > VOICE_LONG_TEXT_WARNING_CHARS) {
    els.voiceTextWarning.textContent = `v1は長文分割・結合をしません。現在 ${length} 文字です。短い単位での生成を推奨します。`;
    els.voiceTextWarning.classList.remove('hidden');
  } else {
    els.voiceTextWarning.textContent = '';
    els.voiceTextWarning.classList.add('hidden');
  }
}

function getVoiceValidationMessage() {
  if (!state.voiceSeedPath || !fileExists(state.voiceSeedPath)) return 'Seed WAVを選択してください。';
  if (!verifyWavHeader(state.voiceSeedPath)) return 'Seed音声はRIFF/WAVE形式の .wav ではありません。';
  if (!els.voiceText.value.trim()) return '読み上げテキストを入力してください。';
  if (!els.voiceDirection.value.trim()) return '脚色指示を入力してください。';
  if (!buildVoicePromptPreview({ updateStatus: false, updatePreview: false }).trim()) return '読み上げ指示プレビューを作成できません。';
  return '';
}

function voiceJobPaths(jobDir, outputBaseName = '') {
  const baseName = safeFileNamePart(outputBaseName, defaultVoiceName(jobDir));
  return {
    seed: path.join(jobDir, 'seed.wav'),
    text: path.join(jobDir, 'input_text.txt'),
    direction: path.join(jobDir, 'acting_direction.txt'),
    caption: path.join(jobDir, 'voice_prompt_preview.txt'),
    optimizerPrompt: path.join(jobDir, 'voice_caption_optimizer_prompt.txt'),
    request: path.join(jobDir, 'job_request.json'),
    result: path.join(jobDir, 'job_result.json'),
    output: path.join(jobDir, `${baseName}.wav`),
    outputBaseName: baseName
  };
}

function referenceSummaryForPrompt() {
  return state.references.map((ref, index) => {
    const fileName = path.basename(ref.stagedPath || ref.filePath);
    const role = state.mode === 'video' && index === 0
      ? (ref.extractedFromVideo ? 'continuation start frame extracted from video last frame' : 'start frame')
      : (ref.extractedFromVideo ? `reference ${index + 1} extracted from video last frame` : `reference ${index + 1}`);
    const dims = ref.width && ref.height ? `${ref.width}x${ref.height}` : 'unknown size';
    const tags = (ref.tags || []).slice(0, 12).join(', ') || 'none';
    const source = ref.extractedFromVideo ? `; source video: ${path.basename(ref.filePath)}` : '';
    return `- @${index + 1} ${role}: ${fileName}; ${dims}; tags: ${tags}${source}`;
  }).join('\n');
}

function videoDialogueTimelineForPrompt() {
  const manualTimeline = els.dialogueTimeline.value.trim();
  const duration = els.videoDuration.value || '6';
  const structuredRows = resolvedScriptRows();
  const structuredText = structuredRows.map((row) => [
    `- Beat ${row.index} (${row.timeRange})`,
    row.dialogue ? `spoken line: "${row.dialogue}"` : 'spoken line: none; use silent acting, facial expression, and body motion',
    `emotion/prosody: ${row.emotionPrompt}`,
    `camera angle: ${row.cameraAnglePrompt}`,
    `camera movement: ${row.cameraMovementPrompt}`
  ].join('; ')).join('\n');

  return [
    `Duration target: ${duration}s. Keep every beat inside the requested second range.`,
    'Treat dialogue as audible character speech with matching lip movement, facial expression, emotion, and prosody.',
    'Do not render the dialogue as subtitles, captions, speech bubbles, written text, floating words, labels, or UI overlays.',
    'Integrate the camera movement and character motion with each timed line.',
    structuredText ? `Structured script/directing beats:\n${structuredText}` : 'Structured script/directing beats: none.',
    manualTimeline ? `Additional manual script/camera notes:\n${manualTimeline}` : ''
  ].filter(Boolean).join('\n');
}

function buildPrompt() {
  const intent = els.userIntent.value.trim();
  const references = referenceSummaryForPrompt() || '- No reference image staged yet.';
  let prompt = '';

  if (state.mode === 'voice') {
    updateVoiceTextWarning();
    prompt = buildVoicePromptPreview({ updateStatus: false, updatePreview: false });
  } else if (state.mode === 'image') {
    prompt = [
      'Task: Edit the uploaded reference image(s) in Grok Imagine.',
      'Preserve the important identity, style anchors, composition cues, and recognizable details from the reference image(s).',
      `References:\n${references}`,
      `User intent: ${intent || '(user will edit this intent)'}`,
      `Image options: aspect ratio=${els.imageAspect.value}, resolution intent=${els.imageResolution.value}, variations=${els.imageCount.value}, change intensity guidance=${els.editStrength.value}.`,
      'Output guidance: make the result coherent, high-detail, cleanly lit, and avoid accidental extra limbs, text artifacts, distorted hands, or mismatched clothing details.',
      'Do not describe file names in the final image; use the uploaded files only as visual references.'
    ].join('\n\n');
  } else {
    prompt = [
      'Task: Generate a video in Grok Imagine using the uploaded reference frame(s).',
      'Use reference 1 as the start frame. If reference 1 was extracted from a video last frame, continue naturally from that last frame for later local concatenation.',
      'Use any additional references for identity, outfit, style, and environment consistency.',
      `References:\n${references}`,
      `User intent: ${intent || '(user will edit this intent)'}`,
      `Video options: resolution intent=${els.videoResolution.value}, duration=${els.videoDuration.value}s, local upscale plan=${els.videoUpscale.value}.`,
      `Dialogue and camera timeline:\n${videoDialogueTimelineForPrompt()}`,
      'Output guidance: keep temporal consistency, avoid flicker, preserve character identity, keep hands and face stable, and maintain a clear subject silhouette.'
    ].join('\n\n');
  }

  els.finalPrompt.value = prompt;
  if (state.initialized && !state.isOptimizing) {
    els.optimizerStatus.textContent = '未最適化';
  }
  if (state.initialized) persistSettings();
  return prompt;
}

function buildOptimizerPayload(rawPrompt) {
  return {
    mode: state.mode,
    userIntent: els.userIntent.value.trim(),
    options: {
      image: {
        aspect: els.imageAspect.value,
        resolution: els.imageResolution.value,
        count: els.imageCount.value,
        editStrength: els.editStrength.value
      },
      video: {
        resolution: els.videoResolution.value,
        duration: els.videoDuration.value,
        upscale: els.videoUpscale.value,
        manualScriptNotes: els.dialogueTimeline.value.trim(),
        cameraMotion: '',
        dialogueTimeline: els.dialogueTimeline.value.trim(),
        scriptRows: resolvedScriptRows()
      }
    },
    references: state.references.map((ref, index) => ({
      index: index + 1,
      refMarker: `@${index + 1}`,
      role: state.mode === 'video' && index === 0
        ? (ref.extractedFromVideo ? 'continuation start frame extracted from video last frame' : 'start frame')
        : (ref.extractedFromVideo ? 'video last frame reference' : 'reference'),
      fileName: path.basename(ref.stagedPath || ref.filePath),
      originalFileName: path.basename(ref.filePath),
      extractedFromVideo: Boolean(ref.extractedFromVideo),
      tags: ref.tags || [],
      width: ref.width || 0,
      height: ref.height || 0,
      ext: ref.ext
    })),
    rawPrompt
  };
}

function localOptimize(rawPrompt) {
  const payload = buildOptimizerPayload(rawPrompt);
  const intent = payload.userIntent || 'Apply the requested transformation while preserving the reference identity.';
  if (payload.mode === 'image') {
    return [
      'Grok Imagine image edit prompt:',
      intent,
      '',
      'Preserve: subject identity, face shape, outfit anchors, color palette, and composition cues from the uploaded reference image(s).',
      `Settings to choose in Web UI: aspect ratio ${payload.options.image.aspect}; ${payload.options.image.resolution}; ${payload.options.image.count} variations; change intensity guidance ${payload.options.image.editStrength}.`,
      'Quality notes: coherent anatomy, clean hands, stable lighting, no garbled text, no extra body parts, no unwanted style drift.',
      '',
      'Reference notes:',
      payload.references.map((ref) => `- ${ref.role}: ${ref.fileName}; ${ref.width || '?'}x${ref.height || '?'}; tags: ${(ref.tags || []).slice(0, 10).join(', ') || 'none'}`).join('\n')
    ].join('\n');
  }

  return [
    'Grok Imagine reference-to-video prompt:',
    intent,
    '',
    'Use uploaded reference 1 as the start frame. If reference 1 is extracted from a video last frame, continue naturally from that frame for later local concatenation. Keep identity, face, outfit, and environment consistent through the full clip.',
    `Settings to choose in Web UI: ${payload.options.video.resolution}; ${payload.options.video.duration}s; local upscale plan ${payload.options.video.upscale}.`,
    payload.options.video.scriptRows && payload.options.video.scriptRows.length
      ? [
          'Structured script/directing beats:',
          payload.options.video.scriptRows.map((row) => [
            `- ${row.timeRange}`,
            row.dialogue ? `spoken line "${row.dialogue}"` : 'silent acting',
            `emotion/prosody ${row.emotionPrompt}`,
            `angle ${row.cameraAnglePrompt}`,
            `movement ${row.cameraMovementPrompt}`
          ].join('; ')).join('\n')
        ].join('\n')
      : '',
    payload.options.video.manualScriptNotes
      ? `Additional manual script/camera notes: ${payload.options.video.manualScriptNotes}`
      : 'Additional manual script/camera notes: none.',
    payload.options.video.dialogueTimeline
      ? [
          'Spoken dialogue timeline:',
          payload.options.video.dialogueTimeline,
          'Dialogue must be audible character speech with matching lip movement and expression. Do not show subtitles, captions, speech bubbles, written words, labels, or text overlays.'
        ].join('\n')
      : 'Dialogue: no spoken dialogue unless explicitly requested by the user intent. Do not add subtitles, captions, speech bubbles, or visible text overlays.',
    'Temporal notes: reduce flicker, keep hands and face stable, avoid sudden costume changes, no warped background jumps.',
    '',
    'Reference notes:',
    payload.references.map((ref) => `- ${ref.role}: ${ref.fileName}; ${ref.width || '?'}x${ref.height || '?'}; tags: ${(ref.tags || []).slice(0, 10).join(', ') || 'none'}`).join('\n')
  ].join('\n');
}

function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(executable, args, {
      cwd: options.cwd || undefined,
      windowsHide: true,
      shell: false
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`process timed out: ${executable}`));
    }, options.timeoutMs || 120000);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    if (options.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const error = new Error(stderr || stdout || `process exited with code ${code}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

function splitCommandLine(commandLine) {
  const matches = String(commandLine || '').match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return matches.map((part) => part.replace(/^"|"$/g, ''));
}

function extractOptimizerText(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return '';
  try {
    const data = JSON.parse(trimmed);
    if (typeof data === 'string') return data;
    if (data.response) return data.response;
    if (data.text) return data.text;
    if (data.content) return data.content;
    if (data.message) return data.message;
    if (Array.isArray(data.messages)) return data.messages.map((msg) => msg.content || msg.text || '').join('\n').trim();
    return JSON.stringify(data, null, 2);
  } catch (_) {
    return trimmed;
  }
}

function getEagleAi() {
  return window.eagle && eagle.extraModule && eagle.extraModule.ai ? eagle.extraModule.ai : null;
}

function updateOptimizerModelName() {
  try {
    const backend = els.optimizerBackend.value;
    if (backend === 'grok_cli') {
      els.optimizerModelName.textContent = 'Grok CLI';
      return 'Grok CLI';
    }

    const ai = getEagleAi();
    if (!ai || !ai.getDefaultModel) {
      els.optimizerModelName.textContent = 'Eagle AI model (未検出)';
      return '';
    }

    const defaultModel = ai.getDefaultModel('chat');
    els.optimizerModelName.textContent = defaultModel || 'Eagle AI model (未設定)';
    return defaultModel || '';
  } catch (error) {
    els.optimizerModelName.textContent = 'Eagle AI model (確認待ち)';
    if (state.initialized) log(`Eagle AIモデル表示を更新できませんでした: ${error.message}`, 'warn');
    return '';
  }
}

async function optimizeWithEagleAi(optimizerPrompt) {
  const ai = getEagleAi();
  if (!ai || !ai.generateText || !ai.getDefaultModel || !ai.getModel) {
    throw new Error('Eagle AI SDKが使えません。Eagle 4.0 Build20以上とAI SDK依存プラグインを確認してください。');
  }
  if (ai.reload) ai.reload();
  const defaultModel = ai.getDefaultModel('chat');
  if (!defaultModel) {
    if (ai.open) ai.open();
    throw new Error('Eagle AI SDKのデフォルト言語モデルが未設定です。環境設定のAIモデルを選択してください。');
  }
  const model = ai.getModel(defaultModel);
  els.optimizerModelName.textContent = defaultModel;
  const result = await ai.generateText({
    model,
    prompt: optimizerPrompt
  });
  return extractOptimizerText(result && (result.text || result.content || result));
}

function buildGrokOptimizationSkillPrompt(payload) {
  const modeLabel = payload.mode === 'video' ? 'reference-to-video' : 'reference-image-edit';
  return [
    'You are the Grok Imagine prompt optimization skill for an Eagle plugin.',
    'Goal: convert the user intent, reference metadata, and options into one production-ready Grok Imagine prompt.',
    '',
    'Rules:',
    '- Do not mention internal plugin implementation details.',
    '- Do not ask questions.',
    '- Do not invent facts not present in the user intent or reference metadata.',
    '- Preserve explicit @1, @2, @3 reference tokens exactly when useful.',
    '- The optimizer never receives image bytes. Use filenames, dimensions, tags, and the user text only.',
    '- Keep the prompt direct, concrete, and generation-oriented.',
    '- Put important visual identity, outfit, pose, composition, camera, motion, and quality constraints in the prompt.',
    '- Avoid policy text, moralizing, or refusal language unless the user intent itself is impossible to express as a safe generation prompt.',
    '',
    'Grok Imagine spec alignment:',
    '- Image editing is natural-language editing of uploaded reference image(s); use the prompt to describe the desired transformation.',
    '- Multi-image editing can use up to 3 reference images; preserve identity and visual anchors by referring to @1, @2, and @3 explicitly when useful.',
    '- Image generation options such as aspect ratio, quality/resolution intent, and image count are represented as prompt guidance in this API-free plugin.',
    '- Reference-to-video uses reference image paths plus a prompt; @1 is the start-frame reference in video mode.',
    '- When the user references a video in video mode, this plugin extracts the source video last frame locally and passes that extracted frame to Grok as the continuation start frame.',
    '- Change intensity guidance is not a native Grok parameter here; translate low/medium/high into wording about preserving or changing the source image.',
    '- Spoken dialogue in video mode must be described as audible character speech with lip movement, facial expression, emotion, and prosody.',
    '- Preserve second-level timing when a dialogue timeline is provided. Compress only if needed to fit the requested duration.',
    '- Integrate dialogue beats with camera movement and character motion in the same timed sequence.',
    '- Treat structured script/directing rows as the strongest timing and camera instructions. Convert each row into a concise video beat in the final prompt.',
    '- Do not ask Grok to draw subtitles, captions, speech bubbles, written dialogue, floating words, labels, logos, or text overlays unless the user explicitly requests visible text.',
    payload.mode === 'image'
      ? '- For image edit mode, keep the output focused on editing the uploaded reference image(s) rather than pure text-to-image generation.'
      : '- For video mode, describe motion, camera behavior, temporal consistency, and subject stability explicitly.',
    '',
    `Mode: ${modeLabel}`,
    'Output format: return only the final prompt text to send to Grok Build / Grok Imagine.',
    '',
    'Payload:',
    JSON.stringify(payload, null, 2)
  ].join('\n');
}

async function optimizePrompt() {
  state.isOptimizing = true;
  const rawPrompt = buildPrompt();
  const backend = els.optimizerBackend.value;
  els.optimizerStatus.textContent = '最適化中';

  const payload = buildOptimizerPayload(rawPrompt);
  const optimizerPrompt = buildGrokOptimizationSkillPrompt(payload);

  try {
    els.optimizePromptBtn.disabled = true;
    if (backend === 'grok_cli') {
      const exe = els.grokCliPath.value.trim() || DEFAULTS.grokCli;
      if (!fileExists(exe)) throw new Error(`Grok CLI not found: ${exe}`);
      const result = await runProcess(exe, ['-p', optimizerPrompt, '--output-format', 'json', '--no-plan'], {
        cwd: state.stagedDir || undefined
      });
      const optimized = extractOptimizerText(result.stdout);
      if (!optimized) throw new Error('Grok CLI returned no optimizer text.');
      els.finalPrompt.value = optimized;
      els.optimizerStatus.textContent = 'Grok CLI最適化済み';
      log('Grok CLI textでプロンプトを最適化しました。');
      return optimized;
    }

    if (backend === 'eagle_ai') {
      const optimized = await optimizeWithEagleAi(optimizerPrompt);
      if (!optimized) throw new Error('Eagle AI SDK returned no optimizer text.');
      els.finalPrompt.value = optimized;
      els.optimizerStatus.textContent = 'Eagle AI最適化済み';
      log('Eagle AI SDKのデフォルト言語モデルでプロンプトを最適化しました。');
      return optimized;
    }
  } catch (error) {
    els.finalPrompt.value = rawPrompt;
    els.optimizerStatus.textContent = '最適化失敗';
    log(`最適化バックエンド失敗。元プロンプトを保持しました: ${error.message}`, 'warn');
    return rawPrompt;
  } finally {
    els.optimizePromptBtn.disabled = false;
    state.isOptimizing = false;
  }
}

async function copyText(text) {
  if (window.eagle && eagle.clipboard) {
    eagle.clipboard.writeText(text);
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    els.finalPrompt.value = text;
    els.finalPrompt.focus();
    els.finalPrompt.select();
    document.execCommand('copy');
  }
}

async function copyPrompt() {
  const text = els.finalPrompt.value.trim() || buildPrompt();
  if (window.eagle && eagle.clipboard) {
    eagle.clipboard.writeText(text);
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    els.finalPrompt.focus();
    els.finalPrompt.select();
    document.execCommand('copy');
  }
  log('プロンプトをクリップボードへコピーしました。');
}

async function openPath(filePath) {
  if (window.eagle && eagle.shell) {
    await eagle.shell.openPath(filePath);
    return;
  }
  if (!spawn) return;
  spawn('explorer.exe', [filePath], { detached: true, windowsHide: true });
}

async function openExternal(url) {
  if (window.eagle && eagle.shell) {
    await eagle.shell.openExternal(url);
    return;
  }
  if (!spawn) return;
  spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, windowsHide: true });
}

async function openGrok() {
  if (!state.stagedDir) {
    await stageReferences();
  }
  await copyPrompt();
  await openPath(state.stagedDir);
  await openExternal(els.grokWebUrl.value.trim() || DEFAULTS.grokWeb);
  log('Grok Webを開きました。参照画像をアップロードして、コピー済みプロンプトを貼り付けてください。');
}

function buildGrokBuildGenerationPrompt(outputDir, promptOverride = '') {
  const finalPrompt = String(promptOverride || '').trim() || els.finalPrompt.value.trim() || buildPrompt();
  const references = state.references.map((ref, index) => {
    const role = state.mode === 'video' && index === 0
      ? (ref.extractedFromVideo ? 'continuation start frame extracted from source video last frame' : 'start frame')
      : (ref.extractedFromVideo ? `reference ${index + 1} extracted from source video last frame` : `reference ${index + 1}`);
    return `@${index + 1} -> ${role}: ${ref.stagedPath || ref.filePath}`;
  }).join('\n') || '(no reference files)';

  if (state.mode === 'image') {
    return [
      'Use Grok Build bundled imagine capabilities. Do not ask for an xAI API key.',
      'If an image_edit tool is available and reference files are provided, use the reference images. Otherwise use /imagine for text-to-image.',
      'Reference token mapping is authoritative. If the prompt mentions @1, @2, or @3, use the matching local file path below.',
      `Reference image paths:\n${references}`,
      `Prompt:\n${finalPrompt}`,
      `Save or download generated media under this folder if the tool allows choosing a path: ${outputDir}`,
      'After generation, report every generated absolute media file path. Keep the response concise.'
    ].join('\n\n');
  }

  return [
    'Use Grok Build bundled imagine capabilities. Do not ask for an xAI API key.',
    'Use image_to_video or reference_to_video for the uploaded/local reference frame paths. Reference 1 is the start frame.',
    'If reference 1 was extracted from the last frame of a source video, generate the continuation from that frame. Do not include the original source video file in Grok; use the extracted frame path.',
    'Reference token mapping is authoritative. If the prompt mentions @1, @2, or @3, use the matching local file path below.',
    'If the prompt includes dialogue, treat it as spoken audio/lip movement only. Do not render subtitles, captions, speech bubbles, written dialogue, or text overlays unless the user explicitly asks for visible text.',
    `Reference frame paths:\n${references}`,
    `Prompt:\n${finalPrompt}`,
    `Save or download generated media under this folder if the tool allows choosing a path: ${outputDir}`,
    'After generation, report every generated absolute media file path. Keep the response concise.'
  ].join('\n\n');
}

async function ensureOptimizedPromptForGeneration() {
  const currentStatus = els.optimizerStatus.textContent || '';
  if (!els.finalPrompt.value.trim() || !currentStatus.includes('最適化済み')) {
    log('生成前にプロンプト最適化を実行します。');
    await optimizePrompt();
  }
  return els.finalPrompt.value.trim() || buildPrompt();
}

function extractMediaPathsFromText(text) {
  const found = new Set();
  for (const match of String(text || '').matchAll(WINDOWS_MEDIA_PATH_RE)) {
    const candidate = match[0].replace(new RegExp(BACKSLASH + BACKSLASH + BACKSLASH + BACKSLASH, 'g'), BACKSLASH).trim();
    if (fileExists(candidate)) found.add(candidate);
  }
  return Array.from(found);
}

async function runGrokBuildCommand(exe, prompt) {
  return runProcess(exe, [
    '--cwd', state.stagedDir,
    '--output-format', 'json',
    '--no-plan',
    '--max-turns', '10',
    '--permission-mode', 'auto',
    '-p', prompt
  ], {
    cwd: state.stagedDir,
    timeoutMs: 20 * 60 * 1000
  });
}

async function runVoiceReadGeneration(options = {}) {
  if (state.isGenerating) {
    log('音声生成はすでに実行中です。二重実行をスキップしました。', 'warn');
    return;
  }
  const validationMessage = getVoiceValidationMessage();
  if (validationMessage) throw new Error(validationMessage);
  const wrapperPath = voiceWrapperScriptPath();
  if (!fileExists(wrapperPath)) throw new Error(`Irodori wrapperが見つかりません: ${wrapperPath}`);

  state.isGenerating = true;
  updateGenerateButtonState();
  const startedAt = new Date().toISOString();
  const jobDir = ensureVoiceJobDir();
  const requestedVoiceName = els.voiceName.value.trim();
  const outputBaseName = voiceOutputBaseName(jobDir);
  const paths = voiceJobPaths(jobDir, outputBaseName);
  const preset = els.voicePreset.value || 'balanced';
  const text = els.voiceText.value.trim();
  const direction = els.voiceDirection.value.trim();
  setVoicePreviewStatus('音声生成を開始します。入力欄を固定し、ジョブ用ファイルを準備しています。');
  const deterministicCaption = buildVoicePromptPreview({ updateStatus: false, updatePreview: false }).trim();
  let caption = deterministicCaption;
  let captionOptimization = {
    status: 'not_started',
    backend: '',
    error: '',
    stdout_tail: '',
    stderr_tail: ''
  };
  const request = {
    plugin: PLUGIN_ID,
    mode: 'voice',
    backend: 'irodori-voice-read',
    preset,
    voice_name: outputBaseName,
    requested_voice_name: requestedVoiceName,
    seed_audio_path: paths.seed,
    seed_audio_original_path: state.voiceSeedOriginalPath || '',
    text_path: paths.text,
    direction_path: paths.direction,
    caption_path: paths.caption,
    caption_optimizer_prompt_path: paths.optimizerPrompt,
    output_wav: paths.output,
    created_at: startedAt,
    dry_run: Boolean(options.dryRun),
    caption_optimization: {
      requested: true,
      backend: 'grok-composer-2.5-fast',
      fallback: 'deterministic'
    }
  };

  try {
    if (!samePath(state.voiceSeedPath, paths.seed)) {
      validateVoiceSeedPath(state.voiceSeedPath);
      fs.copyFileSync(state.voiceSeedPath, paths.seed);
      state.voiceSeedPath = paths.seed;
    }
    fs.writeFileSync(paths.text, text, 'utf8');
    fs.writeFileSync(paths.direction, direction, 'utf8');
    captionOptimization = await optimizeVoiceCaptionWithGrok(jobDir, paths, text, direction, deterministicCaption);
    caption = captionOptimization.caption || deterministicCaption;
    fs.writeFileSync(paths.caption, caption, 'utf8');
    request.deterministic_caption = deterministicCaption;
    request.optimized_caption = caption;
    request.caption_optimization = {
      ...request.caption_optimization,
      status: captionOptimization.status,
      backend_used: captionOptimization.backend,
      error: captionOptimization.error || ''
    };
    writeJsonPretty(paths.request, request);

    log(`Irodori-TTS音声生成を開始します: ${jobDir}`);
    const psArgs = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', wrapperPath,
      '-SeedAudioPath', paths.seed,
      '-TextPath', paths.text,
      '-CaptionPath', paths.caption,
      '-OutputWav', paths.output,
      '-Preset', preset
    ];
    if (options.dryRun) psArgs.push('-DryRun');

    const result = await runProcess('powershell.exe', psArgs, {
      cwd: jobDir,
      timeoutMs: 60 * 60 * 1000
    });

    const outputExists = fileExists(paths.output);
    const outputStat = outputExists ? fs.statSync(paths.output) : null;
    let mediaInfo = {};
    let durationStatus = 'unknown';
    try {
      mediaInfo = importer && importer.probeMedia ? importer.probeMedia(paths.output, DEFAULTS.ffprobe) : {};
      durationStatus = mediaInfo.duration ? 'ok' : 'unknown';
    } catch (error) {
      durationStatus = `warning: ${error.message}`;
    }

    const finishedAt = new Date().toISOString();
    const jobResult = {
      status: outputExists ? 'success' : 'failed',
      preset,
      voice_name: outputBaseName,
      seed_audio_path: paths.seed,
      text_path: paths.text,
      caption_path: paths.caption,
      output_wav: paths.output,
      output_exists: outputExists,
      output_size: outputStat ? outputStat.size : 0,
      duration_seconds: mediaInfo.duration || null,
      duration_status: durationStatus,
      started_at: startedAt,
      finished_at: finishedAt,
      exit_code: 0,
      stdout_tail: textTail(result.stdout),
      stderr_tail: textTail(result.stderr),
      caption_optimization: captionOptimization,
      error: outputExists ? '' : 'Expected output WAV was not created.'
    };
    writeJsonPretty(paths.result, jobResult);
    state.voiceLastResult = jobResult;

    if (!outputExists) throw new Error(jobResult.error);
    addGeneratedCandidate(paths.output, {
      generationMode: 'audio',
      duration: mediaInfo.duration || 0,
      durationStatus,
      voiceJobDir: jobDir,
      voicePrompt: caption,
      voiceText: text,
      voiceDirection: direction,
      voicePreset: preset,
      voiceName: outputBaseName,
      seedAudioOriginalPath: state.voiceSeedOriginalPath || state.voiceSeedPath || ''
    });
    log(`Irodori-TTS音声生成が完了しました: ${paths.output}`);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const jobResult = {
      status: 'failed',
      preset,
      voice_name: outputBaseName,
      seed_audio_path: paths.seed,
      text_path: paths.text,
      caption_path: paths.caption,
      output_wav: paths.output,
      output_exists: fileExists(paths.output),
      output_size: fileExists(paths.output) ? fs.statSync(paths.output).size : 0,
      duration_seconds: null,
      duration_status: 'unknown',
      started_at: startedAt,
      finished_at: finishedAt,
      exit_code: Number.isFinite(error.code) ? error.code : 1,
      stdout_tail: textTail(error.stdout),
      stderr_tail: textTail(error.stderr),
      caption_optimization: captionOptimization,
      error: error.message
    };
    writeJsonPretty(paths.result, jobResult);
    state.voiceLastResult = jobResult;
    throw error;
  } finally {
    state.isGenerating = false;
    state.voiceJobDir = '';
    updateGenerateButtonState();
  }
}

function scanRecentMedia(dirPath, sinceMs, recursive = false, depth = 0) {
  const results = [];
  if (!dirPath || !fs.existsSync(dirPath)) return results;
  const exts = new Set(['png', 'jpg', 'jpeg', 'webp', 'mp4']);
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory() && recursive && depth < 2) {
      results.push(...scanRecentMedia(fullPath, sinceMs, recursive, depth + 1));
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase();
    if (!exts.has(ext)) continue;
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs + 1500 >= sinceMs && stat.size > 0) {
      results.push(fullPath);
    }
  }
  return results;
}

function isStagedReferenceMediaPath(mediaPath) {
  return (state.references || []).some((ref) => ref.stagedPath && samePath(mediaPath, ref.stagedPath));
}

async function runGrokBuildGeneration(options = {}) {
  if (state.isGenerating) {
    log('Grok Build生成はすでに実行中です。二重生成をスキップしました。', 'warn');
    return;
  }
  validateReferenceLimit();
  const exe = els.grokCliPath.value.trim() || DEFAULTS.grokCli;
  if (!executableLooksConfigured(exe)) {
    throw new Error(`Grok CLIが見つかりません: ${exe}`);
  }
  state.isGenerating = true;
  updateGenerateButtonState();
  try {
    if (state.references.length && !state.stagedDir) {
      await stageReferences();
    }
    if (!state.stagedDir) {
      state.stagedDir = createStagingDir();
      els.stagingStatus.textContent = '作成済み';
      els.stagingPath.textContent = state.stagedDir;
    }
    await ensureOptimizedPromptForGeneration();

    const startedAt = Date.now();
    const outputDir = path.join(state.stagedDir, 'grok-build-output');
    fs.mkdirSync(outputDir, { recursive: true });
    const finalPrompt = els.finalPrompt.value.trim() || buildPrompt();
    const prompt = buildGrokBuildGenerationPrompt(outputDir, finalPrompt);
    log(options.retry ? '同じ条件でGrok Build動画再生成を開始します。' : 'Grok Build headless生成を開始します。bundled imagine skillを使える場合はここで生成されます。');
    let result;
    let text = '';
    try {
      result = await runGrokBuildCommand(exe, prompt);
      text = `${result.stdout}\n${result.stderr}`;
      if (isModerationErrorText(text)) {
        throw Object.assign(new Error('Grok Build reported a moderation or safety-policy block.'), {
          stdout: result.stdout,
          stderr: result.stderr
        });
      }
    } catch (error) {
      const errorText = moderationErrorText(error);
      if (!isModerationErrorText(errorText) || Number(options.moderationRetryCount || 0) >= MODERATION_RETRY_LIMIT) {
        throw error;
      }

      const safeFinalPrompt = createModerationSafePrompt(finalPrompt);
      const retryPrompt = buildGrokBuildGenerationPrompt(outputDir, safeFinalPrompt);
      els.finalPrompt.value = safeFinalPrompt;
      els.optimizerStatus.textContent = 'moderation retry prompt';
      const event = buildModerationEvent({
        attempt: Number(options.moderationRetryCount || 0) + 1,
        prompt: finalPrompt,
        retryPrompt: safeFinalPrompt,
        errorText,
        retryPlanned: true
      });
      const logPaths = recordModerationEvent(event);
      upsertFailedResult(moderationFailureFromEvent(event, logPaths, 'Moderation error detected. Retrying once with safer constraints.'));
      log(`Moderation error detected. Prompt logged for trend analysis${logPaths.length ? `: ${logPaths.join(' / ')}` : ''}`, 'warn');
      const trend = moderationTrendSummary();
      if (trend) log(`Moderation trend summary (recent): ${trend}`, 'warn');
      log('Retrying once with moderation-safe constraints applied.', 'warn');

      try {
        result = await runGrokBuildCommand(exe, retryPrompt);
        text = `${result.stdout}\n${result.stderr}`;
        if (isModerationErrorText(text)) {
          throw Object.assign(new Error('Grok Build retry was also blocked by moderation or safety policy.'), {
            stdout: result.stdout,
            stderr: result.stderr
          });
        }
        log('Moderation-safe retry completed.', 'warn');
      } catch (retryError) {
        const retryErrorText = moderationErrorText(retryError);
        if (isModerationErrorText(retryErrorText)) {
          const retryEvent = buildModerationEvent({
            attempt: Number(options.moderationRetryCount || 0) + 2,
            prompt: safeFinalPrompt,
            retryPrompt: '',
            errorText: retryErrorText,
            retryPlanned: false
          });
          const retryLogPaths = recordModerationEvent(retryEvent);
          upsertFailedResult(moderationFailureFromEvent(retryEvent, retryLogPaths, 'Moderation retry was also blocked. Revise the concept or references before trying again.'));
          log(`Moderation retry was blocked. Prompt logged${retryLogPaths.length ? `: ${retryLogPaths.join(' / ')}` : ''}`, 'error');
          throw new Error('Moderation retry was also blocked. Please revise the concept or references before trying again.');
        }
        throw retryError;
      }
    }
    const paths = new Set(extractMediaPathsFromText(text));
    for (const dir of [outputDir, state.stagedDir, DEFAULTS.grokDownloads, els.downloadsPath.value.trim()].filter(Boolean)) {
      for (const mediaPath of scanRecentMedia(dir, startedAt, dir === outputDir || dir === state.stagedDir)) {
        paths.add(mediaPath);
      }
    }
    const detectedPaths = Array.from(paths).filter((mediaPath) => !isStagedReferenceMediaPath(mediaPath));
    for (const mediaPath of detectedPaths) {
      const ext = path.extname(mediaPath).replace(/^\./, '').toLowerCase();
      addGeneratedCandidate(mediaPath, {
        generationMode: ext === 'mp4' ? 'video' : 'image',
        videoResolutionIntent: ext === 'mp4' ? els.videoResolution.value : ''
      });
    }
    if (detectedPaths.length) incrementUsageForMediaPaths(detectedPaths, 'grok_build_generated');
    log(paths.size ? `Grok Build生成候補を ${paths.size}件追加しました。` : 'Grok Build実行は完了しましたが、生成ファイルの自動検出はできませんでした。Downloads候補更新も試してください。');
  } finally {
    state.isGenerating = false;
    updateGenerateButtonState();
  }
}

async function copyStagedFiles() {
  if (!state.references.length) throw new Error('参照画像がありません。');
  const files = state.references.map((ref) => ref.stagedPath || ref.filePath).filter(Boolean);
  if (window.eagle && eagle.clipboard && eagle.clipboard.copyFiles) {
    eagle.clipboard.copyFiles(files);
    log('参照ファイルをクリップボードへコピーしました。');
  } else {
    throw new Error('Eagle clipboard.copyFiles が使えません。');
  }
}

function candidateKey(filePath) {
  return normalizePath(filePath);
}

function armDownloadsWatch() {
  if (!fs) throw new Error('Node.js APIが使えないためDownloads監視できません。');
  const downloads = els.downloadsPath.value.trim();
  if (!downloads || !fs.existsSync(downloads)) throw new Error(`Downloadsフォルダが見つかりません: ${downloads}`);
  state.watchSince = Date.now();
  state.seenDownloads = new Map();
  if (state.watchTimer) clearInterval(state.watchTimer);
  state.watchTimer = setInterval(() => {
    scanDownloads(false).catch(showError);
  }, 3000);
  els.watchStatus.textContent = '監視中';
  log(`Downloads監視を開始しました: ${downloads}`);
}

function stopDownloadsWatch() {
  if (state.watchTimer) clearInterval(state.watchTimer);
  state.watchTimer = null;
  els.watchStatus.textContent = '監視停止中';
  log('Downloads監視を停止しました。');
}

async function scanDownloads(manual = true) {
  const downloads = els.downloadsPath.value.trim();
  if (!downloads || !fs.existsSync(downloads)) throw new Error(`Downloadsフォルダが見つかりません: ${downloads}`);
  const exts = new Set(['png', 'jpg', 'jpeg', 'webp', 'mp4']);
  const since = state.watchSince || (Date.now() - 60 * 60 * 1000);
  const entries = fs.readdirSync(downloads, { withFileTypes: true });
  let added = 0;
  const addedPaths = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.crdownload') || entry.name.endsWith('.tmp')) continue;
    const filePath = path.join(downloads, entry.name);
    const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase();
    if (!exts.has(ext)) continue;
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs + 1500 < since) continue;
    if (stat.size <= 0) continue;

    const key = candidateKey(filePath);
    const seen = state.seenDownloads.get(key);
    const stable = seen && seen.size === stat.size && seen.mtimeMs === stat.mtimeMs;
    state.seenDownloads.set(key, { size: stat.size, mtimeMs: stat.mtimeMs, checkedAt: Date.now() });
    if (!manual && !stable) continue;
    if (state.candidates.some((candidate) => candidateKey(candidate.filePath) === key)) continue;

    let mediaInfo = {};
    try {
      mediaInfo = importer && importer.probeMedia ? importer.probeMedia(filePath, DEFAULTS.ffprobe) : {};
    } catch (_) {
      mediaInfo = {};
    }
    state.candidates.push({
      filePath,
      name: path.basename(filePath, path.extname(filePath)),
      ext,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      width: mediaInfo.width || 0,
      height: mediaInfo.height || 0,
      duration: mediaInfo.duration || 0,
      selected: true,
      imported: false,
      generationMode: ext === 'mp4' ? 'video' : 'image',
      videoResolutionIntent: ext === 'mp4' ? els.videoResolution.value : ''
    });
    added += 1;
    addedPaths.push(filePath);
  }

  renderCandidates();
  if (addedPaths.length) incrementUsageForMediaPaths(addedPaths, 'downloads_detected');
  if (manual || added) log(`Downloads候補を更新しました。新規 ${added}件。`);
}

function formatBytes(size) {
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function isImageExt(ext) {
  return ['png', 'jpg', 'jpeg', 'webp'].includes(String(ext || '').toLowerCase());
}

function canUpscaleCandidate(candidate) {
  if (!candidate || candidate.upscaleResult) return false;
  if (isAudioCandidateExt(candidate.ext)) return false;
  if (isImageExt(candidate.ext)) return true;
  if (candidate.ext === 'mp4') {
    return candidate.videoResolutionIntent === '480p' && Boolean(els.videoUpscale.value && els.videoUpscale.value !== 'none');
  }
  return false;
}

function upscaleDisabledReason(candidate) {
  if (!candidate) return '';
  if (candidate.upscaled || candidate.upscaleResult) return 'すでにアップスケール済みです';
  if (isImageExt(candidate.ext)) return '';
  if (candidate.ext !== 'mp4') return 'アップスケール対象外です';
  if (candidate.videoResolutionIntent !== '480p') return '動画アップスケールは480p生成動画だけが対象です';
  if (!els.videoUpscale.value || els.videoUpscale.value === 'none') return '動画オプションの後処理でアップスケール解像度を選んでください';
  return '';
}

function renderCandidates() {
  els.candidateList.innerHTML = '';
  const failures = state.failedResults || [];
  if (!state.candidates.length && !failures.length) {
    const div = document.createElement('div');
    div.className = 'hint';
    div.textContent = `まだ生成結果はありません。「${state.mode === 'video' ? '動画を生成' : '画像を生成'}」を実行するとここに表示されます。`;
    els.candidateList.appendChild(div);
    return;
  }

  failures.forEach((failure, index) => {
    const div = document.createElement('div');
    div.className = 'candidate failed-candidate';
    const categories = (failure.categories || []).join(', ') || 'uncategorized';
    const logPath = (failure.logPaths || [])[0] || '';
    const promptPreview = String(failure.retryPrompt || failure.prompt || '').slice(0, 500);
    div.innerHTML = `
      <div class="candidate-preview"><span>ERROR</span></div>
      <div>
        <div class="candidate-name" title="${escapeHtml(failure.fingerprint || '')}">Moderation blocked (${escapeHtml(failure.mode || 'unknown')})</div>
        <div class="meta">${escapeHtml(failure.message || 'Moderation error')} / ${escapeHtml(categories)} / ${escapeHtml(failure.at || '')}</div>
        <div class="meta">Prompt: ${escapeHtml(promptPreview)}</div>
        <div class="candidate-actions">
          <button class="btn warn" data-action="retry-failure" data-failure-index="${index}" type="button">Retry</button>
          <button class="btn" data-action="copy-failure-prompt" data-failure-index="${index}" type="button">Prompt</button>
          <button class="btn" data-action="show-failure-log" data-failure-index="${index}" type="button" ${logPath ? '' : 'disabled'}>Log</button>
          <button class="btn ghost" data-action="remove-failure" data-failure-index="${index}" type="button">Remove</button>
        </div>
      </div>`;
    els.candidateList.appendChild(div);
  });

  state.candidates.forEach((candidate, index) => {
    const isAudio = isAudioCandidateExt(candidate.ext);
    const dims = isAudio ? 'audio' : (candidate.width && candidate.height ? `${candidate.width}x${candidate.height}` : 'unknown');
    const duration = candidate.duration ? ` / ${candidate.duration.toFixed(2)}s` : '';
    const div = document.createElement('div');
    div.className = `candidate${isAudio ? ' audio-candidate' : ''}${candidate.upscaled && !candidate.upscaleResult ? ' upscaled' : ''}`;
    const mediaSrc = escapeHtml(fileUrl(candidate.filePath));
    const preview = isImageExt(candidate.ext)
      ? `<img src="${mediaSrc}" alt="">`
      : isAudio
        ? `<audio src="${mediaSrc}" controls preload="metadata"></audio>`
      : candidate.ext === 'mp4'
        ? `<video src="${mediaSrc}" muted loop></video>`
        : `<span>${escapeHtml(candidate.ext.toUpperCase())}</span>`;
    const canUpscale = canUpscaleCandidate(candidate) && !candidate.upscaled;
    const disabledReason = upscaleDisabledReason(candidate);
    const upscaleButton = isAudio
      ? ''
      : `<button class="btn warn" data-action="upscale-candidate" data-index="${index}" type="button" title="${escapeHtml(disabledReason)}" ${canUpscale ? '' : 'disabled'}>${candidate.upscaled || candidate.upscaleResult ? 'Upscale済み' : 'Upscale'}</button>`;
    const voiceProfileButton = isAudio
      ? `<button class="btn" data-action="save-voice-profile" data-index="${index}" type="button">Preset保存</button>`
      : '';
    const videoUpscaledLabel = candidate.ext === 'mp4' && (candidate.upscaled || candidate.upscaleResult)
      ? '<div class="status-label-row"><span class="status-label video-upscaled">アップスケール済み</span></div>'
      : '';
    div.innerHTML = `
      <div class="candidate-preview">${preview}</div>
      <div>
        <div class="candidate-name" title="${escapeHtml(candidate.filePath)}">${escapeHtml(candidate.name)}.${escapeHtml(candidate.ext)}</div>
        <div class="meta">${escapeHtml(formatBytes(candidate.size))} / ${escapeHtml(dims)}${escapeHtml(duration)}${candidate.videoResolutionIntent ? ` / ${escapeHtml(candidate.videoResolutionIntent)}` : ''}${candidate.imported ? ' / 保存済み' : ''}${candidate.upscaled ? ' / アップスケール済み' : ''}</div>
        ${videoUpscaledLabel}
        <div class="candidate-actions">
          <button class="btn primary" data-action="import-candidate" data-index="${index}" type="button">保存</button>
          ${voiceProfileButton}
          ${upscaleButton}
          <button class="btn" data-action="show-candidate" data-index="${index}" type="button">場所</button>
          <button class="btn ghost" data-action="remove-candidate" data-index="${index}" type="button">外す</button>
        </div>
      </div>`;
    els.candidateList.appendChild(div);
  });
}

async function ensureActiveFolderPath(folderPath) {
  const clean = String(folderPath || '').trim().replace(/\\/g, '/');
  if (!clean) return [];
  const parts = clean.split('/').map((part) => part.trim()).filter(Boolean);
  if (!parts.length || !window.eagle || !eagle.folder) return [];

  let roots = await eagle.folder.getAll();
  let children = roots || [];
  let parentId = null;
  let lastFolder = null;
  for (const part of parts) {
    let folder = (children || []).find((candidate) => candidate.name === part);
    if (!folder) {
      folder = parentId
        ? await eagle.folder.createSubfolder(parentId, { name: part, description: 'Grok Imagine Studio' })
        : await eagle.folder.create({ name: part, description: 'Grok Imagine Studio' });
    }
    parentId = folder.id;
    lastFolder = folder;
    children = folder.children || [];
  }
  return lastFolder ? [lastFolder.id] : [];
}

function candidateMediaMode(candidate) {
  if (candidate && candidate.generationMode) return candidate.generationMode;
  if (candidate && isAudioCandidateExt(candidate.ext)) return 'audio';
  if (candidate && candidate.ext === 'mp4') return 'video';
  return 'image';
}

function candidateTags(candidate) {
  const mode = candidateMediaMode(candidate);
  if (mode === 'audio') return ['Grok Imagine Studio', 'Irodori-TTS', 'voice read', 'audio'];
  return ['Grok', 'Grok Imagine Studio', mode === 'video' ? 'video' : 'image'];
}

function candidatePrompt(candidate) {
  if (candidateMediaMode(candidate) === 'audio') return candidate.voicePrompt || '';
  return els.finalPrompt.value.trim();
}

function candidateStagedSources(candidate) {
  if (candidateMediaMode(candidate) === 'audio') {
    return [candidate.seedAudioOriginalPath || state.voiceSeedOriginalPath || 'seed.wav'].filter(Boolean).map((entry) => path.basename(entry));
  }
  return state.references.map((ref) => path.basename(ref.stagedPath || ref.filePath));
}

function candidateAnnotation(candidate, importMethod = '') {
  const mode = candidateMediaMode(candidate);
  const data = {
    source: PLUGIN_ID,
    mode,
    prompt: candidatePrompt(candidate),
    stagedSources: candidateStagedSources(candidate),
    import_method: importMethod,
    importedAt: new Date().toISOString()
  };
  if (mode === 'audio') {
    data.backend = 'irodori-voice-read';
    data.description = 'Local TTS narration generated from a permitted reference WAV. This metadata does not claim an official voice or real-person identity.';
    data.voicePreset = candidate.voicePreset || '';
    data.voiceName = candidate.voiceName || candidate.name || '';
    data.voicePrompt = candidate.voicePrompt || '';
    data.voiceJobDir = candidate.voiceJobDir || '';
    data.durationStatus = candidate.durationStatus || '';
  }
  return JSON.stringify(data, null, 2).slice(0, 6000);
}

function recordCandidateImportMethod(candidate, importMethod) {
  if (!candidate || candidateMediaMode(candidate) !== 'audio' || !candidate.voiceJobDir) return;
  const resultPath = path.join(candidate.voiceJobDir, 'job_result.json');
  if (!fileExists(resultPath)) return;
  try {
    const data = JSON.parse(fs.readFileSync(resultPath, 'utf8').replace(/^\uFEFF/, ''));
    data.import_method = importMethod;
    data.imported_at = new Date().toISOString();
    writeJsonPretty(resultPath, data);
  } catch (error) {
    log(`job_result.jsonへ保存経路を追記できませんでした: ${error.message}`, 'warn');
  }
}

function importOptionsFor(candidate, dryRun = false) {
  const mediaMode = candidateMediaMode(candidate);
  const annotation = candidateAnnotation(candidate, 'direct_library_importer');
  return {
    sourcePath: candidate.filePath,
    libraryPath: getTargetLibraryPath(),
    folderId: getTargetFolderId(),
    tags: candidateTags(candidate),
    dryRun,
    ffmpegPath: DEFAULTS.ffmpeg,
    ffprobePath: DEFAULTS.ffprobe,
    prompt: candidatePrompt(candidate),
    mode: mediaMode,
    stagedSources: candidateStagedSources(candidate),
    website: mediaMode === 'audio' ? 'local-irodori-tts' : (els.grokWebUrl.value.trim() || DEFAULTS.grokWeb),
    voicePreset: candidate.voicePreset || '',
    voiceJobDir: candidate.voiceJobDir || '',
    voicePrompt: candidate.voicePrompt || '',
    importMethod: 'direct_library_importer',
    annotation
  };
}

async function importCandidate(candidate, dryRun = false) {
  const targetLibrary = getTargetLibraryPath();
  const mediaMode = candidateMediaMode(candidate);
  const tags = candidateTags(candidate);
  const annotation = candidateAnnotation(candidate, 'eagle.item.addFromPath');

  if (!targetLibrary) {
    throw new Error('登録先のEagleライブラリを選択してください。');
  }
  if (window.eagle && state.activeLibraryPath && samePath(targetLibrary, state.activeLibraryPath)) {
    const selectedFolderId = getTargetFolderId();
    const folders = selectedFolderId ? [selectedFolderId] : [];
    if (dryRun) {
      log(`[dry-run] active library addFromPath: ${candidate.filePath} / folder: ${getTargetFolderPath() || '(root)'}`);
      return { dryRun: true, activeLibrary: true, sourcePath: candidate.filePath, folders };
    }
    const itemId = await eagle.item.addFromPath(candidate.filePath, {
      name: candidate.name,
      website: mediaMode === 'audio' ? 'local-irodori-tts' : (els.grokWebUrl.value.trim() || DEFAULTS.grokWeb),
      tags,
      folders,
      annotation
    });
    candidate.imported = true;
    candidate.importMethod = 'eagle.item.addFromPath';
    recordCandidateImportMethod(candidate, candidate.importMethod);
    log(`現在のEagleライブラリへ登録しました: ${itemId}`);
    return { itemId, activeLibrary: true, importMethod: candidate.importMethod };
  }

  if (!importer || !importer.importMedia) throw new Error('別ライブラリ直接登録モジュールを読み込めませんでした。プラグインを再読み込みしてください。');
  const result = importer.importMedia(importOptionsFor(candidate, dryRun));
  if (result.duplicate) {
    candidate.imported = true;
    candidate.importMethod = 'direct_library_importer';
    recordCandidateImportMethod(candidate, candidate.importMethod);
    log(`同一SHA1の既存項目を検出しました: ${result.duplicate.id}`, 'warn');
  } else if (dryRun) {
    log(`[dry-run] direct import: ${result.sourcePath} -> ${result.itemDir}`);
  } else {
    candidate.imported = true;
    candidate.importMethod = 'direct_library_importer';
    recordCandidateImportMethod(candidate, candidate.importMethod);
    log(`別ライブラリへ登録しました: ${result.eagleId} / backup: ${result.backupDir}`);
  }
  renderCandidates();
  return result;
}

async function importSelectedCandidates(dryRun = false) {
  const selected = state.candidates.filter((candidate) => candidate.selected && !candidate.imported);
  if (!selected.length) throw new Error('登録対象の候補がありません。');
  for (const candidate of selected) {
    await importCandidate(candidate, dryRun);
  }
  renderCandidates();
}

async function upscaleCandidate(candidate) {
  if (!canUpscaleCandidate(candidate)) throw new Error(upscaleDisabledReason(candidate) || 'アップスケール対象は png/jpg/webp/mp4 の候補です。');
  if (candidate.upscaled) throw new Error('この候補はすでにアップスケール済みです。');
  let outputPath = '';
  if (isImageExt(candidate.ext)) {
    outputPath = await upscaleImageWithUpscayl(candidate);
  } else {
    const target = els.videoUpscale.value;
    if (!target || target === 'none') throw new Error('動画オプションの後処理でアップスケール解像度を選んでください。');
    const height = target === '2160p' ? 2160 : Number(target.replace('p', ''));
    const outPath = path.join(path.dirname(candidate.filePath), `${candidate.name}_upscaled_${target}.mp4`);
    if (!fileExists(DEFAULTS.ffmpeg)) throw new Error(`FFmpegが見つかりません: ${DEFAULTS.ffmpeg}`);
    log(`FFmpegアップスケール開始: ${target}`);
    await runProcess(DEFAULTS.ffmpeg, [
      '-y', '-i', candidate.filePath,
      '-vf', `scale=-2:${height}`,
      '-c:v', 'libx264',
      '-crf', '18',
      '-preset', 'medium',
      '-c:a', 'copy',
      outPath
    ]);
    addGeneratedCandidate(outPath, {
      derivedFrom: candidate.filePath,
      generationMode: 'video',
      videoResolutionIntent: candidate.videoResolutionIntent || '480p',
      upscaleResult: true
    });
    log(`アップスケール完了: ${outPath}`);
    outputPath = outPath;
  }
  candidate.upscaled = true;
  candidate.upscaledPath = outputPath;
  renderCandidates();
  return outputPath;
}

async function upscaleImageWithUpscayl(candidate) {
  const exe = DEFAULTS.upscaylBin;
  if (!fileExists(exe)) throw new Error(`Upscayl CLIが見つかりません: ${exe}`);
  if (!fs.existsSync(DEFAULTS.upscaylModels)) throw new Error(`Upscayl modelsフォルダが見つかりません: ${DEFAULTS.upscaylModels}`);

  const model = 'upscayl-standard-4x';
  const scale = '4';
  const outPath = path.join(path.dirname(candidate.filePath), `${candidate.name}_x${scale}.png`);
  log(`Upscaylアップスケール開始: ${model} / ${scale}x`);
  await runProcess(exe, [
    '-i', candidate.filePath,
    '-o', outPath,
    '-m', DEFAULTS.upscaylModels,
    '-n', model,
    '-s', scale,
    '-z', '4',
    '-f', 'png'
  ], {
    timeoutMs: 20 * 60 * 1000
  });
  addGeneratedCandidate(outPath, { derivedFrom: candidate.filePath });
  log(`Upscaylアップスケール完了: ${outPath}`);
  return outPath;
}

function addGeneratedCandidate(filePath, extra = {}) {
  if (!fileExists(filePath)) return;
  if (state.candidates.some((candidate) => samePath(candidate.filePath, filePath))) return;
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
  let mediaInfo = {};
  try {
    mediaInfo = importer && importer.probeMedia ? importer.probeMedia(filePath, DEFAULTS.ffprobe) : {};
  } catch (_) {
    mediaInfo = {};
  }
  state.candidates.push({
    filePath,
    name: path.basename(filePath, path.extname(filePath)),
    ext,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    width: mediaInfo.width || 0,
    height: mediaInfo.height || 0,
    duration: mediaInfo.duration || 0,
    selected: true,
    imported: false,
    upscaled: false,
    generationMode: isAudioCandidateExt(ext) ? 'audio' : (ext === 'mp4' ? 'video' : 'image'),
    videoResolutionIntent: ext === 'mp4' && state.mode === 'video' ? els.videoResolution.value : '',
    upscaleResult: false,
    ...extra
  });
  renderCandidates();
}

async function chooseLibrary() {
  if (!window.eagle || !eagle.dialog) throw new Error('Eagleダイアログが使えません。');
  const result = await eagle.dialog.showOpenDialog({
    title: '保存先Eagleライブラリを選択',
    defaultPath: getTargetLibraryPath() || undefined,
    properties: ['openDirectory']
  });
  const selected = result && result.filePaths && result.filePaths[0];
  if (selected) {
    addLibraryOption(selected, path.basename(selected));
    renderLibrarySelect(selected);
    await loadFolderOptionsForTarget();
    persistSettings();
    log(`保存先ライブラリを変更しました: ${selected}`);
  }
}

async function refreshActiveLibrary() {
  if (window.eagle && eagle.library) {
    state.activeLibraryPath = eagle.library.path || '';
    els.activeLibrary.textContent = state.activeLibraryPath ? path.basename(state.activeLibraryPath) : '不明';
    addLibraryOption(state.activeLibraryPath, `現在: ${eagle.library.name || path.basename(state.activeLibraryPath)}`);
  } else {
    state.activeLibraryPath = '';
    els.activeLibrary.textContent = 'Eagle外';
  }
  if (state.settings.targetLibraryPath) {
    addLibraryOption(state.settings.targetLibraryPath, path.basename(state.settings.targetLibraryPath));
  }
  renderLibrarySelect(state.activeLibraryPath || state.settings.targetLibraryPath || DEFAULTS.targetLibrary);
  const preferredFolderId = samePath(getTargetLibraryPath(), state.settings.targetLibraryPath)
    ? state.settings.targetFolderId || ''
    : '';
  await loadFolderOptionsForTarget(preferredFolderId);
}

async function closePluginWindow() {
  try {
    if (window.eagle && eagle.window) {
      if (typeof eagle.window.close === 'function') {
        await Promise.resolve(eagle.window.close());
        return;
      }
      if (typeof eagle.window.hide === 'function') {
        await Promise.resolve(eagle.window.hide());
        return;
      }
    }
    window.close();
  } catch (error) {
    showError(error);
  }
}

function bindEvents() {
  if (state.eventsBound) return;
  state.eventsBound = true;
  els.modeImage.addEventListener('click', () => setMode('image'));
  els.modeVideo.addEventListener('click', () => setMode('video'));
  els.modeVoice.addEventListener('click', () => setMode('voice'));
  els.loadSelectionBtn.addEventListener('click', () => loadEagleSelection().catch(showError));
  els.addFilesBtn.addEventListener('click', () => addFilesViaDialog().catch(showError));
  els.fileInput.addEventListener('change', (event) => {
    addFilePaths(Array.from(event.target.files || []).map((file) => file.path).filter(Boolean));
    event.target.value = '';
  });
  ['dragenter', 'dragover'].forEach((type) => {
    els.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.dropZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    els.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (type === 'drop') {
        addFilePaths(extractDroppedPaths(event.dataTransfer || {}));
      }
      els.dropZone.classList.remove('dragover');
    });
  });
  els.stageBtn.addEventListener('click', () => stageReferences().catch(showError));
  els.clearRefsBtn.addEventListener('click', () => {
    state.references = [];
    state.stagedDir = '';
    state.stagedManifest = null;
    els.stagingStatus.textContent = '未作成';
    els.stagingPath.textContent = '';
    renderRefs();
    buildPrompt();
    log('参照素材をクリアしました。');
  });
  els.refs.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Number(button.dataset.index);
    if (button.dataset.action === 'remove-ref') {
      removeReferenceAt(index);
    }
    if (button.dataset.action === 'insert-ref-token') {
      insertAtCursor(els.userIntent, `@${index + 1}`);
    }
  });
  els.buildPromptBtn.addEventListener('click', () => {
    buildPrompt();
    log('プロンプトを作成しました。');
  });
  els.optimizePromptBtn.addEventListener('click', () => optimizePrompt().catch(showError));
  els.copyPromptBtn.addEventListener('click', () => copyPrompt().catch(showError));
  els.runGrokBuildBtn.addEventListener('click', () => {
    const runner = state.mode === 'voice' ? runVoiceReadGeneration : runGrokBuildGeneration;
    runner().catch(showError);
  });
  els.retryVideoBtn.addEventListener('click', () => runGrokBuildGeneration({ retry: true }).catch(showError));
  els.chooseSeedAudioBtn.addEventListener('click', () => chooseVoiceSeedAudio().catch(showError));
  els.clearSeedAudioBtn.addEventListener('click', () => clearVoiceSeed());
  els.voiceProfileSelect.addEventListener('change', () => {
    applyVoiceProfile(els.voiceProfileSelect.value);
  });
  els.saveSeedVoiceProfileBtn.addEventListener('click', () => {
    try {
      saveCurrentSeedVoiceProfile();
    } catch (error) {
      showError(error);
    }
  });
  els.refreshVoiceProfilesBtn.addEventListener('click', () => {
    loadVoiceProfiles();
    log('ボイスプリセットを再読込しました。');
  });
  els.voiceSeedInput.addEventListener('change', (event) => {
    const file = (event.target.files || [])[0];
    if (file) setVoiceSeedFromFile(file).catch(showError);
    event.target.value = '';
  });
  ['dragenter', 'dragover'].forEach((type) => {
    els.voiceSeedDropZone.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.voiceSeedDropZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    els.voiceSeedDropZone.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (type === 'drop') {
        setVoiceSeedFromDrop(event.dataTransfer || {}).catch(showError);
      }
      els.voiceSeedDropZone.classList.remove('dragover');
    });
  });
  els.voiceText.addEventListener('input', () => {
    buildVoicePromptPreview();
    updateVoiceTextWarning();
    updateGenerateButtonState();
    persistSettings();
  });
  els.voiceText.addEventListener('change', () => {
    buildVoicePromptPreview();
    updateVoiceTextWarning();
    updateGenerateButtonState();
    persistSettings();
  });
  els.voiceDirection.addEventListener('input', () => {
    buildVoicePromptPreview();
    updateGenerateButtonState();
  });
  els.voiceDirection.addEventListener('change', () => {
    buildVoicePromptPreview();
    updateGenerateButtonState();
    persistSettings();
  });
  els.voiceName.addEventListener('input', persistSettings);
  els.voiceName.addEventListener('change', persistSettings);
  els.voicePreset.addEventListener('change', () => {
    persistSettings();
    updateGenerateButtonState();
  });
  els.addScriptRowBtn.addEventListener('click', () => addScriptRow());
  els.scriptPresetSelect.addEventListener('change', () => {
    const preset = SCRIPT_PRESETS.find((entry) => entry.id === els.scriptPresetSelect.value);
    if (preset) addScriptRow(scriptPresetToRow(preset));
    els.scriptPresetSelect.value = '';
  });
  els.scriptRows.addEventListener('input', (event) => {
    const target = event.target.closest('[data-script-field]');
    if (target) updateScriptRowField(target);
  });
  els.scriptRows.addEventListener('change', (event) => {
    const target = event.target.closest('[data-script-field]');
    if (target) updateScriptRowField(target);
  });
  els.scriptRows.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action="remove-script-row"]');
    if (target) removeScriptRow(target.dataset.index);
  });
  els.openStagingBtn.addEventListener('click', () => {
    if (!state.stagedDir) return showError(new Error('参照ファイルの内部準備フォルダがまだありません。'));
    return openPath(state.stagedDir).catch(showError);
  });
  els.copyFilesBtn.addEventListener('click', () => copyStagedFiles().catch(showError));
  els.armWatchBtn.addEventListener('click', () => {
    try { armDownloadsWatch(); } catch (error) { showError(error); }
  });
  els.stopWatchBtn.addEventListener('click', stopDownloadsWatch);
  els.scanNowBtn.addEventListener('click', () => scanDownloads(true).catch(showError));
  els.chooseLibraryBtn.addEventListener('click', () => chooseLibrary().catch(showError));
  els.refreshFoldersBtn.addEventListener('click', () => loadFolderOptionsForTarget().catch(showError));
  els.targetLibrarySelect.addEventListener('change', () => {
    persistSettings();
    loadFolderOptionsForTarget('').catch(showError);
  });
  els.targetFolderSelect.addEventListener('change', persistSettings);
  els.dryRunImportBtn.addEventListener('click', () => importSelectedCandidates(true).catch(showError));
  els.importSelectedBtn.addEventListener('click', () => importSelectedCandidates(false).catch(showError));
  els.candidateList.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const failureIndex = Number(target.dataset.failureIndex);
    if (Number.isInteger(failureIndex) && failureIndex >= 0) {
      const failure = (state.failedResults || [])[failureIndex];
      if (!failure) return;
      const action = target.dataset.action;
      if (action === 'retry-failure') {
        els.finalPrompt.value = failure.retryPrompt || failure.prompt || els.finalPrompt.value;
        runGrokBuildGeneration({ retry: true }).catch(showError);
      }
      if (action === 'copy-failure-prompt') {
        copyText(failure.retryPrompt || failure.prompt || '').then(() => log('Failure prompt copied to clipboard.')).catch(showError);
      }
      if (action === 'show-failure-log') {
        const logPath = (failure.logPaths || [])[0];
        if (logPath) openPath(logPath).catch(showError);
      }
      if (action === 'remove-failure') {
        state.failedResults.splice(failureIndex, 1);
        renderCandidates();
      }
      return;
    }
    const index = Number(target.dataset.index);
    const candidate = state.candidates[index];
    if (!candidate) return;
    const action = target.dataset.action;
    if (action === 'show-candidate') openPath(candidate.filePath).catch(showError);
    if (action === 'import-candidate') importCandidate(candidate, false).catch(showError);
    if (action === 'upscale-candidate') upscaleCandidate(candidate).catch(showError);
    if (action === 'save-voice-profile') {
      try {
        saveCandidateVoiceProfile(candidate);
      } catch (error) {
        showError(error);
      }
    }
    if (action === 'remove-candidate') {
      state.candidates.splice(index, 1);
      renderCandidates();
    }
  });
  els.candidateList.addEventListener('change', (event) => {
    const target = event.target.closest('[data-action="toggle-candidate"]');
    if (!target) return;
    const candidate = state.candidates[Number(target.dataset.index)];
    if (candidate) candidate.selected = target.checked;
  });
  els.clearLogBtn.addEventListener('click', () => { els.log.textContent = ''; });
  els.closeBtn.addEventListener('click', () => closePluginWindow());
  els.minimizeBtn.addEventListener('click', () => {
    if (window.eagle && eagle.window && eagle.window.minimize) {
      Promise.resolve(eagle.window.minimize()).catch(showError);
    }
  });

  [
    els.downloadsPath, els.grokWebUrl,
    els.grokCliPath, els.optimizerBackend, els.imageAspect, els.imageResolution,
    els.editStrength, els.imageCount, els.videoResolution, els.videoDuration,
    els.videoUpscale, els.cameraMotion, els.dialogueTimeline, els.userIntent
  ].forEach((element) => {
    element.addEventListener('change', () => {
      if (element === els.videoDuration) {
        state.scriptRows = state.scriptRows.map((row) => normalizeScriptRow(row));
        renderScriptRows();
      }
      persistSettings();
      if (element === els.optimizerBackend) updateOptimizerModelName();
      if (element === els.videoUpscale) renderCandidates();
      if (element !== els.userIntent) buildPrompt();
    });
    element.addEventListener('input', () => {
      if (element === els.userIntent || element === els.dialogueTimeline) buildPrompt();
    });
  });
}

async function init() {
  if (state.initialized || state.initializing) return;
  state.initializing = true;
  try {
    cacheDom();
    populateScriptPresetSelect();
    moveReferencePanelUnderModeSpec();
    bindWatermarkLayout();
    bindEvents();
    loadSettings();
    loadVoiceProfiles();
    loadUsage();
    loadModerationEvents();
    await refreshActiveLibrary();
    await autoLoadInitialSelection();
    renderModeSpec();
    renderRefs();
    renderCandidates();
    buildPrompt();
    scheduleWatermarkLayout();
    state.initialized = true;
    log('API-free Grok Imagine Studioを起動しました。');
    if (!executableLooksConfigured(DEFAULTS.grokCli)) {
      log(`Grok CLIが見つかりません。Grok最適化とGrok Build生成は実行できません: ${DEFAULTS.grokCli}`, 'warn');
    }
  } finally {
    state.initializing = false;
  }
}

function boot() {
  init().catch((error) => {
    console.error(error);
    try {
      const status = document.getElementById('statusPill');
      if (status) status.textContent = `初期化エラー: ${error.message}`;
    } catch (_) {
      // Ignore secondary UI failures while reporting the original error.
    }
  });
}

if (window.eagle && eagle.onPluginCreate) {
  eagle.onPluginCreate(() => boot());
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
