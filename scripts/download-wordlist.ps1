$letters = @('A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z')
$baseUrl = 'https://raw.githubusercontent.com/cuttlin/Vocabulary-of-CET-4/master/JSON'
$outDir  = Join-Path $PSScriptRoot '..\data'

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

foreach ($l in $letters) {
    $url  = "$baseUrl/$l.json"
    $dest = Join-Path $outDir "CET4_$l.json"
    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
        Write-Host "✅  Downloaded $l  →  $dest"
    } catch {
        Write-Warning "❌  Failed $l : $_"
    }
}

Write-Host "`n🎉  All done! Files saved to: $outDir"
