$ErrorActionPreference = "Stop"

$workspace = "E:\codework\words"
$batchDir = Join-Path $workspace "data\enriched\refine-next\gpt52-base-only-batches"
$manifestPath = Join-Path $batchDir "manifest.json"
$configPath = Join-Path $batchDir "run-config.json"
$runLogPath = Join-Path $batchDir "run.log"

if (-not (Test-Path $manifestPath)) {
  throw "Manifest not found: $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

if (-not (Test-Path $configPath)) {
  throw "Run config not found: $configPath"
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
[Environment]::SetEnvironmentVariable("OPENAI_ENRICH_REFINE_API_KEY", [string]$config.apiKey)
[Environment]::SetEnvironmentVariable("OPENAI_ENRICH_REFINE_API_BASE", [string]$config.apiBase)
[Environment]::SetEnvironmentVariable("OPENAI_ENRICH_REFINE_MODEL", [string]$config.model)
[Environment]::SetEnvironmentVariable("OPENAI_ENRICH_REFINE_STREAM", [string]$config.stream)
[Environment]::SetEnvironmentVariable("OPENAI_ENRICH_TIMEOUT_MS", [string]$config.timeoutMs)

function Write-RunLog {
  param([string]$Message)

  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  $line | Tee-Object -FilePath $runLogPath -Append
}

function Test-ImportComplete {
  param([string]$ImportLogPath)

  if (-not (Test-Path $ImportLogPath)) {
    return $false
  }

  $content = Get-Content $ImportLogPath -Raw
  return $content -match "Enriched import complete"
}

Write-RunLog "Runner started. Total batches=$($manifest.totalBatches) totalWords=$($manifest.totalWords)"

foreach ($batch in $manifest.batches) {
  $batchNumber = [int]$batch.batchNumber
  $wordsFile = [string]$batch.wordsFile
  $outputFile = [string]$batch.outputFile
  $enrichLog = [string]$batch.enrichLog
  $importLog = [string]$batch.importLog

  if ((Test-Path $outputFile) -and (Test-ImportComplete $importLog)) {
    Write-RunLog ("Batch {0:D2} already imported, skipping" -f $batchNumber)
    continue
  }

  if (-not (Test-Path $outputFile)) {
    Write-RunLog ("Batch {0:D2} enrich begin words={1}" -f $batchNumber, $batch.wordCount)
    Push-Location $workspace
    try {
      $enrichCommand = 'npm run enrich:words -- --stage refine --refine-mode lite --words-file "{0}" --concurrency 20 --output "{1}" 2>&1' -f $wordsFile, $outputFile
      cmd /c $enrichCommand | Tee-Object -FilePath $enrichLog -Append
      if ($LASTEXITCODE -ne 0) {
        throw ("Batch {0:D2} enrich failed with exit code {1}" -f $batchNumber, $LASTEXITCODE)
      }
    } finally {
      Pop-Location
    }
    Write-RunLog ("Batch {0:D2} enrich complete" -f $batchNumber)
  } else {
    Write-RunLog ("Batch {0:D2} output exists, trying import" -f $batchNumber)
  }

  if (-not (Test-ImportComplete $importLog)) {
    Write-RunLog ("Batch {0:D2} import begin" -f $batchNumber)
    Push-Location $workspace
    try {
      $importCommand = 'npm run import:enriched -- --input "{0}" 2>&1' -f $outputFile
      cmd /c $importCommand | Tee-Object -FilePath $importLog -Append
      if ($LASTEXITCODE -ne 0) {
        throw ("Batch {0:D2} import failed with exit code {1}" -f $batchNumber, $LASTEXITCODE)
      }
    } finally {
      Pop-Location
    }
    Write-RunLog ("Batch {0:D2} import complete" -f $batchNumber)
  }
}

Write-RunLog "Runner finished"
