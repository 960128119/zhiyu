# @openzhiyu/integrations

Unified package for openzhiyu integration packages.

## Packages

This umbrella package exports the following integration packages:

- `@openzhiyu/integrations/asana` - Asana task integration
- `@openzhiyu/integrations/calendar` - Google Calendar and Outlook Calendar adapters
- `@openzhiyu/integrations/channels` - Message platform adapters (Slack, Discord, Telegram, etc.)
- `@openzhiyu/integrations/hubspot` - HubSpot CRM integration
- `@openzhiyu/integrations/imessage` - macOS iMessage adapter

## Usage

```typescript
// Import from umbrella package
import { AsanaClient } from "@openzhiyu/integrations/asana";
import { GoogleCalendarAdapter } from "@openzhiyu/integrations/calendar";
import { MessagePlatformAdapter } from "@openzhiyu/integrations/channels";
import { HubspotClient } from "@openzhiyu/integrations/hubspot";
import { IMessageAdapter } from "@openzhiyu/integrations/imessage";

// Or import specific sub-paths
import type { Platform } from "@openzhiyu/integrations/channels/sources/types";
```

## Architecture

Each integration package is self-contained with its own `package.json` and `tsconfig.json`. The umbrella package (`@openzhiyu/integrations`) re-exports all packages through sub-path exports, allowing consumers to import from a single package while maintaining package separation.
