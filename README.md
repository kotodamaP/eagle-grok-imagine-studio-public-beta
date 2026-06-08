# Eagle Grok Imagine Studio

Language:
[日本語](README.md) | [English](README.en.md) | [简体中文](README.zh-CN.md)

<!-- section:overview -->
## 概要

Eagle Grok Imagine Studio は、Eagle 4.0 の選択画像を参照素材として使い、Grok CLI / Grok Build に画像生成・動画生成用のプロンプトを渡すための個人制作プラグインです。

これは開発中の一次デバッグ版です。Eagle公式ストア向けに磨き込まれた完成品ではなく、ローカル環境での検証・調整を前提にしています。

この公開版には、作者のGrokログイン情報、ローカル設定、ローカルパス、生成物、作業ログは含めません。Grokの認証やCLI設定は、利用者自身の環境で別途用意してください。

![Grok Imagine Studio voice read screen](docs/images/grok-imagine-studio-voice-read.png)

<!-- section:audience -->
## 対象ユーザー

- Eagleで画像・動画生成素材を管理している人。
- Grok CLI / Grok Buildを自分の環境で設定できる人。
- まずは小さなテストライブラリで検証し、必要に応じてCodexなどのAIエージェントに設定調整を任せたい人。
- 完成品ではなく一次デバッグ版として、ログや結果を見ながら自己責任で試せる人。

<!-- section:features -->
## 機能

- Eagleで選択した画像、またはドラッグした画像を参照素材として並べます。
- `@1`, `@2`, `@3` のような参照番号をプロンプトへ反映します。
- 画像編集、参照画像から動画、音声ナレーション補助の作業面を提供します。
- Grok CLIを使ったプロンプト最適化とGrok Build生成を試せます。
- Eagle AI SDKのデフォルトチャットモデルを使うローカル最適化モードもあります。
- 生成結果をEagleの現在のライブラリまたは選択したライブラリへ登録できます。
- FFmpegが利用できる場合、動画サムネイルや動画アップスケール補助に使います。

<!-- section:requirements -->
## 前提

- [Eagle](https://jp.eagle.cool/) 4.0 以降。
- Eagle Plugin API が利用できる環境。EagleのPlugin APIはWeb技術、Node.js API、Eagle内のファイル・フォルダ操作を利用できます。
- Grok CLI / Grok Build。CLIは `grok` としてPATHから起動できる状態を推奨します。
- FFmpeg / FFprobe。PATHから `ffmpeg` と `ffprobe` を起動できる状態を推奨します。
- 任意: [Aratako/Irodori-TTS](https://github.com/Aratako/Irodori-TTS)。音声ナレーション補助を使う場合だけ必要です。
- 任意: [Eagleブラウザ拡張機能](https://jp.eagle.cool/extensions)。Web上の素材収集を助ける別ツールであり、このプラグイン本体とは別に導入します。

Irodori-TTS連携は、公開版では各ユーザーのローカルcheckoutを参照します。モデル重み、参照音声、個人の設定は含まれません。

<!-- section:installation -->
## インストール

1. このリポジトリを取得します。
2. Eagleのプラグインフォルダへ、このフォルダを配置します。
3. Eagleを再起動し、プラグイン一覧から `Grok Imagine Studio` を開きます。
4. Grok CLI、FFmpeg、任意のIrodori-TTSがPATHまたは環境変数から見えることを確認します。

このリポジトリをそのまま公開前の作業履歴ごと共有しないでください。公開するときは、履歴を含まないサニタイズ済みツリーから新しい公開リポジトリを作る想定です。

### クイックスタート

```powershell
git clone <PUBLIC_REPO_URL>
cd eagle-grok-imagine-studio

# PATHから起動できる場合はこのままでOKです。
$env:GROK_CLI_COMMAND="grok"
$env:FFMPEG_PATH="ffmpeg"
$env:FFPROBE_PATH="ffprobe"

node .\scripts\smoke-ui.js
node .\scripts\smoke-runprocess.js
```

初めて導入する場合は、このREADMEと `public_config_requirements.md` をCodexに読ませて、インストール手順と設定調整を案内してもらうのがおすすめです。その場合も、Grok CLI、FFmpeg、Eagle AI SDKのモデルなどは利用者自身の環境にあるものを参照させてください。このプラグイン自体にAPIキーを追加する必要はありません。

Eagleで使う場合は、このフォルダをEagleのプラグインフォルダへ配置し、Eagleを再起動してから小さなテストライブラリで開いてください。初回は実生成ではなく、参照画像の読み込みとプロンプト作成だけ確認するのがおすすめです。

<!-- section:configuration -->
## 設定

公開版の初期値は、特定ユーザーのパスを使いません。

- Grok CLI: 既定は `grok` です。PATHで解決できるようにするか、`GROK_CLI_COMMAND` で明示します。
- FFmpeg / FFprobe: 既定は `ffmpeg` / `ffprobe` です。必要なら `FFMPEG_PATH` / `FFPROBE_PATH` で明示します。
- Upscayl: 任意機能です。必要なら `UPSCAYL_BIN` / `UPSCAYL_MODELS` を指定します。
- Eagle保存先: プラグインを起動した現在のEagleライブラリを優先します。
- ローカルLLM: Eagle AI SDKのデフォルトチャットモデルを使います。CodexなどのAIエージェントに設定調整を任せる場合も、利用者自身のEagle環境にあるモデルを参照させてください。
- Irodori-TTS: 音声連携を使う場合、`IRODORI_TTS_ROOT` にIrodori-TTS checkoutを指定するか、`IRODORI_VOICE_READ_RUNNER` に互換ラッパースクリプトを指定します。

このプラグイン自体に `XAI_API_KEY` などのAPIキーは不要です。Grok連携は利用者自身がログイン・設定済みのGrok CLI / Grok Buildを呼び出す前提で、直接xAI APIを呼ぶ設計ではありません。

詳しくは [public_config_requirements.md](public_config_requirements.md)、[.env.example](.env.example)、[config.example.json](config.example.json) を見てください。

<!-- section:usage -->
## 使い方

1. Eagleで参照したい画像を選択してプラグインを開きます。
2. 必要なら画像をドラッグして追加します。
3. 画像編集、動画、音声のモードを選びます。
4. 意図や演出を入力し、プロンプトを作成または最適化します。
5. Grok Buildで生成し、結果カードを確認します。
6. 保存先ライブラリとフォルダを選び、Eagleへ登録します。

Grok生成は利用者自身のGrok環境で実行されます。回数制限や利用条件は、各自の契約・アカウント・Grok側の仕様に従ってください。

<!-- section:troubleshooting -->
## トラブルシューティング

- Grokが見つからない: `grok --version` がターミナルで動くか確認してください。
- FFmpegが見つからない: `ffmpeg -version` と `ffprobe -version` を確認してください。
- Eagleの保存先が出ない: Eagle内からプラグインを開き、現在のライブラリが読み込まれているか確認してください。
- Irodori-TTSが動かない: `IRODORI_TTS_ROOT` が `infer.py` を含むフォルダを指しているか確認してください。
- 生成物が検出されない: プラグイン内の一時出力、Downloads、Grok側の出力先を確認してください。

ローカル非消費テスト:

```powershell
node .\scripts\smoke-moderation.js
node .\scripts\smoke-runprocess.js
node .\scripts\smoke-ui.js
node .\scripts\smoke-eagle-runtime.js
```

<!-- section:not-included -->
## 含まれないもの

- Grokのログイン情報、セッション、個人設定。
- xAI/Grokの直接API呼び出しや課金フロー。
- 作者のローカルパス、Eagleライブラリ、作業ログ、生成物。
- Irodori-TTS本体、モデル重み、参照音声。
- Eagle本体、Eagleブラウザ拡張機能、Grok CLI、FFmpeg。

<!-- section:security-privacy -->
## セキュリティ / プライバシー

この公開版は、利用者の参照画像をローカル一時フォルダへコピーし、Grok CLIやEagle APIへ処理を渡します。Grok生成を行う場合、プロンプトや参照情報が利用者のGrok環境で処理されます。

公開リポジトリへ `.env`、実ログ、生成物、Eagleライブラリ、個人用設定、作業メモを含めないでください。

<!-- section:license -->
## ライセンス

このリポジトリ内のプラグインコードとドキュメントは [MIT License](LICENSE) で公開します。

MIT License は、このリポジトリに含まれるコードとドキュメントへの許諾です。Grok、Eagle、FFmpeg、Upscayl、Irodori-TTS、各モデル、各サービス、各バイナリの利用条件を置き換えるものではありません。

<!-- section:attribution -->
## 帰属

- [Eagle](https://jp.eagle.cool/) と [Eagle Plugin API](https://developer.eagle.cool/plugin-api/) はEagleの公式ドキュメントを参照してください。
- [Aratako/Irodori-TTS](https://github.com/Aratako/Irodori-TTS) はMITライセンスの公開TTSプロジェクトです。音声連携を使う場合は、Irodori-TTS側のライセンスとモデルカードを確認してください。
- Grok / xAI関連の利用条件は、利用者自身のGrok環境と公式案内に従ってください。
- FFmpeg / FFprobe、Upscayl、Eagleブラウザ拡張機能は同梱していません。利用者が別途導入し、それぞれのライセンスや利用条件を確認してください。
- 詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

<!-- section:disclaimer -->
## 免責

このプロジェクトは個人の趣味・学習・ローカル検証のための実験的な一次デバッグ版です。無保証で提供され、生成結果、外部サービスの仕様変更、利用制限、データ取り扱い、Eagleライブラリへの登録結果について作者は責任を負いません。

このプロジェクトは非公式の個人プロジェクトであり、Eagle、xAI/Grok、FFmpeg、Upscayl、Aratako/Irodori-TTSの公式プロジェクトではなく、提携・承認・スポンサー関係もありません。大切なEagleライブラリで試す前に、必ずバックアップと小さなテストを行ってください。
