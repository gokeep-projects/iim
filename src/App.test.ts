import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.svelte";
import type { ChatMessage, ConversationSummary } from "./api";

const tauriEventListeners = vi.hoisted(
  () => new Map<string, Array<(event: { payload: unknown }) => void>>(),
);
const tauriDragDropHandlers = vi.hoisted(
  () =>
    [] as Array<
      (event: {
        payload: {
          type: string;
          paths?: string[];
          position?: { x: number; y: number };
        };
      }) => void
    >,
);
const notificationActionHandlers = vi.hoisted(() => [] as Array<(notification: unknown) => void>);
const notificationPermissionGranted = vi.hoisted(() => vi.fn(() => Promise.resolve(false)));
const sendNotificationMock = vi.hoisted(() => vi.fn());

const tauriInvoke = vi.hoisted(() =>
  vi.fn((command: string) => {
    const peer = {
      peer_id: "demo-peer",
      display_name: "研发一号",
      hostname: "rd-pc",
      avatar_hash: null,
      status: "online",
      endpoints: ["192.168.1.42:24251"],
      fingerprint: "f".repeat(64),
      public_key: Array(32).fill(15),
    };
    const conversation = {
      id: "direct:demo-peer",
      title: "研发一号",
      last_message_at: Date.now(),
      last_message_preview: "",
      unread_count: 2,
      manual_unread: false,
      pinned: true,
      muted: false,
      archived: false,
      draft_preview: "",
    };

    const responses: Record<string, unknown> = {
      get_self_profile: {
        peer_id: "local-demo",
        display_name: "本机用户",
        hostname: "本机预览",
        avatar_hash: null,
        status: "online",
        endpoints: ["0.0.0.0:24251"],
        fingerprint: "a".repeat(64),
        public_key: Array(32).fill(10),
      },
      list_peers: [peer],
      list_contact_metadata: [],
      list_conversations: [conversation],
      get_network_settings: {
        auto_discovery: true,
        multicast: true,
        seed_peers: [],
        scan_ranges: [],
        discovery_interval_secs: 3,
        peer_ttl_secs: 15,
      },
      get_transport_config: {
        listen_port: 24251,
        heartbeat_secs: 15,
        max_idle_timeout_secs: 60,
        outbox: {
          retry_after_millis: 10000,
          max_attempts: 12,
          batch_limit: 50,
        },
      },
      get_app_preferences: {
        dark_mode: false,
        send_shortcut: "enter",
        show_notification_preview: true,
        privacy_mode: false,
        close_to_tray: true,
        login_enabled: false,
        login_password_hash: "",
        profile_signature: "",
        avatar_label: "",
        require_contact_for_messaging: false,
      },
      list_transfers: [],
      get_storage_overview: {
        data_dir: "%APPDATA%\\IIM",
        database_path: "%APPDATA%\\IIM\\iim.sqlite",
        database_key_path: "%APPDATA%\\IIM\\db.key.dpapi",
        database_key_protection: "Windows DPAPI",
        received_files_dir: "%APPDATA%\\IIM\\received_files",
        staged_files_dir: "%APPDATA%\\IIM\\staged",
        database_bytes: 0,
        received_bytes: 0,
        staged_bytes: 0,
        transfer_task_count: 0,
      },
      list_trusted_peers: [],
      list_messages: [],
      list_todo_messages: [],
      list_outbox_messages: [],
      get_conversation_draft: null,
      mark_conversation_read: undefined,
    };

    return Promise.resolve(responses[command]);
  }),
);
const defaultTauriInvoke = tauriInvoke.getMockImplementation()!;
let autoOpenInitialConversation = true;
let autoOpenInitialConversationObserver: MutationObserver | null = null;

function installInitialConversationAutoOpen() {
  autoOpenInitialConversationObserver?.disconnect();
  autoOpenInitialConversationObserver = new MutationObserver(() => {
    if (!autoOpenInitialConversation) return;
    const welcome = document.querySelector<HTMLElement>('[aria-label="空会话"]');
    const recentButton = welcome?.querySelector<HTMLButtonElement>('[aria-label="最近消息"] button');
    if (!recentButton || recentButton.dataset.testAutoOpening === "true") return;
    recentButton.dataset.testAutoOpening = "true";
    recentButton.click();
  });
  autoOpenInitialConversationObserver.observe(document.body, { childList: true, subtree: true });
}

async function waitForInitialConversationLoad(options: { openConversation?: boolean } = {}) {
  const shell = await screen.findByRole("region", { name: /聊天工作区|空会话/ });
  if (options.openConversation !== false && shell.getAttribute("aria-label") === "空会话") {
    const recent = screen.queryByRole("region", { name: "最近消息" });
    const recentButton = recent ? within(recent).queryByRole("button") : null;
    if (recentButton) {
      await fireEvent.click(recentButton);
      await screen.findByRole("region", { name: "聊天工作区" });
    }
  }
  await Promise.resolve();
}

async function findMessageBubble(messageId: string) {
  await screen.findByRole("region", { name: "聊天工作区" });
  return waitFor(() => {
    const bubble = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    expect(bubble).not.toBeNull();
    return bubble as HTMLElement;
  });
}

async function findDemoMessageBubble() {
  return findMessageBubble("hello");
}

async function openMessageMenuMore() {
  await fireEvent.click(
    await screen.findByRole("menuitem", { name: "更多消息操作" }),
  );
}

const dialogSave = vi.hoisted(() =>
  vi.fn(() => Promise.resolve(null as string | null)),
);
const dialogOpen = vi.hoisted(() =>
  vi.fn(() => Promise.resolve(null as string | string[] | null)),
);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriInvoke,
  convertFileSrc: (path: string) => `asset://${path}`,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    (eventName: string, handler: (event: { payload: unknown }) => void) => {
      const current = tauriEventListeners.get(eventName) ?? [];
      current.push(handler);
      tauriEventListeners.set(eventName, current);
      return Promise.resolve(() => {
        const next = (tauriEventListeners.get(eventName) ?? []).filter(
          (item) => item !== handler,
        );
        tauriEventListeners.set(eventName, next);
      });
    },
  ),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    isMaximized: vi.fn(() => Promise.resolve(true)),
    minimize: vi.fn(() => Promise.resolve()),
    maximize: vi.fn(() => Promise.resolve()),
    unmaximize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    onDragDropEvent: vi.fn((handler) => {
      tauriDragDropHandlers.push(handler);
      return Promise.resolve(() => {
        const index = tauriDragDropHandlers.indexOf(handler);
        if (index >= 0) tauriDragDropHandlers.splice(index, 1);
      });
    }),
  })),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: dialogOpen,
  save: dialogSave,
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: notificationPermissionGranted,
  onAction: vi.fn((handler: (notification: unknown) => void) => {
    notificationActionHandlers.push(handler);
    return Promise.resolve({
      unregister: vi.fn(() => {
        const index = notificationActionHandlers.indexOf(handler);
        if (index >= 0) notificationActionHandlers.splice(index, 1);
      }),
    });
  }),
  requestPermission: vi.fn(() => Promise.resolve("denied")),
  sendNotification: sendNotificationMock,
}));

function emitTauriEvent(eventName: string, payload: unknown) {
  for (const handler of tauriEventListeners.get(eventName) ?? []) {
    handler({ payload });
  }
}

function emitNotificationAction(notification: unknown) {
  for (const handler of notificationActionHandlers) {
    handler(notification);
  }
}

function emitTauriDragDrop(payload: {
  type: string;
  paths?: string[];
  position?: { x: number; y: number };
}) {
  for (const handler of tauriDragDropHandlers) {
    handler({ payload });
  }
}

async function findDirectoryProfileCard() {
  const profileCards = await screen.findAllByRole("region", {
    name: "联系人资料",
  });
  return (
    profileCards.find((card) =>
      card.classList.contains("contact-detail-pane"),
    ) ?? profileCards[0]
  );
}

async function waitForTauriListener(eventName: string) {
  await waitFor(() => {
    expect(tauriEventListeners.get(eventName)?.length ?? 0).toBeGreaterThan(0);
  });
}

async function waitForTauriDragDropListener() {
  await waitFor(() => {
    expect(tauriDragDropHandlers.length).toBeGreaterThan(0);
  });
}

async function findSidebarConversationContextTarget() {
  return waitFor(
    () => {
      const conversationButton = document.querySelector<HTMLButtonElement>(
        ".conversation-main-button",
      );
      if (conversationButton) return conversationButton;
      const peerButton = document.querySelector<HTMLButtonElement>(
        '[title="与 研发一号 聊天"]',
      );
      expect(peerButton).not.toBeNull();
      return peerButton as HTMLButtonElement;
    },
    { timeout: 5000 },
  );
}

async function openSidebarContactQuickList() {
  const sidebarTabs = await screen.findByRole("tablist", { name: "侧栏视图" });
  await fireEvent.click(
    within(sidebarTabs).getByRole("tab", { name: /^联系人/ }),
  );
  await screen.findByRole("list", { name: "联系人列表" });
}

async function openContactDirectoryWorkspace() {
  const main = await screen.findByRole("main");
  if (main.classList.contains("messages-layout")) {
    await waitForInitialConversationLoad();
  }
  const rail = await screen.findByRole("navigation", { name: "主导航" });
  await fireEvent.click(within(rail).getByRole("button", { name: /联系人/ }));
  return screen.findByRole("region", { name: "功能工作区" });
}

async function openNetworkSettingsWorkspace() {
  await screen.findByRole("region", { name: /聊天工作区|空会话/ });
  await fireEvent.click(await screen.findByTitle("设置"));
  const workspace = await screen.findByRole("region", { name: "功能工作区" });
  await fireEvent.click(
    within(workspace).getByRole("button", { name: "网络" }),
  );
  return workspace;
}

async function openComposerMoreTools() {
  const toolbar = await screen.findByRole("toolbar", { name: "消息工具栏" });
  await fireEvent.click(within(toolbar).getByRole("button", { name: "更多" }));
  return within(toolbar).getByRole("group", { name: "更多消息工具" });
}

describe("App", () => {
  beforeEach(() => {
    autoOpenInitialConversation = true;
    installInitialConversationAutoOpen();
    tauriEventListeners.clear();
    tauriDragDropHandlers.length = 0;
    notificationActionHandlers.length = 0;
    notificationPermissionGranted.mockClear();
    notificationPermissionGranted.mockResolvedValue(false);
    sendNotificationMock.mockClear();
    tauriInvoke.mockClear();
    tauriInvoke.mockImplementation(defaultTauriInvoke);
    dialogOpen.mockReset();
    dialogOpen.mockResolvedValue(null);
    dialogSave.mockReset();
    dialogSave.mockResolvedValue(null);
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  afterEach(() => {
    autoOpenInitialConversationObserver?.disconnect();
    autoOpenInitialConversationObserver = null;
    vi.useRealTimers();
  });

  it("shows a password unlock screen when login is enabled", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "get_app_preferences") {
        return Promise.resolve({
          dark_mode: false,
          send_shortcut: "enter",
          show_notification_preview: true,
          privacy_mode: false,
          close_to_tray: true,
          login_enabled: true,
          login_password_hash: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
          profile_signature: "专注内网直连",
          avatar_label: "i",
          require_contact_for_messaging: false,
        });
      }
      return defaultTauriInvoke(command);
    });

    render(App);

    const unlock = await screen.findByRole("dialog", { name: "登录解锁" });
    expect(within(unlock).getByText("iim 已锁定")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "聊天工作区" })).not.toBeInTheDocument();

    await fireEvent.input(within(unlock).getByLabelText("登录密码"), {
      target: { value: "123456" },
    });
    await fireEvent.click(within(unlock).getByRole("button", { name: "解锁进入" }));

    await waitForInitialConversationLoad();
    expect(screen.getByRole("region", { name: "聊天工作区" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "登录解锁" })).not.toBeInTheDocument();
  });

  it("opens a profile menu from the top-left avatar", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    tauriInvoke.mockImplementation((command: string, args?: { profile?: unknown }) => {
      if (command === "get_self_profile") {
        return Promise.resolve({
          peer_id: "local-demo",
          display_name: "本机用户",
          hostname: "local-preview",
          avatar_hash: null,
          status: "online",
          endpoints: ["0.0.0.0:24251"],
          fingerprint: "a".repeat(64),
          public_key: Array(32).fill(10),
        });
      }
      if (command === "get_app_preferences") {
        return Promise.resolve({
          dark_mode: false,
          send_shortcut: "enter",
          show_notification_preview: true,
          privacy_mode: false,
          close_to_tray: true,
          login_enabled: false,
          login_password_hash: "",
          profile_signature: "专注内网直连",
          avatar_label: "i",
          require_contact_for_messaging: false,
        });
      }
      if (command === "update_self_profile") {
        return Promise.resolve(args?.profile);
      }
      return defaultTauriInvoke(command);
    });
    render(App);
    await waitForInitialConversationLoad();

    const rail = await screen.findByRole("navigation", { name: "主导航" });
    await fireEvent.click(within(rail).getByRole("button", { name: "打开个人菜单" }));

    const menu = await screen.findByRole("menu", { name: "个人快捷菜单" });
    expect(within(menu).getByText("本机用户")).toBeInTheDocument();
    expect(within(menu).getByText("专注内网直连")).toBeInTheDocument();
    expect(within(menu).queryByText("local-preview · 0.0.0.0:24251")).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: "在线" })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitemradio", { name: "离开" })).toHaveAttribute("aria-checked", "false");
    expect(within(menu).getByRole("menuitem", { name: "编辑签名" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "设置头像" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "打开设置" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "刷新联系人" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "联系人" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "文件传输" })).not.toBeInTheDocument();

    await fireEvent.click(within(menu).getByRole("menuitemradio", { name: "离开" }));
    expect(tauriInvoke).toHaveBeenCalledWith(
      "update_self_profile",
      expect.objectContaining({
        profile: expect.objectContaining({ status: "away" }),
      }),
    );
  });

  it("renders the production-style Svelte LAN messenger shell", async () => {
    render(App);

    expect(await screen.findByRole("button", { name: "打开个人菜单" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("搜索会话、联系人、聊天记录")).not.toBeInTheDocument();
    expect((await screen.findAllByText("消息")).length).toBeGreaterThan(0);
    expect(await screen.findByTitle("联系人")).toBeInTheDocument();
    expect(await screen.findByTitle("文件传输")).toBeInTheDocument();
    expect(await screen.findByTitle("设置")).toBeInTheDocument();
    await openSidebarContactQuickList();
    expect(await screen.findByRole("list", { name: "联系人列表" })).toBeInTheDocument();
    expect(screen.queryByText("局域网设备")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("可联系联系人 2 人")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("暂不可达联系人 1 人")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "刷新联系人" })).toBeInTheDocument();
    expect(await screen.findByTitle("与 研发一号 聊天")).toBeInTheDocument();
  });

  it("shows a startup progress layer while local data is loading", async () => {
    let resolveProfile: (value: unknown) => void = () => {};
    const profilePromise = new Promise((resolve) => {
      resolveProfile = resolve;
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "get_self_profile") return profilePromise;
      return defaultTauriInvoke(command);
    });

    render(App);

    expect(await screen.findByRole("status", { name: "启动进度" })).toBeInTheDocument();

    resolveProfile(await defaultTauriInvoke("get_self_profile"));
    await waitForInitialConversationLoad();
  });

  it("seeds preview conversations and contacts in an empty Tauri workspace", async () => {
    autoOpenInitialConversation = false;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_peers") return Promise.resolve([]);
      if (command === "list_conversations") return Promise.resolve([]);
      return defaultTauriInvoke(command);
    });

    render(App);
    await waitForInitialConversationLoad({ openConversation: false });

	    expect(screen.getByRole("region", { name: "空会话" })).toBeInTheDocument();
	    const recent = screen.getByRole("region", { name: "最近消息" });
	    expect(within(recent).getByText("产品经理")).toBeInTheDocument();
	    expect(within(recent).getByText("欢迎使用 iim，搜索、文件和群聊入口都在这里。")).toBeInTheDocument();
	    expect(
	      tauriInvoke.mock.calls.some((call) => {
	        const [command, args] = call as [string, { conversationId?: string }?];
	        return command === "list_messages" && args?.conversationId === "direct:demo-peer";
	      }),
	    ).toBe(false);

	    await fireEvent.click(within(recent).getByRole("button"));

	    await waitFor(() =>
	      expect(
	        tauriInvoke.mock.calls.some((call) => {
	          const [command, args] = call as [string, { conversationId?: string }?];
	          return command === "list_messages" && args?.conversationId === "direct:demo-peer";
	        }),
	      ).toBe(true),
	    );
  });

  it("keeps demo peers and group examples visible when discovery is empty but old conversations exist", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_peers") return Promise.resolve([]);
      if (command === "list_conversations") {
        return Promise.resolve([
          {
            id: "direct:demo-ops",
            title: "demo-ops",
            group_owner_peer_id: "",
            last_message_at: 1_700_000_000_000,
            last_message_preview: "消息预览已隐藏",
            unread_count: 33,
            manual_unread: false,
            pinned: false,
            muted: false,
            archived: false,
            draft_preview: "",
          },
        ]);
      }
      return defaultTauriInvoke(command);
    });

    render(App);
    await waitForInitialConversationLoad();

    expect(screen.getAllByText("产品经理").length).toBeGreaterThan(0);
    expect(screen.getByText("Alpha 项目组")).toBeInTheDocument();
    expect(screen.getByText("办公室通知")).toBeInTheDocument();
    expect(screen.getByText("客服值班群")).toBeInTheDocument();
    expect(screen.getByText("运维中控")).toBeInTheDocument();
    expect(screen.getByText("研发七号")).toBeInTheDocument();
    expect(screen.getByText("客服八号")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/群聊头像$/).length).toBeGreaterThanOrEqual(5);

    await fireEvent.click(screen.getByRole("tab", { name: /联系人/ }));
    expect(
      within(screen.getByRole("list", { name: "联系人列表" })).getAllByRole("listitem").length,
    ).toBeGreaterThanOrEqual(16);
    expect(
      tauriInvoke.mock.calls.some((call) => {
        const [command, args] = call as [string, { conversationId?: string }?];
        return command === "list_messages" && args?.conversationId === "direct:demo-peer";
      }),
    ).toBe(true);
  });

  it("disables current conversation tools in an empty Tauri workspace", async () => {
    autoOpenInitialConversation = false;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_peers") return Promise.resolve([]);
      if (command === "list_conversations") return Promise.resolve([]);
      return defaultTauriInvoke(command);
    });

    render(App);
    await waitForInitialConversationLoad({ openConversation: false });

	    expect(screen.getByRole("region", { name: "空会话" })).toBeInTheDocument();
	    expect(screen.queryByRole("toolbar", { name: "消息工具栏" })).not.toBeInTheDocument();
	    expect(screen.queryByPlaceholderText("输入消息")).not.toBeInTheDocument();

    expect(
      tauriInvoke.mock.calls.some((call) => {
        const [command, args] = call as [string, { conversationId?: string }?];
        return (
          (command === "search_conversation_messages" || command === "list_conversation_messages_between") &&
          args?.conversationId === ""
        );
      }),
    ).toBe(false);
  });

  it("does not publish typing events without an active conversation", async () => {
    autoOpenInitialConversation = false;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_peers") return Promise.resolve([]);
      if (command === "list_conversations") return Promise.resolve([]);
      return defaultTauriInvoke(command);
    });

    render(App);
    await waitForInitialConversationLoad({ openConversation: false });

	    expect(screen.getByRole("region", { name: "空会话" })).toBeInTheDocument();
	    expect(screen.queryByPlaceholderText("输入消息")).not.toBeInTheDocument();

    expect(
      tauriInvoke.mock.calls.some((call) => {
        const [command, args] = call as [string, { conversationId?: string }?];
        return command === "send_typing" && args?.conversationId === "";
      }),
    ).toBe(false);
  });

  it("keeps unread state out of visible conversation row chrome", async () => {
    render(App);

    const conversationList = document.querySelector(".conversation-list");
    expect(conversationList).not.toBeNull();
    const conversationButton = await within(
      conversationList as HTMLElement,
    ).findByRole("button", { name: /研发一号/ });
    const conversationRow = conversationButton.closest(".conversation-item");

    expect(conversationRow).toBeInTheDocument();
    expect(conversationRow).not.toHaveClass("unread");
    expect(conversationRow?.querySelector(".unread-badge")).not.toBeInTheDocument();
  });

  it("switches to settings and contact workspaces", async () => {
    render(App);

    await fireEvent.click(await screen.findByTitle("设置"));
    const workspace = await screen.findByRole("region", { name: "功能工作区" });
    expect(
      within(workspace).getByRole("heading", { name: "设置" }),
    ).toBeInTheDocument();
    expect(within(workspace).getByText("个人")).toBeInTheDocument();
    expect(
      within(workspace).getByRole("button", { name: "网络" }),
    ).toBeInTheDocument();
    expect(within(workspace).getByText("存储")).toBeInTheDocument();
    expect(
      within(workspace).getByRole("button", { name: "安全" }),
    ).toBeInTheDocument();
    expect(within(workspace).getByText("设备身份")).toBeInTheDocument();
    expect(within(workspace).getByText("设备 ID")).toBeInTheDocument();

    await fireEvent.click(
      within(workspace).getByRole("button", { name: "网络" }),
    );
    expect(within(workspace).getByText("发现端口")).toBeInTheDocument();
    expect(within(workspace).getByText("24250/UDP")).toBeInTheDocument();
    expect(within(workspace).getAllByText("24251/QUIC").length).toBeGreaterThan(0);
    expect(
      within(workspace).getByText(/Windows 防火墙提示/),
    ).toBeInTheDocument();

    await fireEvent.click(
      within(workspace).getByRole("button", { name: "存储" }),
    );
    expect(within(workspace).getByText("SQLCipher")).toBeInTheDocument();
    expect(
      within(workspace).getAllByText("Windows DPAPI").length,
    ).toBeGreaterThan(0);

    await fireEvent.click(
      within(workspace).getByRole("button", { name: "安全" }),
    );
    expect(within(workspace).getByText("设备指纹信任")).toBeInTheDocument();
    expect(within(workspace).getByText(/已发现 13 台设备/)).toBeInTheDocument();
    expect(within(workspace).getByText("设备指纹")).toBeInTheDocument();
    expect(
      within(workspace).getAllByRole("button", { name: /移除 .* 信任/ }).length,
    ).toBeGreaterThan(0);

    await openContactDirectoryWorkspace();
    expect(
      await screen.findByRole("heading", { name: "联系人" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "创建群聊" }),
    ).toBeInTheDocument();
  });

  it("does not expose an auto discovery toggle in default network settings", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "update_network_settings")
        return Promise.reject(new Error("network store locked"));
      return defaultTauriInvoke(command);
    });
    render(App);

    const workspace = await openNetworkSettingsWorkspace();

    expect(within(workspace).getByText("默认内网直连")).toBeInTheDocument();
    expect(within(workspace).queryByRole("button", { name: /自动发现/ })).not.toBeInTheDocument();
    expect(tauriInvoke).not.toHaveBeenCalledWith("update_network_settings", expect.anything());
  });

  it("does not expose a multicast toggle in default network settings", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "update_network_settings")
        return Promise.reject(new Error("udp bind denied"));
      return defaultTauriInvoke(command);
    });
    render(App);

    const workspace = await openNetworkSettingsWorkspace();

    expect(within(workspace).getByText("默认内网直连")).toBeInTheDocument();
    expect(within(workspace).queryByRole("button", { name: /局域网广播/ })).not.toBeInTheDocument();
    expect(tauriInvoke).not.toHaveBeenCalledWith("update_network_settings", expect.anything());
  });

  it("does not expose advanced network settings in the default network page", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "update_network_settings")
        return Promise.reject(new Error("settings db busy"));
      return defaultTauriInvoke(command);
    });
    render(App);

    const workspace = await openNetworkSettingsWorkspace();

    expect(within(workspace).getByText("默认内网直连")).toBeInTheDocument();
    expect(within(workspace).queryByLabelText("种子节点")).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText("扫描网段")).not.toBeInTheDocument();
    expect(within(workspace).queryByRole("button", { name: "保存网络发现设置" })).not.toBeInTheDocument();
    expect(screen.queryByText(/网络设置已保存/)).not.toBeInTheDocument();
    expect(tauriInvoke).not.toHaveBeenCalledWith("update_network_settings", expect.anything());
  });

  it("locks the app, shows progress, migrates storage, and restarts", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    dialogOpen.mockResolvedValue("D:/IIM-New");
    const migration = { resolve: undefined as (() => void) | undefined };
    tauriInvoke.mockImplementation((command: string, args?: unknown) => {
      if (command === "migrate_storage_directory") {
        return new Promise((resolve) => {
          migration.resolve = () =>
            resolve({
              data_dir: "D:\\IIM-New",
              database_path: "D:\\IIM-New\\iim.sqlite",
              database_key_path: "D:\\IIM-New\\db.key.dpapi",
              database_key_protection: "Windows DPAPI",
              received_files_dir: "D:\\IIM-New\\received_files",
              staged_files_dir: "D:\\IIM-New\\staged",
              database_bytes: 1024,
              received_bytes: 2048,
              staged_bytes: 0,
              transfer_task_count: 0,
            });
        });
      }
      if (command === "restart_app") return Promise.resolve(undefined);
      return (
        defaultTauriInvoke as (
          command: string,
          args?: unknown,
        ) => Promise<unknown>
      )(command, args);
    });
    render(App);

    await waitForInitialConversationLoad();
    await waitForTauriListener("storage:migration_progress");
    await fireEvent.click(await screen.findByTitle("设置"));
    const workspace = await screen.findByRole("region", { name: "功能工作区" });
    await fireEvent.click(within(workspace).getByRole("button", { name: "存储" }));
    await fireEvent.click(within(workspace).getByRole("button", { name: "选择新的数据目录" }));

    await waitFor(() => {
      expect(dialogOpen).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "选择新的 iim 数据目录",
      });
    });
    const dialog = await screen.findByRole("dialog", { name: "数据目录迁移中" });
    expect(within(dialog).getByText(/迁移完成前暂时不能操作应用/)).toBeInTheDocument();
    expect(within(workspace).getByRole("button", { name: "正在迁移数据目录" })).toBeDisabled();

    emitTauriEvent("storage:migration_progress", {
      phase: "copying",
      completed: 2,
      total: 4,
      current_path: "iim.sqlite",
    });
    expect(await within(dialog).findByText("2/4")).toBeInTheDocument();
    expect(within(dialog).getByTitle("iim.sqlite")).toBeInTheDocument();

    const finishMigration = migration.resolve;
    expect(finishMigration).toBeTypeOf("function");
    if (!finishMigration) throw new Error("migration resolver was not registered");
    finishMigration();
    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith("migrate_storage_directory", {
        newDataDir: "D:/IIM-New",
      }),
    );
    await waitFor(() => expect(tauriInvoke).toHaveBeenCalledWith("restart_app"));
  });

  it("opens settings with the global Ctrl+Comma shortcut", async () => {
    render(App);

    expect(
      await screen.findByRole("region", { name: "聊天工作区" }),
    ).toBeInTheDocument();
    const event = new KeyboardEvent("keydown", {
      key: ",",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    const workspace = await screen.findByRole("region", { name: "功能工作区" });
    expect(
      within(workspace).getByRole("heading", { name: "设置" }),
    ).toBeInTheDocument();
    expect(within(workspace).getByText("个人")).toBeInTheDocument();
  });

  it("opens the current conversation history search with Ctrl+K", async () => {
    render(App);

    await waitForInitialConversationLoad();
    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    const conversationSearchInput = await screen.findByPlaceholderText("查询聊天记录");
    await waitFor(() => expect(document.activeElement).toBe(conversationSearchInput));
  });

  it("shows a clear error when current conversation search fails", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "search_conversation_messages") {
        return Promise.reject(new Error("conversation index busy"));
      }
      return defaultTauriInvoke(command);
    });
    render(App);
    await waitForInitialConversationLoad();

    await fireEvent.click(
      within(await screen.findByRole("group", { name: "会话标题栏" })).getByRole("button", { name: "搜索聊天记录" }),
    );
    const conversationSearchInput =
      await screen.findByPlaceholderText("查询聊天记录");
    await fireEvent.input(conversationSearchInput, {
      target: { value: "文件" },
    });
    const searchPanel = conversationSearchInput.closest(
      ".conversation-search-panel",
    ) as HTMLElement | null;
    expect(searchPanel).not.toBeNull();
    const searchForm = (searchPanel as HTMLElement).querySelector("form");
    expect(searchForm).not.toBeNull();
    await fireEvent.submit(searchForm as HTMLFormElement);

    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith(
        "search_conversation_messages",
        expect.objectContaining({
          conversationId: "direct:demo-peer",
          query: "文件",
        }),
      ),
    );

    expect(
      await screen.findByText("当前会话搜索失败：conversation index busy"),
    ).toBeInTheDocument();
  });

  it("loads and focuses a search result outside the current message page", async () => {
    const historicalMessage: ChatMessage = {
      id: "historical-search-result",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "historical searchable message",
      attachments: [],
      created_at: Date.now() - 86_400_000,
      status: "delivered",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "search_conversation_messages") return Promise.resolve([historicalMessage]);
      return defaultTauriInvoke(command);
    });
    render(App);
    await waitForInitialConversationLoad();

    await fireEvent.click(
      within(await screen.findByRole("group", { name: "会话标题栏" })).getByRole("button", { name: "搜索聊天记录" }),
    );
    const searchInput = await screen.findByPlaceholderText("查询聊天记录");
    await fireEvent.input(searchInput, { target: { value: "historical" } });
    const searchForm = searchInput.closest("form");
    expect(searchForm).not.toBeNull();
    await fireEvent.submit(searchForm as HTMLFormElement);

    await waitFor(() => {
      const focusedBubble = document.querySelector(".message-bubble.focused");
      expect(focusedBubble).toHaveTextContent("historical searchable message");
    });
    expect(document.querySelector(".chat-workspace")).toBeInTheDocument();
  });

  it("opens settings preferences when the tray menu requests settings", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await screen.findByRole("region", { name: "聊天工作区" });
    await waitForTauriListener("window:open_settings");
    emitTauriEvent("window:open_settings", "preferences");

    const workspace = await screen.findByRole("region", { name: "功能工作区" });
    expect(
      within(workspace).getByRole("heading", { name: "设置" }),
    ).toBeInTheDocument();
    expect(within(workspace).queryByText("工作台偏好")).not.toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "提醒与隐私" })).toBeInTheDocument();
  });

  it("offers self presence controls in profile settings", async () => {
    render(App);

    await fireEvent.click(await screen.findByTitle("设置"));
    const presenceGroup = await screen.findByRole("group", {
      name: "本机在线状态",
    });
    expect(
      within(presenceGroup).getByRole("button", { name: "在线" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(presenceGroup).getByRole("button", { name: "离开" }),
    ).toBeInTheDocument();
    expect(
      within(presenceGroup).getByRole("button", { name: "隐身" }),
    ).toBeInTheDocument();
  });

  it("shows a clear error when saving the local profile fails", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "update_self_profile")
        return Promise.reject(new Error("profile db locked"));
      return defaultTauriInvoke(command);
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(await screen.findByTitle("设置"));
    const workspace = await screen.findByRole("region", { name: "功能工作区" });
    await fireEvent.input(within(workspace).getByLabelText("显示名称"), {
      target: { value: "新的本机名称" },
    });
    await fireEvent.click(
      within(workspace).getByRole("button", { name: "保存个人信息" }),
    );

    expect(
      await screen.findByText("本机资料保存失败：profile db locked"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(tauriInvoke).not.toHaveBeenCalledWith(
        "update_app_preferences",
        expect.anything(),
      );
    });
  });

  it("copies local identity values from profile settings", async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(App);

    await fireEvent.click(await screen.findByTitle("设置"));
    await fireEvent.click(
      await screen.findByRole("button", { name: "复制设备 ID" }),
    );
    await fireEvent.click(
      await screen.findByRole("button", { name: "复制证书指纹" }),
    );

    expect(writeText).toHaveBeenCalledWith("local-demo");
    expect(writeText).toHaveBeenCalledWith("a".repeat(64));
  });

  it("confirms before removing a trusted peer fingerprint", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    let trustedPeers = [
      {
        peer_id: "demo-peer",
        fingerprint: "f".repeat(64),
        trusted_at: 1_725_000_000,
      },
    ];
    tauriInvoke.mockImplementation((command: string, args?: unknown) => {
      if (command === "list_trusted_peers")
        return Promise.resolve(trustedPeers);
      if (command === "remove_trusted_peer") {
        trustedPeers = [];
        return Promise.resolve(true);
      }
      return (
        defaultTauriInvoke as unknown as (
          command: string,
          args?: unknown,
        ) => Promise<unknown>
      )(command, args);
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(await screen.findByTitle("设置"));
    const workspace = await screen.findByRole("region", { name: "功能工作区" });
    await fireEvent.click(
      within(workspace).getByRole("button", { name: "安全" }),
    );
    expect(
      await within(workspace).findByText("设备指纹"),
    ).toBeInTheDocument();
    await fireEvent.click(
      within(workspace).getByRole("button", { name: /移除 .* 信任/ }),
    );
    const cancelDialog = await screen.findByRole("dialog", {
      name: "确认移除设备信任",
    });
    expect(
      within(cancelDialog).getByText(
        /下次发现该设备时会重新执行 TOFU 信任流程/,
      ),
    ).toBeInTheDocument();
    await fireEvent.click(
      within(cancelDialog).getByRole("button", { name: "取消" }),
    );
    expect(tauriInvoke).not.toHaveBeenCalledWith(
      "remove_trusted_peer",
      expect.anything(),
    );
    expect(
      within(workspace).getByRole("button", { name: /移除 .* 信任/ }),
    ).toBeInTheDocument();

    await fireEvent.click(
      within(workspace).getByRole("button", { name: /移除 .* 信任/ }),
    );
    const confirmDialog = await screen.findByRole("dialog", {
      name: "确认移除设备信任",
    });
    await fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "确认移除" }),
    );

    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith("remove_trusted_peer", {
        peerId: "demo-peer",
      }),
    );
    expect(
      await screen.findByText("已移除该设备信任，下次发现时会重新执行 TOFU"),
    ).toBeInTheDocument();
  });

  it("persists the add-friend-only messaging security preference", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(await screen.findByTitle("设置"));
    const workspace = await screen.findByRole("region", { name: "功能工作区" });
    await fireEvent.click(within(workspace).getByRole("button", { name: "安全" }));
    await fireEvent.click(within(workspace).getByRole("radio", { name: "仅联系人可通信" }));

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("update_app_preferences", {
        preferences: expect.objectContaining({
          require_contact_for_messaging: true,
        }),
      });
    });
  });

  it("persists shortcut preferences from settings", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(await screen.findByTitle("设置"));
    const workspace = await screen.findByRole("region", { name: "功能工作区" });
    await fireEvent.click(within(workspace).getByRole("button", { name: "偏好" }));
    await fireEvent.click(within(workspace).getByRole("button", { name: "Ctrl+Shift+A" }));

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("update_app_preferences", {
        preferences: expect.objectContaining({
          shortcuts: expect.objectContaining({
            screenshot: "ctrl_shift_a",
          }),
        }),
      });
    });
  });

  it("runs configured screenshot and window shortcuts while focused", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string, args?: unknown) => {
      if (command === "get_app_preferences") {
        return Promise.resolve({
          dark_mode: false,
          send_shortcut: "enter",
          shortcuts: {
            send_message: "enter",
            screenshot: "ctrl_alt_a",
            toggle_window: "ctrl_alt_i",
          },
          show_notification_preview: true,
          privacy_mode: false,
          close_to_tray: true,
          login_enabled: false,
          login_password_hash: "",
          profile_signature: "",
          avatar_label: "",
          require_contact_for_messaging: false,
        });
      }
      return (defaultTauriInvoke as (command: string, args?: unknown) => Promise<unknown>)(command, args);
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.keyDown(window, { key: "A", ctrlKey: true, altKey: true });
    await fireEvent.keyDown(window, { key: "I", ctrlKey: true, altKey: true });

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("start_screen_capture");
      expect(tauriInvoke).toHaveBeenCalledWith("minimize_to_tray");
    });
  });

  it("blocks text sends to unsaved contacts when add-friend-only messaging is enabled", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string, args?: unknown) => {
      if (command === "get_app_preferences") {
        return Promise.resolve({
          dark_mode: false,
          send_shortcut: "enter",
          show_notification_preview: true,
          privacy_mode: false,
          close_to_tray: true,
          login_enabled: false,
          login_password_hash: "",
          profile_signature: "",
          avatar_label: "",
          require_contact_for_messaging: true,
        });
      }
      return (defaultTauriInvoke as (command: string, args?: unknown) => Promise<unknown>)(command, args);
    });
    render(App);

    await waitForInitialConversationLoad();
    const input = await screen.findByPlaceholderText("输入消息");
    await waitFor(() => {
      expect(document.querySelector<HTMLButtonElement>(".send-button")).toBeDisabled();
    });
    await fireEvent.input(input, { target: { value: "friend gate" } });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(tauriInvoke.mock.calls.some(([command]) => command === "send_text")).toBe(false);
  });

  it("does not queue dropped files for unsaved contacts when add-friend-only messaging is enabled", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string, args?: unknown) => {
      if (command === "get_app_preferences") {
        return Promise.resolve({
          dark_mode: false,
          send_shortcut: "enter",
          show_notification_preview: true,
          privacy_mode: false,
          close_to_tray: true,
          login_enabled: false,
          login_password_hash: "",
          profile_signature: "",
          avatar_label: "",
          require_contact_for_messaging: true,
        });
      }
      return (defaultTauriInvoke as (command: string, args?: unknown) => Promise<unknown>)(command, args);
    });
    render(App);

    await waitForInitialConversationLoad();
    await waitForTauriDragDropListener();
    emitTauriDragDrop({
      type: "drop",
      paths: ["C:/work/blocked.pdf"],
      position: { x: 320, y: 560 },
    });

    expect(document.querySelector(".pending-file-tray")).not.toBeInTheDocument();
    expect(tauriInvoke.mock.calls.some(([command]) => command === "send_files")).toBe(false);
  });

  it("shows a focused contact profile card with direct actions", async () => {
    render(App);

    await openContactDirectoryWorkspace();
    const profileCards = await screen.findAllByRole("region", {
      name: "联系人资料",
    });
    const profileCard = profileCards.find((card) =>
      card.classList.contains("contact-detail-pane"),
    );
    expect(profileCard).toBeDefined();
    expect(
      within(profileCard as HTMLElement).getByRole("heading", { name: "研发一号" }),
    ).toBeInTheDocument();
    const technicalDetails = within(profileCard as HTMLElement)
      .getByText("设备与安全信息")
      .closest("details");
    expect(technicalDetails).not.toBeNull();
    expect(technicalDetails).not.toHaveAttribute("open");
    expect(within(profileCard as HTMLElement).getByText("设备指纹")).not.toBeVisible();
    expect(within(profileCard as HTMLElement).getByText("IP 地址")).not.toBeVisible();
    expect(
      within(profileCard as HTMLElement).getByRole("button", { name: "发消息" }),
    ).toBeInTheDocument();
    expect(
      within(profileCard as HTMLElement).getByRole("button", { name: "保存资料" }),
    ).toBeInTheDocument();
  });

  it("opens the requested contact profile from the sidebar contact action", async () => {
    const alice = {
      peer_id: "peer-a",
      display_name: "Alice",
      hostname: "alice-pc",
      avatar_hash: null,
      status: "online",
      endpoints: ["192.168.1.20:24251"],
      fingerprint: "a".repeat(64),
      public_key: Array(32).fill(1),
    };
    const bob = {
      peer_id: "peer-b",
      display_name: "Bob",
      hostname: "bob-pc",
      avatar_hash: null,
      status: "online",
      endpoints: ["192.168.1.21:24251"],
      fingerprint: "b".repeat(64),
      public_key: Array(32).fill(2),
    };
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_peers") return Promise.resolve([alice, bob]);
      if (command === "list_conversations")
        return Promise.resolve([
          {
            id: "direct:peer-a",
            title: "Alice",
            last_message_at: Date.now(),
            last_message_preview: "",
            unread_count: 0,
            manual_unread: false,
            pinned: false,
            muted: false,
            archived: false,
            draft_preview: "",
          },
        ]);
      return defaultTauriInvoke(command);
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    const workspace = await openContactDirectoryWorkspace();
    const bobSummaryButton = within(workspace)
      .getAllByRole("button")
      .find((button) => button.classList.contains("directory-contact-select") && button.textContent?.includes("Bob"));
    expect(bobSummaryButton).toBeDefined();
    await fireEvent.click(bobSummaryButton as HTMLButtonElement);

    const profileCard = await findDirectoryProfileCard();
    expect(within(profileCard).getByRole("heading", { name: "Bob" })).toBeInTheDocument();
    expect(within(profileCard).getAllByText("bob-pc").length).toBeGreaterThan(0);
    expect(within(profileCard).queryByRole("heading", { name: "Alice" })).not.toBeInTheDocument();
  });

  it("shows a searchable flat contact list with device actions", async () => {
    render(App);

    await openContactDirectoryWorkspace();
    expect(
      await screen.findByRole("searchbox", { name: "搜索联系人" }),
    ).toBeInTheDocument();
    const contactOverview = await screen.findByLabelText("联系人概览");
    expect(within(contactOverview).getByText(/13 位联系人/)).toBeInTheDocument();
    expect(within(contactOverview).getByText(/10 可联系/)).toBeInTheDocument();

    const reachableGroup = await screen.findByRole("region", {
      name: "发现设备列表",
    });
    expect(
      within(reachableGroup).getByRole("button", { name: "和 研发一号 聊天" }),
    ).toBeInTheDocument();
    expect(
      within(reachableGroup).queryByRole("button", {
        name: "选择 研发一号 加入群聊",
      }),
    ).not.toBeInTheDocument();
    expect(within(contactOverview).queryByText(/已选/)).not.toBeInTheDocument();
  });

  it("selects searchable members inside the group creation dialog", async () => {
    render(App);

    const workspace = await openContactDirectoryWorkspace();
    await fireEvent.click(within(workspace).getByRole("button", { name: "创建群聊" }));

    const dialog = await screen.findByRole("dialog", { name: "创建群聊" });
    expect(within(dialog).getByText("已选择 0 位联系人")).toBeInTheDocument();
    expect(within(dialog).getByText("研发一号")).toBeInTheDocument();
    expect(within(dialog).getByText("客服八号")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "创建" })).toBeDisabled();

    const memberSearch = within(dialog).getByRole("searchbox", { name: "搜索群成员" });
    await fireEvent.input(memberSearch, { target: { value: "研发" } });
    expect(within(dialog).getByText("研发一号")).toBeInTheDocument();
    expect(within(dialog).queryByText("客服八号")).not.toBeInTheDocument();
    await fireEvent.click(within(dialog).getByRole("button", { name: "选择成员 研发一号" }));

    await fireEvent.input(memberSearch, { target: { value: "客服" } });
    await fireEvent.click(within(dialog).getByRole("button", { name: "选择成员 客服八号" }));
    expect(within(dialog).getByText("已选择 2 位联系人")).toBeInTheDocument();

    const nameInput = within(dialog).getByRole("textbox", { name: "群聊名称" });
    await fireEvent.input(nameInput, { target: { value: "项目验收组" } });
    await fireEvent.click(within(dialog).getByRole("button", { name: "创建" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "创建群聊" })).not.toBeInTheDocument());
    expect(await screen.findByRole("heading", { name: "项目验收组" })).toBeInTheDocument();
  });

  it("clears unfinished group member selections when the dialog closes", async () => {
    render(App);

    const workspace = await openContactDirectoryWorkspace();
    await fireEvent.click(within(workspace).getByRole("button", { name: "创建群聊" }));
    let dialog = await screen.findByRole("dialog", { name: "创建群聊" });
    await fireEvent.click(within(dialog).getByRole("button", { name: "选择成员 研发一号" }));
    expect(within(dialog).getByText("已选择 1 位联系人")).toBeInTheDocument();
    await fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));

    await fireEvent.click(within(workspace).getByRole("button", { name: "创建群聊" }));
    dialog = await screen.findByRole("dialog", { name: "创建群聊" });
    expect(within(dialog).getByText("已选择 0 位联系人")).toBeInTheDocument();
    expect(within(dialog).getByRole("searchbox", { name: "搜索群成员" })).toHaveValue("");
  });

  it("opens an app-owned contact context menu from the contact directory", async () => {
    render(App);

    await waitForInitialConversationLoad();
    await openContactDirectoryWorkspace();
    const reachableGroup = await screen.findByRole("region", {
      name: "发现设备列表",
    });
    const contactSummaryButton = within(reachableGroup)
      .getAllByRole("button")
      .find((button) => button.classList.contains("directory-contact-select"));
    expect(contactSummaryButton).toBeDefined();
    await fireEvent.contextMenu(contactSummaryButton as HTMLButtonElement);

    const contactMenu = await screen.findByRole("menu", {
      name: "联系人快捷菜单",
    });
    expect(
      within(contactMenu).getByRole("menuitem", { name: "发起聊天" }),
    ).toBeInTheDocument();
    expect(
      within(contactMenu).getByRole("menuitem", { name: "联系人详情" }),
    ).toBeInTheDocument();
    expect(
      within(contactMenu).getByRole("menuitem", {
        name: /星标联系人|取消星标/,
      }),
    ).toBeInTheDocument();
    expect(
      within(contactMenu).getByRole("menuitem", { name: "阻止联系人" }),
    ).toBeInTheDocument();
    expect(within(contactMenu).getAllByRole("menuitem")).toHaveLength(4);
    expect(within(contactMenu).queryByRole("menuitem", { name: "复制研发一号设备 ID" })).not.toBeInTheDocument();
    expect(within(contactMenu).queryByRole("menuitem", { name: "复制研发一号指纹" })).not.toBeInTheDocument();
    expect(within(contactMenu).queryByRole("menuitem", { name: "复制研发一号端点" })).not.toBeInTheDocument();
    await fireEvent.click(within(contactMenu).getByRole("menuitem", { name: "联系人详情" }));
    expect(document.querySelector(".contact-context-menu")).not.toBeInTheDocument();
    expect(document.querySelector(".app-context-menu")).not.toBeInTheDocument();
  }, 15000);

  it("keeps low-frequency diagnostics out of the contact context menu", async () => {
    render(App);

    await openContactDirectoryWorkspace();
    const reachableGroup = await screen.findByRole("region", {
      name: "发现设备列表",
    });
    const contactSummaryButton = within(reachableGroup)
      .getAllByRole("button")
      .find((button) => button.classList.contains("directory-contact-select"));
    expect(contactSummaryButton).toBeDefined();
    await fireEvent.contextMenu(contactSummaryButton as HTMLButtonElement);
    const contactMenu = await screen.findByRole("menu", {
      name: "联系人快捷菜单",
    });

    expect(within(contactMenu).queryByRole("menuitem", { name: "复制联系人诊断" })).not.toBeInTheDocument();
    expect(within(contactMenu).queryByRole("menuitem", { name: "复制设备 ID" })).not.toBeInTheDocument();
    expect(within(contactMenu).queryByRole("menuitem", { name: "复制端点" })).not.toBeInTheDocument();
    expect(within(contactMenu).queryByRole("menuitem", { name: "复制指纹" })).not.toBeInTheDocument();
  });

  it("blocks a contact from new direct chats and group selection", async () => {
    render(App);

    await openContactDirectoryWorkspace();
    const reachableGroup = await screen.findByRole("region", {
      name: "发现设备列表",
    });
    expect(await within(reachableGroup).findByText("研发一号")).toBeInTheDocument();
    const profileCard = await findDirectoryProfileCard();
    await fireEvent.click(
      within(profileCard).getByRole("button", { name: "阻止联系人" }),
    );

    const messageLoadCallsBefore = tauriInvoke.mock.calls.filter(
      ([command]) => command === "list_messages",
    ).length;
    const blockedSummaryButton = within(reachableGroup)
      .getAllByRole("button")
      .find((button) => button.classList.contains("directory-contact-select"));
    expect(blockedSummaryButton).toBeDefined();
    await fireEvent.contextMenu(blockedSummaryButton as HTMLButtonElement);
    const contactMenu = await screen.findByRole("menu", {
      name: "联系人快捷菜单",
    });
    const startChatItem = within(contactMenu).getByRole("menuitem", {
      name: "发起聊天",
    });
    expect(startChatItem).toBeDisabled();
    await fireEvent.click(startChatItem);

    expect(
      tauriInvoke.mock.calls.filter(([command]) => command === "list_messages")
        .length,
    ).toBe(messageLoadCallsBefore);
  });

  it("uses presence dots instead of online text in the contact profile", async () => {
    render(App);

    await openContactDirectoryWorkspace();
    const profileCard = await findDirectoryProfileCard();
    expect(
      within(profileCard).getByLabelText("研发一号 可联系状态"),
    ).toBeInTheDocument();
    expect(within(profileCard).queryByText("在线")).not.toBeInTheDocument();
  });

  it("shows a clear error when contact metadata saving fails", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "update_contact_metadata")
        return Promise.reject(new Error("metadata db busy"));
      return defaultTauriInvoke(command);
    });
    render(App);

    await openContactDirectoryWorkspace();
    const profileCard = await findDirectoryProfileCard();
    await fireEvent.click(
      within(profileCard).getByRole("button", { name: "保存资料" }),
    );

    expect(
      await screen.findByText("联系人资料保存失败：metadata db busy"),
    ).toBeInTheDocument();
  });

  it("trusts a peer automatically after saving it as a contact", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string, args?: { metadata?: unknown }) => {
      if (command === "update_contact_metadata") {
        return Promise.resolve(args?.metadata);
      }
      return (defaultTauriInvoke as (command: string, args?: unknown) => Promise<unknown>)(command, args);
    });
    render(App);

    await openContactDirectoryWorkspace();
    const profileCard = await findDirectoryProfileCard();
    const saveButton = profileCard.querySelector<HTMLButtonElement>('[aria-label="保存资料"]');
    expect(saveButton).not.toBeNull();
    await fireEvent.click(saveButton as HTMLButtonElement);

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("trust_peer", {
        peerId: "demo-peer",
        fingerprint: "f".repeat(64),
      });
    });
  });

  it("refreshes transfer state after saving a blocked contact", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation(
      (command: string, args?: { metadata?: unknown }) => {
        if (command === "update_contact_metadata") {
          return Promise.resolve({
            ...(args?.metadata as object),
            peer_id: "demo-peer",
            blocked: true,
          });
        }
        return defaultTauriInvoke(command);
      },
    );
    render(App);

    await openContactDirectoryWorkspace();
    const profileCard = await findDirectoryProfileCard();
    const transferCallsBefore = tauriInvoke.mock.calls.filter(
      ([command]) => command === "list_transfers",
    ).length;
    const storageCallsBefore = tauriInvoke.mock.calls.filter(
      ([command]) => command === "get_storage_overview",
    ).length;

    await fireEvent.click(
      within(profileCard).getByRole("button", { name: "阻止联系人" }),
    );
    await fireEvent.click(
      within(profileCard).getByRole("button", { name: "保存资料" }),
    );

    expect(
      await screen.findByText("联系人资料已保存，相关传输授权已撤销"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        tauriInvoke.mock.calls.filter(
          ([command]) => command === "list_transfers",
        ).length,
      ).toBeGreaterThan(transferCallsBefore);
      expect(
        tauriInvoke.mock.calls.filter(
          ([command]) => command === "get_storage_overview",
        ).length,
      ).toBeGreaterThan(storageCallsBefore);
    });
  });

  it("uses presence dots instead of online text in the chat header and inspector", async () => {
    render(App);

    const chatWorkspace = await screen.findByRole("region", {
      name: "聊天工作区",
    });
    expect(
      within(chatWorkspace).getAllByLabelText("研发一号 可联系").length,
    ).toBeGreaterThan(0);
    expect(within(chatWorkspace).queryByText("在线")).not.toBeInTheDocument();

    await fireEvent.click(within(screen.getByRole("group", { name: "会话标题栏" })).getByRole("button", { name: "查看直聊资料" }));
    const inspector = await screen.findByLabelText("会话详情面板");
    expect(
      within(inspector).getAllByLabelText("研发一号 可联系状态").length,
    ).toBeGreaterThan(0);
    expect(within(inspector).queryByText("在线")).not.toBeInTheDocument();
  });

  it("does not open the conversation inspector network tab when a network warning arrives", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await screen.findByTitle("消息");
    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith("mark_conversation_read", {
        conversationId: "direct:demo-peer",
      }),
    );
    emitTauriEvent("network:warning", "Discovery bind failed: port 24250");

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "网络状态" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("会话详情面板")).not.toBeInTheDocument();
    });
  });

  it("does not open the conversation inspector security tab for identity network warnings", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await screen.findByTitle("消息");
    emitTauriEvent("network:warning", "Peer fingerprint rejected for Alice: fingerprint changed");

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "安全指纹" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("会话详情面板")).not.toBeInTheDocument();
    });
  });

  it("does not show recent network warnings in the conversation inspector", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await screen.findByTitle("消息");
    emitTauriEvent("network:warning", "群聊 Ops 未能广播给成员");
    emitTauriEvent("network:warning", "文件传输公告 transfer-1 未能同步给对端");

    await waitFor(() => {
      expect(screen.queryByRole("list", { name: "最近网络告警" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("会话详情面板")).not.toBeInTheDocument();
    });
  });

  it("shows persisted transfer history in the files workspace", async () => {
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(await screen.findByTitle("文件传输"));
    expect(await screen.findByLabelText("文件传输统计")).toBeInTheDocument();
    expect(await screen.findByText("文件传输历史")).toBeInTheDocument();
    expect(await screen.findByText("设计稿同步")).toBeInTheDocument();
    expect(await screen.findByText("历史资料包")).toBeInTheDocument();
    expect((await screen.findAllByText("已完成")).length).toBeGreaterThan(0);
    expect(
      await screen.findByRole("progressbar", { name: "设计稿同步 传输进度" }),
    ).toBeInTheDocument();

    const transferHistory = await screen.findByRole("region", {
      name: "文件传输历史",
    });
    const activeTransfers = (within(transferHistory).getByText("设计稿同步").closest("article") ?? transferHistory) as HTMLElement;
    const cancelButton = within(activeTransfers).getByRole("button", {
      name: "取消",
    });
    expect(cancelButton).toBeInTheDocument();
    expect(
      within(activeTransfers).queryByRole("button", { name: "删除" }),
    ).not.toBeInTheDocument();
    expect(
      within((within(transferHistory).getByText("历史资料包").closest("article") ?? transferHistory) as HTMLElement).getByRole("button", { name: "删除" }),
    ).toBeInTheDocument();

    await fireEvent.click(cancelButton);
    expect(await screen.findByText("传输已取消")).toBeInTheDocument();
  });

  it("confirms before deleting a transfer history record", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_transfers") {
        return Promise.resolve([
          {
            id: "transfer-delete",
            conversationId: "direct:demo-peer",
            name: "danger-history.zip",
            status: "delivered",
            errorMessage: "",
            totalBytes: 4096,
            sentBytes: 4096,
            files: ["danger-history.zip"],
            resumable: false,
          },
        ]);
      }
      if (command === "delete_transfer") return Promise.resolve(true);
      return defaultTauriInvoke(command);
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(await screen.findByTitle("文件传输"));
    const history = await screen.findByRole("region", { name: "文件传输历史" });
    expect(within(history).getByText("danger-history.zip")).toBeInTheDocument();
    await fireEvent.click(
      within(history).getByRole("button", { name: "删除" }),
    );
    const cancelDialog = await screen.findByRole("dialog", {
      name: "确认删除传输记录",
    });
    expect(
      within(cancelDialog).getByText(/不会删除已经接收或暂存的文件/),
    ).toBeInTheDocument();
    await fireEvent.click(
      within(cancelDialog).getByRole("button", { name: "取消" }),
    );
    expect(tauriInvoke).not.toHaveBeenCalledWith(
      "delete_transfer",
      expect.anything(),
    );
    expect(screen.getByText("danger-history.zip")).toBeInTheDocument();

    await fireEvent.click(
      within(history).getByRole("button", { name: "删除" }),
    );
    const confirmDialog = await screen.findByRole("dialog", {
      name: "确认删除传输记录",
    });
    await fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "确认删除" }),
    );

    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith("delete_transfer", {
        transferId: "transfer-delete",
      }),
    );
    expect(screen.queryByText("danger-history.zip")).not.toBeInTheDocument();
    expect(
      await screen.findByText("传输记录已删除，相关传输索引已清理"),
    ).toBeInTheDocument();
  });

  it("opens an app-owned transfer context menu from the files workspace", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_transfers") {
        return Promise.resolve([
          {
            id: "transfer-context",
            conversationId: "direct:demo-peer",
            name: "context-history.zip",
            status: "failed",
            errorMessage: "network interrupted",
            totalBytes: 4096,
            sentBytes: 2048,
            files: ["context-history.zip"],
            resumable: true,
          },
        ]);
      }
      return defaultTauriInvoke(command);
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(await screen.findByTitle("文件传输"));
    const transferName = await screen.findByText("context-history.zip");
    await fireEvent.contextMenu(transferName);

    const transferMenu = await screen.findByRole("menu", {
      name: "传输快捷菜单",
    });
    expect(
      within(transferMenu).getByRole("menuitem", { name: "定位传输目录" }),
    ).toBeInTheDocument();
    expect(
      within(transferMenu).getByRole("menuitem", { name: "重新广播" }),
    ).toBeInTheDocument();
    expect(
      within(transferMenu).getByRole("menuitem", { name: "删除记录" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".app-context-menu")).not.toBeInTheDocument();
  });

  it("copies a transfer identifier from the transfer context menu", async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_transfers") {
        return Promise.resolve([
          {
            id: "transfer-context-copy",
            conversationId: "direct:demo-peer",
            name: "copy-context.zip",
            status: "failed",
            errorMessage: "network interrupted",
            totalBytes: 4096,
            sentBytes: 2048,
            files: ["copy-context.zip", "docs/readme.md"],
            resumable: true,
          },
        ]);
      }
      return defaultTauriInvoke(command);
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(await screen.findByTitle("文件传输"));
    await fireEvent.contextMenu(await screen.findByText("copy-context.zip"));
    const transferMenu = await screen.findByRole("menu", {
      name: "传输快捷菜单",
    });
    await fireEvent.click(
      within(transferMenu).getByRole("menuitem", { name: "复制传输 ID" }),
    );

    expect(writeText).toHaveBeenCalledWith("transfer-context-copy");
    expect(await screen.findByText("传输 ID 已复制")).toBeInTheDocument();

    await fireEvent.contextMenu(await screen.findByText("copy-context.zip"));
    const reopenedTransferMenu = await screen.findByRole("menu", {
      name: "传输快捷菜单",
    });
    await fireEvent.click(
      within(reopenedTransferMenu).getByRole("menuitem", { name: "复制文件清单" }),
    );

    expect(writeText).toHaveBeenCalledWith("copy-context.zip\ndocs/readme.md");
    expect(await screen.findByText("文件清单已复制")).toBeInTheDocument();

    await fireEvent.contextMenu(await screen.findByText("copy-context.zip"));
    const diagnosticTransferMenu = await screen.findByRole("menu", {
      name: "传输快捷菜单",
    });
    await fireEvent.click(
      within(diagnosticTransferMenu).getByRole("menuitem", {
        name: "复制传输记录",
      }),
    );

    const diagnosticReport = writeText.mock.calls[writeText.mock.calls.length - 1]?.[0] ?? "";
    expect(diagnosticReport).toContain("iim 传输记录");
    expect(diagnosticReport).toContain("任务 ID：transfer-context-copy");
    expect(diagnosticReport).toContain("会话：direct:demo-peer");
    expect(diagnosticReport).toContain("状态：失败 (failed)");
    expect(diagnosticReport).toContain("进度：50%");
    expect(diagnosticReport).toContain("copy-context.zip\ndocs/readme.md");
    expect(diagnosticReport).toContain("错误：network interrupted");
    expect(diagnosticReport).toContain("可重新广播：是");
    expect(await screen.findByText("传输诊断报告已复制")).toBeInTheDocument();
  });

  it("reports stale transfer deletion clearly when the record is already gone", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_transfers") {
        return Promise.resolve([
          {
            id: "transfer-stale-delete",
            conversationId: "direct:demo-peer",
            name: "stale-history.zip",
            status: "failed",
            errorMessage: "",
            totalBytes: 4096,
            sentBytes: 1024,
            files: ["stale-history.zip"],
            resumable: false,
          },
        ]);
      }
      if (command === "delete_transfer") return Promise.resolve(false);
      return defaultTauriInvoke(command);
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(await screen.findByTitle("文件传输"));
    const history = await screen.findByRole("region", { name: "文件传输历史" });
    await fireEvent.click(
      within(history).getByRole("button", { name: "删除" }),
    );
    const confirmDialog = await screen.findByRole("dialog", {
      name: "确认删除传输记录",
    });
    await fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "确认删除" }),
    );

    expect(
      await screen.findByText("传输记录不存在或已删除"),
    ).toBeInTheDocument();
  });

  it("confirms before clearing completed transfer history", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_transfers") {
        return Promise.resolve([
          {
            id: "transfer-clear-completed",
            conversationId: "direct:demo-peer",
            name: "completed-history.zip",
            status: "delivered",
            errorMessage: "",
            totalBytes: 2048,
            sentBytes: 2048,
            files: ["completed-history.zip"],
            resumable: false,
          },
        ]);
      }
      if (command === "clear_completed_transfers") return Promise.resolve(1);
      return defaultTauriInvoke(command);
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(await screen.findByTitle("文件传输"));
    expect(
      await screen.findByText("completed-history.zip"),
    ).toBeInTheDocument();
    await fireEvent.click(
      await screen.findByRole("button", { name: "清理已完成" }),
    );
    const cancelDialog = await screen.findByRole("dialog", {
      name: "确认清理传输记录",
    });
    expect(
      within(cancelDialog).getByText(
        /删除所有已完成、失败或取消的传输任务记录/,
      ),
    ).toBeInTheDocument();
    await fireEvent.click(
      within(cancelDialog).getByRole("button", { name: "取消" }),
    );
    expect(tauriInvoke).not.toHaveBeenCalledWith("clear_completed_transfers");
    expect(screen.getByText("completed-history.zip")).toBeInTheDocument();

    await fireEvent.click(
      await screen.findByRole("button", { name: "清理已完成" }),
    );
    const confirmDialog = await screen.findByRole("dialog", {
      name: "确认清理传输记录",
    });
    await fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "确认清理" }),
    );

    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith("clear_completed_transfers"),
    );
    expect(
      await screen.findByText(
        "已清理 1 条已完成/失败传输记录，聊天文件转发索引已保留",
      ),
    ).toBeInTheDocument();
  });

  it("confirms before clearing staged clipboard files", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "get_storage_overview") {
        return Promise.resolve({
          data_dir: "%APPDATA%\\IIM",
          database_path: "%APPDATA%\\IIM\\iim.sqlite",
          database_key_path: "%APPDATA%\\IIM\\db.key.dpapi",
          database_key_protection: "Windows DPAPI",
          received_files_dir: "%APPDATA%\\IIM\\received_files",
          staged_files_dir: "%APPDATA%\\IIM\\staged",
          database_bytes: 0,
          received_bytes: 0,
          staged_bytes: 8192,
          transfer_task_count: 0,
        });
      }
      if (command === "clear_staged_files") return Promise.resolve(undefined);
      return defaultTauriInvoke(command);
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(await screen.findByTitle("设置"));
    const workspace = await screen.findByRole("region", { name: "功能工作区" });
    await fireEvent.click(
      within(workspace).getByRole("button", { name: "存储" }),
    );
    await fireEvent.click(
      within(workspace).getByRole("button", { name: "清理剪贴板暂存" }),
    );
    const cancelDialog = await screen.findByRole("dialog", {
      name: "确认清理剪贴板暂存",
    });
    expect(
      within(cancelDialog).getByText(/会删除剪贴板、拖拽或截图产生的暂存文件/),
    ).toBeInTheDocument();
    await fireEvent.click(
      within(cancelDialog).getByRole("button", { name: "取消" }),
    );
    expect(tauriInvoke).not.toHaveBeenCalledWith("clear_staged_files");

    await fireEvent.click(
      within(workspace).getByRole("button", { name: "清理剪贴板暂存" }),
    );
    const confirmDialog = await screen.findByRole("dialog", {
      name: "确认清理剪贴板暂存",
    });
    await fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "确认清理" }),
    );

    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith("clear_staged_files"),
    );
    expect(await screen.findByText("剪贴板暂存已清理")).toBeInTheDocument();
  });

  it("shows editable group profile and member controls in the inspector", async () => {
    render(App);

    await fireEvent.click(
      await screen.findByRole("button", { name: /内网群聊/ }),
    );

    expect(screen.queryByLabelText("群成员与会话面板")).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "查看群资料" }));
    const inspector = await screen.findByLabelText("群成员与会话面板");
    expect(within(inspector).getByRole("tab", { name: "群资料" })).toBeInTheDocument();
    expect(within(inspector).getByRole("tab", { name: "成员" })).toBeInTheDocument();
    expect(within(inspector).getByText("群聊名称")).toBeInTheDocument();
    expect(within(inspector).getByText("群公告")).toBeInTheDocument();
    expect(within(inspector).getByRole("button", { name: "编辑群公告" })).toBeInTheDocument();
    expect(within(inspector).queryByText("当前成员")).not.toBeInTheDocument();

    await fireEvent.click(within(inspector).getByRole("tab", { name: "成员" }));
    expect(within(inspector).getByText("当前成员")).toBeInTheDocument();
    expect(within(inspector).getByRole("button", { name: "添加成员" })).toBeInTheDocument();
    expect(within(inspector).queryByText("群聊名称")).not.toBeInTheDocument();

    const chatHeader = screen.getByRole("group", { name: "会话标题栏" });
    await fireEvent.click(within(chatHeader).getByRole("button", { name: "收起详情" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("群成员与会话面板")).not.toBeInTheDocument(),
    );
  });

  it("saves group announcement with the editable group profile", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation(
      (command: string, args?: Record<string, any>) => {
        if (command === "list_conversations") {
          return Promise.resolve([
            {
              id: "group:lan",
              title: "内网群聊",
              group_announcement: "旧群公告",
              group_announcement_pinned: true,
              last_message_at: Date.now(),
              last_message_preview: "",
              unread_count: 0,
              pinned: false,
              muted: false,
              archived: false,
              draft_preview: "",
            },
          ]);
        }
        if (command === "list_group_members") {
          return Promise.resolve(["local-demo", "demo-peer"]);
        }
        if (command === "update_group") {
          return Promise.resolve({
            id: args?.request?.conversation_id,
            title: args?.request?.name,
            group_announcement: args?.request?.announcement,
            group_announcement_pinned: args?.request?.announcement_pinned,
            last_message_at: Date.now(),
            last_message_preview: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            archived: false,
            draft_preview: "",
          });
        }
        return defaultTauriInvoke(command);
      },
    );
    render(App);

    await fireEvent.click(
      await screen.findByRole("button", { name: /内网群聊/ }),
    );
    expect(
      within(await screen.findByRole("region", { name: "群公告" })).getByText(
        "旧群公告",
      ),
    ).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "查看群资料" }));
    const inspector = await screen.findByLabelText("群成员与会话面板");
    await fireEvent.click(within(inspector).getByRole("button", { name: "编辑群公告" }));
    const announcementDialog = await screen.findByRole("form", { name: "编辑群公告" });
    await fireEvent.input(within(announcementDialog).getByLabelText("群公告内容"), {
      target: { value: "今天 15:00 发布窗口，所有人提前同步回滚方案。" },
    });
    expect(within(announcementDialog).getByRole("switch", { name: "置顶群公告" })).toBeChecked();
    await fireEvent.click(within(announcementDialog).getByRole("button", { name: "发布公告" }));

    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith("update_group", {
        request: expect.objectContaining({
          announcement: "今天 15:00 发布窗口，所有人提前同步回滚方案。",
          announcement_pinned: true,
        }),
      }),
    );
    expect(
      within(await screen.findByRole("region", { name: "群公告" })).getByText(
        "今天 15:00 发布窗口，所有人提前同步回滚方案。",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("群公告已发布")).toBeInTheDocument();
  });

  it("clears the active conversation history from the inspector danger zone", async () => {
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(within(await screen.findByRole("group", { name: "会话标题栏" })).getByRole("button", { name: "查看直聊资料" }));
    await fireEvent.click(
      await screen.findByRole("button", { name: /清空聊天记录/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "确认清空聊天记录",
    });
    await fireEvent.click(
      within(dialog).getByRole("button", { name: "确认清空" }),
    );
    expect(await screen.findByText("已清空 2 条聊天记录")).toBeInTheDocument();
  });

  it("starts the screenshot workflow from the chat composer toolbar", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await waitForInitialConversationLoad();
    await screen.findByRole("toolbar", { name: "消息工具栏" });
    await waitFor(
      () => {
        const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
        expect(
          within(toolbar).getByRole("button", { name: /截图/ }),
        ).toBeEnabled();
      },
      { timeout: 5000 },
    );
    const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
    await fireEvent.click(
      within(toolbar).getByRole("button", { name: /截图/ }),
    );
    expect(
      await screen.findByText("已启动系统截图，完成后可直接粘贴到聊天框发送。"),
    ).toBeInTheDocument();
  }, 15000);

  it("keeps conversation details in the title bar", async () => {
    render(App);

    const moreTools = await openComposerMoreTools();
    expect(within(moreTools).queryByRole("button", { name: /详情/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "会话标题栏" })).getByRole("button", { name: "查看直聊资料" })).toBeInTheDocument();
  });

  it("keeps attachment utilities above the message input instead of inside the input row", async () => {
    render(App);

    await waitForInitialConversationLoad();
    const toolbar = await screen.findByRole("toolbar", { name: "消息工具栏" });
    expect(
      within(toolbar).getByRole("button", { name: "文件" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).queryByRole("button", { name: "文件夹" }),
    ).not.toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "截图" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "表情" }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).queryByRole("button", { name: "抖一抖" }),
    ).not.toBeInTheDocument();
    expect(
      within(toolbar).queryByRole("button", { name: "传输" }),
    ).not.toBeInTheDocument();
    expect(within(await openComposerMoreTools()).getByRole("button", { name: "文件夹" })).toBeInTheDocument();
    expect(
      within(toolbar).queryByText("拖拽或粘贴文件/图片到输入区"),
    ).not.toBeInTheDocument();

    const inputRow = document.querySelector(".composer-input-row");
    expect(inputRow).not.toBeNull();
    expect(
      within(inputRow as HTMLElement).queryByTitle("附加文件"),
    ).not.toBeInTheDocument();
  });

  it("sends a nudge from the composer toolbar through Tauri", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await waitForInitialConversationLoad();
    await fireEvent.click(
      within(await openComposerMoreTools()).getByRole("button", { name: "抖一抖" }),
    );

    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith("send_nudge", {
        conversationId: "direct:demo-peer",
      }),
    );
    expect(await screen.findByText("已发送抖一抖提醒")).toBeInTheDocument();
  });

  it("shows a visible chat notice when a nudge arrives in the active conversation", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await waitForInitialConversationLoad();
    await waitFor(() =>
      expect(tauriEventListeners.has("nudge:received")).toBe(true),
    );
    emitTauriEvent("nudge:received", {
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      display_name: "研发一号",
      nudged_at: Date.now(),
    });

    expect(
      await screen.findByText("研发一号 给你发来抖一抖提醒"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("聊天工作区")).toHaveClass("nudge-shake"),
    );
  });

  it("queues desktop drag-dropped paths and sends them through the file transfer command", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const droppedPaths = ["C:/work/report.pdf", "C:/work/design"];
    render(App);

    await waitForInitialConversationLoad();
    await screen.findByRole("toolbar", { name: "消息工具栏" });
    await waitFor(
      () => {
        const toolbar = screen.getByRole("toolbar", { name: "消息工具栏" });
        expect(
          within(toolbar).getByRole("button", { name: "文件" }),
        ).toBeEnabled();
      },
      { timeout: 5000 },
    );
    tauriInvoke.mockImplementation(
      (
        command: string,
        args?: { paths?: string[]; conversationId?: string },
      ) => {
        if (command === "send_files") {
          return Promise.resolve({
            id: "drag-file-message",
            conversation_id: args?.conversationId ?? "direct:demo-peer",
            sender_id: "local-demo",
            body: "发送拖拽文件",
            attachments: [
              {
                type: "transfer",
                manifest: {
                  transfer_id: "drag-transfer",
                  files: (args?.paths ?? []).map((path) => ({
                    path,
                    size: 0,
                    sha256: "0".repeat(64),
                  })),
                  total_bytes: 0,
                  chunk_size: 262144,
                  sha256: "0".repeat(64),
                },
              },
            ],
            created_at: Date.now(),
            status: "queued",
            recalled: false,
            quote: null,
            favorited: false,
            reactions: [],
          });
        }
        return (
          defaultTauriInvoke as (
            command: string,
            args?: unknown,
          ) => Promise<unknown>
        )(command, args);
      },
    );
    await waitForTauriDragDropListener();
    emitTauriDragDrop({
      type: "drop",
      paths: droppedPaths,
      position: { x: 320, y: 560 },
    });

    const tray = await screen.findByLabelText("待发送文件");
    expect(within(tray).getByText("report.pdf")).toBeInTheDocument();
    expect(within(tray).getByText("design")).toBeInTheDocument();

    await fireEvent.input(screen.getByPlaceholderText("输入消息"), {
      target: { value: "请查收附件" },
    });
    expect(within(tray).queryByRole("button", { name: "发送" })).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("send_files", {
        conversationId: "direct:demo-peer",
        paths: droppedPaths,
        text: "请查收附件",
        quote: null,
      });
    });
  });

  it("appends an emoji from the composer toolbar", async () => {
    render(App);

    await waitForInitialConversationLoad();
    const input = await screen.findByPlaceholderText("输入消息");
    const toolbar = await screen.findByRole("toolbar", { name: "消息工具栏" });
    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "表情" }),
    );
    expect(
      await screen.findByRole("menu", { name: "表情和动图" }),
    ).toBeInTheDocument();

    await fireEvent.click(await screen.findByTitle("插入 👍"));
    expect(input).toHaveValue("👍");
  });

  it("shows a simulated peer reply after sending in browser preview mode", async () => {
    render(App);

    const input = await screen.findByPlaceholderText("输入消息");
    await fireEvent.input(input, { target: { value: "这个问题可以吗？" } });
    await fireEvent.click(await screen.findByTitle("发送"));

    expect(await screen.findByText("这个问题可以吗？")).toBeInTheDocument();
    expect(
      (await screen.findAllByText("收到，我这边模拟回复：这个问题可以继续细化。", {}, { timeout: 2000 })).length,
    ).toBeGreaterThan(0);
  });

  it("keeps the draft and shows a clear notice when text sending fails", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "send_text")
        return Promise.reject(new Error("network unreachable"));
      return defaultTauriInvoke(command);
    });
    render(App);

    await waitForInitialConversationLoad();
    const input = await screen.findByPlaceholderText("输入消息");
    await fireEvent.input(input, { target: { value: "这条消息先别丢" } });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(
      await screen.findByText("消息发送失败：network unreachable"),
    ).toBeInTheDocument();
    expect(input).toHaveValue("这条消息先别丢");
  });

  it("does not report text sending as failed when clearing the saved draft fails after send", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "send_text")
        return Promise.resolve({
          id: "sent-despite-draft-error",
          conversation_id: "direct:demo-peer",
          sender_id: "local-demo",
          body: "已发送但草稿清理失败",
          attachments: [],
          created_at: Date.now(),
          status: "queued",
          recalled: false,
          quote: null,
          favorited: false,
          reactions: [],
        });
      if (command === "save_conversation_draft")
        return Promise.reject(new Error("draft database busy"));
      return defaultTauriInvoke(command);
    });
    render(App);

    const input = await screen.findByPlaceholderText("输入消息");
    await fireEvent.input(input, { target: { value: "已发送但草稿清理失败" } });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("已发送但草稿清理失败")).toBeInTheDocument();
    expect(
      await screen.findByText("消息已发送，草稿清理失败：draft database busy"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/消息发送失败/)).not.toBeInTheDocument();
  });

  it("switches conversations even when saving the previous draft fails", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const peerB = {
      peer_id: "peer-b",
      display_name: "设计二号",
      hostname: "design-pc",
      avatar_hash: null,
      status: "online",
      endpoints: ["192.168.1.43:24251"],
      fingerprint: "b".repeat(64),
      public_key: Array(32).fill(12),
    };
    tauriInvoke.mockImplementation(
      (command: string, args?: Record<string, string>) => {
        if (command === "list_peers")
          return Promise.resolve([
            {
              peer_id: "demo-peer",
              display_name: "研发一号",
              hostname: "rd-pc",
              avatar_hash: null,
              status: "online",
              endpoints: ["192.168.1.42:24251"],
              fingerprint: "f".repeat(64),
              public_key: Array(32).fill(15),
            },
            peerB,
          ]);
        if (command === "list_conversations")
          return Promise.resolve([
            {
              id: "direct:demo-peer",
              title: "研发一号",
              last_message_at: Date.now(),
              last_message_preview: "",
              unread_count: 0,
              pinned: false,
              muted: false,
              archived: false,
              draft_preview: "",
            },
            {
              id: "direct:peer-b",
              title: "设计二号",
              last_message_at: Date.now() - 1000,
              last_message_preview: "",
              unread_count: 0,
              pinned: false,
              muted: false,
              archived: false,
              draft_preview: "",
            },
          ]);
        if (command === "save_conversation_draft")
          return Promise.reject(new Error("draft db locked"));
        if (
          command === "list_messages" &&
          args?.conversationId === "direct:peer-b"
        )
          return Promise.resolve([
            {
              id: "peer-b-message",
              conversation_id: "direct:peer-b",
              sender_id: "peer-b",
              body: "设计会话已打开",
              attachments: [],
              created_at: Date.now(),
              status: "received",
              recalled: false,
              quote: null,
              favorited: false,
              reactions: [],
            },
          ]);
        return defaultTauriInvoke(command);
      },
    );
    render(App);

    const input = await screen.findByPlaceholderText("输入消息");
    await fireEvent.input(input, { target: { value: "未保存草稿" } });
    await fireEvent.click(
      await screen.findByRole("button", { name: /设计二号/ }),
    );

    expect(await screen.findByText("设计会话已打开")).toBeInTheDocument();
    expect(
      await screen.findByText("草稿保存失败：draft db locked"),
    ).toBeInTheDocument();
  });

  it("keeps the conversation open when marking it read fails", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages")
        return Promise.resolve([
          {
            id: "read-failure-visible-message",
            conversation_id: "direct:demo-peer",
            sender_id: "demo-peer",
            body: "已读失败时仍显示消息",
            attachments: [],
            created_at: Date.now(),
            status: "received",
            recalled: false,
            quote: null,
            favorited: false,
            reactions: [],
          },
        ]);
      if (command === "mark_conversation_read")
        return Promise.reject(new Error("read table busy"));
      return defaultTauriInvoke(command);
    });
    render(App);

    expect(await screen.findByText("已读失败时仍显示消息")).toBeInTheDocument();
    expect(
      await screen.findByText("标记会话已读失败：read table busy"),
    ).toBeInTheDocument();
  });

  it("opens the notification group conversation when action extras are missing", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    notificationPermissionGranted.mockResolvedValue(true);
    const peerB = {
      peer_id: "peer-b",
      display_name: "旧通知联系人",
      hostname: "old-pc",
      avatar_hash: null,
      status: "online",
      endpoints: ["192.168.1.43:24251"],
      fingerprint: "b".repeat(64),
      public_key: Array(32).fill(12),
    };
    const peerC = {
      peer_id: "peer-c",
      display_name: "最新通知联系人",
      hostname: "new-pc",
      avatar_hash: null,
      status: "online",
      endpoints: ["192.168.1.44:24251"],
      fingerprint: "c".repeat(64),
      public_key: Array(32).fill(13),
    };
    tauriInvoke.mockImplementation((command: string, args?: Record<string, string>) => {
      if (command === "list_peers")
        return Promise.resolve([
          {
            peer_id: "demo-peer",
            display_name: "研发一号",
            hostname: "rd-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "f".repeat(64),
            public_key: Array(32).fill(15),
          },
          peerB,
          peerC,
        ]);
      if (command === "list_conversations")
        return Promise.resolve([
          {
            id: "direct:demo-peer",
            title: "研发一号",
            last_message_at: Date.now(),
            last_message_preview: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            archived: false,
            draft_preview: "",
          },
          {
            id: "direct:peer-b",
            title: "旧通知联系人",
            last_message_at: Date.now() - 1000,
            last_message_preview: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            archived: false,
            draft_preview: "",
          },
          {
            id: "direct:peer-c",
            title: "最新通知联系人",
            last_message_at: Date.now() - 2000,
            last_message_preview: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            archived: false,
            draft_preview: "",
          },
        ]);
      if (command === "list_messages" && args?.conversationId === "direct:peer-b")
        return Promise.resolve([
          {
            id: "old-notification-message",
            conversation_id: "direct:peer-b",
            sender_id: "peer-b",
            body: "旧通知会话已打开",
            attachments: [],
            created_at: Date.now(),
            status: "received",
            recalled: false,
            quote: null,
            favorited: false,
            reactions: [],
          },
        ]);
      if (command === "list_messages" && args?.conversationId === "direct:peer-c")
        return Promise.resolve([
          {
            id: "latest-notification-message",
            conversation_id: "direct:peer-c",
            sender_id: "peer-c",
            body: "最新通知会话不应被兜底打开",
            attachments: [],
            created_at: Date.now(),
            status: "received",
            recalled: false,
            quote: null,
            favorited: false,
            reactions: [],
          },
        ]);
      return defaultTauriInvoke(command);
    });

    render(App);
    await waitForInitialConversationLoad();
    await waitFor(() => expect(notificationActionHandlers.length).toBeGreaterThan(0));
    await fireEvent.click(screen.getByRole("button", { name: "设置" }));
    const settingsWorkspace = await screen.findByRole("region", { name: "功能工作区" });
    await fireEvent.click(within(settingsWorkspace).getByRole("button", { name: "偏好" }));
    const enableNotificationButton = await within(settingsWorkspace).findByRole("button", {
      name: "开启系统通知",
    });
    await fireEvent.click(enableNotificationButton);
    await waitFor(() => expect(notificationPermissionGranted).toHaveBeenCalled());

    emitTauriEvent("message:received", {
      id: "latest-background-message",
      conversation_id: "direct:peer-c",
      sender_id: "peer-c",
      body: "这条消息只用于制造最新通知兜底",
      attachments: [],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    });
    emitNotificationAction({
      title: "旧通知联系人",
      body: "点击旧通知",
      group: "direct:peer-b",
      extra: undefined,
    });

    expect(await screen.findByText("旧通知会话已打开")).toBeInTheDocument();
    expect(screen.queryByText("最新通知会话不应被兜底打开")).not.toBeInTheDocument();
  });

  it("uses attachment summaries for incoming desktop notification previews", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    notificationPermissionGranted.mockResolvedValue(true);
    const peerB = {
      peer_id: "peer-b",
      display_name: "文件发送方",
      hostname: "files-pc",
      avatar_hash: null,
      status: "online",
      endpoints: ["192.168.1.55:24251"],
      fingerprint: "b".repeat(64),
      public_key: Array(32).fill(12),
    };
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_peers")
        return Promise.resolve([
          {
            peer_id: "demo-peer",
            display_name: "研发一号",
            hostname: "rd-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "f".repeat(64),
            public_key: Array(32).fill(15),
          },
          peerB,
        ]);
      if (command === "list_conversations")
        return Promise.resolve([
          {
            id: "direct:demo-peer",
            title: "研发一号",
            last_message_at: Date.now(),
            last_message_preview: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            archived: false,
            draft_preview: "",
          },
          {
            id: "direct:peer-b",
            title: "文件发送方",
            last_message_at: Date.now() - 1000,
            last_message_preview: "",
            unread_count: 0,
            pinned: false,
            muted: false,
            archived: false,
            draft_preview: "",
          },
        ]);
      return defaultTauriInvoke(command);
    });

    render(App);
    await waitForInitialConversationLoad();
    await fireEvent.click(screen.getByRole("button", { name: "设置" }));
    const settingsWorkspace = await screen.findByRole("region", { name: "功能工作区" });
    await fireEvent.click(within(settingsWorkspace).getByRole("button", { name: "偏好" }));
    const enableNotificationButton = await within(settingsWorkspace).findByRole("button", {
      name: "开启系统通知",
    });
    await fireEvent.click(enableNotificationButton);
    await waitFor(() => expect(notificationPermissionGranted).toHaveBeenCalled());
    sendNotificationMock.mockClear();

    emitTauriEvent("message:received", {
      id: "incoming-attachment-notification",
      conversation_id: "direct:peer-b",
      sender_id: "peer-b",
      body: "",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "incoming-attachment-transfer",
            files: [
              {
                path: "C:/work/report.pdf",
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
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    });

    await waitFor(() =>
      expect(sendNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "文件发送方",
          body: "[文件] report.pdf",
          group: "direct:peer-b",
        }),
      ),
    );
  });

  it("opens the current conversation search panel from the chat header", async () => {
    render(App);

    await waitForInitialConversationLoad();
    expect(
      (await screen.findAllByText(/欢迎使用 iim/)).length,
    ).toBeGreaterThan(0);
    await fireEvent.click(
      within(await screen.findByRole("group", { name: "会话标题栏" })).getByRole("button", { name: "搜索聊天记录" }),
    );
    expect(
      await screen.findByRole("region", { name: "会话内搜索" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByPlaceholderText("查询聊天记录"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("按日期跳转聊天记录"),
    ).not.toBeInTheDocument();
  });

  it("opens an app-owned composer edit menu for the message input", async () => {
    render(App);

    const input = await screen.findByPlaceholderText("输入消息");
    await fireEvent.contextMenu(input);
    expect(
      await screen.findByRole("menu", { name: "输入框编辑菜单" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "复制" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "粘贴" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "全选" }),
    ).toBeInTheDocument();
  });

  it("opens an app-owned message context menu instead of relying on the native menu", async () => {
    render(App);

    await fireEvent.contextMenu(await findDemoMessageBubble());
    const menu = await screen.findByRole("menu", { name: "消息快捷菜单" });
    expect(menu).toHaveClass("message-context-menu");
    expect(menu.querySelectorAll(".context-menu-section").length).toBe(1);
    expect(await screen.findByTitle("回应 👍")).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "复制消息" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "引用回复" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "转发消息" }),
    ).toBeInTheDocument();
    await openMessageMenuMore();
    expect(
      await screen.findByRole("menuitem", { name: "取消收藏" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "重新发送" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "撤回消息" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "会话详情" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "删除消息" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".app-context-menu")).not.toBeInTheDocument();
  });

  it("repositions tall app-owned message context menus inside the viewport", async () => {
    const originalInnerHeight = window.innerHeight;
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 420,
    });
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this instanceof HTMLElement && this.classList.contains("context-menu")) {
        return {
          x: 100,
          y: 280,
          left: 100,
          top: 280,
          width: 180,
          height: 360,
          right: 280,
          bottom: 640,
          toJSON: () => ({}),
        };
      }
      return originalGetBoundingClientRect.call(this);
    };

    try {
      render(App);

      await fireEvent.contextMenu(await findDemoMessageBubble(), { clientX: 100, clientY: 418 });
      const menu = await screen.findByRole("menu", { name: "消息快捷菜单" });

      await waitFor(() => expect(menu).toHaveStyle({ top: "52px" }));
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it("uses an attachment summary when quoting an attachment-only message", async () => {
    const attachmentOnlyMessage: ChatMessage = {
      id: "attachment-quote-summary",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "quote-summary-transfer",
            files: [
              {
                path: "report.pdf",
                relative_path: null,
                size: 4096,
                sha256: "a".repeat(64),
              },
              {
                path: "readme.md",
                relative_path: "docs/readme.md",
                size: 512,
                sha256: "c".repeat(64),
              },
            ],
            total_bytes: 4608,
            chunk_size: 262144,
            sha256: "b".repeat(64),
          },
        },
      ],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_peers")
        return Promise.resolve([
          {
            peer_id: "demo-peer",
            display_name: "Alice",
            hostname: "alice-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "f".repeat(64),
            public_key: Array(32).fill(15),
          },
        ]);
      if (command === "list_messages")
        return Promise.resolve([attachmentOnlyMessage]);
      return defaultTauriInvoke(command);
    });
    render(App);

    const attachment = await screen.findByRole("article", {
      name: "附件 2 个文件",
    });
    await fireEvent.contextMenu(attachment);
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "引用回复" }),
    );

    expect(await screen.findByText("引用回复 · Alice")).toBeInTheDocument();
    expect(screen.getByText("[文件] report.pdf、docs/readme.md")).toBeInTheDocument();
  });

  it("does not open the shell context menu over the image preview dialog", async () => {
    const imageMessage: ChatMessage = {
      id: "image-preview-menu",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "screenshot",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "transfer-image-preview-menu",
            files: [
              {
                path: "C:\\Users\\admin\\Pictures\\screenshot.png",
                relative_path: null,
                size: 8192,
                sha256: "c".repeat(64),
              },
            ],
            total_bytes: 8192,
            chunk_size: 262144,
            sha256: "d".repeat(64),
          },
        },
      ],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages") return Promise.resolve([imageMessage]);
      return defaultTauriInvoke(command);
    });
    render(App);

    const attachment = await screen.findByRole("article", {
      name: /screenshot\.png/,
    });
    await fireEvent.click(
      within(attachment).getByRole("button", {
        name: /预览图片 screenshot\.png/,
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "图片预览" });

    await fireEvent.contextMenu(dialog);

    expect(document.querySelector(".app-context-menu")).not.toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it("favorites multiple selected messages from the chat selection toolbar", async () => {
    const firstMessage: ChatMessage = {
      id: "bulk-favorite-1",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "bulk favorite first",
      attachments: [],
      created_at: Date.now() - 1000,
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    const secondMessage: ChatMessage = {
      ...firstMessage,
      id: "bulk-favorite-2",
      body: "bulk favorite second",
      created_at: Date.now(),
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation(
      (command: string, args?: Record<string, string | boolean>) => {
        if (command === "list_messages")
          return Promise.resolve([firstMessage, secondMessage]);
        if (command === "set_message_favorite") {
          const source =
            args?.messageId === firstMessage.id ? firstMessage : secondMessage;
          return Promise.resolve({
            ...source,
            favorited: Boolean(args?.favorite),
          });
        }
        return defaultTauriInvoke(command);
      },
    );
    render(App);

    await screen.findByText("bulk favorite first");
    await fireEvent.contextMenu(await screen.findByText("bulk favorite first"));
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "多选消息" }),
    );
    await fireEvent.click(screen.getByLabelText("选择消息 bulk-favorite-2"));
    await fireEvent.click(await screen.findByRole("button", { name: "收藏" }));

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("set_message_favorite", {
        messageId: "bulk-favorite-1",
        favorite: true,
      });
      expect(tauriInvoke).toHaveBeenCalledWith("set_message_favorite", {
        messageId: "bulk-favorite-2",
        favorite: true,
      });
    });
    expect(await screen.findByText("已收藏 2 条消息")).toBeInTheDocument();
  });

  it("pins and unpins a message from the app-owned message context menu", async () => {
    const message: ChatMessage = {
      id: "pin-context-message",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "pin this rollout window",
      attachments: [],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages") return Promise.resolve([message]);
      if (command === "list_pinned_messages") return Promise.resolve([]);
      if (command === "set_message_pin") return Promise.resolve(message);
      return defaultTauriInvoke(command);
    });
    render(App);

    await screen.findByText("pin this rollout window");
    await fireEvent.contextMenu(await screen.findByText("pin this rollout window"));
    await openMessageMenuMore();
    await fireEvent.click(await screen.findByRole("menuitem", { name: "置顶消息" }));

    expect(tauriInvoke).toHaveBeenCalledWith("set_message_pin", {
      messageId: "pin-context-message",
      pinned: true,
    });
    const pinnedPanel = await screen.findByLabelText("置顶消息");
    expect(within(pinnedPanel).getByText("pin this rollout window")).toBeInTheDocument();
    expect(await screen.findByText("消息已置顶到会话顶部")).toBeInTheDocument();

    await fireEvent.click(
      within(pinnedPanel).getByRole("button", {
        name: "取消置顶消息 pin-context-message",
      }),
    );

    expect(tauriInvoke).toHaveBeenCalledWith("set_message_pin", {
      messageId: "pin-context-message",
      pinned: false,
    });
    expect(await screen.findByText("已取消置顶消息")).toBeInTheDocument();
  });

  it("adds and completes a message todo from the app-owned message context menu", async () => {
    const message: ChatMessage = {
      id: "todo-context-message",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "follow up on this message",
      attachments: [],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages") return Promise.resolve([message]);
      if (command === "list_pinned_messages") return Promise.resolve([]);
      if (command === "list_todo_messages") return Promise.resolve([]);
      if (command === "set_message_todo") return Promise.resolve(message);
      return defaultTauriInvoke(command);
    });
    render(App);

    await screen.findByText("follow up on this message");
    await fireEvent.contextMenu(await screen.findByText("follow up on this message"));
    await openMessageMenuMore();
    await fireEvent.click(await screen.findByRole("menuitem", { name: "加入待办" }));

    expect(tauriInvoke).toHaveBeenCalledWith("set_message_todo", {
      messageId: "todo-context-message",
      todo: true,
    });
    expect(await screen.findByText("已加入消息待办")).toBeInTheDocument();
    const todoMessageRow = (await findMessageBubble("todo-context-message")).closest(".message-row");
    expect(todoMessageRow).not.toBeNull();
    expect(within(todoMessageRow as HTMLElement).getByText("待办")).toBeInTheDocument();

    await fireEvent.contextMenu(await screen.findByText("follow up on this message"));
    await openMessageMenuMore();
    await fireEvent.click(await screen.findByRole("menuitem", { name: "完成待办" }));

    expect(tauriInvoke).toHaveBeenCalledWith("set_message_todo", {
      messageId: "todo-context-message",
      todo: false,
    });
    expect(await screen.findByText("已完成消息待办")).toBeInTheDocument();
  });

  it("selects and clears all loaded messages from the chat selection toolbar", async () => {
    const firstMessage: ChatMessage = {
      id: "bulk-select-all-1",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "bulk select all first",
      attachments: [],
      created_at: Date.now() - 2000,
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    const secondMessage: ChatMessage = {
      ...firstMessage,
      id: "bulk-select-all-2",
      body: "bulk select all second",
      created_at: Date.now() - 1000,
    };
    const thirdMessage: ChatMessage = {
      ...firstMessage,
      id: "bulk-select-all-3",
      body: "bulk select all third",
      created_at: Date.now(),
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages")
        return Promise.resolve([firstMessage, secondMessage, thirdMessage]);
      return defaultTauriInvoke(command);
    });
    render(App);

    await screen.findByText("bulk select all first");
    await fireEvent.contextMenu(await screen.findByText("bulk select all first"));
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "多选消息" }),
    );
    const toolbar = await screen.findByRole("region", {
      name: "消息多选工具栏",
    });
    expect(within(toolbar).getByText("已选择 1 条消息")).toBeInTheDocument();

    await fireEvent.click(within(toolbar).getByRole("button", { name: "全选" }));

    await waitFor(() => {
      expect(within(toolbar).getByText("已选择 3 条消息")).toBeInTheDocument();
      expect(screen.getByLabelText("选择消息 bulk-select-all-1")).toBeChecked();
      expect(screen.getByLabelText("选择消息 bulk-select-all-2")).toBeChecked();
      expect(screen.getByLabelText("选择消息 bulk-select-all-3")).toBeChecked();
    });

    await fireEvent.click(
      within(toolbar).getByRole("button", { name: "取消全选" }),
    );

    await waitFor(() => {
      expect(within(toolbar).getByText("已选择 0 条消息")).toBeInTheDocument();
      expect(screen.getByLabelText("选择消息 bulk-select-all-1")).not.toBeChecked();
      expect(screen.getByLabelText("选择消息 bulk-select-all-2")).not.toBeChecked();
      expect(screen.getByLabelText("选择消息 bulk-select-all-3")).not.toBeChecked();
    });
  });

  it("copies multiple selected messages with attachment summaries in chat order", async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const firstMessage: ChatMessage = {
      id: "bulk-copy-1",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "bulk copy first",
      attachments: [],
      created_at: Date.now() - 2000,
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    const secondMessage: ChatMessage = {
      ...firstMessage,
      id: "bulk-copy-2",
      body: "",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "bulk-copy-transfer",
            files: [
              {
                path: "C:/work/report.pdf",
                relative_path: "docs/report.pdf",
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
      created_at: Date.now() - 1000,
    };
    const recalledMessage: ChatMessage = {
      ...firstMessage,
      id: "bulk-copy-recalled",
      body: "should not be copied",
      recalled: true,
      created_at: Date.now(),
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages")
        return Promise.resolve([firstMessage, secondMessage, recalledMessage]);
      return defaultTauriInvoke(command);
    });
    render(App);

    await screen.findByText("bulk copy first");
    await fireEvent.contextMenu(await screen.findByText("bulk copy first"));
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "多选消息" }),
    );
    await fireEvent.click(screen.getByLabelText("选择消息 bulk-copy-2"));
    await fireEvent.click(screen.getByLabelText("选择消息 bulk-copy-recalled"));

    const bulkToolbar = await screen.findByRole("region", {
      name: "消息多选工具栏",
    });
    await fireEvent.click(
      within(bulkToolbar).getByRole("button", { name: "复制" }),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain("bulk copy first");
    expect(copied).toContain("docs/report.pdf");
    expect(copied.indexOf("bulk copy first")).toBeLessThan(
      copied.indexOf("docs/report.pdf"),
    );
    expect(copied).not.toContain("should not be copied");
    expect(await screen.findByText("已复制 2 条消息")).toBeInTheDocument();
  });

  it("forwards multiple selected messages in order through the batch forward dialog", async () => {
    const firstMessage: ChatMessage = {
      id: "bulk-forward-1",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "bulk forward first",
      attachments: [],
      created_at: Date.now() - 1000,
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    const secondMessage: ChatMessage = {
      ...firstMessage,
      id: "bulk-forward-2",
      body: "bulk forward second",
      created_at: Date.now(),
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation(
      (command: string, args?: Record<string, string>) => {
        if (command === "list_messages")
          return Promise.resolve([firstMessage, secondMessage]);
        if (command === "forward_message") {
          const source =
            args?.messageId === firstMessage.id ? firstMessage : secondMessage;
          return Promise.resolve({
            ...source,
            id: `forwarded-${source.id}`,
            conversation_id: args?.targetConversationId,
            sender_id: "local-demo",
            status: "queued",
            favorited: false,
            reactions: [],
          });
        }
        return defaultTauriInvoke(command);
      },
    );
    render(App);

    await screen.findByText("bulk forward first");
    await fireEvent.contextMenu(await screen.findByText("bulk forward first"));
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "多选消息" }),
    );
    await fireEvent.click(screen.getByLabelText("选择消息 bulk-forward-2"));
    await fireEvent.click(await screen.findByRole("button", { name: "转发" }));

    const dialog = await screen.findByRole("dialog", { name: "转发消息" });
    expect(within(dialog).getByText("转发 2 条消息")).toBeInTheDocument();
    expect(within(dialog).getByText("bulk forward first")).toBeInTheDocument();
    expect(within(dialog).getByText("bulk forward second")).toBeInTheDocument();
    const target = within(dialog).getAllByRole("button", { name: /选择转发目标/ })[0];
    await fireEvent.click(target);

    expect(target).toHaveAttribute("aria-pressed", "true");
    expect(tauriInvoke).not.toHaveBeenCalledWith(
      "forward_message",
      expect.anything(),
    );
    await fireEvent.click(within(dialog).getByRole("button", { name: "确认转发" }));

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("forward_message", {
        messageId: "bulk-forward-1",
        targetConversationId: "direct:demo-peer",
      });
      expect(tauriInvoke).toHaveBeenCalledWith("forward_message", {
        messageId: "bulk-forward-2",
        targetConversationId: "direct:demo-peer",
      });
    });
    expect(await screen.findByText(/已转发 2 条消息到/)).toBeInTheDocument();
  });

  it("confirms before deleting multiple selected messages", async () => {
    const firstMessage: ChatMessage = {
      id: "bulk-delete-1",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "bulk delete first",
      attachments: [],
      created_at: Date.now() - 1000,
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    const secondMessage: ChatMessage = {
      ...firstMessage,
      id: "bulk-delete-2",
      body: "bulk delete second",
      created_at: Date.now(),
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages")
        return Promise.resolve([firstMessage, secondMessage]);
      if (command === "delete_message") return Promise.resolve(undefined);
      return defaultTauriInvoke(command);
    });
    render(App);

    await screen.findByText("bulk delete first");
    await fireEvent.contextMenu(await screen.findByText("bulk delete first"));
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "多选消息" }),
    );
    await fireEvent.click(screen.getByLabelText("选择消息 bulk-delete-2"));
    const bulkToolbar = await screen.findByRole("region", {
      name: "消息多选工具栏",
    });
    await fireEvent.click(
      within(bulkToolbar).getByRole("button", { name: "删除" }),
    );

    const cancelDialog = await screen.findByRole("dialog", {
      name: "确认删除多条消息",
    });
    expect(
      within(cancelDialog).getByText(/选中的 2 条消息/),
    ).toBeInTheDocument();
    await fireEvent.click(
      within(cancelDialog).getByRole("button", { name: "取消" }),
    );
    expect(tauriInvoke).not.toHaveBeenCalledWith(
      "delete_message",
      expect.anything(),
    );

    await fireEvent.click(
      within(bulkToolbar).getByRole("button", { name: "删除" }),
    );
    const confirmDialog = await screen.findByRole("dialog", {
      name: "确认删除多条消息",
    });
    await fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "确认删除" }),
    );

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("delete_message", {
        messageId: "bulk-delete-1",
      });
      expect(tauriInvoke).toHaveBeenCalledWith("delete_message", {
        messageId: "bulk-delete-2",
      });
    });
    expect(screen.queryByText("bulk delete first")).not.toBeInTheDocument();
    expect(screen.queryByText("bulk delete second")).not.toBeInTheDocument();
    expect(await screen.findByText("已删除 2 条消息")).toBeInTheDocument();
  });

  it("confirms before deleting a message from the message context menu", async () => {
    const message: ChatMessage = {
      id: "delete-message-context",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "delete me from context menu",
      attachments: [],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages") return Promise.resolve([message]);
      if (command === "delete_message") return Promise.resolve(undefined);
      return defaultTauriInvoke(command);
    });
    render(App);

    expect(
      await screen.findByText("delete me from context menu"),
    ).toBeInTheDocument();
    await fireEvent.contextMenu(
      await screen.findByText("delete me from context menu"),
    );
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "删除消息" }),
    );
    const cancelDialog = await screen.findByRole("dialog", {
      name: "确认删除消息",
    });
    expect(
      within(cancelDialog).getByText(/只会从本机聊天记录中删除/),
    ).toBeInTheDocument();
    await fireEvent.click(
      within(cancelDialog).getByRole("button", { name: "取消" }),
    );
    expect(tauriInvoke).not.toHaveBeenCalledWith(
      "delete_message",
      expect.anything(),
    );
    expect(screen.getByText("delete me from context menu")).toBeInTheDocument();

    await fireEvent.contextMenu(
      await screen.findByText("delete me from context menu"),
    );
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "删除消息" }),
    );
    const confirmDialog = await screen.findByRole("dialog", {
      name: "确认删除消息",
    });
    await fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "确认删除" }),
    );

    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith("delete_message", {
        messageId: "delete-message-context",
      }),
    );
    expect(
      screen.queryByText("delete me from context menu"),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("消息已删除")).toBeInTheDocument();
  });

  it("opens an app-owned conversation context menu from the conversation list", async () => {
    render(App);

    const conversationButton = await findSidebarConversationContextTarget();
    await fireEvent.contextMenu(conversationButton);
    expect(
      await screen.findByRole("menuitem", { name: "会话详情" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "取消置顶" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "免打扰" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "标为未读" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "删除会话" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "打开会话" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "归档" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "导出聊天记录" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "会话快捷菜单" }).querySelectorAll('[role="menuitem"]')).toHaveLength(5);
    expect(document.querySelector(".app-context-menu")).not.toBeInTheDocument();
  });

  it("keeps conversation context menus inside the viewport at the top-left edge", async () => {
    render(App);

    const conversationButton = await findSidebarConversationContextTarget();
    await fireEvent.contextMenu(conversationButton, { clientX: -24, clientY: -18 });
    const menu = await screen.findByRole("menu", { name: "会话快捷菜单" });

    expect(menu).toHaveStyle({ left: "8px", top: "8px" });
  });

  it("focuses the app-owned conversation context menu when it opens", async () => {
    render(App);

    const conversationButton = await findSidebarConversationContextTarget();
    await fireEvent.contextMenu(conversationButton);
    const menu = await screen.findByRole("menu");

    await waitFor(() => expect(menu).toHaveFocus());
  });

  it("moves focus through app-owned conversation context menu items with arrow keys", async () => {
    render(App);

    const conversationButton = await findSidebarConversationContextTarget();
    await fireEvent.contextMenu(conversationButton);
    const menu = await screen.findByRole("menu", { name: "会话快捷菜单" });
    const items = within(menu).getAllByRole("menuitem");

    await fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();

    await fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();

    await fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(items[0]).toHaveFocus();
  });

  it("keeps low-frequency diagnostics out of the conversation context menu", async () => {
    render(App);

    const conversationButton = await findSidebarConversationContextTarget();
    await fireEvent.contextMenu(conversationButton);

    expect(screen.queryByRole("menuitem", { name: "复制会话 ID" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "复制会话诊断" })).not.toBeInTheDocument();
  });

  it("opens conversation details from the conversation context menu", async () => {
    render(App);

    const conversationButton = await findSidebarConversationContextTarget();
    await fireEvent.contextMenu(conversationButton);
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "会话详情" }),
    );

    const inspector = await screen.findByLabelText("会话详情面板");
    expect(
      within(inspector).getByRole("heading", { name: "会话详情" }),
    ).toBeInTheDocument();
  });

  it("opens the app-owned conversation menu from a peer quick contact", async () => {
    render(App);

    await fireEvent.click(await screen.findByRole("tab", { name: /联系人/ }));
    await fireEvent.contextMenu(await screen.findByTitle("与 研发一号 聊天"));

    expect(
      await screen.findByRole("menu", { name: "会话快捷菜单" }),
    ).toBeInTheDocument();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "会话详情" }),
    );

    const inspector = await screen.findByLabelText("会话详情面板");
    expect(
      within(inspector).getByRole("heading", { name: "会话详情" }),
    ).toBeInTheDocument();
  });

  it("confirms before deleting a conversation from the context menu", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "delete_conversation") return Promise.resolve(undefined);
      if (command === "list_transfers")
        return Promise.resolve([
          {
            id: "transfer-delete-conversation",
            conversationId: "direct:demo-peer",
            name: "delete-conv.zip",
            status: "failed",
            errorMessage: "network lost",
            totalBytes: 4096,
            sentBytes: 1024,
            files: ["delete-conv.zip"],
            resumable: true,
          },
        ]);
      return defaultTauriInvoke(command);
    });
    render(App);

    await screen.findByRole("region", { name: "聊天工作区" });
    await waitForTauriListener("typing:changed");
    await waitForTauriListener("peer:offline");
    emitTauriEvent("typing:changed", {
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      display_name: "研发一号",
      active: true,
      updated_at: Date.now(),
    });
    expect(
      (await screen.findAllByText("研发一号 正在输入...")).length,
    ).toBeGreaterThan(0);

    const conversationButton = await findSidebarConversationContextTarget();
    await fireEvent.contextMenu(conversationButton);
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "删除会话" }),
    );
    const cancelDialog = await screen.findByRole("dialog", {
      name: "确认删除会话",
    });
    expect(document.querySelector(".context-menu")).not.toBeInTheDocument();
    expect(
      within(cancelDialog).getByText(/会话列表中移除/),
    ).toBeInTheDocument();
    await fireEvent.click(
      within(cancelDialog).getByRole("button", { name: "取消" }),
    );
    expect(tauriInvoke).not.toHaveBeenCalledWith(
      "delete_conversation",
      expect.anything(),
    );

    await fireEvent.contextMenu(conversationButton);
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "删除会话" }),
    );
    const confirmDialog = await screen.findByRole("dialog", {
      name: "确认删除会话",
    });
    await fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "确认删除" }),
    );

    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith("delete_conversation", {
        conversationId: "direct:demo-peer",
      }),
    );
    expect(await screen.findByText("会话已删除")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryAllByText("研发一号 正在输入...")).toHaveLength(0);
    });

    await fireEvent.click(await screen.findByTitle("文件传输"));
    expect(screen.queryByText("delete-conv.zip")).not.toBeInTheDocument();
  });

  it("clears typing indicators when a peer goes offline", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await screen.findByRole("region", { name: "聊天工作区" });
    await waitForTauriListener("typing:changed");
    await waitForTauriListener("peer:offline");
    emitTauriEvent("typing:changed", {
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      display_name: "研发一号",
      active: true,
      updated_at: Date.now(),
    });
    expect(
      (await screen.findAllByText("研发一号 正在输入...")).length,
    ).toBeGreaterThan(0);

    emitTauriEvent("peer:offline", {
      peer_id: "demo-peer",
      display_name: "研发一号",
      hostname: "rd-pc",
      avatar_hash: null,
      status: "offline",
      endpoints: ["192.168.1.42:24251"],
      fingerprint: "f".repeat(64),
      public_key: Array(32).fill(15),
    });

    await waitFor(() => {
      expect(screen.queryAllByText("研发一号 正在输入...")).toHaveLength(0);
    });
    expect(
      (await screen.findAllByLabelText("研发一号 暂不可达")).length,
    ).toBeGreaterThan(0);
  });

  it("restores peer presence when an offline peer is discovered again", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await screen.findByRole("region", { name: "聊天工作区" });
    await waitForTauriListener("peer:offline");
    await waitForTauriListener("peer:upserted");
    emitTauriEvent("peer:offline", {
      peer_id: "demo-peer",
      display_name: "研发一号",
      hostname: "rd-pc",
      avatar_hash: null,
      status: "offline",
      endpoints: ["192.168.1.42:24251"],
      fingerprint: "f".repeat(64),
      public_key: Array(32).fill(15),
    });
    expect(
      (await screen.findAllByLabelText("研发一号 暂不可达")).length,
    ).toBeGreaterThan(0);

    emitTauriEvent("peer:upserted", {
      peer_id: "demo-peer",
      display_name: "研发一号",
      hostname: "rd-pc",
      avatar_hash: null,
      status: "online",
      endpoints: ["192.168.1.42:24251"],
      fingerprint: "f".repeat(64),
      public_key: Array(32).fill(15),
    });

    expect(
      (await screen.findAllByLabelText("研发一号 可联系")).length,
    ).toBeGreaterThan(0);
  });

  it("marks all-hands mentions only for group conversations", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const now = Date.now();
    const directConversation: ConversationSummary = {
      id: "direct:demo-peer",
      title: "研发一号",
      last_message_at: now,
      last_message_preview: "",
      unread_count: 2,
      manual_unread: false,
      pinned: true,
      muted: false,
      archived: false,
      draft_preview: "",
    };
    const groupConversation: ConversationSummary = {
      id: "group:ops",
      title: "值班群",
      last_message_at: now - 1,
      last_message_preview: "",
      unread_count: 0,
      manual_unread: false,
      pinned: false,
      muted: false,
      archived: false,
      draft_preview: "",
    };
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_conversations") {
        return Promise.resolve([directConversation, groupConversation]);
      }
      return defaultTauriInvoke(command);
    });
    render(App);

    await screen.findByRole("region", { name: "聊天工作区" });
    await screen.findByText("值班群");
    const baseMessage: ChatMessage = {
      id: "all-hands-direct",
      conversation_id: "direct:peer-b",
      sender_id: "peer-b",
      body: "FYI @everyone",
      attachments: [],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };

    emitTauriEvent("message:received", baseMessage);
    expect(document.querySelector(".conversation-state-chip.mention")).not.toBeInTheDocument();

    emitTauriEvent("message:received", {
      ...baseMessage,
      id: "all-hands-group",
      conversation_id: "group:ops",
      sender_id: "peer-b",
      body: "release now @everyone",
      created_at: Date.now() + 1,
    });

    await waitFor(() => {
      expect(document.querySelector(".conversation-state-chip.mention")).toBeInTheDocument();
    });
  });

  it("shows a clear error when marking a conversation read from the context menu fails", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "mark_conversation_read") {
        return Promise.reject(new Error("read failed"));
      }
      return defaultTauriInvoke(command);
    });
    render(App);

    const conversationButton = await findSidebarConversationContextTarget();
    await fireEvent.contextMenu(conversationButton);
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "标为已读" }),
    );

    expect(
      await screen.findByText("标为已读失败：read failed"),
    ).toBeInTheDocument();
  });

  it("keeps read and unread actions in the conversation menu instead of the chat header", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    await waitForInitialConversationLoad();
    const header = await screen.findByRole("group", { name: "会话标题栏" });
    expect(within(header).queryByRole("button", { name: "标为已读" })).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "标为未读" })).not.toBeInTheDocument();

    const conversationButton = await findSidebarConversationContextTarget();
    await fireEvent.contextMenu(conversationButton);
    await fireEvent.click(await screen.findByRole("menuitem", { name: "标为未读" }));

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("mark_conversation_unread", {
        conversationId: "direct:demo-peer",
      });
    });
  });

  it("keeps conversation preferences unchanged when saving them fails", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "update_conversation_preferences")
        return Promise.reject(new Error("preference store busy"));
      return defaultTauriInvoke(command);
    });
    render(App);

    const conversationButton = await findSidebarConversationContextTarget();
    await fireEvent.contextMenu(conversationButton);
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "取消置顶" }),
    );

    expect(
      await screen.findByText("会话设置保存失败：preference store busy"),
    ).toBeInTheDocument();
    await fireEvent.contextMenu(conversationButton);
    expect(
      await screen.findByRole("menuitem", { name: "取消置顶" }),
    ).toBeInTheDocument();
  });

  it("does not open an app-owned shell context menu for empty workspace right clicks", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    render(App);

    const appShell = await screen.findByRole("main");
    await fireEvent.contextMenu(appShell);

    expect(screen.queryByRole("menu", { name: "窗口快捷菜单" })).not.toBeInTheDocument();
    expect(document.querySelector(".app-context-menu")).not.toBeInTheDocument();
    expect(tauriInvoke).not.toHaveBeenCalledWith("minimize_to_tray");
  });

  it("does not open an app-owned shell context menu when right-clicking invalid space repeatedly", async () => {
    render(App);

    const appShell = await screen.findByRole("main");
    await fireEvent.contextMenu(appShell);
    await fireEvent.contextMenu(appShell);

    expect(screen.queryByRole("menu", { name: "窗口快捷菜单" })).not.toBeInTheDocument();
    expect(document.querySelector(".app-context-menu")).not.toBeInTheDocument();
  });

  it("opens the app-owned forwarding dialog from the message context menu", async () => {
    render(App);

    await fireEvent.contextMenu(await findDemoMessageBubble());
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "转发消息" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "转发消息" }),
    ).toBeInTheDocument();
    const dialog = await screen.findByRole("dialog", { name: "转发消息" });
    const search = within(dialog).getByPlaceholderText("搜索会话");
    await waitFor(() => expect(search).toHaveFocus());
    expect(await screen.findByText("选择会话")).toBeInTheDocument();
    expect(within(dialog).queryByText("direct:demo-peer")).not.toBeInTheDocument();
    expect(dialog.querySelector(".forward-target-check")).toBeInTheDocument();
    expect(within(dialog).queryByText("已选择")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "确认转发" })).toBeDisabled();
  });

  it("shows attachment file names in the single-message forwarding preview", async () => {
    const attachmentMessage: ChatMessage = {
      id: "forward-attachment-preview",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "forward-preview-transfer",
            files: [
              {
                path: "report.pdf",
                relative_path: null,
                size: 4096,
                sha256: "a".repeat(64),
              },
              {
                path: "readme.md",
                relative_path: "docs/readme.md",
                size: 512,
                sha256: "b".repeat(64),
              },
            ],
            total_bytes: 4608,
            chunk_size: 262144,
            sha256: "c".repeat(64),
          },
        },
      ],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages")
        return Promise.resolve([attachmentMessage]);
      return defaultTauriInvoke(command);
    });
    render(App);

    const attachment = await screen.findByRole("article", {
      name: "附件 2 个文件",
    });
    await fireEvent.contextMenu(attachment);
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "转发消息" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "转发消息" });

    expect(
      within(dialog).getByText("[文件] report.pdf、docs/readme.md"),
    ).toBeInTheDocument();
  });

  it("opens an app-owned message details dialog from the message context menu", async () => {
    render(App);

    await fireEvent.contextMenu(await findDemoMessageBubble());
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "消息详情" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "消息详情" });
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "关闭" })).toHaveFocus(),
    );
    const advancedSummary = within(dialog).getByText("交付与技术信息");
    const advanced = advancedSummary.closest("details");
    expect(advanced).not.toBeNull();
    expect(advanced).not.toHaveAttribute("open");
    expect(within(advanced as HTMLElement).getByText("交付审计")).toBeInTheDocument();
    expect(dialog.querySelector(".message-detail-summary")).toBeInTheDocument();
    expect(within(dialog).getByText(/已写入本机加密历史/)).toBeInTheDocument();
    expect(within(dialog).getByText("消息 ID")).toBeInTheDocument();
    expect(within(dialog).getByText("hello")).toBeInTheDocument();
    expect(within(dialog).getByText("会话")).toBeInTheDocument();
    expect(within(dialog).getByText("direct:demo-peer")).toBeInTheDocument();
    expect(within(dialog).getByText("状态")).toBeInTheDocument();
    expect(within(dialog).getAllByText("已读").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("收到的消息")).toBeInTheDocument();
    expect(within(dialog).queryByText("发送尝试")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("最后尝试")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("附件")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("暂无回应")).not.toBeInTheDocument();
    expect(within(dialog).getByText("消息正文")).toBeInTheDocument();
    expect(within(dialog).getByText(/我/)).toBeInTheDocument();
    expect(within(dialog).getByText("已收藏")).toBeInTheDocument();
  });

  it("shows per-recipient delivery receipts in the message details dialog", async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const outgoingMessage: ChatMessage = {
      id: "delivery-audit",
      conversation_id: "direct:demo-peer",
      sender_id: "local-demo",
      body: "delivery audit body",
      attachments: [],
      created_at: Date.now(),
      status: "sending",
      recalled: false,
      quote: {
        message_id: "quoted-delivery-source",
        sender_id: "peer-quote",
        body_preview: "quoted audit context",
      },
      favorited: false,
      reactions: [],
      send_attempts: 2,
      last_attempt_at: 1_700_000_123_000,
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages") return Promise.resolve([outgoingMessage]);
      if (command === "list_message_delivery_receipts")
        return Promise.resolve([
          { peer_id: "demo-peer", acknowledged_at: 1_700_000_000_000 },
          { peer_id: "peer-b", acknowledged_at: null },
        ]);
      return defaultTauriInvoke(command);
    });
    render(App);

    await fireEvent.contextMenu(await screen.findByText("delivery audit body"));
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "消息详情" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "消息详情" });
    const receipts = await within(dialog).findByRole("region", {
      name: "逐成员送达",
    });

    expect(within(receipts).getByText("研发一号")).toBeInTheDocument();
    expect(within(receipts).getByText("已送达 1/2，等待 ACK 1")).toBeInTheDocument();
    expect(within(receipts).getByText(/已送达 ·/)).toBeInTheDocument();
    expect(within(receipts).getByText("peer-b")).toBeInTheDocument();
    expect(within(receipts).getByText("等待 ACK")).toBeInTheDocument();
    expect(within(dialog).queryByText("发送尝试")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("2 次")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(new Date(1_700_000_123_000).toLocaleString("zh-CN"))).not.toBeInTheDocument();
    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith(
        "list_message_delivery_receipts",
        { messageId: "delivery-audit" },
      ),
    );

    await fireEvent.click(
      within(dialog).getByRole("button", { name: "复制审计报告" }),
    );

    expect(writeText).toHaveBeenCalledTimes(1);
    const report = writeText.mock.calls[0][0];
    expect(report).toContain("iim 消息审计");
    expect(report).toContain("消息 ID：delivery-audit");
    expect(report).toContain("正文：\ndelivery audit body");
    expect(report).toContain("发送尝试：2 次");
    expect(report).toContain(`最后尝试：${new Date(1_700_000_123_000).toLocaleString("zh-CN")}`);
    expect(report).toContain("引用：");
    expect(report).toContain("消息 ID：quoted-delivery-source");
    expect(report).toContain("发送人：peer-quote");
    expect(report).toContain("摘要：quoted audit context");
    expect(report).toContain("已送达 1/2，等待 ACK 1");
    expect(report).toContain("研发一号：已送达");
    expect(report).toContain("peer-b：等待 ACK");
    expect(await within(dialog).findByText("消息审计报告已复制")).toBeInTheDocument();
  });

  it("shows attachment-only message details without an empty body section", async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const attachmentOnlyMessage: ChatMessage = {
      id: "attachment-only-detail",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "   ",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "detail-transfer",
            files: [
              {
                path: "report.pdf",
                relative_path: null,
                size: 4096,
                sha256: "a".repeat(64),
              },
              {
                path: "readme.md",
                relative_path: "docs/readme.md",
                size: 512,
                sha256: "c".repeat(64),
              },
            ],
            total_bytes: 4608,
            chunk_size: 262144,
            sha256: "b".repeat(64),
          },
        },
      ],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages")
        return Promise.resolve([attachmentOnlyMessage]);
      return defaultTauriInvoke(command);
    });
    render(App);

    const attachment = await screen.findByRole("article", {
      name: "附件 2 个文件",
    });
    await fireEvent.contextMenu(attachment);
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "消息详情" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "消息详情" });

    expect(within(dialog).queryByText("消息正文")).not.toBeInTheDocument();
    expect(within(dialog).getByText("附件清单")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/包含 2 个文件，4.5 KB/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("report.pdf · 4.0 KB")).toBeInTheDocument();
    expect(within(dialog).getByText("docs/readme.md · 512 B")).toBeInTheDocument();

    await fireEvent.click(
      within(dialog).getByRole("button", { name: "复制附件清单" }),
    );

    expect(writeText).toHaveBeenCalledWith("report.pdf\ndocs/readme.md");
    expect(await within(dialog).findByText("附件清单已复制")).toBeInTheDocument();

    await fireEvent.click(
      within(dialog).getByRole("button", { name: "复制审计报告" }),
    );

    const auditReport = writeText.mock.calls[writeText.mock.calls.length - 1]?.[0] ?? "";
    expect(auditReport).toContain("附件清单：");
    expect(auditReport).toContain(`report.pdf · 4.0 KB · SHA-256：${"a".repeat(64)}`);
    expect(auditReport).toContain(`docs/readme.md · 512 B · SHA-256：${"c".repeat(64)}`);
    expect(await within(dialog).findByText("消息审计报告已复制")).toBeInTheDocument();
  });

  it("copies an attachment summary when an attachment-only message has no text body", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const attachmentOnlyMessage: ChatMessage = {
      id: "attachment-copy-summary",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "   ",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "copy-summary-transfer",
            files: [
              {
                path: "report.pdf",
                relative_path: null,
                size: 4096,
                sha256: "a".repeat(64),
              },
              {
                path: "readme.md",
                relative_path: "docs/readme.md",
                size: 512,
                sha256: "c".repeat(64),
              },
            ],
            total_bytes: 4608,
            chunk_size: 262144,
            sha256: "b".repeat(64),
          },
        },
      ],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages")
        return Promise.resolve([attachmentOnlyMessage]);
      return defaultTauriInvoke(command);
    });
    render(App);

    const attachment = await screen.findByRole("article", {
      name: "附件 2 个文件",
    });
    await fireEvent.contextMenu(attachment);
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "复制消息" }),
    );

    expect(writeText).toHaveBeenCalledWith("report.pdf\ndocs/readme.md");
    expect(await screen.findByText("附件清单已复制")).toBeInTheDocument();
  });

  it("copies an attachment card file list from the chat bubble", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const attachmentOnlyMessage: ChatMessage = {
      id: "attachment-card-copy-summary",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "copy-card-transfer",
            files: [
              {
                path: "report.pdf",
                relative_path: null,
                size: 4096,
                sha256: "a".repeat(64),
              },
              {
                path: "readme.md",
                relative_path: "docs/readme.md",
                size: 512,
                sha256: "c".repeat(64),
              },
            ],
            total_bytes: 4608,
            chunk_size: 262144,
            sha256: "b".repeat(64),
          },
        },
      ],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages")
        return Promise.resolve([attachmentOnlyMessage]);
      return defaultTauriInvoke(command);
    });
    render(App);

    const attachment = await screen.findByRole("article", {
      name: "附件 2 个文件",
    });
    await fireEvent.click(
      within(attachment).getByRole("button", { name: "复制清单" }),
    );

    expect(writeText).toHaveBeenCalledWith("report.pdf\ndocs/readme.md");
    expect(await screen.findByText("附件清单已复制")).toBeInTheDocument();
  });

  it("copies identifiers from the message details dialog", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(App);

    await fireEvent.contextMenu(await findDemoMessageBubble());
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "消息详情" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "消息详情" });
    await fireEvent.click(
      within(dialog).getByRole("button", { name: "复制消息 ID" }),
    );
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(await within(dialog).findByText("消息 ID 已复制")).toBeInTheDocument();
  });

  it("copies attachment transfer identifiers from the message details dialog", async () => {
    const writeText = vi.fn(async () => undefined);
    const attachmentMessage: ChatMessage = {
      id: "attachment-transfer-copy",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "transfer details",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "transfer-copy-detail",
            files: [
              {
                path: "C:\\Users\\admin\\Documents\\handoff.zip",
                relative_path: null,
                size: 8192,
                sha256: "c".repeat(64),
              },
            ],
            total_bytes: 8192,
            chunk_size: 262144,
            sha256: "d".repeat(64),
          },
        },
      ],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages") return Promise.resolve([attachmentMessage]);
      return defaultTauriInvoke(command);
    });
    render(App);

    await fireEvent.contextMenu(await screen.findByText("transfer details"));
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "消息详情" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "消息详情" });
    await fireEvent.click(
      within(dialog).getByRole("button", { name: "复制附件传输 ID" }),
    );

    expect(writeText).toHaveBeenCalledWith("transfer-copy-detail");
    expect(
      await within(dialog).findByText("附件传输 ID 已复制"),
    ).toBeInTheDocument();
  });

  it("copies attachment SHA-256 values from the message details dialog", async () => {
    const writeText = vi.fn(async () => undefined);
    const attachmentMessage: ChatMessage = {
      id: "attachment-sha-copy",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "checksum details",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "transfer-sha-detail",
            files: [
              {
                path: "C:\\Users\\admin\\Documents\\release.zip",
                relative_path: null,
                size: 8192,
                sha256: "e".repeat(64),
              },
            ],
            total_bytes: 8192,
            chunk_size: 262144,
            sha256: "f".repeat(64),
          },
        },
      ],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages") return Promise.resolve([attachmentMessage]);
      return defaultTauriInvoke(command);
    });
    render(App);

    await fireEvent.contextMenu(await screen.findByText("checksum details"));
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "消息详情" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "消息详情" });
    await fireEvent.click(
      within(dialog).getByRole("button", { name: "复制附件 SHA-256" }),
    );

    expect(writeText).toHaveBeenCalledWith("f".repeat(64));
    expect(
      await within(dialog).findByText("附件 SHA-256 已复制"),
    ).toBeInTheDocument();
  });

  it("shows a failure hint when copying message detail identifiers is blocked", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("clipboard denied");
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(App);

    await fireEvent.contextMenu(await findDemoMessageBubble());
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "消息详情" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "消息详情" });
    await fireEvent.click(
      within(dialog).getByRole("button", { name: "复制消息 ID" }),
    );
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(
      await within(dialog).findByText("消息 ID 复制失败：clipboard denied"),
    ).toBeInTheDocument();
  });

  it("shows a chat notice when copying a message body is blocked", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("clipboard denied");
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(App);

    await fireEvent.contextMenu(await findDemoMessageBubble());
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "复制消息" }),
    );
    expect(writeText).toHaveBeenCalledWith(
      "欢迎使用 iim。无需服务器，同网段自动发现；联系人页就是设备发现与管理入口。",
    );
    expect(
      await screen.findByText("消息复制失败：clipboard denied"),
    ).toBeInTheDocument();
  });

  it("keeps the app usable when favoriting a message fails", async () => {
    const defaultInvoke = tauriInvoke.getMockImplementation();
    const message: ChatMessage = {
      id: "favorite-failure",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "favorite failure body",
      attachments: [],
      created_at: Date.now(),
      status: "received",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages") return Promise.resolve([message]);
      if (command === "set_message_favorite")
        return Promise.reject(new Error("disk locked"));
      return defaultInvoke?.(command) ?? Promise.resolve(undefined);
    });

    render(App);

    await fireEvent.contextMenu(
      await screen.findByText("favorite failure body"),
    );
    await openMessageMenuMore();
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: "收藏消息" }),
    );

    expect(
      await screen.findByText("收藏失败：disk locked"),
    ).toBeInTheDocument();
  });

  it("offers retry and revoke only for local outbox messages", async () => {
    const message: ChatMessage = {
      id: "queued-local-context",
      conversation_id: "direct:demo-peer",
      sender_id: "local-demo",
      body: "local queued outbox body",
      attachments: [],
      created_at: Date.now(),
      status: "queued",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages") return Promise.resolve([message]);
      return defaultTauriInvoke(command);
    });
    render(App);

    await fireEvent.contextMenu(
      await screen.findByText("local queued outbox body"),
    );
    await openMessageMenuMore();
    expect(
      await screen.findByRole("menuitem", { name: "重新发送" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "收藏消息" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "撤回消息" }),
    ).toBeInTheDocument();
  });

  it("keeps the active chat open when a message avatar opens peer details", async () => {
    const message: ChatMessage = {
      id: "incoming-avatar-details",
      conversation_id: "direct:demo-peer",
      sender_id: "demo-peer",
      body: "avatar detail regression",
      attachments: [],
      created_at: Date.now(),
      status: "delivered",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages") return Promise.resolve([message]);
      return defaultTauriInvoke(command);
    });
    render(App);

    const messageText = await screen.findByText("avatar detail regression");
    const messageRow = messageText.closest(".message-row");
    const avatarButton = messageRow?.querySelector<HTMLButtonElement>(".message-avatar-button");
    expect(avatarButton).toBeTruthy();
    await fireEvent.click(avatarButton as HTMLButtonElement);

    await waitFor(() => expect(document.querySelector(".inspector")).toBeInTheDocument());
    expect(document.querySelector(".chat-workspace")).toBeInTheDocument();
    expect(document.querySelector(".workspace-panel.contacts-workspace")).not.toBeInTheDocument();
  });

  it("does not offer retry for delivered local messages", async () => {
    const message: ChatMessage = {
      id: "delivered-local-context",
      conversation_id: "direct:demo-peer",
      sender_id: "local-demo",
      body: "delivered local message",
      attachments: [],
      created_at: Date.now(),
      status: "delivered",
      recalled: false,
      quote: null,
      favorited: false,
      reactions: [],
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    tauriInvoke.mockImplementation((command: string) => {
      if (command === "list_messages") return Promise.resolve([message]);
      return defaultTauriInvoke(command);
    });
    render(App);

    await fireEvent.contextMenu(
      await screen.findByText("delivered local message"),
    );
    await openMessageMenuMore();
    expect(
      screen.queryByRole("menuitem", { name: "重新发送" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "撤回消息" }),
    ).toBeInTheDocument();
  });
});
