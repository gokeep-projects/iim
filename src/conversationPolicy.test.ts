import { describe, expect, it } from "vitest";
import { groupFileTransferBlockReason, incomingConversationPolicy, outgoingConversationBlockReason } from "./conversationPolicy";

describe("incomingConversationPolicy", () => {
  it("keeps unread badges for muted background conversations while suppressing notifications", () => {
    expect(incomingConversationPolicy({ isActiveConversation: false, muted: true })).toEqual({
      incrementUnread: true,
      markRead: false,
      notify: false,
      drop: false
    });
  });

  it("marks the active conversation as read without showing a notification", () => {
    expect(incomingConversationPolicy({ isActiveConversation: true, muted: false })).toEqual({
      incrementUnread: false,
      markRead: true,
      notify: false,
      drop: false
    });
  });

  it("drops blocked sender messages without unread, read, or notification side effects", () => {
    expect(incomingConversationPolicy({ isActiveConversation: false, muted: false, blocked: true })).toEqual({
      incrementUnread: false,
      markRead: false,
      notify: false,
      drop: true
    });
  });
});

describe("outgoingConversationBlockReason", () => {
  it("blocks direct sends to a blocked contact before calling the backend", () => {
    expect(
      outgoingConversationBlockReason({
        conversationId: "direct:peer-a",
        recipientPeerIds: ["peer-a"],
        blockedPeerIds: new Set(["peer-a"])
      })
    ).toBe("联系人已被阻止，不能发送消息");
  });

  it("blocks group sends when every remote member is blocked", () => {
    expect(
      outgoingConversationBlockReason({
        conversationId: "group:ops",
        recipientPeerIds: ["peer-a", "peer-b"],
        blockedPeerIds: new Set(["peer-a", "peer-b"])
      })
    ).toBe("群聊没有可发送的未阻止成员");
  });

  it("allows group sends when at least one remote member is unblocked", () => {
    expect(
      outgoingConversationBlockReason({
        conversationId: "group:ops",
        recipientPeerIds: ["peer-a", "peer-b"],
        blockedPeerIds: new Set(["peer-a"])
      })
    ).toBe("");
  });
});

describe("groupFileTransferBlockReason", () => {
  it("blocks group file sends when a saved member has not been discovered", () => {
    expect(
      groupFileTransferBlockReason({
        memberPeerIds: ["local", "peer-a", "peer-missing"],
        selfPeerId: "local",
        discoveredPeerIds: new Set(["peer-a"]),
        publicKeyPeerIds: new Set(["peer-a"]),
        blockedPeerIds: new Set()
      })
    ).toBe("有 1 名群成员尚未发现，请刷新联系人后再发送文件");
  });

  it("blocks group file sends when a discovered member has no public key", () => {
    expect(
      groupFileTransferBlockReason({
        memberPeerIds: ["local", "peer-a", "peer-b"],
        selfPeerId: "local",
        discoveredPeerIds: new Set(["peer-a", "peer-b"]),
        publicKeyPeerIds: new Set(["peer-a"]),
        blockedPeerIds: new Set()
      })
    ).toBe("部分群成员缺少公钥，请刷新联系人后再发送文件");
  });

  it("ignores blocked members while checking group file readiness", () => {
    expect(
      groupFileTransferBlockReason({
        memberPeerIds: ["local", "peer-a", "peer-missing"],
        selfPeerId: "local",
        discoveredPeerIds: new Set(["peer-a"]),
        publicKeyPeerIds: new Set(["peer-a"]),
        blockedPeerIds: new Set(["peer-missing"])
      })
    ).toBe("");
  });
});
