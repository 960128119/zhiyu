export function splitConversationWindows<T extends { messageTime: Date }>(
  events: T[],
  gapMs = 30 * 60 * 1000,
) {
  const sorted = [...events].sort(
    (a, b) => a.messageTime.getTime() - b.messageTime.getTime(),
  );
  const windows: T[][] = [];
  for (const event of sorted) {
    const current = windows.at(-1);
    const previous = current?.at(-1);
    if (
      !current ||
      !previous ||
      event.messageTime.getTime() - previous.messageTime.getTime() > gapMs
    ) {
      windows.push([event]);
    } else {
      current.push(event);
    }
  }
  return windows;
}
