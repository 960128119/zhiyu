# Security Notes

This service can send messages through a logged-in PC WeChat session. Treat it as a local privileged automation component.

## Safe Defaults

- The HTTP service binds to `127.0.0.1` by default.
- Binding outside localhost requires `WECHAT_DESKTOP_TOKEN` or `--token`.
- Message sending is a two-step flow: `/preview` creates a `confirmToken`; `/send` consumes it.
- The default send rate limit is 6 sends per minute.
- Logs store message hashes and lengths, not message bodies.

## Recommended Configuration

Set a bearer token before exposing the service to any other process:

```powershell
$env:WECHAT_DESKTOP_TOKEN = "replace-with-a-long-random-token"
```

Limit recipients for demos, shared machines, and MCP use:

```powershell
$env:WECHAT_DESKTOP_ALLOWED_RECIPIENTS = "filehelper,Example Contact"
```

Keep the service on localhost unless you have a specific reason not to:

```powershell
.\start.ps1 -HostName 127.0.0.1
```

## Do Not Commit

- `.env` files
- service logs
- screenshots containing chats, contacts, or QR codes
- MCP configs with real tokens
- exported WeChat data

## Reporting Issues

Do not include private message content, contact names, group names, tokens, QR codes, or account identifiers in public issues. Redact local paths when they reveal personal information.
