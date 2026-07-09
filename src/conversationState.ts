import type { ChatMessage, ContactMetadata, ConversationSummary, PeerProfile } from "./api";

export type ConversationFilter = "all" | "active" | "unread" | "mentions" | "todo" | "outbox" | "pinned" | "muted" | "archived";

export function filterConversationSummaries(
  conversations: ConversationSummary[],
  filter: ConversationFilter,
  mentionedConversationIds: string[] = [],
  todoConversationCounts: Record<string, number> = {},
  outboxConversationCounts: Record<string, number> = {}
): ConversationSummary[] {
  return conversations.filter((conversation) => {
    if (filter === "all") return true;
    if (filter === "archived") return conversation.archived;
    if (conversation.archived) return false;
    if (filter === "unread") return conversation.unread_count > 0 && !conversation.muted;
    if (filter === "mentions") return mentionedConversationIds.includes(conversation.id);
    if (filter === "todo") return (todoConversationCounts[conversation.id] ?? 0) > 0;
    if (filter === "outbox") return (outboxConversationCounts[conversation.id] ?? 0) > 0;
    if (filter === "pinned") return conversation.pinned;
    if (filter === "muted") return conversation.muted;
    return true;
  });
}

export function visibleUnreadCount(conversations: ConversationSummary[]): number {
  return conversations
    .filter((conversation) => !conversation.muted && !conversation.archived)
    .reduce((total, conversation) => total + conversation.unread_count, 0);
}

export function markConversationReadInList(
  conversations: ConversationSummary[],
  conversationId: string
): ConversationSummary[] {
  if (!conversations.some((conversation) => conversation.id === conversationId)) {
    return conversations;
  }
  return conversations.map((conversation) =>
    conversation.id === conversationId ? { ...conversation, unread_count: 0, manual_unread: false } : conversation
  );
}

export function markConversationUnreadInList(
  conversations: ConversationSummary[],
  conversationId: string
): ConversationSummary[] {
  if (!conversations.some((conversation) => conversation.id === conversationId)) {
    return conversations;
  }
  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? { ...conversation, unread_count: Math.max(1, conversation.unread_count), manual_unread: true }
      : conversation
  );
}

export function markAllConversationsReadInList(conversations: ConversationSummary[]): ConversationSummary[] {
  if (!conversations.some((conversation) => conversation.unread_count > 0 || conversation.manual_unread)) {
    return conversations;
  }
  return conversations.map((conversation) =>
    conversation.unread_count > 0 || conversation.manual_unread
      ? { ...conversation, unread_count: 0, manual_unread: false }
      : conversation
  );
}

export function sortConversationSummaries(conversations: ConversationSummary[]): ConversationSummary[] {
  return [...conversations].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      Number(a.archived) - Number(b.archived) ||
      b.last_message_at - a.last_message_at
  );
}

export function updateConversationStatusPreview(
  conversations: ConversationSummary[],
  message: ChatMessage,
  preview: string
): ConversationSummary[] {
  if (!conversations.some((conversation) => conversation.id === message.conversation_id)) {
    return conversations;
  }

  return sortConversationSummaries(
    conversations.map((conversation) =>
      conversation.id === message.conversation_id && message.created_at >= conversation.last_message_at
        ? {
            ...conversation,
            last_message_at: Math.max(conversation.last_message_at, message.created_at),
            last_message_preview: preview
          }
        : conversation
    )
  );
}

export function directConversationPeer(conversation: ConversationSummary, peers: PeerProfile[]): PeerProfile | null {
  if (conversation.id.startsWith("group:")) return null;
  return (
    peers.find((item) => item.peer_id === conversation.title) ??
    peers.find((item) => conversation.id.includes(item.peer_id)) ??
    null
  );
}

export function conversationDisplayTitle(
  conversation: ConversationSummary,
  peers: PeerProfile[],
  contactMetadata: Record<string, ContactMetadata>
): string {
  if (conversation.id.startsWith("group:")) {
    return conversation.title || "内网群聊";
  }
  const peer = directConversationPeer(conversation, peers);
  if (!peer) {
    return conversation.title || conversation.id;
  }
  const metadata = contactMetadata[peer.peer_id];
  return metadata?.remark.trim() || peer.display_name || peer.hostname || peer.peer_id;
}

export function forwardTargetConversations(
  conversations: ConversationSummary[],
  peers: PeerProfile[],
  contactMetadata: Record<string, ContactMetadata>,
  query = ""
): ConversationSummary[] {
  const needle = query.trim().toLowerCase();
  return conversations.filter((conversation) => {
    const peer = directConversationPeer(conversation, peers);
    if (peer && contactMetadata[peer.peer_id]?.blocked) return false;
    if (!needle) return true;
    return [
      conversationDisplayTitle(conversation, peers, contactMetadata),
      conversation.title,
      conversation.id,
      peer ? `${peer.display_name} ${peer.hostname} ${contactMetadata[peer.peer_id]?.group_name ?? ""}` : ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}
