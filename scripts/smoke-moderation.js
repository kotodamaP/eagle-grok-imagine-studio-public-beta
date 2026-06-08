const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const pluginPath = path.join(root, 'js', 'plugin.js');
const source = fs.readFileSync(pluginPath, 'utf8');
const smokeBase = path.join(root, '.smoke-tmp');
fs.rmSync(smokeBase, { recursive: true, force: true });
fs.mkdirSync(smokeBase, { recursive: true });
const mockOs = { ...os, tmpdir: () => smokeBase };

function element(initialValue = '') {
  const node = {
    value: initialValue,
    textContent: '',
    title: '',
    disabled: false,
    classList: { toggle() {}, contains() { return false; }, add() {}, remove() {} },
    style: { setProperty() {} },
    addEventListener() {},
    children: [],
    appendChild(child) { this.children.push(child); },
    closest() { return null; },
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
  require(moduleName) {
    if (moduleName === 'os') return mockOs;
    return require(moduleName);
  },
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
globalThis.__runModerationScenario = async function(config) {
  const fs = require('fs');
  const path = require('path');
  const tempRoot = config.tempRoot;
  const stagedDir = path.join(tempRoot, 'job-' + config.name);
  const outputDir = path.join(stagedDir, 'grok-build-output');
  const refPath = path.join(stagedDir, config.mode === 'video' ? '01-ref.png' : '01-ref.png');
  const generatedPath = path.join(outputDir, config.mode === 'video' ? 'generated.mp4' : 'generated.png');
  const fakeGrokExe = path.join(tempRoot, 'grok.exe');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(refPath, 'ref');
  fs.writeFileSync(fakeGrokExe, 'fake');

  Object.assign(els, {
    runGrokBuildBtn: element(),
    retryVideoBtn: element(),
    grokCliPath: element(fakeGrokExe),
    stagingStatus: element(),
    stagingPath: element(),
    finalPrompt: element(config.mode === 'video' ? 'Generate a safe short video with @1.' : 'Create a tasteful portrait with @1.'),
    optimizerStatus: element('Grok CLI最適化済み'),
    videoResolution: element(config.videoResolution || '720p'),
    videoDuration: element('6'),
    videoUpscale: element('none'),
    imageAspect: element('auto'),
    imageResolution: element('1k'),
    imageCount: element('1'),
    editStrength: element('medium'),
    userIntent: element(config.mode === 'video' ? 'Generate a safe short video with @1.' : 'Create a tasteful portrait with @1.'),
    downloadsPath: element(tempRoot),
    candidateList: element(),
    usageDateText: element(),
    usageText: element(),
    usageImageCount: element(),
    usageVideo480Count: element(),
    usageVideo720Count: element(),
    refCount: element(),
    refs: element(),
    refHint: element(),
    stageBtn: element(),
    log: element(),
    statusPill: element()
  });
  state.mode = config.mode;
  state.references = [{
    filePath: refPath,
    stagedPath: refPath,
    name: 'ref',
    ext: 'png',
    size: 3,
    tags: config.tags || ['portrait'],
    width: 512,
    height: 512
  }];
  state.stagedDir = stagedDir;
  state.candidates = [];
  state.failedResults = [];
  state.usage = { imageUsed: 0, video480Used: 0, video720Used: 0, date: todayUsageKey(), events: [] };
  state.moderationEvents = [];
  ensureOptimizedPromptForGeneration = async function() { return els.finalPrompt.value; };

  let calls = 0;
  runGrokBuildCommand = async function(_exe, prompt) {
    calls += 1;
    if (calls === 1) return { stdout: 'content policy blocked by moderation safety system', stderr: '' };
    if (!prompt.includes('Moderation-safe retry constraints:')) throw new Error('retry prompt did not include safety constraints');
    if (config.retryBlocks) return { stdout: 'blocked by moderation policy on retry', stderr: '' };
    fs.writeFileSync(generatedPath, 'generated');
    return { stdout: generatedPath, stderr: '' };
  };

  let thrown = '';
  try {
    await runGrokBuildGeneration();
  } catch (error) {
    thrown = error && error.message ? error.message : String(error);
  }

  const aggregateLog = path.join(require('os').tmpdir(), PLUGIN_ID, MODERATION_LOG_FILE);
  const jobLog = path.join(stagedDir, MODERATION_LOG_FILE);
  const readJsonl = (filePath) => fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8').trim().split(/\\r?\\n/).filter(Boolean).map((line) => JSON.parse(line))
    : [];

  return {
    name: config.name,
    mode: config.mode,
    retryBlocks: Boolean(config.retryBlocks),
    calls,
    thrown,
    aggregateExists: fs.existsSync(aggregateLog),
    jobExists: fs.existsSync(jobLog),
    aggregateEntries: readJsonl(aggregateLog),
    jobEntries: readJsonl(jobLog),
    candidates: state.candidates.map((candidate) => ({ filePath: candidate.filePath, mode: candidate.generationMode, videoResolutionIntent: candidate.videoResolutionIntent })),
    failedResults: state.failedResults.map((failure) => ({
      fingerprint: failure.fingerprint,
      mode: failure.mode,
      retryPlanned: failure.retryPlanned,
      categories: failure.categories,
      logPaths: failure.logPaths,
      prompt: failure.prompt,
      retryPrompt: failure.retryPrompt
    })),
    renderedFailureCards: els.candidateList.children.filter((child) => String(child.innerHTML || '').includes('Moderation blocked')).length,
    finalPrompt: els.finalPrompt.value,
    moderationEvents: state.moderationEvents,
    logText: els.log.textContent
  };
};
`;

vm.createContext(sandbox);
vm.runInContext(`${source}\n${smoke}`, sandbox, { filename: pluginPath });

async function main() {
  const scenarios = [
    { name: 'image-retry-success', mode: 'image', retryBlocks: false, tempRoot: fs.mkdtempSync(path.join(smokeBase, 'image-')) },
    { name: 'video-retry-success', mode: 'video', retryBlocks: false, videoResolution: '480p', tempRoot: fs.mkdtempSync(path.join(smokeBase, 'video-')) },
    { name: 'image-retry-blocked', mode: 'image', retryBlocks: true, tempRoot: fs.mkdtempSync(path.join(smokeBase, 'blocked-')) }
  ];
  const results = [];
  for (const scenario of scenarios) {
    results.push(await sandbox.__runModerationScenario(scenario));
  }

  const failures = [];
  for (const result of results) {
    if (result.calls !== 2) failures.push(`${result.name}: expected 2 Grok calls, got ${result.calls}`);
    if (!result.aggregateExists) failures.push(`${result.name}: aggregate moderation log was not written`);
    if (!result.jobExists) failures.push(`${result.name}: job moderation log was not written`);
    const expectedEntries = result.retryBlocks ? 2 : 1;
    if (result.jobEntries.length !== expectedEntries) failures.push(`${result.name}: expected ${expectedEntries} job moderation events, got ${result.jobEntries.length}`);
    if (!result.jobEntries[0] || result.jobEntries[0].retryPlanned !== true) failures.push(`${result.name}: first event did not mark retryPlanned=true`);
    if (result.aggregateEntries.length < expectedEntries) failures.push(`${result.name}: aggregate log did not retain expected event count`);
    if (!result.finalPrompt.includes('Moderation-safe retry constraints:')) failures.push(`${result.name}: final prompt did not retain retry constraints`);
    if (!result.moderationEvents.length) failures.push(`${result.name}: localStorage moderation summary was not updated`);
    if (!result.failedResults.length) failures.push(`${result.name}: moderation failure card state was not recorded`);
    if (result.renderedFailureCards !== expectedEntries) failures.push(`${result.name}: expected ${expectedEntries} rendered failure cards, got ${result.renderedFailureCards}`);
    for (const [index, entry] of result.jobEntries.entries()) {
      const label = `${result.name}: event ${index + 1}`;
      if (entry.type !== 'moderation_error') failures.push(`${label}: type was not moderation_error`);
      if (entry.mode !== result.mode) failures.push(`${label}: mode mismatch`);
      if (!Number.isInteger(entry.attempt) || entry.attempt < 1) failures.push(`${label}: attempt was not a positive integer`);
      if (!entry.at || Number.isNaN(Date.parse(entry.at))) failures.push(`${label}: at was not an ISO timestamp`);
      if (!Array.isArray(entry.categories) || !entry.categories.length) failures.push(`${label}: categories were not recorded`);
      if (!entry.options || typeof entry.options !== 'object') failures.push(`${label}: generation options were not recorded`);
      if (!entry.userIntent) failures.push(`${label}: userIntent was not recorded`);
      if (!entry.prompt) failures.push(`${label}: prompt was not recorded`);
      if (!entry.errorText || !/moderation|policy|safety/i.test(entry.errorText)) failures.push(`${label}: errorText did not retain moderation text`);
      if (!Array.isArray(entry.references) || entry.references.length !== 1) failures.push(`${label}: reference snapshot was not recorded`);
      if (entry.references && entry.references[0] && entry.references[0].refMarker !== '@1') failures.push(`${label}: reference marker was not @1`);
      if (entry.references && entry.references[0] && !entry.references[0].fileName) failures.push(`${label}: reference fileName was empty`);
    }
    const firstEvent = result.jobEntries[0] || {};
    if (!firstEvent.retryPrompt || !firstEvent.retryPrompt.includes('Moderation-safe retry constraints:')) {
      failures.push(`${result.name}: first event did not retain retry prompt constraints`);
    }
    const firstSummary = result.moderationEvents[0] || {};
    if (!firstSummary.promptLength || firstSummary.promptLength < 10) failures.push(`${result.name}: localStorage summary did not record promptLength`);
    if (!result.logText.includes('Moderation trend summary')) failures.push(`${result.name}: log did not include moderation trend summary`);
    if (result.retryBlocks) {
      if (result.failedResults.length !== 2) failures.push(`${result.name}: retry-blocked scenario should retain two distinct failure cards`);
      if (!result.thrown.includes('Moderation retry was also blocked')) failures.push(`${result.name}: retry block did not surface expected error`);
      if (!result.jobEntries[1] || result.jobEntries[1].retryPlanned !== false) failures.push(`${result.name}: second event did not mark retryPlanned=false`);
      if (result.jobEntries[1] && result.jobEntries[1].retryPrompt) failures.push(`${result.name}: blocked retry event should not include another retry prompt`);
      if (result.candidates.length !== 0) failures.push(`${result.name}: blocked retry should not add candidates`);
    } else {
      if (result.failedResults.length !== 1) failures.push(`${result.name}: retry-success scenario should retain the first moderation failure card`);
      if (result.thrown) failures.push(`${result.name}: unexpected throw: ${result.thrown}`);
      if (result.candidates.length !== 1) failures.push(`${result.name}: generated candidate was not detected after retry`);
      if (result.mode === 'video' && (result.candidates[0].mode !== 'video' || result.candidates[0].videoResolutionIntent !== '480p')) {
        failures.push(`${result.name}: video candidate metadata was not preserved`);
      }
      if (result.mode === 'image' && result.candidates[0].mode !== 'image') failures.push(`${result.name}: image candidate metadata was not preserved`);
    }
  }

  const duplicateResult = await sandbox.__runModerationScenario({
    name: 'image-retry-success-duplicate',
    mode: 'image',
    retryBlocks: false,
    tempRoot: fs.mkdtempSync(path.join(smokeBase, 'image-dupe-'))
  });
  const duplicateFingerprint = duplicateResult.jobEntries[0] && duplicateResult.jobEntries[0].fingerprint;
  const duplicateAggregateCount = duplicateResult.aggregateEntries.filter((entry) => entry.fingerprint === duplicateFingerprint).length;
  if (duplicateAggregateCount !== 1) failures.push(`duplicate prompt: aggregate log retained ${duplicateAggregateCount} copies for one fingerprint`);
  if (duplicateResult.moderationEvents.length !== 1) failures.push('duplicate prompt: local moderation history should contain one deduped summary');
  if (duplicateResult.failedResults.length !== 1) failures.push('duplicate prompt: failed result cards should stay deduped at one card');

  if (failures.length) {
    console.error(JSON.stringify({ ok: false, failures, results, duplicateResult }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    scenarios: results.map((result) => ({
      name: result.name,
      calls: result.calls,
      jobEntries: result.jobEntries.length,
      aggregateEntries: result.aggregateEntries.length,
      categories: result.jobEntries.map((entry) => entry.categories),
      failedResults: result.failedResults.length,
      renderedFailureCards: result.renderedFailureCards,
      candidates: result.candidates,
      thrown: result.thrown
    })),
    duplicatePrompt: {
      aggregateEntries: duplicateResult.aggregateEntries.length,
      moderationEvents: duplicateResult.moderationEvents.length,
      failedResults: duplicateResult.failedResults.length
    }
  }, null, 2));
}

main()
  .then(() => fs.rmSync(smokeBase, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    fs.rmSync(smokeBase, { recursive: true, force: true });
    process.exit(1);
  });
