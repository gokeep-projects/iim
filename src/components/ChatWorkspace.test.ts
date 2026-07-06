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

  it("keeps group detail actions in the composer toolbar, not the announcement banner", async () => {
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
      within(screen.getByRole("toolbar", { name: "消息工具栏" })).getByRole(
        "button",
        { name: "成员" },
      ),
    );
    expect(showDetails).toHaveBeenCalledTimes(1);
  });

  it("labels group conversations as no-server fanout groups in the header", () => {
    render(ChatWorkspace, {
      props: {
        isGroup: true,
        memberCount: 4,
        title: "内网群聊",
      },
    });

    const header = screen.getByRole("group", { name: "会话标题栏" });
    expect(within(header).getByText("群聊 · 无服务器 fanout")).toBeInTheDocument();
    expect(within(header).queryByText("直连会话 · 无中间服务器")).not.toBeInTheDocument();
    expect(within(header).getByText("4 位成员 · 本机 fanout 直连")).toBeInTheDocument();
  });

  it("adds date dividers when message history crosses days", () => {
    render(ChatWorkspace, {
      props: {
        messages: [
          textMessage({
            id: "day-one-a",
            created_at: Date.UTC(2024, 0, 1, 12, 0),
          }),
          textMessage({
            id: "day-one-b",
            created_at: Date.UTC(2024, 0, 1, 13, 0),
          }),
          textMessage({
            id: "day-two",
            created_at: Date.UTC(2024, 0, 2, 9, 0),
          }),
        ],
      },
    });

    expect(
      screen.getByRole("separator", { name: /2024-01-01/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: /2024-01-02/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("separator")).toHaveLength(2);
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
    await fireEvent.click(
      within(attachment).getByRole("button", { name: "复制清单" }),
    );

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
    const folderButton = screen.getByRole("button", { name: "文件夹" });
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
    const preview = screen.getByRole("link", {
      name: "打开链接 https://example.com/runbook",
    });
    expect(preview).toHaveClass("link-preview-card");
    expect(within(preview).getByText("example.com")).toBeInTheDocument();
    expect(within(preview).getByText("HTTPS · /runbook")).toBeInTheDocument();
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
    const preview = screen.getByRole("link", {
      name: "打开链接 http://intranet.local/wiki",
    });
    expect(within(preview).getByText("intranet.local")).toBeInTheDocument();
    expect(within(preview).getByText("HTTP · /wiki")).toBeInTheDocument();
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
    const preview = screen.getByRole("link", {
      name: "打开链接 https://kb.local/wiki/Project_(Alpha)",
    });
    expect(within(preview).getByText("HTTPS · /wiki/Project_(Alpha)")).toBeInTheDocument();
  });
});

describe("ChatWorkspace composer toolbar", () => {
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

  it("keeps conversation actions in the composer toolbar instead of the header", async () => {
    const toggleSearch = vi.fn();
    const showDetails = vi.fn();
    const showTransfers = vi.fn();
    render(ChatWorkspace, {
      props: {
        onToggleConversationSearch: toggleSearch,
        onShowDetails: showDetails,
        onShowTransfers: showTransfers,
      },
    });

    expect(
      within(screen.getByRole("group", { name: "会话标题栏" })).queryByRole(
        "button",
        { name: /文件|文件夹|截图|抖一抖|搜索|传输|详情|成员/ },
      ),
    ).not.toBeInTheDocument();

    const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
    expect(
      within(toolbar).getByRole("group", { name: "附件工具" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole("group", { name: "消息工具" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole("group", { name: "会话工具" }),
    ).toBeInTheDocument();

    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "搜索" }),
    );
    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "传输" }),
    );
    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "详情" }),
    );

    expect(toggleSearch).toHaveBeenCalledTimes(1);
    expect(showTransfers).toHaveBeenCalledTimes(1);
    expect(showDetails).toHaveBeenCalledTimes(1);
  });

  it("places file, screenshot, and detail actions directly above the message input", () => {
    render(ChatWorkspace);

    const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
    expect(
      within(toolbar).getByRole("button", { name: "文件" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "文件夹" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "截图" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "抖一抖" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "搜索" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "传输" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "详情" }),
    ).toBeInTheDocument();

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

    expect(buttons.length).toBeGreaterThanOrEqual(10);
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

    const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
    const nudgeButton = within(toolbar).getByRole("button", { name: "抖一抖" });

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

    await fireEvent.click(
      within(screen.getByRole("toolbar", { name: "消息工具栏" })).getByRole(
        "button",
        { name: "抖一抖" },
      ),
    );

    expect(sendNudge).toHaveBeenCalledTimes(1);
  });

  it("closes the emoji picker when clicking outside the composer", async () => {
    render(ChatWorkspace);

    await fireEvent.click(screen.getByRole("button", { name: "表情" }));
    expect(
      screen.getByRole("menu", { name: "表情选择器" }),
    ).toBeInTheDocument();

    await fireEvent.click(document.body);

    expect(
      screen.queryByRole("menu", { name: "表情选择器" }),
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

  it("exposes pin and mute actions in the composer conversation tools", async () => {
    const togglePin = vi.fn();
    const toggleMute = vi.fn();
    const toggleArchive = vi.fn();
    render(ChatWorkspace, {
      props: {
        conversation: conversation({
          pinned: true,
          muted: false,
          archived: true,
        }),
        onTogglePin: togglePin,
        onToggleMute: toggleMute,
        onToggleArchive: toggleArchive,
      },
    });

    const conversationTools = screen.getByRole("group", { name: "会话工具" });
    await fireEvent.click(
      within(conversationTools).getByRole("button", { name: "取消置顶" }),
    );
    await fireEvent.click(
      within(conversationTools).getByRole("button", { name: "免打扰" }),
    );
    await fireEvent.click(
      within(conversationTools).getByRole("button", { name: "取消归档" }),
    );

    expect(togglePin).toHaveBeenCalledTimes(1);
    expect(toggleMute).toHaveBeenCalledTimes(1);
    expect(toggleArchive).toHaveBeenCalledTimes(1);
  });

  it("disables conversation actions when no conversation can be targeted", async () => {
    const showDetails = vi.fn();
    const togglePin = vi.fn();
    const toggleMute = vi.fn();
    const toggleArchive = vi.fn();
    render(ChatWorkspace, {
      props: {
        conversation: conversation(),
        conversationActionsDisabledReason: "请先选择一个会话或联系人",
        onShowDetails: showDetails,
        onTogglePin: togglePin,
        onToggleMute: toggleMute,
        onToggleArchive: toggleArchive,
      },
    });

    const conversationTools = screen.getByRole("group", { name: "会话工具" });
    const detailButton = within(conversationTools).getByRole("button", { name: "详情" });
    const pinButton = within(conversationTools).getByRole("button", { name: "置顶" });
    const muteButton = within(conversationTools).getByRole("button", { name: "免打扰" });
    const archiveButton = within(conversationTools).getByRole("button", { name: "归档" });

    expect(detailButton).toBeDisabled();
    expect(detailButton).toHaveAttribute("title", "请先选择一个会话或联系人");
    expect(pinButton).toBeDisabled();
    expect(muteButton).toBeDisabled();
    expect(archiveButton).toBeDisabled();

    await fireEvent.click(detailButton);
    await fireEvent.click(pinButton);
    await fireEvent.click(muteButton);
    await fireEvent.click(archiveButton);

    expect(showDetails).not.toHaveBeenCalled();
    expect(togglePin).not.toHaveBeenCalled();
    expect(toggleMute).not.toHaveBeenCalled();
    expect(toggleArchive).not.toHaveBeenCalled();
  });

  it("disables current-conversation message tools when no conversation can be targeted", async () => {
    const toggleSearch = vi.fn();
    const openDateJump = vi.fn();
    const startSelection = vi.fn();
    render(ChatWorkspace, {
      props: {
        conversationActionsDisabledReason: "请先选择一个会话或联系人",
        onToggleConversationSearch: toggleSearch,
        onOpenConversationDateJump: openDateJump,
        onStartMessageSelection: startSelection,
      },
    });

    const messageTools = screen.getByRole("group", { name: "消息工具" });
    const searchButton = within(messageTools).getByRole("button", { name: "搜索" });
    const dateButton = within(messageTools).getByRole("button", { name: "日期" });
    const selectionButton = within(messageTools).getByRole("button", { name: "多选" });

    expect(searchButton).toBeDisabled();
    expect(searchButton).toHaveAttribute("title", "请先选择一个会话或联系人");
    expect(dateButton).toBeDisabled();
    expect(selectionButton).toBeDisabled();

    await fireEvent.click(searchButton);
    await fireEvent.click(dateButton);
    await fireEvent.click(selectionButton);

    expect(toggleSearch).not.toHaveBeenCalled();
    expect(openDateJump).not.toHaveBeenCalled();
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

    expect(await screen.findByPlaceholderText("搜索当前会话")).toHaveFocus();
  });

  it("opens date jump from the composer toolbar", async () => {
    const openDateJump = vi.fn();
    render(ChatWorkspace, {
      props: {
        onOpenConversationDateJump: openDateJump,
      },
    });

    const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "日期" }),
    );

    expect(openDateJump).toHaveBeenCalledTimes(1);
  });

  it("focuses the date jump input when opened in date mode", async () => {
    render(ChatWorkspace, {
      props: {
        conversationSearchOpen: true,
        conversationSearchFocus: "date",
      },
    });

    expect(await screen.findByLabelText("按日期跳转聊天记录")).toHaveFocus();
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

    await fireEvent.click(screen.getByRole("button", { name: "清空搜索" }));

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

  it("offers inline retry for queued outgoing messages", async () => {
    const retryMessage = vi.fn();
    render(ChatWorkspace, {
      props: {
        selfPeerId: "local-demo",
        messages: [textMessage({ sender_id: "local-demo", status: "queued" })],
        onRetryMessage: retryMessage,
      },
    });

    expect(screen.getByText("排队")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "立即重试" }));

    expect(retryMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "msg-text", status: "queued" }),
    );
  });

  it("shows send attempt metadata for retryable outgoing messages", () => {
    render(ChatWorkspace, {
      props: {
        selfPeerId: "local-demo",
        messages: [
          textMessage({ id: "msg-failed-attempts", sender_id: "local-demo", status: "failed", send_attempts: 3 }),
          textMessage({ id: "msg-queued-first", sender_id: "local-demo", status: "queued", send_attempts: 0 }),
          textMessage({ id: "msg-delivered", sender_id: "local-demo", status: "delivered", send_attempts: 4 }),
        ],
      },
    });

    expect(screen.getByText("已尝试 3 次")).toHaveClass("attempt-mark");
    expect(screen.getByText("等待首次发送")).toHaveClass("attempt-mark");
    expect(screen.queryByText("已尝试 4 次")).not.toBeInTheDocument();
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

  it("renders pending files and exposes tray actions", async () => {
    const removePendingFile = vi.fn();
    const clearPendingFiles = vi.fn();
    const sendPendingFiles = vi.fn();
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
        onSendPendingFiles: sendPendingFiles,
      },
    });

    const tray = screen.getByLabelText("待发送文件");
    expect(within(tray).getByText("2 个文件")).toBeInTheDocument();
    expect(within(tray).getByText("report.pdf")).toBeInTheDocument();
    expect(within(tray).getByText("design")).toBeInTheDocument();

    await fireEvent.click(within(tray).getByTitle("移除 report.pdf"));
    await fireEvent.click(within(tray).getByRole("button", { name: "清空" }));
    await fireEvent.click(within(tray).getByRole("button", { name: "发送" }));

    expect(removePendingFile).toHaveBeenCalledWith("draft-1");
    expect(clearPendingFiles).toHaveBeenCalledTimes(1);
    expect(sendPendingFiles).toHaveBeenCalledTimes(1);
  });

  it("keeps pending file send inert when file actions are disabled", async () => {
    const sendPendingFiles = vi.fn();
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
        onSendPendingFiles: sendPendingFiles,
      },
    });

    const tray = screen.getByLabelText("待发送文件");
    const sendButton = within(tray).getByRole("button", { name: "发送" });
    expect(sendButton).toBeDisabled();
    await fireEvent.click(sendButton);

    expect(sendPendingFiles).not.toHaveBeenCalled();
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

  it("does not send quick replies when sending is disabled", async () => {
    const send = vi.fn();
    render(ChatWorkspace, {
      props: {
        quickReplies: ["收到"],
        sendDisabledReason: "blocked",
        onSend: send,
      },
    });

    const quickReply = screen.getByRole("button", { name: "收到" });
    expect(quickReply).toBeDisabled();
    await fireEvent.click(quickReply);

    expect(send).not.toHaveBeenCalled();
  });
});

describe("ChatWorkspace composer context", () => {
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
