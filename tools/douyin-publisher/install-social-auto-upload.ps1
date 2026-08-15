param(
  [string]$SauRoot = "",
  [string]$RepoUrl = "https://github.com/dreammis/social-auto-upload.git",
  [switch]$SkipBrowserInstall
)

$ErrorActionPreference = "Stop"

$toolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $toolRoot "..\..")

if (-not $SauRoot) {
  $SauRoot = Join-Path $projectRoot "downloads\social-auto-upload"
}

if (-not (Test-Path $SauRoot)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SauRoot) | Out-Null
  git clone --depth 1 $RepoUrl $SauRoot
}

$conf = Join-Path $SauRoot "conf.py"
$confExample = Join-Path $SauRoot "conf.example.py"
if ((-not (Test-Path $conf)) -and (Test-Path $confExample)) {
  Copy-Item -LiteralPath $confExample -Destination $conf
}

$chromeCandidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)
$chromePath = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chromePath -and (Test-Path $conf)) {
  $content = Get-Content -LiteralPath $conf -Raw
  $escaped = $chromePath.Replace("\", "/")
  $content = $content -replace 'LOCAL_CHROME_PATH = ".*"', "LOCAL_CHROME_PATH = `"$escaped`""
  Set-Content -LiteralPath $conf -Value $content -Encoding UTF8
}

$python = ""
try {
  $python = (& py -3.12 -c "import sys; print(sys.executable)") -join ""
} catch {
  throw "Python 3.12 is required for social-auto-upload. Install Python 3.12 or set up the venv manually."
}

$venv = Join-Path $toolRoot ".venv"
if (-not (Test-Path $venv)) {
  & $python -m venv $venv
}

$venvPython = Join-Path $venv "Scripts\python.exe"
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -e $SauRoot

if (-not $SkipBrowserInstall) {
  & $venvPython -m patchright install chromium
}

Write-Output "Installed social-auto-upload adapter runtime."
Write-Output "Set DOUYIN_PUBLISHER_SAU_ROOT=$SauRoot"
Write-Output "Set DOUYIN_PUBLISHER_SAU_PYTHON=$venvPython"
Write-Output "Then run: $venvPython $SauRoot\sau_cli.py douyin login --account default --headed"
