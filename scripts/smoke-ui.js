const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'plugin.js'), 'utf8');

function element(initialValue = '') {
  const node = {
    value: initialValue,
    textContent: '',
    title: '',
    disabled: false,
    className: '',
    children: [],
    dataset: {},
    style: { setProperty() {} },
    classList: {
      values: new Set(),
      add(name) { this.values.add(name); },
      remove(name) { this.values.delete(name); },
      contains(name) { return this.values.has(name); },
      toggle(name, force) {
        const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
        if (enabled) this.values.add(name);
        else this.values.delete(name);
      }
    },
    addEventListener() {},
    appendChild(child) { this.children.push(child); },
    closest() { return null; },
    insertAdjacentElement() {},
    querySelectorAll() { return []; }
  };
  let html = '';
  Object.defineProperty(node, 'innerHTML', {
    get() { return html; },
    set(value) {
      html = String(value || '');
      if (!html) node.children = [];
    }
  });
  return node;
}

const sandbox = {
  console,
  element,
  require,
  setTimeout,
  clearTimeout,
  Buffer,
  navigator: {},
  localStorage: {
    store: new Map(),
    getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
    setItem(key, value) { this.store.set(key, String(value)); }
  },
  window: { innerWidth: 1200, addEventListener() {}, eagle: null },
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return element(); },
    querySelector() { return null; },
    createElement() { return element(); }
  }
};
sandbox.globalThis = sandbox;

const smoke = `
globalThis.__smoke = function() {
  Object.assign(els, {
    modeImage: element(),
    modeVideo: element(),
    modeVoice: element(),
    modeSpec: element(),
    modeSpecBadge: element(),
    modeChecklist: element(),
    imageOptions: element(),
    videoOptions: element(),
    voiceOptions: element(),
    resultUpscaleSetting: element(),
    grokPromptField: element(),
    refCount: element(),
    refs: element(),
    refHint: element(),
    stageBtn: element(),
    runGrokBuildBtn: element(),
    retryVideoBtn: element(),
    candidateList: element(),
    finalPrompt: element(),
    optimizerStatus: element(),
    userIntent: element('@1を主参照、@2を衣装参照にして、穏やかな表情にする。'),
    imageAspect: element('auto'),
    imageResolution: element('1k'),
    imageCount: element('2'),
    editStrength: element('medium'),
    videoResolution: element('720p'),
    videoDuration: element('6'),
    videoUpscale: element('none'),
    dialogueTimeline: element('0-2s: 「ここにいるよ」 close-up slow push-in'),
    scriptRows: element(),
    scriptTimingWarning: element(),
    scriptPresetSelect: element(),
    cameraMotion: element(''),
    log: element(),
    statusPill: element()
  });
  state.initialized = false;
  state.usage = { imageUsed: 0, video480Used: 0, video720Used: 0, date: todayUsageKey(), events: [] };
  state.references = [];
  setMode('image');
  const disabledWithoutRefs = els.runGrokBuildBtn.disabled === true;

  addRefs([
    { filePath: '/mock/tmp/ref1.png', stagedPath: '', name: 'ref1', ext: 'png', size: 1, tags: ['alpha'], width: 640, height: 480 },
    { filePath: '/mock/tmp/ref2.png', stagedPath: '', name: 'ref2', ext: 'png', size: 1, tags: ['beta'], width: 800, height: 600 }
  ]);
  const twoRefsRendered = els.refs.children.length === 2 && els.refCount.textContent.includes('2');
  const initialBadges = els.refs.children.map((child) => child.innerHTML.match(/@\\d/g)).flat().filter(Boolean);
  const imagePrompt = els.finalPrompt.value;

  removeReferenceAt(0);
  const afterRemoveBadges = els.refs.children.map((child) => child.innerHTML.match(/@\\d/g)).flat().filter(Boolean);
  addRefs([{ filePath: '/mock/tmp/ref3.png', stagedPath: '', name: 'ref3', ext: 'png', size: 1, tags: ['gamma'], width: 512, height: 512 }]);
  const afterAddBadges = els.refs.children.map((child) => child.innerHTML.match(/@\\d/g)).flat().filter(Boolean);

  setMode('video');
  buildPrompt();
  const videoPrompt = els.finalPrompt.value;
  return {
    disabledWithoutRefs,
    twoRefsRendered,
    initialBadges,
    afterRemoveBadges,
    afterAddBadges,
    imageButtonLabel: els.runGrokBuildBtn.textContent,
    videoButtonLabel: els.runGrokBuildBtn.textContent,
    imagePrompt,
    videoPrompt,
    retryVisible: !els.retryVideoBtn.classList.contains('hidden')
  };
};
`;

vm.createContext(sandbox);
vm.runInContext(`${source}\n${smoke}`, sandbox, { filename: path.join(root, 'js', 'plugin.js') });

const result = sandbox.__smoke();
const failures = [];
if (!result.disabledWithoutRefs) failures.push('generate button was not disabled without references');
if (!result.twoRefsRendered) failures.push('two references were not rendered');
if (!result.imagePrompt.includes('@1') || !result.imagePrompt.includes('@2')) failures.push('image prompt did not include @1 and @2');
if (!result.afterRemoveBadges.join(',').includes('@1')) failures.push('reference badge did not renumber to @1 after removal');
if (!result.afterAddBadges.join(',').includes('@1') || !result.afterAddBadges.join(',').includes('@2')) failures.push('reference badges did not remain sequential after add');
if (!result.videoPrompt.includes('Grok Imagine') || !result.videoPrompt.includes('Dialogue and camera timeline')) failures.push('video prompt did not include video prompt sections');
if (!result.videoPrompt.includes('ここにいるよ') || !result.videoPrompt.includes('close-up') || !result.videoPrompt.includes('push-in')) failures.push('video prompt did not include dialogue/camera notes');
if (!result.retryVisible) failures.push('video retry button was not visible in video mode');

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, result }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  disabledWithoutRefs: result.disabledWithoutRefs,
  twoRefsRendered: result.twoRefsRendered,
  afterRemoveBadges: result.afterRemoveBadges,
  afterAddBadges: result.afterAddBadges,
  retryVisible: result.retryVisible
}, null, 2));
