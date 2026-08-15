import 'server-only';

export type ConnectorBootstrapName =
  | 'feishu'
  | 'dingtalk'
  | 'qqbot'
  | 'weixin'
  | 'telegram'
  | 'whatsapp'
  | 'imessage';

export interface ConnectorBootstrapResult {
  name: ConnectorBootstrapName;
  status: 'fulfilled' | 'rejected';
  error?: string;
}

export interface RuntimeBootstrapStatus {
  lastQueuedAt: string | null;
  lastCompletedAt: string | null;
  inFlight: boolean;
  results: ConnectorBootstrapResult[];
}

const connectorBootstrapState = new Map<string, RuntimeBootstrapStatus>();

export function getRuntimeBootstrapStatus(
  userId: string,
): RuntimeBootstrapStatus {
  return (
    connectorBootstrapState.get(userId) ?? {
      lastQueuedAt: null,
      lastCompletedAt: null,
      inFlight: false,
      results: [],
    }
  );
}

export function setRuntimeBootstrapStatus(
  userId: string,
  status: RuntimeBootstrapStatus,
) {
  connectorBootstrapState.set(userId, status);
}
