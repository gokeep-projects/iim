export interface IncomingConversationPolicyInput {
  isActiveConversation: boolean;
  muted: boolean;
  blocked?: boolean;
}

export interface IncomingConversationPolicy {
  incrementUnread: boolean;
  markRead: boolean;
  notify: boolean;
  drop: boolean;
}

export function incomingConversationPolicy(input: IncomingConversationPolicyInput): IncomingConversationPolicy {
  if (input.blocked) {
    return {
      incrementUnread: false,
      markRead: false,
      notify: false,
      drop: true
    };
  }

  return {
    incrementUnread: !input.isActiveConversation,
    markRead: input.isActiveConversation,
    notify: !input.isActiveConversation && !input.muted,
    drop: false
  };
}

export interface OutgoingConversationBlockInput {
  conversationId: string;
  recipientPeerIds: string[];
  blockedPeerIds: Set<string>;
  contactPeerIds?: Set<string>;
  requireContactForMessaging?: boolean;
}

export function outgoingConversationBlockReason(input: OutgoingConversationBlockInput): string {
  const recipients = input.recipientPeerIds.filter((peerId) => peerId.trim().length > 0);
  if (recipients.length === 0) return "";

  if (input.conversationId.startsWith("direct:") && recipients.some((peerId) => input.blockedPeerIds.has(peerId))) {
    return "联系人已被阻止，不能发送消息";
  }

  if (
    input.requireContactForMessaging &&
    input.conversationId.startsWith("direct:") &&
    recipients.some((peerId) => !input.contactPeerIds?.has(peerId))
  ) {
    return "请先添加好友后再发送消息";
  }

  if (input.conversationId.startsWith("group:") && recipients.every((peerId) => input.blockedPeerIds.has(peerId))) {
    return "群聊没有可发送的未阻止成员";
  }

  if (input.requireContactForMessaging && input.conversationId.startsWith("group:")) {
    const sendableRecipients = recipients.filter((peerId) => !input.blockedPeerIds.has(peerId));
    const missingContactCount = sendableRecipients.filter((peerId) => !input.contactPeerIds?.has(peerId)).length;
    if (missingContactCount > 0) {
      return `有 ${missingContactCount} 名群成员尚未添加好友，请添加后再发送消息`;
    }
  }

  return "";
}

export interface GroupFileTransferBlockInput {
  memberPeerIds: string[];
  selfPeerId: string;
  discoveredPeerIds: Set<string>;
  publicKeyPeerIds: Set<string>;
  blockedPeerIds: Set<string>;
}

export function groupFileTransferBlockReason(input: GroupFileTransferBlockInput): string {
  const remoteMemberIds = Array.from(
    new Set(
      input.memberPeerIds
        .map((peerId) => peerId.trim())
        .filter((peerId) => peerId.length > 0 && peerId !== input.selfPeerId && !input.blockedPeerIds.has(peerId))
    )
  );
  if (remoteMemberIds.length === 0) return "群聊没有可发送文件的未阻止成员";

  const undiscoveredCount = remoteMemberIds.filter((peerId) => !input.discoveredPeerIds.has(peerId)).length;
  if (undiscoveredCount > 0) {
    return `有 ${undiscoveredCount} 名群成员尚未发现，请刷新联系人后再发送文件`;
  }

  if (remoteMemberIds.some((peerId) => !input.publicKeyPeerIds.has(peerId))) {
    return "部分群成员缺少公钥，请刷新联系人后再发送文件";
  }

  return "";
}
