# WeChat Desktop Service

Local companion service for OpenZhiyu. It controls the logged-in Windows WeChat desktop client through Windows UI automation by default, so it does not require `wxautox`.

## Safety Model

- Binds to `127.0.0.1` by default.
- `/preview` creates a short-lived `confirmToken`; it does not send.
- `/send` requires the matching `confirmToken`.
- If you bind outside localhost, pass `--token` or set `WECHAT_DESKTOP_TOKEN`.
- The default `window` backend briefly focuses PC WeChat, sends the message, then restores the previous foreground window and clipboard.
- Personal PC WeChat does not expose a reliable fully invisible background API. For truly background delivery, use an official API such as WeCom or another authorized channel.

## Requirements

- Windows.
- Python 3.9+.
- PC WeChat installed and logged in.
- `pywin32`.

## Start

When developing OpenZhiyu from the repository root, the recommended command is:

```powershell
pnpm dev
```

That command starts this service automatically if `127.0.0.1:8765` is not
already healthy.

To start this service by itself:

```powershell
cd D:\zhiyu\tools\wechat-desktop-service
.\start.ps1
```

The default backend is `window`:

```powershell
$env:WECHAT_DESKTOP_BACKEND = "window"
.\start.ps1
```

To minimize WeChat after each send:

```powershell
.\start.ps1 -MinimizeAfterSend
```

With an auth token:

```powershell
$env:WECHAT_DESKTOP_TOKEN = "change-me"
.\start.ps1
```

## API

Health:

```powershell
Invoke-WebRequest http://127.0.0.1:8765/health -UseBasicParsing
```

Preview:

```powershell
$body = @{
  recipientName = "文件传输助手"
  message = "OpenZhiyu preview test"
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri http://127.0.0.1:8765/preview `
  -Method POST `
  -ContentType "application/json" `
  -Body $body `
  -UseBasicParsing
```

Send:

```powershell
$body = @{
  recipientName = "文件传输助手"
  message = "OpenZhiyu preview test"
  confirmToken = "<token-from-preview>"
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri http://127.0.0.1:8765/send `
  -Method POST `
  -ContentType "application/json" `
  -Body $body `
  -UseBasicParsing
```

If `WECHAT_DESKTOP_TOKEN` is set, include:

```powershell
-Headers @{ Authorization = "Bearer $env:WECHAT_DESKTOP_TOKEN" }
```
