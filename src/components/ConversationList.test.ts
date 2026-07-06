import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import ConversationList from "./ConversationList.svelte";
import type { ContactMetadata, ConversationSummary, PeerProfile } from "../api";
import styles from "../styles.css?raw";

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

  it("shows archived conversations in the all view", () => {
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
      screen.getByRole("button", { name: /Archived Chat/ }),
    ).toBeInTheDocument();
  });

  it("keeps row shortcut actions out of the default conversation scan path", () => {
    render(ConversationList, {
      props: {
        conversations: [conversation("direct:active", "Active Chat")],
        filter: "active",
        onQueryChange: vi.fn(),
        onFilterChange: vi.fn(),
      },
    });

    const mainButton = screen.getByRole("button", { name: /Active Chat/ });
    const item = mainButton.closest(".conversation-item");
    const actions = item?.querySelector(".conversation-actions");

    expect(actions).toHaveAttribute("aria-hidden", "true");
    expect(mainButton).toHaveClass("conversation-main-button");
  });

  it("does not reveal row shortcut actions only because the active row keeps keyboard focus", () => {
    expect(styles).not.toContain(".conversation-item:focus-within .conversation-actions");
  });

  it("filters muted conversations from the sidebar filter tabs", async () => {
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
      screen.queryByRole("button", { name: /Active Chat/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Archived Muted Chat/ }),
    ).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole("tab", { name: /免扰/ }));

    expect(changeFilter).toHaveBeenCalledWith("muted");
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

  it("keeps muted unread conversations out of the unread tab", () => {
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
      screen.queryByRole("button", { name: /Muted Chat/ }),
    ).not.toBeInTheDocument();
  });

  it("marks conversations that mentioned the local user", () => {
    render(ConversationList, {
      props: {
        conversations: [conversation("group:ops", "Ops", { unread_count: 2 })],
        mentionedConversationIds: ["group:ops"],
      },
    });

    const item = screen.getByRole("button", { name: /Ops/ });
    expect(within(item).getByText("@我")).toHaveClass("mention-flag");
  });

  it("filters conversations that mentioned the local user", async () => {
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
      screen.queryByRole("button", { name: /Quiet/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Archived/ }),
    ).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole("tab", { name: /@我 1/ }));

    expect(changeFilter).toHaveBeenCalledWith("mentions");
  });

  it("marks and filters conversations with message todos", async () => {
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
      screen.queryByRole("button", { name: /Quiet Chat/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Archived Todo/ }),
    ).not.toBeInTheDocument();
    expect(within(item).getByText("待办 2")).toHaveClass("todo-flag");

    await fireEvent.click(screen.getByRole("tab", { name: /待办 1/ }));

    expect(changeFilter).toHaveBeenCalledWith("todo");
  });

  it("marks and filters conversations with outbox messages", async () => {
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
    expect(screen.queryByRole("button", { name: /Quiet Chat/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Archived Outbox/ })).not.toBeInTheDocument();
    expect(within(failed).getByText("失败 2")).toHaveClass("failed");
    expect(within(queued).getByText("待发 1")).toHaveClass("outbox-flag");

    await fireEvent.click(screen.getByRole("tab", { name: /待发 2/ }));

    expect(changeFilter).toHaveBeenCalledWith("outbox");
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

  it("shows the contact directory as its own sidebar page when there are no conversations", async () => {
    const openContacts = vi.fn();
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
        onOpenContacts: openContacts,
      },
    });

    await fireEvent.click(screen.getByRole("tab", { name: /联系人/ }));
    const contactSummary = screen.getByRole("region", { name: "联系人概览" });
    expect(
      within(contactSummary).getByLabelText("局域网联系人 2 人"),
    ).toBeInTheDocument();
    expect(
      within(contactSummary).getByLabelText("可联系联系人 1 人"),
    ).toBeInTheDocument();
    expect(
      within(contactSummary).getByLabelText("暂不可达联系人 1 人"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "联系人列表" })).getByRole("group", {
        name: "联系人分组 研发部",
      }),
    ).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "管理联系人" }));

    expect(openContacts).toHaveBeenCalledTimes(1);
  });

  it("filters the sidebar contact directory by reachable, favorite, and unavailable peers", async () => {
    render(ConversationList, {
      props: {
        conversations: [conversation("direct:active", "Active Chat")],
        peers: [
          peer("peer-a", "Alice"),
          peer("peer-b", "Bob"),
          { ...peer("peer-c", "Carol"), status: "offline" },
        ],
        contactMetadata: {
          "peer-b": metadata("peer-b", "Bob", { favorite: true }),
        },
      },
    });

    await fireEvent.click(screen.getByRole("tab", { name: /联系人 3 人/ }));
    const filterTabs = screen.getByRole("tablist", { name: "联系人筛选" });
    const contactList = screen.getByRole("list", { name: "联系人列表" });

    expect(within(filterTabs).getByRole("tab", { name: "全部 3" })).toHaveAttribute("aria-selected", "true");

    await fireEvent.click(within(filterTabs).getByRole("tab", { name: "可联系 2" }));
    expect(within(contactList).getByText("Alice")).toBeInTheDocument();
    expect(within(contactList).getByText("Bob")).toBeInTheDocument();
    expect(within(contactList).queryByText("Carol")).not.toBeInTheDocument();

    await fireEvent.click(within(filterTabs).getByRole("tab", { name: "收藏 1" }));
    expect(within(contactList).queryByText("Alice")).not.toBeInTheDocument();
    expect(within(contactList).getByText("Bob")).toBeInTheDocument();
    expect(within(contactList).queryByText("Carol")).not.toBeInTheDocument();

    await fireEvent.click(within(filterTabs).getByRole("tab", { name: "暂不可达 1" }));
    expect(within(contactList).queryByText("Alice")).not.toBeInTheDocument();
    expect(within(contactList).queryByText("Bob")).not.toBeInTheDocument();
    expect(within(contactList).getByText("Carol")).toBeInTheDocument();
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

    const contactSummary = screen.getByRole("region", { name: "联系人概览" });
    expect(screen.getByRole("tab", { name: /联系人 2 人/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      within(contactSummary).getByLabelText("局域网联系人 2 人"),
    ).toBeInTheDocument();
    expect(
      within(contactSummary).getByLabelText("可联系联系人 1 人"),
    ).toBeInTheDocument();
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
