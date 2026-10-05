# Runs the unit tests. Uses Node.js if it's installed, otherwise VS Code's bundled Electron in Node mode.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$tests = Get-ChildItem (Join-Path $root 'test') -Filter '*.test.js'

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $runtime = $node.Source
} else {
  $code = Get-Command code -ErrorAction Stop
  $runtime = Join-Path (Split-Path (Split-Path $code.Source -Parent) -Parent) 'Code.exe'
  $env:ELECTRON_RUN_AS_NODE = '1'
}

$failed = 0
try {
  # Each file is run directly (node:test self-executes), which also works under Electron.
  foreach ($t in $tests) {
    Write-Host "`n== $($t.Name)"
    # Start-Process: Code.exe is a GUI-subsystem binary, so $LASTEXITCODE is unreliable for it.
    $p = Start-Process -FilePath $runtime -ArgumentList "`"$($t.FullName)`"" -NoNewWindow -Wait -PassThru
    if ($p.ExitCode -ne 0) { $failed++ }
  }
} finally {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}
if ($failed) { Write-Host "`n$failed test file(s) failed" -ForegroundColor Red; exit 1 }
Write-Host "`nAll tests passed" -ForegroundColor Green
