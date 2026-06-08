param(
    [Parameter(Mandatory = $true)]
    [string]$SeedAudioPath,

    [Parameter(Mandatory = $true)]
    [string]$TextPath,

    [Parameter(Mandatory = $true)]
    [string]$CaptionPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputWav,

    [ValidateSet('fast', 'balanced', 'quality')]
    [string]$Preset = 'balanced',

    [string]$RunnerScript = $env:IRODORI_VOICE_READ_RUNNER,

    [string]$IrodoriRoot = $env:IRODORI_TTS_ROOT,

    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-RequiredFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "$Label path is empty."
    }
    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    $item = Get-Item -LiteralPath $resolved.Path -ErrorAction Stop
    if ($item.PSIsContainer) {
        throw "$Label must be a file, not a directory: $($item.FullName)"
    }
    return $item.FullName
}

function Resolve-IrodoriRuntime {
    param(
        [string]$ConfiguredRunner,
        [string]$ConfiguredRoot
    )

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredRunner)) {
        if (Test-Path -LiteralPath $ConfiguredRunner -PathType Leaf) {
            return @{
                Mode = 'wrapper'
                Path = (Resolve-Path -LiteralPath $ConfiguredRunner -ErrorAction Stop).Path
            }
        }
        throw "IRODORI_VOICE_READ_RUNNER does not exist: $ConfiguredRunner"
    }

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredRoot)) {
        $root = Resolve-Path -LiteralPath $ConfiguredRoot -ErrorAction Stop
        $infer = Join-Path $root.Path 'infer.py'
        if (Test-Path -LiteralPath $infer -PathType Leaf) {
            return @{
                Mode = 'irodori'
                Path = $root.Path
            }
        }
        throw "Irodori-TTS infer.py was not found under IRODORI_TTS_ROOT: $($root.Path)"
    }

    throw @(
        'Irodori-TTS runtime was not configured.',
        'Set IRODORI_VOICE_READ_RUNNER to a compatible wrapper script, or set IRODORI_TTS_ROOT to your local Aratako/Irodori-TTS checkout.',
        'This public plugin does not include Irodori-TTS, model weights, reference audio, private local Codex skills, or private login material.'
    ) -join ' '
}

function Assert-WavFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if ([System.IO.Path]::GetExtension($Path).ToLowerInvariant() -ne '.wav') {
        throw "Seed audio must be .wav in v1: $Path"
    }

    $bytes = [byte[]]::new(12)
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        if ($stream.Read($bytes, 0, 12) -lt 12) {
            throw "Seed WAV is too small: $Path"
        }
    }
    finally {
        $stream.Dispose()
    }

    $riff = [System.Text.Encoding]::ASCII.GetString($bytes, 0, 4)
    $wave = [System.Text.Encoding]::ASCII.GetString($bytes, 8, 4)
    if ($riff -ne 'RIFF' -or $wave -ne 'WAVE') {
        throw "Seed audio is not a RIFF/WAVE file: $Path"
    }
}

$IrodoriRuntime = Resolve-IrodoriRuntime -ConfiguredRunner $RunnerScript -ConfiguredRoot $IrodoriRoot

$seedPath = Resolve-RequiredFile -Path $SeedAudioPath -Label 'Seed audio'
$textFile = Resolve-RequiredFile -Path $TextPath -Label 'Text'
$captionFile = Resolve-RequiredFile -Path $CaptionPath -Label 'Caption'
Assert-WavFile -Path $seedPath

$text = Get-Content -LiteralPath $textFile -Raw -Encoding UTF8
$caption = Get-Content -LiteralPath $captionFile -Raw -Encoding UTF8
if ([string]::IsNullOrWhiteSpace($text)) {
    throw 'Text file is empty.'
}
if ([string]::IsNullOrWhiteSpace($caption)) {
    throw 'Caption file is empty.'
}

$outputFull = [System.IO.Path]::GetFullPath($OutputWav)
$outputDir = Split-Path -Parent $outputFull
if (-not [string]::IsNullOrWhiteSpace($outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

if ($IrodoriRuntime.Mode -eq 'wrapper') {
    $runnerArgs = @{
        RefWav = $seedPath
        Text = $text.Trim()
        Caption = $caption.Trim()
        OutputWav = $outputFull
        Preset = $Preset
    }
    if ($DryRun) {
        $runnerArgs['DryRun'] = $true
    }
    & $IrodoriRuntime.Path @runnerArgs
}
else {
    $stepsByPreset = @{
        fast = '12'
        balanced = '24'
        quality = '36'
    }
    $args = @(
        'run',
        '--no-sync',
        'python',
        'infer.py',
        '--hf-checkpoint',
        'Aratako/Irodori-TTS-600M-v3-VoiceDesign',
        '--text',
        $text.Trim(),
        '--ref-wav',
        $seedPath,
        '--caption',
        $caption.Trim(),
        '--output-wav',
        $outputFull,
        '--num-steps',
        $stepsByPreset[$Preset]
    )
    if ($DryRun) {
        Write-Output (@{
            ok = $true
            dryRun = $true
            cwd = $IrodoriRuntime.Path
            command = 'uv'
            args = $args
        } | ConvertTo-Json -Depth 5)
        exit 0
    }
    Push-Location -LiteralPath $IrodoriRuntime.Path
    try {
        & uv @args
    }
    finally {
        Pop-Location
    }
}
$lastExit = Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
if ($lastExit -and $null -ne $lastExit.Value -and [int]$lastExit.Value -ne 0) {
    throw "Irodori-TTS runner failed with exit code $($lastExit.Value)."
}
