import { createHash } from 'node:crypto';

export type NormalizedWechatMessage = {
  platform: 'wechat';
  source: 'wechat_local';
  conversationId: string;
  conversationName: string;
  conversationType: string;
  senderId?: string;
  senderName?: string;
  senderDisplayName?: string;
  direction: string;
  contentType: string;
  content: string;
  contentPreview: string;
  messageTime: Date;
  collectedAt: Date;
  sourceMessageId?: string;
  sourceSequence?: string;
  sourceRaw: Record<string, unknown>;
  dedupeKey: string;
};

const MESSAGE_ARRAY_KEYS = [
  'messages',
  'items',
  'results',
  'data',
  'records',
  'newMessages',
  'unreadMessages',
  'history',
  'sessions',
];

const MESSAGE_LIKE_KEYS = [
  'content',
  'text',
  'message',
  'msg',
  'msgText',
  'plainText',
  'summary',
  'lastMessage',
  'last_message',
  'time',
  'timestamp',
  'createTime',
  'CreateTime',
  'msgId',
  'messageId',
  'sender',
  'chat',
  'username',
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isRecordList(value: unknown): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
  );
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function firstBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', '1'].includes(normalized)) return true;
      if (['false', 'no', '0'].includes(normalized)) return false;
    }
    if (typeof value === 'number') return value !== 0;
  }
  return undefined;
}

function parseDateValue(value: unknown, fallback: Date) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return parseDateValue(numeric, fallback);
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fallback;
}

function firstDate(record: Record<string, unknown>, keys: string[], fallback: Date) {
  for (const key of keys) {
    const value = record[key];
    const date = parseDateValue(value, fallback);
    if (date !== fallback || value !== undefined) return date;
  }
  return fallback;
}

function contentPreview(content: string, max = 220) {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function normalizeContentType(rawType: string | undefined) {
  const type = rawType?.trim().toLowerCase();
  if (!type) return 'unknown';
  const numeric = Number(type);
  if (Number.isFinite(numeric)) {
    if (numeric === 1) return 'text';
    if (numeric === 3) return 'image';
    if (numeric === 34) return 'voice';
    if (numeric === 43) return 'video';
    if (numeric === 47) return 'sticker';
    if (numeric === 49) return 'link';
    if (numeric === 10000) return 'system';
  }
  if (['txt', '文本'].includes(type)) return 'text';
  return type;
}

function normalizeDirection(record: Record<string, unknown>) {
  const raw = firstString(record, [
    'direction',
    'flow',
    'isSend',
    'is_sender',
    'fromMe',
    'isSelf',
  ]);
  const sentByMe = firstBoolean(record, [
    'isSend',
    'is_sender',
    'fromMe',
    'isSelf',
    'isMe',
  ]);
  if (sentByMe === true) return 'outbound';
  if (sentByMe === false) return 'inbound';
  const normalized = raw?.toLowerCase();
  if (!normalized) return 'unknown';
  if (['out', 'outbound', 'sent', 'send', 'me', 'self', '1'].includes(normalized)) {
    return 'outbound';
  }
  if (['in', 'inbound', 'received', 'receive', 'other', '0'].includes(normalized)) {
    return 'inbound';
  }
  return normalized;
}

function hasMessageShape(record: Record<string, unknown>) {
  return MESSAGE_LIKE_KEYS.some((key) => record[key] !== undefined);
}

function collectMessageCandidates(value: unknown, depth = 0): Array<Record<string, unknown>> {
  if (depth > 4) return [];
  if (isRecordList(value)) {
    const direct = value.filter(hasMessageShape);
    if (direct.length > 0) return direct;
    return value.flatMap((item) => collectMessageCandidates(item, depth + 1));
  }

  const record = asRecord(value);
  if (!Object.keys(record).length) return [];
  if (hasMessageShape(record) && !MESSAGE_ARRAY_KEYS.some((key) => Array.isArray(record[key]))) {
    return [record];
  }

  const candidates: Array<Record<string, unknown>> = [];
  for (const key of MESSAGE_ARRAY_KEYS) {
    candidates.push(...collectMessageCandidates(record[key], depth + 1));
  }
  return candidates;
}

function hashDedupeKey(parts: string[]) {
  return createHash('sha256')
    .update(parts.filter(Boolean).join('\n'))
    .digest('hex');
}

export function normalizeWechatLocalPayload(
  payload: unknown,
  options: { collectedAt?: Date } = {},
): NormalizedWechatMessage[] {
  const collectedAt = options.collectedAt ?? new Date();
  const candidates = collectMessageCandidates(payload);

  return candidates
    .map((candidate) => {
      const conversationName =
        firstString(candidate, [
          'chat',
          'chatName',
          'conversationName',
          'display',
          'displayName',
          'roomName',
          'sessionName',
          'nickname',
          'remark',
          'username',
          'talker',
          'name',
        ]) ?? '未知会话';
      const conversationId =
        firstString(candidate, [
          'conversationId',
          'chatId',
          'roomId',
          'username',
          'talker',
          'chat',
          'display',
        ]) ?? conversationName;
      const senderName = firstString(candidate, [
        'sender',
        'senderName',
        'from',
        'fromName',
        'person',
        'last_sender',
        'talkerName',
      ]);
      const senderId = firstString(candidate, [
        'senderId',
        'fromId',
        'senderWxid',
        'wxid',
      ]);
      const content =
        firstString(candidate, [
          'content',
          'text',
          'message',
          'msg',
          'msgText',
          'plainText',
          'summary',
          'lastMessage',
          'last_message',
        ]) ?? '';
      const messageTime = firstDate(
        candidate,
        [
          'messageTime',
          'timestamp',
          'time',
          'createdAt',
          'createTime',
          'CreateTime',
          'msgTime',
          'serverTime',
        ],
        collectedAt,
      );
      const sourceMessageId = firstString(candidate, [
        'messageId',
        'msgId',
        'id',
        'localId',
        'clientMsgId',
        'svrid',
      ]);
      const sourceSequence =
        firstString(candidate, ['sequence', 'seq', 'rowid']) ??
        firstNumber(candidate, ['sequence', 'seq', 'rowid'])?.toString();
      const contentType = normalizeContentType(
        firstString(candidate, ['contentType', 'msgType', 'type', 'last_msg_type']),
      );
      const direction = normalizeDirection(candidate);
      const dedupeKey = hashDedupeKey([
        sourceMessageId ?? '',
        sourceSequence ?? '',
        conversationId,
        messageTime.toISOString(),
        senderId ?? senderName ?? '',
        content,
      ]);

      return {
        platform: 'wechat' as const,
        source: 'wechat_local' as const,
        conversationId,
        conversationName,
        conversationType:
          firstString(candidate, ['conversationType', 'chatType', 'type']) ??
          'unknown',
        senderId,
        senderName,
        senderDisplayName:
          firstString(candidate, ['senderDisplayName', 'displaySender']) ??
          senderName,
        direction,
        contentType,
        content,
        contentPreview: contentPreview(content || `[${contentType}]`),
        messageTime,
        collectedAt,
        sourceMessageId,
        sourceSequence,
        sourceRaw: candidate,
        dedupeKey,
      };
    })
    .filter((message) => message.content || message.sourceMessageId);
}
