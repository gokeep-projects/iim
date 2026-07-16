import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import ChatWorkspace from "./ChatWorkspace.svelte";
import type {
  ChatMessage,
  ConversationSummary,
  PeerProfile,
  TransferTask,
} from "../api";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

async function openMoreTools() {
  const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
  await fireEvent.click(within(toolbar).getByRole("button", { name: "更多" }));
  return within(toolbar).getByRole("group", { name: "更多消息工具" });
}

function transferMessage(): ChatMessage {
  return {
    id: "msg-file",
    conversation_id: "direct:peer-a",
    sender_id: "peer-a",
    body: "发送了文件：report.pdf",
    attachments: [
      {
        type: "transfer",
        manifest: {
          transfer_id: "transfer-1",
          files: [
            {
              path: "report.pdf",
              relative_path: null,
              size: 4096,
              sha256: "a".repeat(64),
            },
          ],
          total_bytes: 4096,
          chunk_size: 262144,
          sha256: "b".repeat(64),
        },
      },
    ],
    created_at: 1_700_000_000_000,
    status: "received",
    recalled: false,
    quote: null,
    favorited: false,
    reactions: [],
  };
}

function imageTransferMessage(): ChatMessage {
  const message = transferMessage();
  message.id = "msg-image";
  message.body = "screenshot";
  message.attachments[0].manifest.transfer_id = "transfer-image";
  message.attachments[0].manifest.files = [
    {
      path: "C:\\Users\\admin\\Pictures\\screenshot.png",
      relative_path: null,
      size: 8192,
      sha256: "c".repeat(64),
    },
  ];
  message.attachments[0].manifest.total_bytes = 8192;
  return message;
}

function folderTransferMessage(): ChatMessage {
  const message = transferMessage();
  message.id = "msg-folder";
  message.body = "";
  message.attachments[0].manifest.transfer_id = "transfer-folder";
  message.attachments[0].manifest.files = [
    {
      path: "readme.md",
      relative_path: "docs/readme.md",
      size: 512,
      sha256: "c".repeat(64),
    },
    {
      path: "diagram.png",
      relative_path: "assets/diagram.png",
      size: 1024,
      sha256: "d".repeat(64),
    },
  ];
  message.attachments[0].manifest.total_bytes = 1536;
  return message;
}

function textMessage(patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-text",
    conversation_id: "group:ops",
    sender_id: "peer-a",
    body: "今晚值班我来处理",
    attachments: [],
    created_at: 1_700_000_010_000,
    status: "received",
    recalled: false,
    quote: null,
    favorited: false,
    reactions: [],
    ...patch,
  };
}

function conversation(
  patch: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id: "direct:peer-a",
    title: "Alice",
    last_message_at: 1_700_000_010_000,
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

function transferTask(patch: Partial<TransferTask> = {}): TransferTask {
  return {
    id: "transfer-1",
    conversationId: "direct:peer-a",
    name: "report.pdf",
    status: "downloading",
    errorMessage: "",
    totalBytes: 4096,
    sentBytes: 2048,
    files: ["report.pdf"],
    resumable: true,
    ...patch,
  };
}

function peerProfile(patch: Partial<PeerProfile> = {}): PeerProfile {
  return {
    peer_id: "peer-a",
    display_name: "Alice",
    hostname: "alice-pc",
    avatar_hash: null,
    status: "online",
    endpoints: ["192.168.1.10:24251"],
    fingerprint: "a".repeat(64),
    public_key: Array(32).fill(1),
    ...patch,
  };
}

describe("ChatWorkspace attachments", () => {
  it("toggles an existing message reaction from the reaction strip", async () => {
    const onReactMessage = vi.fn();
    const message = textMessage({
      reactions: [
        { sender_id: "peer-b", reaction: "👍" },
        { sender_id: "local-demo", reaction: "👍" },
      ],
    });

    render(ChatWorkspace, {
      messages: [message],
      selfPeerId: "local-demo",
      onReactMessage,
    });

    await fireEvent.click(screen.getByRole("button", { name: "回应 👍，2 人" }));

    expect(onReactMessage).toHaveBeenCalledWith(message, "👍");
  });

  it("keeps group details in the title bar, not the announcement or composer tools", async () => {
    const showDetails = vi.fn();
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        memberCount: 4,
        title: "内网群聊",
        conversation: conversation({
          id: "group:ops",
          title: "内网群聊",
          group_announcement: "今天 15:00 发布窗口，先同步回滚方案。",
          group_announcement_pinned: true,
        }),
        onShowDetails: showDetails,
      },
    });

    const banner = screen.getByRole("region", { name: "群公告" });
    expect(within(banner).getByText("群公告")).toBeInTheDocument();
    expect(
      within(banner).getByText("今天 15:00 发布窗口，先同步回滚方案。"),
    ).toBeInTheDocument();
    expect(
      within(banner).queryByRole("button", { name: "查看群资料" }),
    ).not.toBeInTheDocument();

    await fireEvent.click(
      within(screen.getByRole("group", { name: "会话标题栏" })).getByRole("button", {
        name: "查看群资料",
      }),
    );
    expect(showDetails).toHaveBeenCalledTimes(1);
    expect(within(await openMoreTools()).queryByRole("button", { name: "成员" })).not.toBeInTheDocument();
  });

  it("keeps an unpinned group announcement out of the chat timeline", () => {
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        title: "内网群聊",
        conversation: conversation({
          id: "group:ops",
          title: "内网群聊",
          group_announcement: "仅在群资料中查看",
          group_announcement_pinned: false,
        }),
      },
    });

    expect(screen.queryByRole("region", { name: "群公告" })).not.toBeInTheDocument();
  });

  it("keeps protocol details out of the everyday group chat header", () => {
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        memberCount: 4,
        title: "内网群聊",
      },
    });

    const header = screen.getByRole("group", { name: "会话标题栏" });
    expect(within(header).getByRole("heading", { name: "内网群聊" })).toBeInTheDocument();
    expect(within(header).getByText("4 位成员")).toBeInTheDocument();
    expect(within(header).queryByText(/fanout|无服务器|无中间服务器|直连/)).not.toBeInTheDocument();
  });

  it("keeps sparse day dividers and places per-message hover times above bubbles", () => {
    render(ChatWorkspace, {
      props: {
        messages: [
          textMessage({
            id: "day-one-a",
            created_at: new Date(2024, 0, 1, 12, 0).getTime(),
          }),
          textMessage({
            id: "day-one-b",
            created_at: new Date(2024, 0, 1, 12, 2).getTime(),
          }),
          textMessage({
            id: "day-two",
            created_at: new Date(2024, 0, 2, 9, 0).getTime(),
          }),
        ],
      },
    });

    expect(
      screen.getByRole("separator", { name: /1月1日 12:00/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: /1月2日 09:00/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("separator")).toHaveLength(2);
    const hoverTimes = document.querySelectorAll(".message-hover-time");
    const firstStack = document.querySelector(".message-stack");
    expect(hoverTimes).toHaveLength(3);
    expect(firstStack?.firstElementChild).toHaveClass("message-hover-time");
    expect(firstStack?.firstElementChild).toHaveClass("message-floating-time");
  });

  it("scrolls to the newest message when messages change", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 900,
    });
    const { rerender } = render(ChatWorkspace, {
      props: {
        messages: [textMessage({ id: "first" })],
      },
    });

    scrollTo.mockClear();
    await rerender({
      messages: [
        textMessage({ id: "first" }),
        textMessage({ id: "second", body: "latest update" }),
      ],
    });

    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ top: 900 }),
      ),
    );
  });

  it("shows live transfer status and progress inside attachment cards", async () => {
    render(ChatWorkspace, {
      props: {
        messages: [transferMessage()],
        transferTasks: [transferTask()],
      },
    });

    const attachment = await screen.findByRole("article", {
      name: "附件 report.pdf",
    });
    expect(within(attachment).getByText("传输中")).toBeInTheDocument();
    expect(within(attachment).getByText("2.0 KB / 4.0 KB")).toBeInTheDocument();
    expect(
      within(attachment).getByRole("progressbar", { name: /report\.pdf/ }),
    ).toHaveAttribute("aria-valuenow", "50");
  });

  it("only shows visible message status chips for exceptional sending states", () => {
    render(ChatWorkspace, {
      props: {
        selfPeerId: "local-demo",
        messages: [
          textMessage({
            id: "msg-delivered",
            sender_id: "local-demo",
            status: "delivered",
            favorited: true,
          }),
          textMessage({
            id: "msg-failed",
            sender_id: "local-demo",
            status: "failed",
            send_attempts: 2,
          }),
          textMessage({
            id: "msg-sending",
            sender_id: "local-demo",
            status: "sending",
            send_attempts: 1,
          }),
        ],
      },
    });

    expect(screen.queryByLabelText("消息状态 已送达")).not.toBeInTheDocument();
    expect(screen.getByLabelText("消息状态 发送失败")).toHaveClass(
      "message-status-chip",
      "failed",
    );
    expect(screen.getByLabelText("消息状态 发送中 · 第 1/3 次")).toHaveClass(
      "message-status-chip",
      "active",
    );
    const favoriteMark = screen.getByLabelText("已收藏");
    expect(favoriteMark).toHaveClass("message-meta-chip");
    expect(within(favoriteMark).getByText("收藏")).toHaveClass("visually-hidden");
    expect(favoriteMark.closest(".message-meta")).toHaveClass("message-hover-actions", "message-floating-meta");
    expect(screen.queryByText("已尝试 2 次")).not.toBeInTheDocument();
  });

  it("opens the transfer directory directly from an attachment card", async () => {
    const openTransfer = vi.fn();
    render(ChatWorkspace, {
      props: {
        messages: [transferMessage()],
        onOpenTransfer: openTransfer,
      },
    });

    const attachment = await screen.findByRole("article", {
      name: "附件 report.pdf",
    });
    await fireEvent.click(
      within(attachment).getByRole("button", { name: "打开" }),
    );

    expect(openTransfer).toHaveBeenCalledWith("transfer-1");
  });

  it("copies the file list directly from an attachment card", async () => {
    const copyAttachmentFiles = vi.fn();
    render(ChatWorkspace, {
      props: {
        messages: [folderTransferMessage()],
        onCopyAttachmentFiles: copyAttachmentFiles,
      },
    });

    const attachment = await screen.findByRole("article", {
      name: "附件 2 个文件",
    });
    const copyButton = within(attachment).getByRole("button", { name: "复制清单" });
    expect(within(copyButton).getByText("复制清单")).toHaveClass("visually-hidden");
    expect(copyButton.closest(".attachment-actions")).toHaveClass("attachment-floating-actions");
    await fireEvent.click(copyButton);

    expect(copyAttachmentFiles).toHaveBeenCalledWith(
      "docs/readme.md\nassets/diagram.png",
    );
  });

  it("previews single-image attachments inside the app while keeping transfer actions", async () => {
    const openTransfer = vi.fn();
    render(ChatWorkspace, {
      props: {
        messages: [imageTransferMessage()],
        onOpenTransfer: openTransfer,
      },
    });

    const attachment = await screen.findByRole("article", {
      name: /screenshot\.png/,
    });
    await fireEvent.click(
      within(attachment).getByRole("button", {
        name: /预览图片 screenshot\.png/,
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: "图片预览" });
    const image = within(dialog).getByRole("img", { name: "screenshot.png" });
    expect(image).toHaveAttribute(
      "src",
      "asset://C:\\Users\\admin\\Pictures\\screenshot.png",
    );

    await fireEvent.click(
      within(dialog).getByRole("button", { name: "打开所在目录" }),
    );
    expect(openTransfer).toHaveBeenCalledWith("transfer-image");
  });

  it("closes the image preview dialog with Escape", async () => {
    render(ChatWorkspace, {
      props: {
        messages: [imageTransferMessage()],
      },
    });

    const attachment = await screen.findByRole("article", {
      name: /screenshot\.png/,
    });
    await fireEvent.click(
      within(attachment).getByRole("button", {
        name: /预览图片 screenshot\.png/,
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "图片预览" });

    await fireEvent.keyDown(dialog, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "图片预览" }),
    ).not.toBeInTheDocument();
  });

  it("does not render an empty text paragraph for attachment-only messages", async () => {
    const message = transferMessage();
    message.body = "";
    render(ChatWorkspace, {
      props: {
        messages: [message],
      },
    });

    expect(
      await screen.findByRole("article", { name: "附件 report.pdf" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".message-body")).not.toBeInTheDocument();
    expect(document.querySelector(".message-bubble")).toHaveClass("attachment-only");
  });

  it("renders quoted messages as a compact author and preview line", () => {
    render(ChatWorkspace, {
      props: {
        messages: [
          textMessage({
            quote: {
              message_id: "quoted-message",
              sender_id: "peer-b",
              body_preview: "部署窗口 18:00",
            },
          }),
        ],
        messageSenderLabels: { "peer-b": "运维二号" },
      },
    });

    const quote = document.querySelector(".message-quote");
    expect(quote?.querySelector(".message-quote-author")).toHaveTextContent("运维二号");
    expect(quote?.querySelector(".message-quote-preview")).toHaveTextContent("部署窗口 18:00");
  });

  it("keeps attachment actions inert when file actions are disabled", async () => {
    const startScreenshot = vi.fn();
    const chooseFiles = vi.fn();
    const chooseFolder = vi.fn();
    render(ChatWorkspace, {
      props: {
        fileActionsDisabled: true,
        fileActionsDisabledReason: "blocked",
        onChooseDesktopFiles: chooseFiles,
        onChooseDesktopFolder: chooseFolder,
        onStartScreenshot: startScreenshot,
      },
    });

    const screenshotButton = screen.getByRole("button", { name: "截图" });
    const fileButton = screen.getByRole("button", { name: "文件" });
    const folderButton = within(await openMoreTools()).getByRole("button", { name: "文件夹" });
    expect(fileButton).toBeDisabled();
    expect(folderButton).toBeDisabled();
    expect(screenshotButton).toBeDisabled();
    await fireEvent.click(fileButton);
    await fireEvent.click(folderButton);
    await fireEvent.click(screenshotButton);

    expect(chooseFiles).not.toHaveBeenCalled();
    expect(chooseFolder).not.toHaveBeenCalled();
    expect(startScreenshot).not.toHaveBeenCalled();
  });

  it("keeps dropped and pasted files inert when file actions are disabled", async () => {
    const pickFiles = vi.fn();
    const { container } = render(ChatWorkspace, {
      props: {
        fileActionsDisabled: true,
        fileActionsDisabledReason: "blocked",
        onPickFiles: pickFiles,
      },
    });
    const composer = container.querySelector("form.composer");
    if (!composer) throw new Error("composer form missing");
    const file = new File(["hello"], "report.txt", { type: "text/plain" });

    await fireEvent.drop(composer, {
      dataTransfer: {
        files: [file],
      },
    });
    await fireEvent.paste(composer, {
      clipboardData: {
        files: [file],
        items: [],
      },
    });

    expect(pickFiles).not.toHaveBeenCalled();
  });

  it("highlights mentions in group message bodies without using raw html", () => {
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        selfPeerId: "local-peer",
        selfDisplayName: "Me",
        messages: [
          textMessage({
            sender_id: "peer-a",
            body: "please ask @Alice and @Me before release; notice @所有人",
          }),
        ],
      },
    });

    expect(screen.getByText("@Alice")).toHaveClass("message-mention");
    expect(screen.getByText("@Me")).toHaveClass(
      "message-mention",
      "self-mention",
    );
    expect(screen.getByText("@所有人")).toHaveClass(
      "message-mention",
      "self-mention",
    );
    expect(screen.getByText(/please ask/)).toBeInTheDocument();
  });

  it("renders http links as safe clickable anchors alongside mentions", () => {
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        selfPeerId: "local-peer",
        selfDisplayName: "Me",
        messages: [
          textMessage({
            sender_id: "peer-a",
            body: "see https://example.com/runbook, and ping @Me",
          }),
        ],
      },
    });

    const link = screen.getByRole("link", {
      name: "https://example.com/runbook",
    });
    expect(link).toHaveAttribute("href", "https://example.com/runbook");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link).toHaveClass("message-link");
    expect(screen.queryByRole("link", {
      name: "打开链接 https://example.com/runbook",
    })).not.toBeInTheDocument();
    expect(document.querySelector(".link-preview-card")).not.toBeInTheDocument();
    expect(screen.getByText("@Me")).toHaveClass("self-mention");
  });

  it("renders bare intranet host links with safe http targets", () => {
    render(ChatWorkspace, {
      props: {
        messages: [
          textMessage({
            body: "docs intranet.local/wiki and files nas-01:8080/share.",
          }),
        ],
      },
    });

    const docsLink = screen.getByRole("link", { name: "intranet.local/wiki" });
    const filesLink = screen.getByRole("link", { name: "nas-01:8080/share" });
    expect(docsLink).toHaveAttribute("href", "http://intranet.local/wiki");
    expect(filesLink).toHaveAttribute("href", "http://nas-01:8080/share");
    expect(screen.getByText(".")).toBeInTheDocument();
    expect(screen.queryByRole("link", {
      name: "打开链接 http://intranet.local/wiki",
    })).not.toBeInTheDocument();
  });

  it("keeps balanced URL parentheses while stripping sentence punctuation", () => {
    render(ChatWorkspace, {
      props: {
        messages: [
          textMessage({
            body: "kb https://kb.local/wiki/Project_(Alpha).",
          }),
        ],
      },
    });

    const link = screen.getByRole("link", {
      name: "https://kb.local/wiki/Project_(Alpha)",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://kb.local/wiki/Project_(Alpha)",
    );
    expect(screen.getByText(".")).toBeInTheDocument();
    expect(screen.queryByRole("link", {
      name: "打开链接 https://kb.local/wiki/Project_(Alpha)",
    })).not.toBeInTheDocument();
  });
});

describe("ChatWorkspace composer toolbar", () => {
  it("offers a broad emoji set and a dedicated GIF picker without quick replies", async () => {
    render(ChatWorkspace);
    const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
    await fireEvent.click(within(toolbar).getByRole("button", { name: "表情" }));

    const menu = await screen.findByRole("menu", { name: "表情和动图" });
    expect(within(menu).getAllByRole("menuitem").length).toBeGreaterThan(40);
    expect(within(menu).queryByText("快捷回复")).not.toBeInTheDocument();
    await fireEvent.click(within(menu).getByRole("tab", { name: "动图" }));
    expect(within(menu).getByRole("menuitem", { name: "选择 GIF 动图" })).toBeInTheDocument();
    expect(within(menu).getByLabelText("选择 GIF 动图文件")).toHaveAttribute("accept", "image/gif,.gif");
  });

  it("opens the expression picker only by deliberate click, not by hover", async () => {
    render(ChatWorkspace);

    const button = screen.getByRole("button", { name: "表情" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    await fireEvent.mouseEnter(button);
    expect(screen.queryByRole("menu", { name: "表情和动图" })).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");

    await fireEvent.click(button);
    expect(await screen.findByRole("menu", { name: "表情和动图" })).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("shows message selection controls with bulk actions above the chat history", async () => {
    const toggleSelection = vi.fn();
    const toggleSelectAll = vi.fn();
    const cancelSelection = vi.fn();
    const copySelected = vi.fn();
    const favoriteSelected = vi.fn();
    const forwardSelected = vi.fn();
    const deleteSelected = vi.fn();
    render(ChatWorkspace, {
      props: {
        messages: [textMessage(), transferMessage()],
        messageSelectionMode: true,
        selectedMessageIds: ["msg-text"],
        onToggleMessageSelection: toggleSelection,
        onToggleSelectAllMessages: toggleSelectAll,
        onCancelMessageSelection: cancelSelection,
        onBulkCopyMessages: copySelected,
        onBulkFavoriteMessages: favoriteSelected,
        onBulkForwardMessages: forwardSelected,
        onBulkDeleteMessages: deleteSelected,
      },
    });

    const toolbar = screen.getByRole("region", { name: "消息多选工具栏" });
    expect(within(toolbar).getByText("已选择 1 条消息")).toBeInTheDocument();
    expect(screen.getByLabelText("选择消息 msg-text")).toBeChecked();
    expect(screen.getByLabelText("选择消息 msg-file")).not.toBeChecked();

    await fireEvent.click(screen.getByLabelText("选择消息 msg-file"));
    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "全选" }),
    );
    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "复制" }),
    );
    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "收藏" }),
    );
    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "转发" }),
    );
    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "删除" }),
    );
    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "取消" }),
    );

    expect(toggleSelection).toHaveBeenCalledWith("msg-file");
    expect(toggleSelectAll).toHaveBeenCalledTimes(1);
    expect(copySelected).toHaveBeenCalledTimes(1);
    expect(favoriteSelected).toHaveBeenCalledTimes(1);
    expect(forwardSelected).toHaveBeenCalledTimes(1);
    expect(deleteSelected).toHaveBeenCalledTimes(1);
    expect(cancelSelection).toHaveBeenCalledTimes(1);
  });

  it("keeps chat bubbles content-first with external metadata and compact selection rows", () => {
    render(ChatWorkspace, {
      props: {
        messages: [
          textMessage({ favorited: true }),
          transferMessage(),
        ],
        messageSelectionMode: true,
        selectedMessageIds: ["msg-text"],
      },
    });

    const selectedRow = document.querySelector<HTMLElement>(".message-row.selected");
    const attachment = document.querySelector<HTMLElement>(".attachment-card");
    const firstBubble = document.querySelector<HTMLElement>(".message-bubble");

    expect(selectedRow).toHaveClass("selection-mode");
    expect(selectedRow?.querySelector(".message-select-control")).toBeInTheDocument();
    expect(firstBubble?.querySelector(".message-meta")).not.toBeInTheDocument();
    expect(document.querySelector(".message-meta")).toHaveClass("message-hover-actions");
    expect(attachment).toBeInTheDocument();
    expect(attachment?.querySelector(".attachment-progress")).toBeInTheDocument();
  });

  it("renders recalled messages as centered system notices instead of chat bubbles", () => {
    const openMenu = vi.fn();
    render(ChatWorkspace, {
      props: {
        messages: [textMessage({ recalled: true })],
        onMessageContext: openMenu,
      },
    });

    const notice = document.querySelector<HTMLElement>(".message-system-notice");
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveTextContent("对方撤回了一条消息");
    expect(document.querySelector(".message-row.system")).toBeInTheDocument();
    expect(document.querySelector(".message-bubble")).not.toBeInTheDocument();
  });

  it("keeps search and details in the header while the composer stays message-focused", async () => {
    const toggleSearch = vi.fn();
    const showDetails = vi.fn();
    render(ChatWorkspace, {
      props: {
        onToggleConversationSearch: toggleSearch,
        onShowDetails: showDetails,
      },
    });

    const header = screen.getByRole("group", { name: "会话标题栏" });
    await fireEvent.click(within(header).getByRole("button", { name: "搜索聊天记录" }));
    await fireEvent.click(within(header).getByRole("button", { name: "查看直聊资料" }));

    const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
    expect(
      within(toolbar).getByRole("group", { name: "附件工具" }),
    ).toBeInTheDocument();
    expect(within(toolbar).queryByRole("group", { name: "消息工具" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("group", { name: "会话工具" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "聊天记录" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "传输" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "详情" })).not.toBeInTheDocument();

    const moreTools = await openMoreTools();
    expect(within(moreTools).queryByRole("button", { name: "传输" })).not.toBeInTheDocument();
    expect(within(moreTools).queryByRole("button", { name: "详情" })).not.toBeInTheDocument();

    expect(toggleSearch).toHaveBeenCalledTimes(1);
    expect(showDetails).toHaveBeenCalledTimes(1);
  });

  it("shows a direct chat details icon in the header without moving low-frequency tools there", async () => {
    const showDetails = vi.fn();
    render(ChatWorkspace, {
      props: {
        onShowDetails: showDetails,
      },
    });

    const header = screen.getByRole("group", { name: "会话标题栏" });
    const detailsButton = within(header).getByRole("button", { name: "查看直聊资料" });

    expect(detailsButton).toHaveClass("chat-header-action");
    expect(within(header).queryByRole("button", { name: "抖一抖" })).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "传输" })).not.toBeInTheDocument();

    await fireEvent.click(detailsButton);

    expect(showDetails).toHaveBeenCalledTimes(1);
  });

  it("keeps read and unread actions out of the chat header", () => {
    render(ChatWorkspace, {
      props: {
        conversation: conversation({
          unread_count: 2,
          manual_unread: true,
        }),
      },
    });

    const unreadHeader = screen.getByRole("group", { name: "会话标题栏" });
    expect(within(unreadHeader).queryByRole("button", { name: "标为已读" })).not.toBeInTheDocument();
    expect(within(unreadHeader).queryByRole("button", { name: "标为未读" })).not.toBeInTheDocument();
  });

  it("places the four primary message actions directly above the input", () => {
    render(ChatWorkspace);

    const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
    expect(
      within(toolbar).getByRole("button", { name: "文件" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).queryByRole("button", { name: "文件夹" }),
    ).not.toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "截图" }),
    ).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "表情" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "聊天记录" })).not.toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "更多" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "抖一抖" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "搜索" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "传输" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "详情" })).not.toBeInTheDocument();

    const inputRow = document.querySelector(".composer-input-row");
    expect(inputRow).toBeTruthy();
    expect(
      toolbar.compareDocumentPosition(inputRow as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect((inputRow as Element).previousElementSibling).toBe(toolbar);
  });

  it("renders composer actions as compact icon buttons with accessible labels", () => {
    render(ChatWorkspace);

    const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
    const buttons = within(toolbar).getAllByRole("button");

    expect(buttons.length).toBe(4);
    for (const button of buttons) {
      expect(button).toHaveClass("composer-tool-button");
      expect(button).toHaveAttribute("title");
      expect(button.querySelector(".composer-tool-label")?.textContent?.trim()).not.toBe("");
    }
  });

  it("sends a nudge from the composer toolbar and disables it with blocked sending", async () => {
    const sendNudge = vi.fn();
    render(ChatWorkspace, {
      props: {
        onSendNudge: sendNudge,
        sendDisabledReason: "对方已被阻止",
      },
    });

    const moreTools = await openMoreTools();
    expect(within(moreTools).getAllByRole("button")).toHaveLength(3);
    const nudgeButton = within(moreTools).getByRole("button", { name: "抖一抖" });

    expect(nudgeButton).toBeDisabled();
    await fireEvent.click(nudgeButton);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it("calls the nudge handler from the composer toolbar", async () => {
    const sendNudge = vi.fn();
    render(ChatWorkspace, {
      props: {
        onSendNudge: sendNudge,
      },
    });

    await fireEvent.click(within(await openMoreTools()).getByRole("button", { name: "抖一抖" }));

    expect(sendNudge).toHaveBeenCalledTimes(1);
  });

  it("animates the chat workspace when the nudge pulse changes", async () => {
    const { rerender } = render(ChatWorkspace, {
      props: {
        nudgePulseKey: 0,
      },
    });
    const workspace = screen.getByLabelText("聊天工作区");

    expect(workspace).not.toHaveClass("nudge-shake");

    await rerender({ nudgePulseKey: 1 });

    await waitFor(() => expect(workspace).toHaveClass("nudge-shake"));
  });

	  it("closes the expression picker when clicking outside the composer", async () => {
	    render(ChatWorkspace);
	
	    await fireEvent.click(screen.getByRole("button", { name: "表情" }));
	    expect(
	      screen.getByRole("menu", { name: "表情和动图" }),
	    ).toBeInTheDocument();
	
	    await fireEvent.click(document.body);
	
	    expect(
	      screen.queryByRole("menu", { name: "表情和动图" }),
	    ).not.toBeInTheDocument();
	  });

  it("keeps the composer edit menu inside the viewport at the top-left edge", async () => {
    render(ChatWorkspace);

    const input = document.querySelector("textarea") as HTMLTextAreaElement;
    await fireEvent.contextMenu(input, { clientX: -32, clientY: -24 });
    const menu = await screen.findByRole("menu", { name: "输入框编辑菜单" });

    expect(menu).toHaveStyle({ left: "8px", top: "8px" });
  });

  it("focuses the composer edit menu after replacing the native context menu", async () => {
    render(ChatWorkspace);

    const input = document.querySelector("textarea") as HTMLTextAreaElement;
    await fireEvent.contextMenu(input);
    const menu = await screen.findByRole("menu");

    await waitFor(() => expect(menu).toHaveFocus());
  });

  it("keeps low-frequency conversation management out of the more menu", async () => {
    render(ChatWorkspace);
    const tools = await openMoreTools();
    expect(within(tools).queryByRole("button", { name: /置顶|免打扰|归档/ })).not.toBeInTheDocument();
    expect(within(tools).getAllByRole("button")).toHaveLength(3);
  });

  it("disables conversation actions when no conversation can be targeted", async () => {
    const showDetails = vi.fn();
    render(ChatWorkspace, {
      props: {
        conversation: conversation(),
        conversationActionsDisabledReason: "请先选择一个会话或联系人",
        onShowDetails: showDetails,
      },
    });

    const header = screen.getByRole("group", { name: "会话标题栏" });
    const detailButton = within(header).getByRole("button", { name: "查看直聊资料" });
    const searchButton = within(header).getByRole("button", { name: "搜索聊天记录" });
    expect(detailButton).toBeDisabled();
    expect(searchButton).toBeDisabled();
    expect(detailButton).toHaveAttribute("title", "请先选择一个会话或联系人");

    expect(showDetails).not.toHaveBeenCalled();
  });

  it("disables current-conversation message tools when no conversation can be targeted", async () => {
    const toggleSearch = vi.fn();
    const startSelection = vi.fn();
    render(ChatWorkspace, {
      props: {
        conversationActionsDisabledReason: "请先选择一个会话或联系人",
        onToggleConversationSearch: toggleSearch,
        onStartMessageSelection: startSelection,
      },
    });

    const header = screen.getByRole("group", { name: "会话标题栏" });
    const searchButton = within(header).getByRole("button", { name: "搜索聊天记录" });
    const messageTools = await openMoreTools();
    const selectionButton = within(messageTools).getByRole("button", { name: "多选" });

    expect(searchButton).toBeDisabled();
    expect(searchButton).toHaveAttribute("title", "请先选择一个会话或联系人");
    expect(selectionButton).toBeDisabled();

    await fireEvent.click(searchButton);
    await fireEvent.click(selectionButton);

    expect(toggleSearch).not.toHaveBeenCalled();
    expect(startSelection).not.toHaveBeenCalled();
  });
});

describe("ChatWorkspace group mentions", () => {
  it("offers @所有人 in group mention suggestions", async () => {
    const changeDraft = vi.fn();
    const send = vi.fn();
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        mentionableMembers: [
          peerProfile({
            peer_id: "alice",
            display_name: "Alice",
            hostname: "alice-pc",
          }),
          peerProfile({
            peer_id: "bob",
            display_name: "Bob",
            hostname: "bob-pc",
          }),
        ],
        onDraftChange: changeDraft,
        onSend: send,
      },
    });

    const input = document.querySelector("textarea") as HTMLTextAreaElement;
    await fireEvent.input(input, { target: { value: "notice @" } });
    const panel = await screen.findByRole("listbox", { name: "群成员提醒" });
    expect(
      within(panel).getByRole("option", { name: /所有人/ }),
    ).toBeInTheDocument();

    await fireEvent.keyDown(input, { key: "Enter" });

    expect(changeDraft).toHaveBeenLastCalledWith("notice @所有人 ");
    expect(send).not.toHaveBeenCalled();
  });

  it("suggests group members after @ and inserts the selected display name", async () => {
    const changeDraft = vi.fn();
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        mentionableMembers: [
          peerProfile({
            peer_id: "alice",
            display_name: "Alice",
            hostname: "alice-pc",
          }),
          peerProfile({
            peer_id: "bob",
            display_name: "Bob",
            hostname: "bob-pc",
          }),
        ],
        onDraftChange: changeDraft,
      },
    });

    const input = document.querySelector("textarea") as HTMLTextAreaElement;
    await fireEvent.input(input, { target: { value: "please @ali" } });
    const option = await screen.findByRole("option", { name: /Alice/ });
    await fireEvent.click(option);

    expect(changeDraft).toHaveBeenLastCalledWith("please @Alice ");
  });

  it("lets keyboard users choose a mention candidate before sending", async () => {
    const changeDraft = vi.fn();
    const send = vi.fn();
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        mentionableMembers: [
          peerProfile({
            peer_id: "alice",
            display_name: "Alice",
            hostname: "alice-pc",
          }),
          peerProfile({
            peer_id: "bob",
            display_name: "Bob",
            hostname: "bob-pc",
          }),
        ],
        onDraftChange: changeDraft,
        onSend: send,
      },
    });

    const input = document.querySelector("textarea") as HTMLTextAreaElement;
    await fireEvent.input(input, { target: { value: "sync @" } });
    await screen.findByRole("listbox", { name: "群成员提醒" });
    await fireEvent.keyDown(input, { key: "ArrowDown" });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(changeDraft).toHaveBeenLastCalledWith("sync @Alice ");
    expect(send).not.toHaveBeenCalled();
  });

  it("closes mention suggestions with Escape without sending", async () => {
    const send = vi.fn();
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        mentionableMembers: [
          peerProfile({
            peer_id: "alice",
            display_name: "Alice",
            hostname: "alice-pc",
          }),
          peerProfile({
            peer_id: "bob",
            display_name: "Bob",
            hostname: "bob-pc",
          }),
        ],
        onSend: send,
      },
    });

    const input = document.querySelector("textarea") as HTMLTextAreaElement;
    await fireEvent.input(input, { target: { value: "sync @" } });
    await screen.findByRole("listbox", { name: "群成员提醒" });

    await fireEvent.keyDown(input, { key: "Escape" });

    expect(
      screen.queryByRole("listbox", { name: "群成员提醒" }),
    ).not.toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not show mention suggestions in direct conversations", async () => {
    render(ChatWorkspace, {
      props: {
        isGroup: false,
        mentionableMembers: [peerProfile()],
      },
    });

    const input = document.querySelector("textarea") as HTMLTextAreaElement;
    await fireEvent.input(input, { target: { value: "hello @" } });

    expect(
      screen.queryByRole("listbox", { name: "群成员提醒" }),
    ).not.toBeInTheDocument();
  });
});

describe("ChatWorkspace conversation search", () => {
  it("opens current conversation search with Ctrl+F", async () => {
    const toggleSearch = vi.fn();
    render(ChatWorkspace, {
      props: {
        onToggleConversationSearch: toggleSearch,
      },
    });

    const event = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(toggleSearch).toHaveBeenCalledTimes(1);
  });

  it("keeps Ctrl+F from opening current conversation search without a target conversation", async () => {
    const toggleSearch = vi.fn();
    render(ChatWorkspace, {
      props: {
        conversationActionsDisabledReason: "请先选择一个会话或联系人",
        onToggleConversationSearch: toggleSearch,
      },
    });

    const event = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(toggleSearch).not.toHaveBeenCalled();
  });

  it("keeps Ctrl+F from closing an already open conversation search", async () => {
    const toggleSearch = vi.fn();
    render(ChatWorkspace, {
      props: {
        conversationSearchOpen: true,
        onToggleConversationSearch: toggleSearch,
      },
    });

    const event = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(toggleSearch).not.toHaveBeenCalled();
  });

  it("closes current conversation search with Escape", async () => {
    const toggleSearch = vi.fn();
    render(ChatWorkspace, {
      props: {
        conversationSearchOpen: true,
        onToggleConversationSearch: toggleSearch,
      },
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(toggleSearch).toHaveBeenCalledTimes(1);
  });

  it("focuses the conversation search input when the panel is open", async () => {
    render(ChatWorkspace, {
      props: {
        conversationSearchOpen: true,
      },
    });

    expect(await screen.findByPlaceholderText("查询聊天记录")).toHaveFocus();
  });

  it("opens conversation history from the dedicated title-bar icon", async () => {
    const toggleSearch = vi.fn();
    render(ChatWorkspace, { props: { onToggleConversationSearch: toggleSearch } });

    await fireEvent.click(screen.getByRole("button", { name: "搜索聊天记录" }));

    expect(toggleSearch).toHaveBeenCalledTimes(1);
    expect(within(await openMoreTools()).queryByRole("button", { name: "日期" })).not.toBeInTheDocument();
  });

  it("keeps date filtering out of conversation search", async () => {
    render(ChatWorkspace, {
      props: {
        conversationSearchOpen: true,
      },
    });

    expect(screen.queryByLabelText("按日期跳转聊天记录")).not.toBeInTheDocument();
    expect(await screen.findByPlaceholderText("查询聊天记录")).toHaveFocus();
  });

  it("shows result summary and clears conversation search state", async () => {
    const clearSearch = vi.fn();
    render(ChatWorkspace, {
      props: {
        conversationSearchOpen: true,
        conversationSearchQuery: "ops",
        conversationSearchResults: [
          textMessage({ id: "msg-search-a", body: "ops alpha" }),
          textMessage({ id: "msg-search-b", body: "ops beta" }),
        ],
        focusedMessageId: "msg-search-b",
        onClearConversationSearch: clearSearch,
      },
    });

    expect(screen.getByText("2 条结果，当前第 2 条")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "清空查询" }));

    expect(clearSearch).toHaveBeenCalledTimes(1);
  });

  it("shows attachment file names in current conversation search results", () => {
    render(ChatWorkspace, {
      props: {
        conversationSearchOpen: true,
        conversationSearchQuery: "report",
        conversationSearchResults: [
          { ...transferMessage(), body: "" },
          folderTransferMessage(),
        ],
      },
    });

    expect(screen.getByText("文件：report.pdf")).toBeInTheDocument();
    expect(screen.getByText("文件：docs/readme.md、assets/diagram.png")).toBeInTheDocument();
  });

  it("navigates current conversation search results without opening the result list menu", async () => {
    const focusSearchResult = vi.fn();
    const results = [
      textMessage({ id: "msg-search-a", body: "ops alpha" }),
      textMessage({ id: "msg-search-b", body: "ops beta" }),
      textMessage({ id: "msg-search-c", body: "ops gamma" }),
    ];
    render(ChatWorkspace, {
      props: {
        conversationSearchOpen: true,
        conversationSearchQuery: "ops",
        conversationSearchResults: results,
        focusedMessageId: "msg-search-b",
        onFocusConversationSearchResult: focusSearchResult,
      },
    });

    const navigation = screen.getByRole("group", { name: "搜索结果导航" });
    await fireEvent.click(within(navigation).getByRole("button", { name: "下一个" }));
    await fireEvent.click(within(navigation).getByRole("button", { name: "上一个" }));

    expect(focusSearchResult).toHaveBeenNthCalledWith(1, results[2]);
    expect(focusSearchResult).toHaveBeenNthCalledWith(2, results[0]);
  });
});

describe("ChatWorkspace failed messages", () => {
  it("offers inline retry for failed outgoing messages", async () => {
    const retryMessage = vi.fn();
    render(ChatWorkspace, {
      props: {
        selfPeerId: "local-demo",
        messages: [textMessage({ sender_id: "local-demo", status: "failed" })],
        onRetryMessage: retryMessage,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "重新发送" }));

    expect(retryMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "msg-text", status: "failed" }),
    );
  });

  it("keeps queued outgoing messages automatic until they fail", () => {
    const retryMessage = vi.fn();
    render(ChatWorkspace, {
      props: {
        selfPeerId: "local-demo",
        messages: [textMessage({ sender_id: "local-demo", status: "queued" })],
        onRetryMessage: retryMessage,
      },
    });

    expect(screen.getByLabelText("消息状态 等待发送")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "立即重试" })).not.toBeInTheDocument();
    expect(retryMessage).not.toHaveBeenCalled();
  });

  it("folds live retry attempts into one capped sending status", () => {
    render(ChatWorkspace, {
      props: {
        selfPeerId: "local-demo",
        messages: [
          textMessage({ id: "msg-failed-attempts", sender_id: "local-demo", status: "failed", send_attempts: 3 }),
          textMessage({ id: "msg-queued-first", sender_id: "local-demo", status: "queued", send_attempts: 0 }),
          textMessage({ id: "msg-sending-capped", sender_id: "local-demo", status: "sending", send_attempts: 8 }),
          textMessage({ id: "msg-delivered", sender_id: "local-demo", status: "delivered", send_attempts: 4 }),
        ],
      },
    });

    expect(screen.getByLabelText("消息状态 发送失败")).toHaveTextContent("发送失败");
    expect(screen.getByLabelText("消息状态 等待发送")).toHaveTextContent("等待发送");
    expect(screen.getByLabelText("消息状态 发送中 · 第 3/3 次")).toHaveTextContent("发送中 · 第 3/3 次");
    expect(screen.queryByText(/第 8\/3 次/)).not.toBeInTheDocument();
    expect(document.querySelector(".attempt-mark")).not.toBeInTheDocument();
  });

  it("does not offer inline retry for failed incoming messages", () => {
    render(ChatWorkspace, {
      props: {
        selfPeerId: "local-demo",
        messages: [textMessage({ sender_id: "peer-a", status: "failed" })],
      },
    });

    expect(
      screen.queryByRole("button", { name: "重新发送" }),
    ).not.toBeInTheDocument();
  });
});

describe("ChatWorkspace pending files", () => {
  it("labels pasted screenshot images clearly in the pending tray", () => {
    render(ChatWorkspace, {
      props: {
        pendingFileDrafts: [
          {
            id: "draft-image",
            name: "clipboard-image-1.png",
            path: "C:/tmp/clipboard-image-1.png",
            sourceLabel: "剪贴板/拖拽",
            size: 1024,
            directory: false,
          },
        ],
      },
    });

    const tray = screen.getByLabelText("待发送文件");
    expect(within(tray).getByText(/截图\/图片/)).toBeInTheDocument();
    expect(within(tray).getByText("1.0 KB")).toBeInTheDocument();
  });

  it("renders pending files and keeps one shared send command", async () => {
    const removePendingFile = vi.fn();
    const clearPendingFiles = vi.fn();
    render(ChatWorkspace, {
      props: {
        pendingFileDrafts: [
          {
            id: "draft-1",
            name: "report.pdf",
            path: "C:/tmp/report.pdf",
            sourceLabel: "文件",
            size: 3072,
            directory: false,
          },
          {
            id: "draft-2",
            name: "design",
            path: "C:/tmp/design",
            sourceLabel: "文件夹",
            size: null,
            directory: true,
          },
        ],
        onRemovePendingFile: removePendingFile,
        onClearPendingFiles: clearPendingFiles,
      },
    });

    const tray = screen.getByLabelText("待发送文件");
    expect(within(tray).getByText("2 个文件")).toBeInTheDocument();
    expect(within(tray).getByText("report.pdf")).toBeInTheDocument();
    expect(within(tray).getByText("design")).toBeInTheDocument();

    await fireEvent.click(within(tray).getByTitle("移除 report.pdf"));
    await fireEvent.click(within(tray).getByRole("button", { name: "清空" }));
    expect(within(tray).queryByRole("button", { name: "发送" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();

    expect(removePendingFile).toHaveBeenCalledWith("draft-1");
    expect(clearPendingFiles).toHaveBeenCalledTimes(1);
  });

  it("keeps the shared send command blocked when file actions are disabled", async () => {
    render(ChatWorkspace, {
      props: {
        fileActionsDisabled: true,
        fileActionsDisabledReason: "blocked",
        pendingFileDrafts: [
          {
            id: "draft-1",
            name: "report.pdf",
            path: "C:/tmp/report.pdf",
            sourceLabel: "文件",
            size: 3072,
            directory: false,
          },
        ],
      },
    });

    const sendButton = screen.getByRole("button", { name: "发送" });
    expect(sendButton).toBeDisabled();
  });
});

describe("ChatWorkspace send shortcut", () => {
  it("sends with plain Enter in enter mode", async () => {
    const send = vi.fn();
    render(ChatWorkspace, {
      props: {
        draft: "hello",
        sendShortcut: "enter",
        onSend: send,
      },
    });

    await fireEvent.keyDown(screen.getByPlaceholderText("输入消息"), {
      key: "Enter",
    });

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("requires Ctrl+Enter in ctrl_enter mode", async () => {
    const send = vi.fn();
    render(ChatWorkspace, {
      props: {
        draft: "hello",
        sendShortcut: "ctrl_enter",
        onSend: send,
      },
    });

    const input = screen.getByPlaceholderText("输入消息");
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(send).not.toHaveBeenCalled();

    await fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not send from button or Enter when sending is disabled", async () => {
    const send = vi.fn();
    render(ChatWorkspace, {
      props: {
        draft: "hello",
        sendDisabledReason: "blocked",
        onSend: send,
      },
    });

    const input = screen.getByPlaceholderText("输入消息");
    await fireEvent.keyDown(input, { key: "Enter" });
    await fireEvent.click(screen.getByTitle("blocked"));

    expect(screen.getByTitle("blocked")).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps expressions available while the disabled send button remains authoritative", async () => {
    render(ChatWorkspace, { props: { sendDisabledReason: "blocked" } });
    await fireEvent.click(screen.getByRole("button", { name: "表情" }));
    expect(await screen.findByRole("menu", { name: "表情和动图" })).toBeInTheDocument();
    expect(screen.getByTitle("blocked")).toBeDisabled();
  });
});

describe("ChatWorkspace composer context", () => {
  it("hides the generic undiscovered-contact warning from the composer status row", () => {
    render(ChatWorkspace, {
      props: {
        fileActionsDisabledReason: "请先选择一个已发现的联系人",
      },
    });

    const status = screen.getByLabelText("发送状态");
    expect(within(status).queryByText("请先选择一个已发现的联系人")).not.toBeInTheDocument();
  });

  it("shows a selected conversation overview when no messages are loaded", () => {
    render(ChatWorkspace, {
      props: {
        title: "产品经理",
        conversation: conversation({
          title: "产品经理",
          last_message_preview: "可以先发一版无服务器群聊，我来验收。",
          last_message_at: 1_700_000_080_000,
          unread_count: 2,
        }),
        activePeer: peerProfile({
          display_name: "产品经理",
          hostname: "pm-laptop",
          endpoints: ["192.168.1.42:24251"],
        }),
        messages: [],
      },
    });

    const overview = screen.getByRole("region", { name: "会话概览" });
    expect(within(overview).getByText("产品经理")).toBeInTheDocument();
    expect(within(overview).getByText("可以先发一版无服务器群聊，我来验收。")).toBeInTheDocument();
    expect(within(overview).getByText("192.168.1.42")).toBeInTheDocument();
    expect(within(overview).queryByText("192.168.1.42:24251")).not.toBeInTheDocument();
    expect(screen.queryByText("选择会话后开始内网直连聊天")).not.toBeInTheDocument();
  });

  it("shows group scope and delivery blockers near the composer", () => {
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        memberCount: 4,
        sendDisabledReason: "等待信任指纹确认",
        fileActionsDisabledReason: "文件传输需要可联系联系人",
      },
    });

    const status = screen.getByLabelText("发送状态");
    expect(within(status).getByText("群聊 · 4 位成员")).toBeInTheDocument();
    expect(within(status).getByText("等待信任指纹确认")).toBeInTheDocument();
    expect(
      within(status).getByText("文件传输需要可联系联系人"),
    ).toBeInTheDocument();
  });

  it("shows the direct peer presence in the composer context", () => {
    render(ChatWorkspace, {
      props: {
        title: "研发一号",
        activePeer: {
          peer_id: "peer-a",
          display_name: "研发一号",
          hostname: "rd-01",
          avatar_hash: null,
          status: "online",
          endpoints: ["192.168.1.8:24251"],
          fingerprint: "f".repeat(64),
        },
      },
    });

    const status = screen.getByLabelText("发送状态");
    expect(within(status).getByText("直连会话")).toBeInTheDocument();
    expect(
      within(status).getByLabelText("研发一号 可联系"),
    ).toBeInTheDocument();
    expect(within(status).queryByText("直连 · 在线")).not.toBeInTheDocument();
  });

  it("renders unavailable direct peers with the gray visual tone", () => {
    render(ChatWorkspace, {
      props: {
        title: "研发一号",
        activePeer: {
          peer_id: "peer-a",
          display_name: "研发一号",
          hostname: "rd-01",
          avatar_hash: null,
          status: "away",
          endpoints: ["192.168.1.8:24251"],
          fingerprint: "f".repeat(64),
        },
      },
    });

    const status = screen.getByLabelText("发送状态");
    const presence = within(status).getByLabelText("研发一号 暂不可达");
    expect(presence).toHaveClass("offline");
    expect(presence).not.toHaveClass("away");
    expect(presence).toHaveAttribute("title", "暂不可达");
  });
});

describe("ChatWorkspace group messages", () => {
  it("opens sender details from an incoming message avatar", async () => {
    const openPeerDetails = vi.fn();
    const sender = {
      peer_id: "peer-a",
      display_name: "研发一号",
      hostname: "rd-01",
      avatar_hash: null,
      status: "online" as const,
      endpoints: ["192.168.1.8:24251"],
      fingerprint: "f".repeat(64),
    };
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        selfPeerId: "local-peer",
        messages: [textMessage()],
        messageSenderLabels: { "peer-a": "研发一号" },
        mentionableMembers: [sender],
        onOpenPeerDetails: openPeerDetails,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "查看 研发一号 资料" }));

    expect(openPeerDetails).toHaveBeenCalledWith(sender);
  });

  it("focuses the message input after switching conversations", async () => {
    const { rerender } = render(ChatWorkspace, {
      props: { conversation: conversation(), messages: [textMessage({ conversation_id: "direct:peer-a" })] },
    });

    await waitFor(() => expect(screen.getByPlaceholderText("输入消息")).toHaveFocus());
    await rerender({ conversation: conversation({ id: "direct:peer-b", title: "Bob" }) });
    await waitFor(() => expect(screen.getByPlaceholderText("输入消息")).toHaveFocus());
  });

  it("shows the quoted sender in the composer reply preview", () => {
    render(ChatWorkspace, {
      props: {
        replyQuote: {
          message_id: "msg-quoted",
          sender_id: "peer-a",
          body_preview: "部署窗口 18:00",
        },
        messageSenderLabels: { "peer-a": "研发一号" },
      },
    });

    expect(screen.getByText("引用回复 · 研发一号")).toBeInTheDocument();
    expect(screen.getByText("部署窗口 18:00")).toBeInTheDocument();
  });

  it("shows the sender display label for incoming group messages", () => {
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        selfPeerId: "local-peer",
        messages: [textMessage()],
        messageSenderLabels: { "peer-a": "研发一号" },
      },
    });

    expect(screen.getByText("研发一号")).toBeInTheDocument();
  });

  it("does not add a sender label above direct incoming messages", () => {
    render(ChatWorkspace, {
      props: {
        isGroup: false,
        selfPeerId: "local-peer",
        messages: [textMessage({ conversation_id: "direct:peer-a" })],
        messageSenderLabels: { "peer-a": "研发一号" },
      },
    });

    expect(screen.queryByText("研发一号")).not.toBeInTheDocument();
  });
});
