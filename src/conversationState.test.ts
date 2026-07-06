import { describe, expect, it } from "vitest";
import {
  conversationDisplayTitle,
  directConversationPeer,
  filterConversationSummaries,
  forwardTargetConversations,
  visibleUnreadCount,
  markAllConversationsReadInList,
  markConversationReadInList,
  markConversationUnreadInList,
  updateConversationStatusPreview
} from "./conversationState";
import type { ChatMessage, ContactMetadata, ConversationSummary, PeerProfile } from "./api";

function conversation(id: string, unreadCount: number, patch: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id,
    title: id,
    last_message_at: unreadCount,
    last_message_preview: "",
    unread_count: unreadCount,
    pinned: false,
    muted: false,
    archived: false,
    draft_preview: "",
    ...patch
  };
}

function peer(peerId: string, displayName: string): PeerProfile {
  return {
    peer_id: peerId,
    display_name: displayName,
    hostname: `${peerId}.local`,
    status: "online",
    endpoints: [`${peerId}:24251`],
    fingerprint: `${peerId}-fingerprint`
  };
}

function metadata(peerId: string, remark: string, patch: Partial<ContactMetadata> = {}): ContactMetadata {
  return {
    peer_id: peerId,
    remark,
    group_name: "",
    favorite: false,
    blocked: false,
    ...patch
  };
}

function message(patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    conversation_id: "direct:b",
    sender_id: "peer-b",
    body: "updated preview",
    attachments: [],
    created_at: 20,
    status: "delivered",
    recalled: false,
    quote: null,
    favorited: false,
    reactions: [],
    ...patch
  };
}

describe("conversationState", () => {
  it("clears unread count for one conversation without reordering the list", () => {
    const conversations = [conversation("direct:a", 3), conversation("direct:b", 1)];

    expect(markConversationReadInList(conversations, "direct:a")).toEqual([
      { ...conversations[0], unread_count: 0 },
      conversations[1]
    ]);
  });

  it("returns the original list when the conversation is missing", () => {
    const conversations = [conversation("direct:a", 3)];

    expect(markConversationReadInList(conversations, "direct:x")).toBe(conversations);
  });

  it("marks a read conversation unread without reordering the list", () => {
    const conversations = [conversation("direct:a", 0), conversation("direct:b", 2)];

    expect(markConversationUnreadInList(conversations, "direct:a")).toEqual([
      { ...conversations[0], unread_count: 1 },
      conversations[1]
    ]);
  });

  it("clears unread counts for every conversation without reordering the list", () => {
    const conversations = [conversation("direct:a", 3), conversation("direct:b", 0), conversation("group:c", 2)];

    expect(markAllConversationsReadInList(conversations)).toEqual([
      { ...conversations[0], unread_count: 0 },
      conversations[1],
      { ...conversations[2], unread_count: 0 }
    ]);
  });

  it("updates and resorts a conversation when a newer status-changed message arrives", () => {
    const conversations = [
      conversation("direct:a", 0, { last_message_at: 10, last_message_preview: "old a" }),
      conversation("direct:b", 0, { last_message_at: 5, last_message_preview: "old b" })
    ];

    expect(updateConversationStatusPreview(conversations, message(), "updated preview")).toEqual([
      { ...conversations[1], last_message_at: 20, last_message_preview: "updated preview" },
      conversations[0]
    ]);
  });

  it("excludes muted conversations from visible unread totals", () => {
    const conversations = [
      conversation("direct:loud", 3),
      conversation("direct:muted", 8, { muted: true }),
      conversation("group:archived", 5, { archived: true }),
      conversation("direct:quiet", 0)
    ];

    expect(visibleUnreadCount(conversations)).toBe(3);
  });

  it("keeps muted conversations out of the unread triage filter", () => {
    const conversations = [
      conversation("direct:loud", 3),
      conversation("direct:muted", 8, { muted: true }),
      conversation("direct:archived-muted", 5, { archived: true, muted: true })
    ];

    expect(filterConversationSummaries(conversations, "unread").map((item) => item.id)).toEqual(["direct:loud"]);
    expect(filterConversationSummaries(conversations, "muted").map((item) => item.id)).toEqual(["direct:muted"]);
  });

  it("keeps archived conversations visible only in all and archived filters", () => {
    const conversations = [
      conversation("direct:active", 0),
      conversation("direct:archived", 0, { archived: true }),
      conversation("direct:unread", 2),
      conversation("direct:pinned", 0, { pinned: true })
    ];

    expect(filterConversationSummaries(conversations, "all").map((item) => item.id)).toEqual([
      "direct:active",
      "direct:archived",
      "direct:unread",
      "direct:pinned"
    ]);
    expect(filterConversationSummaries(conversations, "active").map((item) => item.id)).toEqual([
      "direct:active",
      "direct:unread",
      "direct:pinned"
    ]);
    expect(filterConversationSummaries(conversations, "archived").map((item) => item.id)).toEqual(["direct:archived"]);
  });

  it("shows muted conversations in the muted filter without surfacing archived chats", () => {
    const conversations = [
      conversation("direct:active", 0),
      conversation("direct:muted", 0, { muted: true }),
      conversation("direct:archived-muted", 0, { archived: true, muted: true })
    ];

    expect(filterConversationSummaries(conversations, "muted").map((item) => item.id)).toEqual(["direct:muted"]);
  });

  it("filters mentioned conversations without surfacing archived chats", () => {
    const conversations = [
      conversation("group:ops", 4),
      conversation("group:quiet", 0),
      conversation("group:archived", 2, { archived: true })
    ];

    expect(filterConversationSummaries(conversations, "mentions", ["group:ops", "group:archived"]).map((item) => item.id)).toEqual([
      "group:ops"
    ]);
  });

  it("filters todo conversations without surfacing archived chats", () => {
    const conversations = [
      conversation("direct:todo", 0),
      conversation("direct:quiet", 0),
      conversation("direct:archived-todo", 0, { archived: true })
    ];

    expect(
      filterConversationSummaries(conversations, "todo", [], {
        "direct:todo": 2,
        "direct:archived-todo": 1
      }).map((item) => item.id)
    ).toEqual(["direct:todo"]);
  });

  it("filters outbox conversations without surfacing archived chats", () => {
    const conversations = [
      conversation("direct:outbox", 0),
      conversation("direct:quiet", 0),
      conversation("direct:archived-outbox", 0, { archived: true })
    ];

    expect(
      filterConversationSummaries(conversations, "outbox", [], {}, {
        "direct:outbox": 2,
        "direct:archived-outbox": 1
      }).map((item) => item.id)
    ).toEqual(["direct:outbox"]);
  });

  it("uses contact remarks for direct conversation display titles", () => {
    expect(
      conversationDisplayTitle(
        conversation("direct:peer-a", 0, { title: "Alice" }),
        [peer("peer-a", "Alice")],
        { "peer-a": metadata("peer-a", "研发一号") }
      )
    ).toBe("研发一号");
  });

  it("prefers exact peer id from direct conversation title before legacy id matching", () => {
    expect(
      conversationDisplayTitle(
        conversation("direct:local", 0, { title: "peer-a" }),
        [peer("local", "本机"), peer("peer-a", "Alice")],
        {
          local: metadata("local", "我"),
          "peer-a": metadata("peer-a", "研发一号")
        }
      )
    ).toBe("研发一号");
  });

  it("resolves legacy direct conversations by exact peer id from summary title", () => {
    const resolved = directConversationPeer(
      conversation("direct:local", 0, { title: "peer-a" }),
      [peer("local", "本机"), peer("peer-a", "Alice")]
    );

    expect(resolved?.peer_id).toBe("peer-a");
  });

  it("keeps group conversation titles unchanged", () => {
    expect(
      conversationDisplayTitle(
        conversation("group:ops", 0, { title: "值班群" }),
        [peer("peer-a", "Alice")],
        { "peer-a": metadata("peer-a", "研发一号") }
      )
    ).toBe("值班群");
  });
  it("excludes blocked direct conversations from forward targets", () => {
    const conversations = [
      conversation("direct:peer-a", 0, { title: "Alice" }),
      conversation("direct:peer-b", 0, { title: "Bob" }),
      conversation("group:ops", 0, { title: "Ops" })
    ];

    expect(
      forwardTargetConversations(conversations, [peer("peer-a", "Alice"), peer("peer-b", "Bob")], {
        "peer-a": metadata("peer-a", "Blocked Alice", { blocked: true }),
        "peer-b": metadata("peer-b", "Bob")
      }).map((item) => item.id)
    ).toEqual(["direct:peer-b", "group:ops"]);
  });

  it("matches forward targets by contact remarks", () => {
    const conversations = [conversation("direct:peer-a", 0, { title: "Alice" })];

    expect(
      forwardTargetConversations(conversations, [peer("peer-a", "Alice")], {
        "peer-a": metadata("peer-a", "研发一号")
      }, "研发").map((item) => item.id)
    ).toEqual(["direct:peer-a"]);
  });
});
