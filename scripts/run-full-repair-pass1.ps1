param(
  [string]$SourceFile = "E:\codework\words\data\enriched\quality-audit\after-full-repair-batch-01\recommended-full-refine.words.txt",
  [int]$BatchSize = 200,
  [int]$StartBatchNumber = 2,
  [int]$Concurrency = 10,
  [string]$OutputDir = "E:\codework\words\data\enriched\refine-next\betterclaude-gpt52-full-repair",
  [string]$LogDir = "E:\codework\words\data\logs\betterclaude-gpt52-full-repair",
  [string]$FinalAuditOutput = "data/logs/word-quality-audit-after-full-repair-pass1.json",
  [string]$FinalAuditWordsDir = "data/enriched/quality-audit/after-full-repair-pass1"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $SourceFile)) {
  throw "Source file not found: $SourceFile"
}

if (-not $env:OPENAI_ENRICH_REFINE_API_BASE -or -not $env:OPENAI_ENRICH_REFINE_API_KEY -or -not $env:OPENAI_ENRICH_REFINE_MODEL) {
  throw 'Missing OPENAI_ENRICH_REFINE_* environment variables.'
}

if (-not $env:OPENAI_ENRICH_EXAMPLE_API_BASE) {
  $env:OPENAI_ENRICH_EXAMPLE_API_BASE = $env:OPENAI_ENRICH_REFINE_API_BASE
}
if (-not $env:OPENAI_ENRICH_EXAMPLE_API_KEY) {
  $env:OPENAI_ENRICH_EXAMPLE_API_KEY = $env:OPENAI_ENRICH_REFINE_API_KEY
}
if (-not $env:OPENAI_ENRICH_EXAMPLE_MODEL) {
  $env:OPENAI_ENRICH_EXAMPLE_MODEL = $env:OPENAI_ENRICH_REFINE_MODEL
}
if (-not $env:OPENAI_ENRICH_EXAMPLE_STREAM -and $env:OPENAI_ENRICH_REFINE_STREAM) {
  $env:OPENAI_ENRICH_EXAMPLE_STREAM = $env:OPENAI_ENRICH_REFINE_STREAM
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$allWords = Get-Content $SourceFile | Where-Object { $_.Trim() }

function Invoke-CmdLogged {
  param(
    [string]$CommandText,
    [string]$LogPath,
    [string]$FailureMessage,
    [int]$MaxAttempts = 3
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt += 1) {
    $arg = "/c $CommandText > ""$LogPath"" 2>&1"
    $process = Start-Process -FilePath 'cmd.exe' -ArgumentList $arg -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -eq 0) {
      return
    }

    if ($attempt -lt $MaxAttempts) {
      Start-Sleep -Seconds (5 * $attempt)
      continue
    }

    throw $FailureMessage
  }
}

function Show-SummaryLines {
  param(
    [string]$Path,
    [string[]]$Patterns
  )

  if (-not (Test-Path $Path)) {
    return
  }

  Get-Content $Path | Select-String -Pattern $Patterns
}

function Test-ImportComplete {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $false
  }

  $content = Get-Content $Path -Raw
  return $content -match 'Enriched import complete'
}

for ($index = 0; $index -lt $allWords.Count; $index += $BatchSize) {
  $batchNumber = [int]($index / $BatchSize) + $StartBatchNumber
  $batchWords = $allWords[$index..([Math]::Min($index + $BatchSize - 1, $allWords.Count - 1))]
  $suffix = '{0:D2}' -f $batchNumber
  $wordsFile = Join-Path $OutputDir ("batch-$suffix.words.txt")
  $outputFile = Join-Path $OutputDir ("batch-$suffix.c10.json")
  $enrichLog = Join-Path $LogDir ("batch-$suffix.enrich.log")
  $importAiLog = Join-Path $LogDir ("batch-$suffix.import-ai.log")
  $importExamplesLog = Join-Path $LogDir ("batch-$suffix.import-examples.log")

  Set-Content -Path $wordsFile -Value $batchWords
  Write-Host ("=== Batch {0} / words={1} ===" -f $suffix, $batchWords.Count)

  if (-not (Test-Path $outputFile)) {
    $enrichCommand = "npm run enrich:words -- --stage refine --refine-mode full --words-file ""$wordsFile"" --concurrency $Concurrency --output ""$outputFile"""
    Invoke-CmdLogged -CommandText $enrichCommand -LogPath $enrichLog -FailureMessage ("enrich failed for batch {0}" -f $suffix)
  }
  Show-SummaryLines -Path $enrichLog -Patterns @('Enriched dataset written', '  words:', '  concurrency:')

  if (-not (Test-ImportComplete $importAiLog)) {
    $importAiCommand = "npm run import:enriched -- --input ""$outputFile"" --require-generation-method ai_refine"
    Invoke-CmdLogged -CommandText $importAiCommand -LogPath $importAiLog -FailureMessage ("ai_refine import failed for batch {0}" -f $suffix)
  }
  Show-SummaryLines -Path $importAiLog -Patterns @('imported words:', 'skipped words:', 'profiles upserted:', 'examples inserted:', 'sources inserted:')

  if (-not (Test-ImportComplete $importExamplesLog)) {
    $importExamplesCommand = "npm run import:enriched -- --input ""$outputFile"" --examples-only"
    Invoke-CmdLogged -CommandText $importExamplesCommand -LogPath $importExamplesLog -FailureMessage ("examples_only import failed for batch {0}" -f $suffix)
  }
  Show-SummaryLines -Path $importExamplesLog -Patterns @('import mode:', 'imported words:', 'examples inserted:', 'sources inserted:', 'synced primary examples:')
}

npm run audit:word-quality -- --output $FinalAuditOutput --words-dir $FinalAuditWordsDir
if ($LASTEXITCODE -ne 0) {
  throw 'final audit failed'
}
