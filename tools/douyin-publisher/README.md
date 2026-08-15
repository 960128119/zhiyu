# Douyin Publisher Adapter

Local adapter for connecting Zhiyu workshop agents to a Douyin publishing
tool such as `social-auto-upload`.

The adapter is intentionally thin:

- It stores publish drafts as local JSON files.
- It checks whether a local uploader command is available.
- It builds auditable command plans for login, upload preparation, and publish.
- It only executes external uploader commands when explicitly asked.

## Install

Install and configure `social-auto-upload` separately, then make its CLI command
available on `PATH`. On this project, the safer default is a local Python 3.12
virtual environment:

```powershell
powershell -ExecutionPolicy Bypass -File tools\douyin-publisher\install-social-auto-upload.ps1
```

`social-auto-upload` currently declares `requires-python = ">=3.10,<3.13"`, so
do not install it into the repo's default Python 3.13 environment.

The default command assumes a `sau` executable:

```powershell
sau douyin login --account default --headed
sau douyin check --account default
sau douyin upload-video --account default --file videos/demo.mp4 --title "demo"
```

If your installed version uses different commands, set templates in your env:

```dotenv
DOUYIN_PUBLISHER_LOGIN_CMD=sau douyin login --account {account} --headed
DOUYIN_PUBLISHER_CHECK_CMD=sau douyin check --account {account}
DOUYIN_PUBLISHER_UPLOAD_CMD=sau douyin upload-video --account {account} --file {video_path} --title {title} --desc {description}
DOUYIN_PUBLISHER_PUBLISH_CMD=sau douyin upload-video --account {account} --file {video_path} --title {title} --desc {description}
```

Supported placeholders:

```text
{draft_id}
{account}
{video_path}
{title}
{description}
{topics}
{cover_path}
{scheduled_at}
```

## Commands

```powershell
python tools/douyin-publisher/publisher.py health
python tools/douyin-publisher/publisher.py login
python tools/douyin-publisher/publisher.py create-draft --payload draft.json
python tools/douyin-publisher/publisher.py list-drafts
python tools/douyin-publisher/publisher.py get-draft --draft-id <id>
python tools/douyin-publisher/publisher.py prepare-upload --draft-id <id>
python tools/douyin-publisher/publisher.py publish --draft-id <id>
```

`prepare-upload` and `publish` are dry-run by default. Add `--execute` only
after owner approval.
