# Public Config Requirements

This public project does not include real login/session data, private local settings, generated media, or the author's machine-specific paths.

This plugin itself does not require `XAI_API_KEY` or another direct API key. It calls the user's own logged-in/configured Grok CLI / Grok Build environment and does not implement direct xAI API calls.

## Required Local Tools

- Eagle 4.0 or later.
- Grok CLI / Grok Build, available as `grok` on PATH.
- FFmpeg / FFprobe, available as `ffmpeg` and `ffprobe` on PATH.

## Optional Local Tools

- Aratako/Irodori-TTS for narration assistance.
- Eagle browser extensions for collecting web assets before using this plugin.
- Upscayl CLI for optional local image upscale, if the user's platform supports it.

## Local Environment Variables

- `GROK_CLI_COMMAND`: command name or executable path for Grok CLI. Defaults to `grok`.
- `FFMPEG_PATH`: command name or executable path for FFmpeg. Defaults to `ffmpeg`.
- `FFPROBE_PATH`: command name or executable path for FFprobe. Defaults to `ffprobe`.
- `UPSCAYL_BIN`: optional Upscayl executable path for image upscale.
- `UPSCAYL_MODELS`: optional Upscayl model folder path for image upscale.
- `IRODORI_TTS_ROOT`: points to a local Aratako/Irodori-TTS checkout that contains `infer.py`.
- `IRODORI_VOICE_READ_RUNNER`: points to a compatible wrapper script. If set, this is used before `IRODORI_TTS_ROOT`.

## Local Files To Keep Private

- `.env`
- local config files containing real paths
- Grok/Eagle/Irodori runtime state
- generated media
- work logs and JSONL logs
- Eagle libraries and their backups
- private release reports

## Dry-Run Guidance

Run non-consuming smoke checks before using real Grok generation:

```powershell
node .\scripts\smoke-moderation.js
node .\scripts\smoke-runprocess.js
node .\scripts\smoke-ui.js
node .\scripts\smoke-eagle-runtime.js
```

Use a small temporary Eagle library for the first real save test.
