# Development Handoff

This file is public-safe. It intentionally avoids private paths, local account names, generated media, private logs, and original working-history details.

## Current Public Scope

- Plugin ID: `eagle-grok-imagine-studio`
- Status: first public debugging build
- Target runtime: Eagle 4.0 plugin window
- Generation route: user's own Grok CLI / Grok Build environment
- Prompt optimization routes:
  - Grok CLI
  - Eagle AI SDK default chat model
- Optional narration route: user's own Aratako/Irodori-TTS checkout or compatible wrapper

The plugin is API-free from the repository perspective: it does not ship an xAI/Grok direct API integration, billing flow, or login material.

## Publicization Rules

- Do not publish this repository's original private history.
- Publish from a sanitized candidate tree only.
- Keep `agent-tools/`, `mcps/`, local NotebookLM notes, generated media, logs, temp files, and private release reports out of public output.
- Keep `.env` and real local config files ignored.
- Include only placeholder examples such as `.env.example` and `config.example.json`.
- Do not add user-specific Eagle library paths or local executable paths to defaults.
- Never commit runtime logs, `job_request.json`, `job_result.json`, `moderation-errors.jsonl`, or metadata exported from an Eagle library. If any of these appear in a release diff, stop and remove them before continuing.

## Debugging Status

This release is for early debugging. Prefer mocked or non-consuming checks before real generation:

```powershell
node .\scripts\smoke-moderation.js
node .\scripts\smoke-runprocess.js
node .\scripts\smoke-ui.js
node .\scripts\smoke-eagle-runtime.js
```

Optional checks when dependencies are installed:

```powershell
node .\scripts\smoke-dependencies.js
node .\scripts\smoke-browser-server.js 8787
```

Then open `http://127.0.0.1:8787/index.html` and inspect `codexSmokeResult`.

## Real-World Smoke Checklist

1. Open Eagle with a small test library.
2. Select one or two non-sensitive reference images.
3. Open `Grok Imagine Studio`.
4. Confirm references appear in the expected order.
5. Build a prompt without running generation.
6. If the user's Grok quota allows it, run one image generation.
7. Register the generated result into the test Eagle library.
8. Confirm no real local config, login material, or generated logs are committed.

## Known Constraints

- Grok quota and current Grok Build behavior are external and may change.
- Eagle Plugin API behavior should be checked inside the actual Eagle app, not only through browser mocks.
- Irodori-TTS integration requires the user to install and configure Irodori-TTS separately.
- The plugin code and documentation are published under the MIT License. Third-party tools, services, models, and binaries keep their own terms.
