import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConversationList from "./ConversationList.svelte";
import type { ChatMessage, ContactMetadata, ConversationSummary, PeerProfile } from "../api";

function conversation(
  id: string,
  title: string,
  patch: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id,
    title,
    last_message_at: 1_700_000_000_000,
    last_message_preview: "",
    unread_count: 0,
    manual_unread: false,
    pinned: false,
    muted: false,
    archived: false,
    draft_preview: "",
    ...patch,
  };
}

const conversations = [
  conversation("direct:active", "Active Chat"),
  conversation("direct:archived", "Archived Chat", { archived: true }),
];

afterEach(() => {
  vi.useRealTimers();
});

function peer(peerId: string, displayName: string): PeerProfile {
  return {
    peer_id: peerId,
    display_name: displayName,
    hostname: `${peerId}.local`,
    status: "online",
    endpoints: [`${peerId}:24251`],
    fingerprint: `${peerId}-fingerprint`,
  };
}

function chatMessage(
  id: string,
  conversationId: string,
  body: string,
  patch: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    conversation_id: conversationId,
    sender_id: "peer-a",
    body,
    attachments: [],
    created_at: 1_700_000_001_000,
    status: "received",
    recalled: false,
    favorited: false,
    reactions: [],
    ...patch,
  };
}

function metadata(
  peerId: string,
  remark: string,
  patch: Partial<ContactMetadata> = {},
): ContactMetadata {
  return {
    peer_id: peerId,
    remark,
    group_name: "",
    favorite: false,
    blocked: false,
    ...patch,
  };
}

describe("ConversationList filters", () => {
  it("keeps the conversation tab ready when conversations arrive after the initial empty state", async () => {
    const { rerender } = render(ConversationList, {
      props: {
        conversations: [],
        filter: "active",
      },
    });

    await rerender({
      conversations: [conversation("direct:demo-peer", "研发一号")],
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /研发一号/ }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("tab", { name: /会话/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps archived conversations out of the current view", () => {
    render(ConversationList, {
      props: {
        conversations,
        filter: "active",
        onQueryChange: vi.fn(),
        onFilterChange: vi.fn(),
      },
    });

    expect(
      screen.getByRole("button", { name: /Active Chat/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Archived Chat/ }),
    ).not.toBeInTheDocument();
  });

  it("does not show archived conversations because sidebar filters were removed", () => {
    render(ConversationList, {
      props: {
        conversations,
        filter: "all",
        onQueryChange: vi.fn(),
        onFilterChange: vi.fn(),
      },
    });

    expect(
      screen.getByRole("button", { name: /Active Chat/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Archived Chat/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps row management actions out of the visible conversation row", () => {
    render(ConversationList, {
      props: {
        conversations: [conversation("direct:active", "Active Chat")],
      },
    });

    const mainButton = screen.getByRole("button", { name: /Active Chat/ });
    const item = mainButton.closest(".conversation-item");
    const actions = item?.querySelector(".conversation-actions");

    expect(mainButton).toHaveClass("conversation-main-button");
    expect(actions).toBeNull();
  });

  it("keeps conversation row management available through the context callback", async () => {
    const openContext = vi.fn();
    render(ConversationList, {
      props: {
        conversations: [conversation("direct:active", "Active Chat")],
        onConversationContext: openContext,
      },
    });

    await fireEvent.contextMenu(screen.getByRole("button", { name: /Active Chat/ }));

    expect(openContext).toHaveBeenCalledWith(
      expect.objectContaining({ id: "direct:active" }),
      expect.any(MouseEvent),
    );
  });

  it("keeps the refresh button busy and spinning for at least one second", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(() => Promise.resolve());
    render(ConversationList, {
      props: {
        conversations: [],
        onRefreshPeers: refresh,
      },
    });

    const button = screen.getByRole("button", { name: "刷新联系人" });
    await fireEvent.click(button);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveClass("refreshing");

    await vi.advanceTimersByTimeAsync(999);
    expect(button).toHaveAttribute("aria-busy", "true");

    await vi.advanceTimersByTimeAsync(1);
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "false"));
    expect(button).not.toHaveClass("refreshing");
  });

  it("opens a compact global search box for conversations, contacts, and records", async () => {
    render(ConversationList, {
      props: {
        conversations,
      },
    });

    expect(screen.queryByPlaceholderText("用户名、主机名、IP 或聊天内容")).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "找人/搜索" }));
    expect(screen.getByPlaceholderText("用户名、主机名、IP 或聊天内容")).toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "搜索建议" })).not.toBeInTheDocument();
  });

  it("keeps conversation row management behind the context menu instead of hover action buttons", () => {
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:peer-a", "Alice Chat", {
            pinned: true,
            muted: true,
          }),
        ],
      },
    });

    expect(screen.queryByRole("button", { name: "置顶" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消置顶" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除会话" })).not.toBeInTheDocument();
  });

  it("keeps muted conversations in the single conversation list without filter tabs", async () => {
    const changeFilter = vi.fn();
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:active", "Active Chat"),
          conversation("direct:muted", "Muted Chat", { muted: true }),
          conversation("direct:archived-muted", "Archived Muted Chat", {
            archived: true,
            muted: true,
          }),
        ],
        filter: "muted",
        onFilterChange: changeFilter,
      },
    });

    expect(
      screen.getByRole("button", { name: /Muted Chat/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Active Chat/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Archived Muted Chat/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /免扰/ })).not.toBeInTheDocument();
    expect(changeFilter).not.toHaveBeenCalled();
  });

  it("exposes a mark-all-read action when any conversation is unread", async () => {
    const markAllRead = vi.fn();
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:active", "Active Chat", { unread_count: 3 }),
        ],
        filter: "active",
        onMarkAllRead: markAllRead,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "全部已读" }));

    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  it("excludes muted unread conversations from the sidebar unread total", () => {
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:loud", "Loud Chat", { unread_count: 2 }),
          conversation("direct:muted", "Muted Chat", {
            muted: true,
            unread_count: 7,
          }),
        ],
        filter: "active",
      },
    });

    expect(screen.getByRole("tab", { name: /会话 2/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /会话 9/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Muted Chat 7 条未读")).toHaveClass("muted");
  });

  it("keeps muted unread conversations visible in the single conversation list", () => {
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:loud", "Loud Chat", { unread_count: 2 }),
          conversation("direct:muted", "Muted Chat", {
            muted: true,
            unread_count: 7,
          }),
        ],
        filter: "unread",
      },
    });

    expect(
      screen.getByRole("button", { name: /Loud Chat/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Muted Chat/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /未读/ })).not.toBeInTheDocument();
  });

  it("distinguishes manual unread markers from ordinary unread counts", () => {
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:manual", "Manual Chat", {
            unread_count: 1,
            manual_unread: true,
          }),
        ],
      },
    });

	    const mainButton = screen.getByRole("button", { name: /Manual Chat/ });
	    expect(mainButton.closest(".conversation-item")).toHaveClass("manual-unread");
	    expect(within(mainButton).queryByText("未读标记")).not.toBeInTheDocument();
	    expect(within(mainButton).getByTitle("手动标为未读")).toHaveClass("manual");
	    expect(screen.getByLabelText("Manual Chat 已标为未读")).toHaveClass("manual");
	  });

  it("marks conversations that mentioned the local user", () => {
    render(ConversationList, {
      props: {
        conversations: [conversation("group:ops", "Ops", { unread_count: 2 })],
        mentionedConversationIds: ["group:ops"],
      },
    });

	    const item = screen.getByRole("button", { name: /Ops/ });
	    expect(within(item).queryByText("@我")).not.toBeInTheDocument();
	    expect(within(item).getByTitle("@我")).toHaveClass("mention");
  });

  it("marks mentioned conversations without exposing a mention filter tab", async () => {
    const changeFilter = vi.fn();
    render(ConversationList, {
      props: {
        conversations: [
          conversation("group:ops", "Ops", { unread_count: 2 }),
          conversation("group:quiet", "Quiet"),
          conversation("group:archived", "Archived", {
            archived: true,
            unread_count: 1,
          }),
        ],
        filter: "mentions",
        mentionedConversationIds: ["group:ops", "group:archived"],
        onFilterChange: changeFilter,
      },
    });

    expect(screen.getByRole("button", { name: /Ops/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Quiet/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Archived/ }),
    ).not.toBeInTheDocument();
	    const ops = screen.getByRole("button", { name: /Ops/ });
	    expect(within(ops).queryByText("@我")).not.toBeInTheDocument();
	    expect(within(ops).getByTitle("@我")).toHaveClass("mention");
	    expect(screen.queryByRole("tab", { name: /@我 1/ })).not.toBeInTheDocument();
	    expect(changeFilter).not.toHaveBeenCalled();
  });

  it("marks todo conversations and keeps them in the single sorted list", async () => {
    const changeFilter = vi.fn();
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:todo", "Todo Chat"),
          conversation("direct:quiet", "Quiet Chat"),
          conversation("direct:archived-todo", "Archived Todo", {
            archived: true,
          }),
        ],
        filter: "todo",
        todoConversationCounts: {
          "direct:todo": 2,
          "direct:archived-todo": 1,
        },
        onFilterChange: changeFilter,
      },
    });

	    const item = screen.getByRole("button", { name: /Todo Chat/ });
	    expect(item).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Quiet Chat/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Archived Todo/ }),
    ).not.toBeInTheDocument();
	    expect(within(item).queryByText("待办 2")).not.toBeInTheDocument();
	    expect(within(item).getByTitle("2 个待办")).toHaveClass("todo");
	    expect(screen.queryByRole("tab", { name: /待办 1/ })).not.toBeInTheDocument();
	    expect(changeFilter).not.toHaveBeenCalled();
  });

  it("marks outbox conversations and keeps them in the single sorted list", async () => {
    const changeFilter = vi.fn();
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:failed", "Failed Chat"),
          conversation("direct:queued", "Queued Chat"),
          conversation("direct:quiet", "Quiet Chat"),
          conversation("direct:archived-outbox", "Archived Outbox", {
            archived: true,
          }),
        ],
        filter: "outbox",
        outboxConversationCounts: {
          "direct:failed": 3,
          "direct:queued": 1,
          "direct:archived-outbox": 1,
        },
        failedOutboxConversationCounts: {
          "direct:failed": 2,
        },
        onFilterChange: changeFilter,
      },
    });

    const failed = screen.getByRole("button", { name: /Failed Chat/ });
    const queued = screen.getByRole("button", { name: /Queued Chat/ });
    expect(failed).toBeInTheDocument();
    expect(queued).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Quiet Chat/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Archived Outbox/ })).not.toBeInTheDocument();
	    expect(within(failed).queryByText("失败 2")).not.toBeInTheDocument();
	    expect(within(queued).queryByText("待发 1")).not.toBeInTheDocument();
	    expect(within(failed).getByTitle("2 条发送失败")).toHaveClass("failed");
	    expect(within(queued).getByTitle("1 条待发送")).toHaveClass("outbox");
    expect(screen.queryByRole("tab", { name: /待发 2/ })).not.toBeInTheDocument();
    expect(changeFilter).not.toHaveBeenCalled();
  });

  it("shows typing previews in the conversation list", () => {
    render(ConversationList, {
      props: {
        conversations: [conversation("direct:active", "Active Chat")],
        typingPreviewByConversation: { "direct:active": "Alice 正在输入..." },
      },
    });

    const item = screen.getByRole("button", { name: /Active Chat/ });
    expect(within(item).getByText(/Alice 正在输入/)).toBeInTheDocument();
  });

  it("shows the latest message preview when no draft or typing preview is present", () => {
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:active", "Active Chat", {
            last_message_preview: "latest runbook update",
          }),
        ],
        query: "runbook",
      },
    });

    const item = screen.getByRole("button", { name: /Active Chat/ });
    expect(within(item).getByText("latest runbook update")).toBeInTheDocument();
  });

  it("keeps draft previews ahead of typing previews", () => {
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:active", "Active Chat", {
            draft_preview: "finish report",
          }),
        ],
        typingPreviewByConversation: { "direct:active": "Alice 正在输入..." },
      },
    });

    const item = screen.getByRole("button", { name: /Active Chat/ });
    expect(within(item).getByText("finish report")).toBeInTheDocument();
    expect(within(item).queryByText(/Alice 正在输入/)).not.toBeInTheDocument();
  });

  it("hides draft and latest message previews while privacy mode is enabled", () => {
    render(ConversationList, {
      props: {
        privacyMode: true,
        conversations: [
          conversation("direct:draft", "Draft Chat", {
            draft_preview: "secret draft",
          }),
          conversation("direct:latest", "Latest Chat", {
            last_message_preview: "payroll update",
          }),
        ],
      },
    });

    expect(screen.queryByText("secret draft")).not.toBeInTheDocument();
    expect(screen.queryByText("payroll update")).not.toBeInTheDocument();
    expect(screen.getByText("草稿已隐藏")).toBeInTheDocument();
    expect(screen.getByText("消息预览已隐藏")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /secret draft|payroll update/ }),
    ).not.toBeInTheDocument();
  });

  it("uses contact remarks for direct conversation titles and search", () => {
    render(ConversationList, {
      props: {
        conversations: [conversation("direct:peer-a", "Peer A")],
        peers: [peer("peer-a", "Alice")],
        contactMetadata: {
          "peer-a": metadata("peer-a", "研发一号", { blocked: true }),
        },
        query: "研发",
      },
    });

    expect(
      screen.getByRole("button", { name: /研发一号/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Peer A/ }),
    ).not.toBeInTheDocument();
  });

  it("shows peer presence on direct conversation avatars", () => {
    render(ConversationList, {
      props: {
        conversations: [conversation("direct:peer-a", "Peer A")],
        peers: [{ ...peer("peer-a", "Alice"), status: "offline" }],
      },
    });

    expect(screen.getByLabelText("Alice 暂不可达")).toHaveClass("offline");
  });

  it("renders unavailable peers with the same gray visual tone without exposing away text", async () => {
    render(ConversationList, {
      props: {
        conversations: [],
        peers: [{ ...peer("peer-a", "Alice"), status: "away" }],
      },
    });

    await fireEvent.click(screen.getByRole("tab", { name: /联系人/ }));
    const presence = screen.getByLabelText("Alice 暂不可达");
    expect(presence).toHaveClass("offline");
    expect(presence).not.toHaveClass("away");
    expect(presence).toHaveAttribute("title", "暂不可达");
    expect(screen.queryByTitle("离开")).not.toBeInTheDocument();
  });

  it("shows the contact directory as a lean sidebar list without local summary cards", async () => {
    render(ConversationList, {
      props: {
        conversations: [],
        peers: [
          peer("peer-a", "研发一号"),
          { ...peer("peer-b", "设计二号"), status: "offline" },
        ],
        contactMetadata: {
          "peer-a": metadata("peer-a", "前端研发", {
            group_name: "研发部",
            favorite: true,
          }),
          "peer-b": metadata("peer-b", "设计二号", { group_name: "设计部" }),
        },
      },
    });

    await fireEvent.click(screen.getByRole("tab", { name: /联系人/ }));
    expect(screen.queryByRole("region", { name: "联系人概览" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "管理联系人" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新联系人" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "联系人列表" })).getByRole("group", {
        name: "联系人分组 研发部",
      }),
    ).toBeInTheDocument();
  });

  it("keeps contact discovery free of duplicate status filter tabs", async () => {
    render(ConversationList, {
      props: {
        conversations: [conversation("direct:active", "Active Chat")],
        peers: [
          peer("peer-a", "Alice"),
          peer("peer-b", "Bob"),
          { ...peer("peer-c", "Carol"), status: "offline" },
        ],
      },
    });

    await fireEvent.click(screen.getAllByRole("tab")[1]);
    const contactList = screen.getByRole("list");

    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(within(contactList).getByText("Alice")).toBeInTheDocument();
    expect(within(contactList).getByText("Bob")).toBeInTheDocument();
    expect(within(contactList).getByText("Carol")).toBeInTheDocument();
  });

  it("marks pinned conversations with row styling instead of visible pinned text", () => {
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:peer-a", "Alice Chat", {
            pinned: true,
          }),
        ],
      },
    });

    const mainButton = screen.getByRole("button", { name: /Alice Chat/ });
    expect(mainButton.closest(".conversation-item")).toHaveClass("pinned");
    expect(within(mainButton).queryByText("置顶")).not.toBeInTheDocument();
  });

  it("searches conversations, contacts, and chat records with keyboard selection", async () => {
    const selectConversation = vi.fn();
    const openMessageResult = vi.fn();
    const searchMessages = vi.fn(async () => [
      chatMessage("msg-ops", "direct:ops", "ops release checklist"),
    ]);
    render(ConversationList, {
      props: {
        conversations: [
          conversation("direct:ops", "Ops Room", {
            last_message_preview: "ops deploy window",
          }),
        ],
        peers: [
          {
            ...peer("ops", "Ops Device"),
            hostname: "ops-host.local",
            endpoints: ["10.0.0.8:24251"],
          },
        ],
        onSelectConversation: selectConversation,
        onOpenMessageResult: openMessageResult,
        onSearchMessages: searchMessages,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "找人/搜索" }));
    const input = screen.getByPlaceholderText("用户名、主机名、IP 或聊天内容");
    await fireEvent.input(input, { target: { value: "ops" } });

    const suggestions = await screen.findByRole("listbox", { name: "搜索建议" });
    expect(within(suggestions).getByText("会话")).toBeInTheDocument();
    expect(within(suggestions).getByText("联系人")).toBeInTheDocument();
    await waitFor(() => expect(within(suggestions).getByText("记录")).toBeInTheDocument());
    expect(within(suggestions).getByText("10.0.0.8:24251")).toBeInTheDocument();
    expect(searchMessages).toHaveBeenCalledWith("ops");

    await fireEvent.keyDown(input, { key: "ArrowDown" });
    await fireEvent.keyDown(input, { key: "ArrowDown" });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(openMessageResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: "msg-ops" }),
    );
    expect(selectConversation).not.toHaveBeenCalled();
  });

  it("groups sidebar contacts by saved contact group", async () => {
    const selectConversation = vi.fn();
    render(ConversationList, {
      props: {
        conversations: [],
        peers: [
          peer("peer-a", "Alice"),
          peer("peer-b", "Bob"),
          peer("peer-c", "Carol"),
        ],
        contactMetadata: {
          "peer-a": metadata("peer-a", "Alice", { group_name: "Engineering" }),
          "peer-b": metadata("peer-b", "Bob", { group_name: "Engineering" }),
          "peer-c": metadata("peer-c", "Carol", { group_name: "Design" }),
        },
        onSelectConversation: selectConversation,
      },
    });

    await fireEvent.click(screen.getByRole("tab", { name: /联系人/ }));
    const contactList = screen.getByRole("list", { name: "联系人列表" });
    const engineering = within(contactList).getByRole("group", { name: "联系人分组 Engineering" });
    const design = within(contactList).getByRole("group", { name: "联系人分组 Design" });

    expect(within(engineering).getByText("Alice")).toBeInTheDocument();
    expect(within(engineering).getByText("Bob")).toBeInTheDocument();
    expect(within(design).getByText("Carol")).toBeInTheDocument();

    await fireEvent.click(within(engineering).getByRole("button", { name: "与 Alice 聊天" }));

    expect(selectConversation).toHaveBeenCalledWith("direct:peer-a");
  });

  it("keeps conversations as the default sidebar page when conversation history exists", async () => {
    render(ConversationList, {
      props: {
        conversations: [conversation("direct:active", "Active Chat")],
        peers: [
          peer("peer-a", "Alice"),
          { ...peer("peer-b", "Bob"), status: "offline" },
        ],
      },
    });

    expect(
      screen.getByRole("button", { name: /Active Chat/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /会话/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByRole("region", { name: "联系人概览" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "联系人列表" }),
    ).not.toBeInTheDocument();
  });

  it("switches to the contact directory from the sidebar view tabs", async () => {
    render(ConversationList, {
      props: {
        conversations: [conversation("direct:active", "Active Chat")],
        peers: [
          peer("peer-a", "Alice"),
          { ...peer("peer-b", "Bob"), status: "offline" },
        ],
      },
    });

    await fireEvent.click(screen.getByRole("tab", { name: /联系人 2 人/ }));

    expect(screen.getByRole("tab", { name: /联系人 2 人/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("region", { name: "联系人概览" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新联系人" })).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "联系人列表" }),
    ).toBeInTheDocument();
  });

  it("opens contact details from an explicit contact-row action without losing direct chat", async () => {
    const selectConversation = vi.fn();
    const openPeerDetails = vi.fn();
    render(ConversationList, {
      props: {
        conversations: [conversation("direct:active", "Active Chat")],
        peers: [peer("peer-a", "Alice")],
        onSelectConversation: selectConversation,
        onOpenPeerDetails: openPeerDetails,
      },
    });

    await fireEvent.click(screen.getByRole("tab", { name: /联系人 1 人/ }));
    await fireEvent.click(screen.getByRole("button", { name: "与 Alice 聊天" }));
    await fireEvent.click(screen.getByRole("button", { name: "查看 Alice 资料" }));

    expect(selectConversation).toHaveBeenCalledWith("direct:peer-a");
    expect(openPeerDetails).toHaveBeenCalledWith(
      expect.objectContaining({ peer_id: "peer-a" }),
    );
  });
});
