# Eagle Grok Imagine Studio

Language:
[Japanese](README.md) | [English](README.en.md) | [Simplified Chinese](README.zh-CN.md)

<!-- section:overview -->
## Overview

Eagle Grok Imagine Studio is a personal Eagle 4.0 plugin for preparing reference images from Eagle and sending image/video generation prompts to Grok CLI / Grok Build.

This is a first public debugging build. It is not a polished extension-store release, and it expects local testing and adjustment.

This public version does not include the author's Grok login state, local settings, local paths, generated media, or work logs. Users must configure their own Grok CLI environment separately.

<!-- section:audience -->
## Audience

- Users who manage image/video generation assets in Eagle.
- Users who can configure Grok CLI / Grok Build in their own environment.
- Users who want to start with a small test library and optionally let Codex or another AI agent adjust local settings.
- Users who understand this is a first debugging build and can test it at their own risk while checking logs and results.

<!-- section:features -->
## Features

- Uses selected Eagle items or dragged images as ordered references.
- Keeps reference markers such as `@1`, `@2`, and `@3` in prompts.
- Provides work surfaces for image editing, reference-to-video, and assisted narration.
- Can try prompt optimization and generation through Grok CLI / Grok Build.
- Can use Eagle AI SDK's default chat model for local prompt optimization.
- Registers generated results into the current or selected Eagle library.
- Uses FFmpeg/FFprobe for thumbnails and video helper tasks when available.

<!-- section:requirements -->
## Requirements

- [Eagle](https://jp.eagle.cool/) 4.0 or later.
- An environment that can run Eagle Plugin API plugins. Eagle Plugin API supports web technologies, Node.js APIs, and Eagle file/folder operations.
- Grok CLI / Grok Build. The recommended setup is that `grok` can be launched from PATH.
- FFmpeg / FFprobe. The recommended setup is that `ffmpeg` and `ffprobe` can be launched from PATH.
- Optional: [Aratako/Irodori-TTS](https://github.com/Aratako/Irodori-TTS) for narration assistance.
- Optional: [Eagle browser extensions](https://jp.eagle.cool/extensions), which are separate tools for collecting web assets.

Irodori-TTS integration points to each user's local checkout. Model weights, reference audio, and personal settings are not included.

<!-- section:installation -->
## Installation

1. Get this repository.
2. Place this folder in your Eagle plugins directory.
3. Restart Eagle and open `Grok Imagine Studio` from the plugin list.
4. Confirm that Grok CLI, FFmpeg, and optional Irodori-TTS are visible through PATH or environment variables.

Do not publish a private working repository with its original history. For a public release, create a fresh public repository from a sanitized tree without private history.

### Quick Start

```powershell
git clone <PUBLIC_REPO_URL>
cd eagle-grok-imagine-studio

# These defaults are enough when the tools are available from PATH.
$env:GROK_CLI_COMMAND="grok"
$env:FFMPEG_PATH="ffmpeg"
$env:FFPROBE_PATH="ffprobe"

node .\scripts\smoke-ui.js
node .\scripts\smoke-runprocess.js
```

To use it in Eagle, place this folder in the Eagle plugins directory, restart Eagle, and open it against a small test library first. For the first run, verify reference loading and prompt creation before running real generation.

<!-- section:configuration -->
## Configuration

The public defaults do not use any specific user's paths.

- Grok CLI: the default command is `grok`; make it resolvable from PATH or set `GROK_CLI_COMMAND`.
- FFmpeg / FFprobe: defaults are `ffmpeg` / `ffprobe`; set `FFMPEG_PATH` / `FFPROBE_PATH` when needed.
- Upscayl: optional; set `UPSCAYL_BIN` / `UPSCAYL_MODELS` when image upscale is used.
- Eagle target: the plugin prefers the Eagle library that launched it.
- Local LLM: the plugin uses Eagle AI SDK's default chat model. If you ask Codex or another AI agent to adjust settings, tell it to use the model available in your own Eagle environment.
- Irodori-TTS: set `IRODORI_TTS_ROOT` to an Irodori-TTS checkout, or set `IRODORI_VOICE_READ_RUNNER` to a compatible wrapper script.

This plugin itself does not require API keys such as `XAI_API_KEY`. Grok integration calls the user's own logged-in/configured Grok CLI / Grok Build environment and does not implement direct xAI API calls.

See [public_config_requirements.md](public_config_requirements.md), [.env.example](.env.example), and [config.example.json](config.example.json).

<!-- section:usage -->
## Usage

1. Select reference images in Eagle and open the plugin.
2. Add more images by drag and drop if needed.
3. Choose image, video, or voice mode.
4. Enter intent/directing notes, then build or optimize the prompt.
5. Run Grok Build and inspect result cards.
6. Choose an Eagle library/folder and register the result.

Grok generation runs in the user's own Grok environment. Limits and terms follow each user's account and Grok's current behavior.

<!-- section:troubleshooting -->
## Troubleshooting

- Grok is not found: confirm `grok --version` works in a terminal.
- FFmpeg is not found: confirm `ffmpeg -version` and `ffprobe -version`.
- No Eagle target appears: open the plugin from inside Eagle with a library loaded.
- Irodori-TTS fails: confirm `IRODORI_TTS_ROOT` points to a folder that contains `infer.py`.
- Generated media is not detected: check the plugin temp output, Downloads, and Grok output location.

Non-consuming local tests:

```powershell
node .\scripts\smoke-moderation.js
node .\scripts\smoke-runprocess.js
node .\scripts\smoke-ui.js
node .\scripts\smoke-eagle-runtime.js
```

<!-- section:not-included -->
## What Is Not Included

- Grok login/session data or personal settings.
- Direct xAI/Grok API calls or billing flows.
- The author's local paths, Eagle libraries, work logs, or generated media.
- Irodori-TTS source tree, model weights, or reference audio.
- Eagle itself, Eagle browser extensions, Grok CLI, or FFmpeg.

<!-- section:security-privacy -->
## Security / Privacy Notice

This plugin copies user references into a local temporary folder and sends work to Grok CLI and Eagle APIs. When Grok generation is run, prompts and reference information are processed in the user's Grok environment.

Do not commit `.env`, real logs, generated media, Eagle libraries, personal settings, or work notes.

<!-- section:license -->
## License

The plugin code and documentation in this repository are released under the [MIT License](LICENSE).

The MIT License applies to the code and documentation included in this repository. It does not replace the terms for Grok, Eagle, FFmpeg, Upscayl, Irodori-TTS, models, services, or binaries used separately by each user.

<!-- section:attribution -->
## Attribution

- See official [Eagle](https://jp.eagle.cool/) and [Eagle Plugin API](https://developer.eagle.cool/plugin-api/) documentation.
- [Aratako/Irodori-TTS](https://github.com/Aratako/Irodori-TTS) is a public MIT-licensed TTS project. Check its license and model cards before using narration features.
- Follow the terms of your own Grok / xAI environment.
- FFmpeg / FFprobe, Upscayl, and Eagle browser extensions are not bundled. Users must install them separately and follow their respective licenses and terms.
- See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details.

<!-- section:disclaimer -->
## Disclaimer

This project is an experimental first debugging build for personal hobby, learning, and local testing. It is provided as-is, without warranty. The author is not responsible for generated results, external service changes, usage limits, data handling, or Eagle library registration results.

This is an unofficial personal project. It is not affiliated with, endorsed by, or sponsored by Eagle, xAI/Grok, FFmpeg, Upscayl, or Aratako/Irodori-TTS. Back up important Eagle libraries and test with a small sample first.
