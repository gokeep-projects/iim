import type { Options } from "@tauri-apps/plugin-notification";

export function messageNotificationOptions(title: string, body: string, conversationId = "", showPreview = true): Options {
  const trimmedConversationId = conversationId.trim();
  return {
    title,
    body: showPreview ? body : "收到一条新消息",
    group: trimmedConversationId || undefined,
    autoCancel: true,
    extra: trimmedConversationId ? { conversation_id: trimmedConversationId } : {}
  };
}

export function notificationPreviewEnabled(showPreview: boolean, privacyMode: boolean): boolean {
  return showPreview && !privacyMode;
}

export function notificationConversationId(notification: Pick<Options, "extra" | "group">): string {
  const extra = notification.extra as Record<string, unknown> | undefined;
  const directValue = conversationIdValue(extra?.conversation_id) || conversationIdValue(extra?.conversationId);
  if (directValue) return directValue;

  const payload = extra?.payload;
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      const payloadValue = conversationIdValue(parsed.conversation_id) || conversationIdValue(parsed.conversationId);
      if (payloadValue) return payloadValue;
    } catch {
      // Older platform callbacks may preserve only notification grouping metadata.
    }
  }

  return conversationIdValue(notification.group);
}

function conversationIdValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
