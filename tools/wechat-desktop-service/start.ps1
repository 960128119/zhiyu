param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 8765,
  [string]$Token = $env:WECHAT_DESKTOP_TOKEN,
  [ValidateSet("window", "wxauto")]
  [string]$Backend = $(if ($env:WECHAT_DESKTOP_BACKEND) { $env:WECHAT_DESKTOP_BACKEND } else { "window" }),
  [switch]$MinimizeAfterSend
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path ".venv")) {
  $PythonLauncher = Get-Command py -ErrorAction SilentlyContinue
  if ($PythonLauncher) {
    py -3.12 -m venv .venv
  } else {
    python -m venv .venv
  }
}

& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

$argsList = @("server.py", "--host", $HostName, "--port", "$Port", "--backend", $Backend)
if ($Token) {
  $argsList += @("--token", $Token)
}
if ($MinimizeAfterSend) {
  $argsList += @("--minimize-after-send")
}

& ".\.venv\Scripts\python.exe" @argsList
